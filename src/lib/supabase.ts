/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const runtimeConfig = typeof window !== 'undefined' ? ((window as any).__RUNTIME_CONFIG__ || {}) : {};

const rawUrl = runtimeConfig.VITE_SUPABASE_URL || 
               (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL : '') || 
               import.meta.env?.VITE_SUPABASE_URL || 
               import.meta.env?.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = runtimeConfig.VITE_SUPABASE_ANON_KEY || 
                    (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY : '') || 
                    import.meta.env?.VITE_SUPABASE_ANON_KEY || 
                    import.meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function cleanUrlHelper(urlStr: string): string {
  let clean = (urlStr || '').trim();
  if (clean) {
    clean = clean.replace(/\/+$/, '');
    if (clean.endsWith('/rest/v1')) {
      clean = clean.slice(0, -8);
    }
    clean = clean.replace(/\/+$/, '');
  }
  return clean;
}

// Clean up Supabase URL if user accidentally included /rest/v1 or trailing slashes
let cleanSupabaseUrl = cleanUrlHelper(rawUrl);

if (!cleanSupabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase environment variables are missing! Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

// Fallback to placeholders so the app doesn't crash to a white screen immediately, 
// though authentication will fail until the keys are added.
export const supabase = createClient(
  cleanSupabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

export const RAW_SUPABASE_KEY = supabaseKey || '';
export const RAW_SUPABASE_URL = cleanSupabaseUrl || '';

export const isSecretKeyMistake = !!(
  supabaseKey && 
  (supabaseKey.startsWith('sb_secret_') || 
   supabaseKey.toLowerCase().includes('secret') || 
   supabaseKey.startsWith('service_role'))
);

export const isMissingConfig = !cleanSupabaseUrl || !supabaseKey || cleanSupabaseUrl.includes('placeholder') || supabaseKey.includes('placeholder');

/**
 * Creates an administrative Supabase client that bypasses RLS policies securely on the backend server.
 */
let cachedSupabaseAdmin: any = null;

export function getSupabaseAdmin() {
  if (cachedSupabaseAdmin) {
    return cachedSupabaseAdmin;
  }
  const rawUrlLocal = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || cleanSupabaseUrl || '';
  const url = cleanUrlHelper(rawUrlLocal);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || supabaseKey || '').trim();
  
  if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
    throw new Error('Supabase URL or Key are missing / placeholder.');
  }

  cachedSupabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cachedSupabaseAdmin;
}

/**
 * Server-side: Instantiates or creates a new session in PostgreSQL/Supabase.
 */
export async function createSession(roomId: string, hostId: string, twitchData: any) {
  const supabaseAdmin = getSupabaseAdmin();

  // 1. Upsert Room in rooms table
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .upsert({
      id: roomId,
      owner_id: hostId,
      twitch_channel_id: twitchData?.twitchUserId || twitchData?.login || hostId,
      is_active: true,
      last_active_at: new Date().toISOString()
    }, { onConflict: 'owner_id' })
    .select()
    .single();

  if (roomError) {
    console.error('[Supabase DB] Error creating room:', roomError);
    throw roomError;
  }

  // 2. Initial state configuration
  const defaultSettings = {
    isManualApprovalRequired: false,
    maxVideoDuration: 300,
    blockLiveStreams: true,
    globalCooldownSeconds: 0,
    userCooldownSeconds: 0,
    maxSubmissionsPerHour: 0,
    maxVideosPerUser: 0,
    maxQueueSize: 0,
    maxStrikesBeforeBan: 5,
    domainMode: 'both',
    domainWhitelist: [],
    domainBlacklist: [],
    requireFollower: false,
    requireSub: false,
    minFollowMinutes: 0
  };

  // Fetch existing room settings if any to prevent wiping out streamer custom rules when starting/reopening session
  const { data: existingSettings } = await supabaseAdmin
    .from('room_settings')
    .select('*')
    .eq('room_id', roomId)
    .single();

  const existingSettingsJson = existingSettings?.settings_json || {};
  const existingSettingsJsonConfig = existingSettingsJson?.settings || {};

  const mergedSettings = {
    ...defaultSettings,
    ...existingSettingsJsonConfig,
    // Sync table columns to the JSON settings config
    requireFollower: existingSettings?.require_follower ?? defaultSettings.requireFollower,
    requireSub: existingSettings?.require_sub ?? defaultSettings.requireSub,
    minFollowMinutes: existingSettings?.min_follow_minutes ?? (existingSettings?.min_follow_days ? existingSettings.min_follow_days * 1440 : defaultSettings.minFollowMinutes),
    userCooldownSeconds: existingSettings?.cooldown_seconds ?? defaultSettings.userCooldownSeconds,
    maxVideosPerUser: existingSettings?.max_videos_per_user ?? existingSettingsJsonConfig.maxVideosPerUser ?? defaultSettings.maxVideosPerUser,
    maxQueueSize: existingSettings?.max_queue_size ?? existingSettingsJsonConfig.maxQueueSize ?? defaultSettings.maxQueueSize,
    maxSubmissionsPerHour: existingSettings?.maxSubmissionsPerHour ?? existingSettingsJsonConfig.maxSubmissionsPerHour ?? defaultSettings.maxSubmissionsPerHour,
    isManualApprovalRequired: existingSettings?.isManualApprovalRequired ?? existingSettingsJsonConfig.isManualApprovalRequired ?? defaultSettings.isManualApprovalRequired,
    blockLiveStreams: existingSettings?.blockLiveStreams ?? existingSettingsJsonConfig.blockLiveStreams ?? defaultSettings.blockLiveStreams,
    globalCooldownSeconds: existingSettings?.globalCooldownSeconds ?? existingSettingsJsonConfig.globalCooldownSeconds ?? defaultSettings.globalCooldownSeconds,
  };

  const initialSessionState = {
    id: roomId,
    hostId: hostId,
    twitchData: twitchData,
    users: [],
    queue: [],
    currentVideoId: null,
    history: [],
    isPlaying: false,
    currentTime: 0,
    settings: mergedSettings,
    blacklistIPs: existingSettingsJson?.blacklistIPs || [],
    blacklistUsernames: existingSettingsJson?.blacklistUsernames || [],
    allBans: existingSettingsJson?.allBans || [],
    auditLogs: existingSettingsJson?.auditLogs || []
  };

  // 3. Upsert settings with consolidated JSON state payload
  const { error: settingsError } = await supabaseAdmin
    .from('room_settings')
    .upsert({
      room_id: roomId,
      settings_json: initialSessionState,
      require_sub: existingSettings?.require_sub ?? false,
      require_follower: existingSettings?.require_follower ?? false,
      min_follow_days: existingSettings?.min_follow_days ?? 0,
      min_account_age_days: existingSettings?.min_account_age_days ?? 0,
      max_videos_per_user: existingSettings?.max_videos_per_user ?? 2,
      max_queue_size: existingSettings?.max_queue_size ?? 50,
      cooldown_seconds: existingSettings?.cooldown_seconds ?? 60,
    });

  if (settingsError) {
    console.error('[Supabase DB] Error inserting room settings:', settingsError);
    throw settingsError;
  }

  return initialSessionState;
}

/**
 * Server-side: Retrieves the complete active session state.
 */
export async function getSession(roomId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: roomData, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('is_active')
    .eq('id', roomId)
    .single();

  if (roomError || !roomData || !roomData.is_active) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('room_settings')
    .select('*')
    .eq('room_id', roomId)
    .single();

  if (error || !data) {
    return null;
  }

  const session = data.settings_json || { id: roomId, users: [], queue: [], settings: {} };
  
  // SYNC SOURCE OF TRUTH: Overwrite nested settings with flat column values from DB
  session.settings = {
    ...(session.settings || {}),
    requireSub: data.require_sub ?? session.settings?.requireSub,
    requireFollower: data.require_follower ?? session.settings?.requireFollower,
    userCooldownSeconds: data.cooldown_seconds ?? session.settings?.userCooldownSeconds,
    maxVideosPerUser: data.max_videos_per_user ?? session.settings?.maxVideosPerUser,
    maxQueueSize: data.max_queue_size ?? session.settings?.maxQueueSize
  };

  if (!session.allBans) session.allBans = [];
  if (!session.blacklistUsernames) session.blacklistUsernames = [];
  
  return session;
}

/**
 * Server-side: Sets a session to inactive.
 */
export async function endSession(roomId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('rooms')
    .update({ is_active: false })
    .eq('id', roomId);

  if (error) {
    console.error('[Supabase DB] Error ending session:', error);
  }
}

/**
 * Server-side: Updates the session heartbeat timestamp.
 */
export async function updateHeartbeat(roomId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from('rooms')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', roomId);
}

/**
 * Server-side: Adds an item to the session's video queue.
 */
export async function addQueueItem(roomId: string, video: any) {
  const supabaseAdmin = getSupabaseAdmin();
  const sessionState: any = await getSession(roomId);
  if (!sessionState) return null;

  // Append clean item copy
  const updatedQueue = [...(sessionState.queue || []), video];
  const updatedState = { ...sessionState, queue: updatedQueue };

  // Write state JSON
  await supabaseAdmin
    .from('room_settings')
    .update({ settings_json: updatedState })
    .eq('room_id', roomId);

  // Sync to database videos table to maintain relational triggers and integrity
  try {
    await supabaseAdmin
      .from('videos')
      .insert({
        room_id: roomId,
        submitted_by: video.submitterId && video.submitterId.length === 36 ? video.submitterId : null,
        twitch_user_id: video.submitterId || 'anonymous',
        video_url: video.url,
        status: video.status || 'pending',
        priority_score: 0
      });
  } catch (err) {
    console.warn('[Supabase DB Sync] Video insert bypassed relational constraints safely.');
  }

  return updatedState;
}

/**
 * Server-side: Filters/Removes a video queue item.
 */
export async function removeQueueItem(roomId: string, videoId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const sessionState: any = await getSession(roomId);
  if (!sessionState) return null;

  const updatedQueue = (sessionState.queue || []).filter((v: any) => v.id !== videoId);
  const updatedState = { ...sessionState, queue: updatedQueue };

  await supabaseAdmin
    .from('room_settings')
    .update({ settings_json: updatedState })
    .eq('room_id', roomId);

  // Optionally Sync state delete (if we want to clean database rows or update status to removed)
  try {
    await supabaseAdmin
      .from('videos')
      .update({ status: 'removed' })
      .eq('id', videoId);
  } catch (err) {}

  return updatedState;
}

/**
 * Server-side: Sets status of a video queue item.
 */
export async function updateQueueItemStatus(roomId: string, videoId: string, status: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const sessionState: any = await getSession(roomId);
  if (!sessionState) return null;

  const updatedQueue = (sessionState.queue || []).map((v: any) => {
    if (v.id === videoId) {
      return { ...v, status };
    }
    return v;
  });

  const updatedState = { ...sessionState, queue: updatedQueue };

  await supabaseAdmin
    .from('room_settings')
    .update({ settings_json: updatedState })
    .eq('room_id', roomId);

  // Sync state update to individual videos table row
  try {
    await supabaseAdmin
      .from('videos')
      .update({ status })
      .eq('id', videoId);
  } catch (err) {}

  return updatedState;
}

