import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import dns from 'dns';
import punycode from 'punycode';
import crypto from 'crypto';
import fs from 'fs';
// @ts-ignore
import instagramGetUrlPkg from 'instagram-url-direct';
import { dbStore } from './src/database.js';
import { getSupabaseAdmin, createSession, getSession, endSession } from './src/lib/supabase.js';
import { generateAblyTokenRequest, ablyRest } from './src/lib/ably.js';
import youtubedl from 'youtube-dl-exec';

const __filename = typeof import.meta !== 'undefined' && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof (globalThis as any).__filename !== 'undefined' ? (globalThis as any).__filename : '');

const __dirname = typeof import.meta !== 'undefined' && import.meta.url
  ? path.dirname(__filename)
  : (typeof (globalThis as any).__dirname !== 'undefined' ? (globalThis as any).__dirname : '');

// Persistent tracker for all-time hosts who have ever opened a room on this platform
let historyHosts = new Set<string>();
try {
  const hostsFilePath = path.join(process.cwd(), 'data', 'history_hosts.json');
  if (fs.existsSync(hostsFilePath)) {
    const data = JSON.parse(fs.readFileSync(hostsFilePath, 'utf-8'));
    if (Array.isArray(data)) {
      data.forEach((l: string) => {
        if (typeof l === 'string') {
          historyHosts.add(l.toLowerCase());
        }
      });
    }
  }
} catch (e) {
  console.error('[History Hosts] Failed to load history_hosts.json:', e);
}

// Preload former hosts from existing history.json if available
try {
  const oldHistoryPath = path.join(process.cwd(), 'data', 'history.json');
  if (fs.existsSync(oldHistoryPath)) {
    const logs = JSON.parse(fs.readFileSync(oldHistoryPath, 'utf-8'));
    if (Array.isArray(logs)) {
      logs.forEach((log: any) => {
        if (log.videoId === 'session_init' && log.actionDetails) {
          const match = log.actionDetails.match(/Streamer @([a-zA-Z0-9_]+)/i);
          if (match && match[1]) {
            historyHosts.add(match[1].toLowerCase());
          }
        }
      });
    }
  }
} catch (e) {
  console.warn('[History Hosts] Failed to pre-seed from history.json:', e);
}

function addHistoryHost(login: string) {
  if (!login) return;
  const lower = login.toLowerCase();
  if (!historyHosts.has(lower)) {
    historyHosts.add(lower);
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const hostsFilePath = path.join(dataDir, 'history_hosts.json');
      fs.writeFileSync(hostsFilePath, JSON.stringify(Array.from(historyHosts), null, 2), 'utf-8');
      console.log(`[History Hosts] Broadcaster @${lower} added to history_hosts.json`);
    } catch (e) {
      console.error('[History Hosts] Failed to save history_hosts.json:', e);
    }
  }
}

// Helper to generate a unique but persistent user ID based on IP
function getPersistentUserId(ip: string): string {
    return 'usr_' + crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

import { ChatClient } from '@twurple/chat';
import { StaticAuthProvider } from '@twurple/auth';

let botClient: ChatClient | null = null;
const activeChannels = new Set<string>();
const processedMessages = new Set<string>();

export function connectBotToChannel(channelName: string) {
  if (!channelName) return;
  const login = channelName.toLowerCase();
  
  if (!activeChannels.has(login)) {
     activeChannels.add(login);
     console.log(`[Twitch Bot] Adding channel #${login} to queue/monitored set`);
  }

  if (botClient && botClient.isConnected) {
    botClient.join(login).catch((err) => {
      console.error(`[Twitch Bot] Error joining channel #${login}:`, err.message);
    });
  }
}

async function joinAllActiveRooms() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select('id, twitch_channel_id, room_settings(settings_json)')
      .eq('is_active', true);
      
    if (error || !rooms) {
      console.warn('[Twitch Bot] Auto-join lookup returned zero active rooms or error:', error);
      return;
    }
    
    console.log(`[Twitch Bot] Found ${rooms.length} active room(s) in public DB on startup. Auto-joining...`);
    
    for (const room of rooms) {
      const settingsRaw = Array.isArray(room.room_settings) 
        ? (room.room_settings[0] as any)?.settings_json 
        : (room.room_settings as any)?.settings_json;
      
      const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
        || (!/^\d+$/.test(room.twitch_channel_id) ? room.twitch_channel_id?.toLowerCase() : null);
        
      if (streamerLogin && !streamerLogin.includes('-') && streamerLogin.length > 2) {
         console.log(`[Twitch Bot] Auto-joining active streamer room channel: #${streamerLogin}`);
         connectBotToChannel(streamerLogin);
      }
    }
  } catch (err: any) {
    console.error('[Twitch Bot] Failed to auto-join active rooms on boot:', err.message);
  }
}

// Helper to send messages safely back to Twitch chat (requires authenticated bot config)
function sendBotMessage(channel: string, message: string) {
  if (!botClient || !botClient.isConnected) return;
  console.log(`[Twitch Bot Chat Feedback] Sending to ${channel}: ${message}`);
  const botUsername = process.env.TWITCH_BOT_USERNAME || '';
  const botOauthToken = process.env.TWITCH_BOT_OAUTH_TOKEN || '';
  if (!botUsername || !botOauthToken) {
    console.log('[Twitch Bot Chat Feedback] Skipping chat response because credentials are not configured (running in read-only anonymous mode).');
    return;
  }
  botClient.say(channel, message).catch((err) => {
    console.error(`[Twitch Bot Chat Feedback] Failed to send message to Twitch chat channel ${channel}:`, err.message);
  });
}

function checkUserActionStatus(state: any, userId: string, twitchLogin?: string, twitchUserId?: string, userIp?: string) {
  const loginLower = twitchLogin?.toLowerCase().trim();
  const tId = twitchUserId?.trim();

  // 1. Check blacklistUsernames
  if (loginLower && state.blacklistUsernames?.map((n: string) => n.toLowerCase()).includes(loginLower)) {
    return { banned: true, reason: 'Seu nome de usuário está na lista de banimento.' };
  }

  // 2. Check blacklistIPs
  if (userIp && state.blacklistIPs?.includes(userIp)) {
    return { banned: true, reason: 'Seu endereço de IP está na lista de banimento.' };
  }

  // 3. Search in users array for any matching record that is set to isBanned
  const matchedUsers = (state.users || []).filter((u: any) => {
    const uLogin = u.twitchData?.login?.toLowerCase().trim();
    const uTId = u.twitchData?.twitchUserId;
    return (
      u.userId === userId ||
      (loginLower && uLogin === loginLower) ||
      (tId && uTId === tId) ||
      (tId && u.userId === tId)
    );
  });

  if (matchedUsers.some((u: any) => u.isBanned)) {
    return { banned: true, reason: 'Você está banido desta sala.' };
  }

  // 4. Search in allBans array
  if (state.allBans && state.allBans.length > 0) {
    const isBannedInHistory = state.allBans.some((b: any) => {
      const bLogin = b.username?.toLowerCase().trim();
      return (
        b.userId === userId ||
        (loginLower && bLogin === loginLower) ||
        (tId && b.userId === tId) ||
        (userIp && b.ip === userIp)
      );
    });
    if (isBannedInHistory) {
      return { banned: true, reason: 'Você está permanentemente banido desta sala.' };
    }
  }

  // 5. Check timeouts on any matched records
  let maxTimeoutUntil = 0;
  for (const u of matchedUsers) {
    if (u.timeoutUntil && u.timeoutUntil > maxTimeoutUntil) {
      maxTimeoutUntil = u.timeoutUntil;
    }
  }

  if (maxTimeoutUntil && Date.now() < maxTimeoutUntil) {
    return { timedOut: true, timeoutUntil: maxTimeoutUntil, remainingSeconds: Math.ceil((maxTimeoutUntil - Date.now()) / 1000) };
  }

  return { banned: false, timedOut: false };
}

// Ensure Twitch chatter is registered under session active users
function registerOrUpdateTwitchChatterFromTags(
  state: any,
  userId: string,
  username: string,
  displayName: string,
  tags: any,
  broadcasterId: string
): boolean {
  if (!state.users) {
    state.users = [];
  }

  const rawBadges = tags && tags.badges ? Object.keys(tags.badges) : [];
  
  // Clean indicators
  const isSubscriber = rawBadges.includes('subscriber') || rawBadges.includes('founder') || !!tags?.subscriber;
  const isModerator = rawBadges.includes('moderator') || rawBadges.includes('broadcaster') || !!tags?.mod;
  const isVip = rawBadges.includes('vip');
  const isBroadcaster = userId === broadcasterId || rawBadges.includes('broadcaster');

  // Find if user already exists
  let userIndex = state.users.findIndex((u: any) => u.userId === userId || u.name?.toLowerCase() === username.toLowerCase());
  let existingUser = userIndex !== -1 ? state.users[userIndex] : null;

  const now = Date.now();
  const needsSave = !existingUser || 
                     existingUser.name !== displayName ||
                     existingUser.twitchData?.isSubscriber !== isSubscriber ||
                     existingUser.twitchData?.isModerator !== isModerator ||
                     existingUser.twitchData?.isVip !== isVip ||
                     existingUser.twitchData?.isBroadcaster !== isBroadcaster ||
                     !existingUser.lastPresenceAt ||
                     (now - existingUser.lastPresenceAt > 5 * 60 * 1000);

  if (!needsSave) {
    // Just quietly update timestamp of their presence in the session memory state, without forcing save
    if (existingUser) {
      existingUser.lastPresenceAt = now;
    }
    return false;
  }

  let avatarUrl = existingUser?.twitchData?.avatarUrl;
  if (!avatarUrl) {
    avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;
  }

  const twitchData = {
    avatarUrl,
    login: username.toLowerCase(),
    displayName: displayName,
    twitchUserId: userId,
    isSubscriber,
    isModerator,
    isVip,
    isBroadcaster,
    isFollower: existingUser?.twitchData?.isFollower || (isBroadcaster ? true : false),
    followedAt: existingUser?.twitchData?.followedAt || (isBroadcaster ? new Date(now - 365*24*60*60*1000).toISOString() : null),
    color: tags?.color || '#9146FF',
    badges: rawBadges
  };

  const formattedUser = {
    id: userId,
    userId,
    name: displayName,
    isHost: isBroadcaster,
    isWhitelisted: existingUser?.isWhitelisted || false,
    strikes: existingUser?.strikes || 0,
    isBanned: existingUser?.isBanned || false,
    timeoutUntil: existingUser?.timeoutUntil || undefined,
    lastSubmittedAt: existingUser?.lastSubmittedAt || undefined,
    lastPresenceAt: now,
    twitchData
  };

  if (userIndex !== -1) {
    state.users[userIndex] = {
      ...existingUser,
      ...formattedUser,
      adminNotes: existingUser.adminNotes || [],
      reputation: existingUser.reputation ?? 100,
      strikes: existingUser.strikes || 0,
      isBanned: existingUser.isBanned || false,
      timeoutUntil: existingUser.timeoutUntil || undefined,
      twitchData: {
        ...existingUser.twitchData,
        ...twitchData
      }
    };
  } else {
    state.users.push(formattedUser);
  }

  return true;
}

async function ensureTwitchChatUserRegistered(
  state: any,
  userId: string,
  username: string,
  displayName: string,
  tags: any,
  broadcasterId: string,
  broadcasterToken: string | undefined
) {
  if (!state.users) {
    state.users = [];
  }

  let userIndex = state.users.findIndex((u: any) => u.userId === userId || u.name?.toLowerCase() === username.toLowerCase());
  let existingUser = userIndex !== -1 ? state.users[userIndex] : null;

  let avatarUrl = existingUser?.twitchData?.avatarUrl || '';
  let login = existingUser?.twitchData?.login || username.toLowerCase();
  let finalDisplayName = existingUser?.twitchData?.displayName || displayName;

  // Retrieve user profiles via Helix if token is present and details are missing
  if (broadcasterToken && (!avatarUrl || avatarUrl.includes('dicebear'))) {
    try {
      let clientId = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
      const rootRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${broadcasterToken}` },
        timeout: 3000
      }).catch(() => null);
      if (rootRes && rootRes.data && rootRes.data.client_id) {
        clientId = rootRes.data.client_id;
      }

      const userRes = await axios.get(`https://api.twitch.tv/helix/users?id=${userId}`, {
        headers: {
          'Client-Id': clientId,
          'Authorization': `Bearer ${broadcasterToken}`
        },
        timeout: 4000
      });
      const d = userRes.data?.data?.[0];
      if (d) {
        avatarUrl = d.profile_image_url || avatarUrl;
        login = d.login || login;
        finalDisplayName = d.display_name || finalDisplayName;
      }
    } catch (e: any) {
      console.warn(`[Twitch Helix User Fetch Failed] id=${userId}:`, e.message);
    }
  }

  if (!avatarUrl) {
    avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;
  }

  const rawBadges = tags && tags.badges ? Object.keys(tags.badges) : [];
  let isSubscriber = rawBadges.includes('subscriber') || rawBadges.includes('founder') || !!tags?.subscriber;
  let isModerator = rawBadges.includes('moderator') || rawBadges.includes('broadcaster') || !!tags?.mod;
  let isVip = rawBadges.includes('vip');
  let isBroadcaster = userId === broadcasterId || rawBadges.includes('broadcaster');

  let isFollower = existingUser?.twitchData?.isFollower || (isBroadcaster ? true : false);
  let followedAt = existingUser?.twitchData?.followedAt || (isBroadcaster ? new Date(Date.now() - 365*24*60*60*1000).toISOString() : null);

  // Lazy execution of metrics on submission using broadcasterToken
  if (broadcasterToken && broadcasterId && userId !== broadcasterId && !isBroadcaster) {
    try {
      const foll = await checkTwitchFollower(broadcasterId, userId, broadcasterToken);
      if (foll.isFollower) {
        isFollower = true;
        followedAt = foll.followedAt || null;
      }
      
      const sub = await checkTwitchSubscriber(broadcasterId, userId, broadcasterToken);
      if (sub) {
        isSubscriber = true;
      }
    } catch (e: any) {
      console.warn(`[ensureTwitchChatUserRegistered Metrics Check Error]`, e.message);
    }
  }

  const twitchData = {
    avatarUrl,
    login,
    displayName: finalDisplayName,
    twitchUserId: userId,
    isSubscriber,
    isModerator,
    isVip,
    isBroadcaster,
    isFollower,
    followedAt,
    color: tags?.color || '#9146FF',
    badges: rawBadges
  };

  const formattedUser = {
    id: userId,
    userId,
    name: finalDisplayName,
    isHost: isBroadcaster,
    isWhitelisted: existingUser?.isWhitelisted || false,
    strikes: existingUser?.strikes || 0,
    isBanned: existingUser?.isBanned || false,
    timeoutUntil: existingUser?.timeoutUntil || undefined,
    lastSubmittedAt: Date.now(),
    twitchData
  };

  if (userIndex !== -1) {
    state.users[userIndex] = {
      ...existingUser,
      ...formattedUser,
      adminNotes: existingUser.adminNotes || [],
      reputation: existingUser.reputation ?? 100,
      strikes: existingUser.strikes || 0,
      isBanned: existingUser.isBanned || false,
      timeoutUntil: existingUser.timeoutUntil || undefined,
      twitchData: {
        ...existingUser.twitchData,
        ...twitchData
      }
    };
  } else {
    state.users.push(formattedUser);
  }
}

// Bot Init inside server
setTimeout(() => {
  const botUsername = process.env.TWITCH_BOT_USERNAME || '';
  let token = process.env.TWITCH_BOT_OAUTH_TOKEN || '';
  if (token.startsWith('oauth:')) {
    token = token.slice(6);
  }
  
  if (botUsername && token) {
    console.log(`[Twitch Bot] Initializing authenticated Twitch IRC bot client as @${botUsername}...`);
    const authProvider = new StaticAuthProvider(process.env.VITE_TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5', token);
    botClient = new ChatClient({ authProvider });
  } else {
    console.log('[Twitch Bot] Initializing anonymous read-only Twitch IRC bot client...');
    botClient = new ChatClient({});
  }
  
  try {
    botClient.connect();
  } catch (connectErr: any) {
    console.error('[Twitch Bot] Connection error during initial connect:', connectErr.message);
  }

  botClient.onConnect(() => {
    console.log(`[Twitch Bot] Successfully connected to Twitch IRC server`);
    
    // Join any channels that requested to join before the bot finished connecting
    for (const chan of activeChannels) {
      console.log(`[Twitch Bot] Joining accumulated pre-connection channel #${chan}`);
      botClient?.join(chan).catch(err => {
        console.error(`[Twitch Bot] Failed to join channel #${chan}:`, err.message);
      });
    }
    
    // Periodically fetch active rooms from Supabase DB to heal from server restarts
    joinAllActiveRooms();
  });
  
  // Synchronized Real-Time Listeners for Twitch IRC native moderation events
  botClient.onBan(async (channel, username, _msg) => {
    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();
    const reason = 'Ban via chat';
    console.log(`[Twitch IRC Event] User @${username} was BANNED in native chat channel #${login}. Reason: ${reason}`);
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: rooms } = await supabaseAdmin
        .from('rooms')
        .select('id, twitch_channel_id, room_settings(settings_json)')
        .eq('is_active', true);
        
      if (!rooms) return;

      const matchedRoom = rooms.find(r => {
        const settingsRaw = Array.isArray(r.room_settings) 
          ? (r.room_settings[0] as any)?.settings_json 
          : (r.room_settings as any)?.settings_json;
        
        const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
          || String(r.twitch_channel_id || '').toLowerCase();
          
        return streamerLogin === login || String(r.twitch_channel_id || '').toLowerCase() === login;
      });

      if (matchedRoom) {
        const roomId = matchedRoom.id;
        const state = Array.isArray(matchedRoom.room_settings) 
          ? (matchedRoom.room_settings[0] as any)?.settings_json 
          : (matchedRoom.room_settings as any)?.settings_json || {};

        if (state) {
          const wasBannedObj = (state.users || []).find((u: any) => 
            u.name?.toLowerCase() === username.toLowerCase() || u.twitchData?.login?.toLowerCase() === username.toLowerCase()
          );
          const wasBannedInState = wasBannedObj?.isBanned;
          const wasInBlacklist = state.blacklistUsernames?.map((n: string) => n.toLowerCase()).includes(username.toLowerCase());
          
          if (wasBannedInState && wasInBlacklist) {
            console.log(`[Twitch IRC Event Sync] Skipped: Ban for @${username} is already persisted/active.`);
            return;
          }

          const blacklistUsernames = [...(state.blacklistUsernames || [])];
          if (!blacklistUsernames.includes(username.toLowerCase())) {
            blacklistUsernames.push(username.toLowerCase());
          }

          let targetUserId = '';
          const updatedUsers = (state.users || []).map((u: any) => {
            if (u.name?.toLowerCase() === username.toLowerCase() || u.twitchData?.login?.toLowerCase() === username.toLowerCase()) {
              targetUserId = u.userId;
              return { ...u, isBanned: true };
            }
            return u;
          });

          // Eliminate pending queue items from database as well
          const updatedQueue = (state.queue || []).filter((v: any) => {
            const isUserVid = v.submitter?.toLowerCase() === username.toLowerCase();
            return !isUserVid;
          });

          const updatedState = { ...state, users: updatedUsers, queue: updatedQueue, blacklistUsernames };
          await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);
          
          if (ablyRest) {
            const channelObj = ablyRest.channels.get(`session:${roomId}`);
            await channelObj.publish('session_state', updatedState);
            if (targetUserId) {
              await channelObj.publish('kick', { userId: targetUserId, reason: reason || 'Banido no chat da Twitch.' });
            }
          }
          console.log(`[Twitch IRC Event Sync] Applied ban for user @${username} on session card in room ${roomId}`);
        }
      }
    } catch (err: any) {
      console.error('[Twitch IRC Event Ban Sync Error]', err.message);
    }
  });

  botClient.onTimeout(async (channel, username, duration, _msg) => {
    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();
    const reason = 'Timeout via chat';
    console.log(`[Twitch IRC Event] User @${username} was TIMED OUT in channel #${login} for ${duration}s. Reason: ${reason}`);
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: rooms } = await supabaseAdmin
        .from('rooms')
        .select('id, twitch_channel_id, room_settings(settings_json)')
        .eq('is_active', true);
        
      if (!rooms) return;

      const matchedRoom = rooms.find(r => {
        const settingsRaw = Array.isArray(r.room_settings) 
          ? (r.room_settings[0] as any)?.settings_json 
          : (r.room_settings as any)?.settings_json;
        
        const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
          || String(r.twitch_channel_id || '').toLowerCase();
          
        return streamerLogin === login || String(r.twitch_channel_id || '').toLowerCase() === login;
      });

      if (matchedRoom) {
        const roomId = matchedRoom.id;
        const state = Array.isArray(matchedRoom.room_settings) 
          ? (matchedRoom.room_settings[0] as any)?.settings_json 
          : (matchedRoom.room_settings as any)?.settings_json || {};

        if (state) {
          const timeoutUntil = Date.now() + (duration * 1000);
          const targetUser = (state.users || []).find((u: any) => 
            u.name?.toLowerCase() === username.toLowerCase() || u.twitchData?.login?.toLowerCase() === username.toLowerCase()
          );
          if (targetUser?.timeoutUntil && Math.abs(targetUser.timeoutUntil - timeoutUntil) < 10000) {
            console.log(`[Twitch IRC Event Sync] Skipped: Timeout for @${username} is already persisted/active.`);
            return;
          }

          const updatedUsers = (state.users || []).map((u: any) => {
            if (u.name?.toLowerCase() === username.toLowerCase() || u.twitchData?.login?.toLowerCase() === username.toLowerCase()) {
              return { ...u, timeoutUntil };
            }
            return u;
          });

          const updatedState = { ...state, users: updatedUsers };
          await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);
          
          if (ablyRest) {
            const channelObj = ablyRest.channels.get(`session:${roomId}`);
            await channelObj.publish('session_state', updatedState);
          }
          console.log(`[Twitch IRC Event Sync] Applied timeout for @${username} on session card in room ${roomId} for ${duration}s.`);
        }
      }
    } catch (err: any) {
      console.error('[Twitch IRC Event Timeout Sync Error]', err.message);
    }
  });

  botClient.onMessage(async (channel, username, message, msg) => {
    // Map Twurple msg to legacy tags to avoid massive rewrite of limit handlers
    const tags: any = {};
    for (const [key, val] of msg.tags.entries()) tags[key] = val;
    tags['id'] = msg.id;
    tags['username'] = username;
    tags['display-name'] = msg.userInfo.displayName || username;
    tags['user-id'] = msg.userInfo.userId;
    tags['room-id'] = msg.channelId || tags['room-id'];
    tags['color'] = msg.userInfo.color;
    tags['badges'] = {};
    for (const [badge, version] of msg.userInfo.badges.entries()) tags['badges'][badge] = version;
    if (msg.userInfo.isSubscriber) tags['subscriber'] = '1';

    // Prevent duplicate processing of the same Twitch message ID
    const msgId = msg.id;
    if (msgId) {
      if (processedMessages.has(msgId)) {
        console.log(`[Twitch Bot] Duplicate message ignored: ${msgId}`);
        return;
      }
      processedMessages.add(msgId);
      if (processedMessages.size > 2000) {
        const oldest = processedMessages.values().next().value;
        if (oldest) processedMessages.delete(oldest);
      }
    }

    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();

    // 1. Live presence registration for any chat event (highly fluid and metadata rich!)
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: rooms } = await supabaseAdmin
          .from('rooms')
          .select('id, twitch_channel_id, room_settings(settings_json)')
          .eq('is_active', true);
          
        if (rooms && rooms.length > 0) {
          const matchedRoom = rooms.find(r => {
            const settingsRaw = Array.isArray(r.room_settings) 
              ? (r.room_settings[0] as any)?.settings_json 
              : (r.room_settings as any)?.settings_json;
            
            const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
              || String(r.twitch_channel_id || '').toLowerCase();
              
            const channelRoomId = tags ? String(tags['room-id'] || tags['room_id'] || '') : null;
            
            return streamerLogin === login || 
                   String(r.twitch_channel_id || '').toLowerCase() === login ||
                   (channelRoomId && String(r.twitch_channel_id || '') === channelRoomId) ||
                   (channelRoomId && String(settingsRaw?.twitchData?.twitchUserId || '') === channelRoomId);
          });

          if (matchedRoom) {
            const roomId = matchedRoom.id;
            const settingsRaw = Array.isArray(matchedRoom.room_settings) 
              ? (matchedRoom.room_settings[0] as any)?.settings_json 
              : (matchedRoom.room_settings as any)?.settings_json;
            const state: any = settingsRaw || {};
            
            if (state.settings) {
              const username = tags['username'] || 'TwitchUser';
              const displayName = tags['display-name'] || username;
              const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();

              const changed = registerOrUpdateTwitchChatterFromTags(state, userId, username, displayName, tags, matchedRoom.twitch_channel_id);
              if (changed) {
                // Update persistent session state settings JSON
                await supabaseAdmin.from('room_settings').update({ settings_json: state }).eq('room_id', roomId);
                
                if (ablyRest) {
                  const ablyChannel = ablyRest.channels.get(`session:${roomId}`);
                  await ablyChannel.publish('session_state', state);
                }
              }
            }
          }
        }
    } catch (presenceErr: any) {
        console.error('[Twitch Bot Presence Registry Error]:', presenceErr.message);
    }

    // 2. Process link submissions if message contains URL
    const hasProtocol = message.includes('http://') || message.includes('https://');
    const hasKnownDomain = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|x\.com|twitter\.com/i.test(message);
    
    if (!hasProtocol && !hasKnownDomain) return;
    
    // Improved regex to capture URLs with or without http/https
    // Adjusted to match until whitespace to capture the complete URL properly, preventing truncation of path parameters, slashes, or query variables.
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_\-]+[^\s]*|youtu\.be\/[a-zA-Z0-9_\-]+[^\s]*|youtube\.com\/shorts\/[a-zA-Z0-9_\-]+[^\s]*|instagram\.com\/(?:p|reel|reels|tv)\/[^\s]+|tiktok\.com\/@[\w.-]+\/video\/\d+[^\s]*|tiktok\.com\/v\/\d+[^\s]*|twitter\.com\/\w+\/status\/\d+[^\s]*|x\.com\/\w+\/status\/\d+[^\s]*|[a-zA-Z0-9_.+-]+\.[a-zA-Z0-9-.]+\/[^\s]*)/gi;
    
    let rawMatches = message.match(urlRegex) || [];
    if (rawMatches.length === 0) {
      // Fallback check if regex missed but we had https://
      if (!hasProtocol) return;
      const fallbackUrls = message.match(/https?:\/\/[^\s]+/g);
      if (!fallbackUrls) return;
      rawMatches = fallbackUrls;
    }
    
    // Normalize and add https:// if missing
    const urlsToProcess = rawMatches.map(u => u.startsWith('http') ? u : `https://${u}`);
    const urls = Array.from(new Set(urlsToProcess));

    console.log(`[Twitch Bot Msg] Scraped video link message in channel #${login} from @${tags.username}: ${message} -> Extracted: ${urls.join(', ')}`);
    
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: rooms } = await supabaseAdmin
          .from('rooms')
          .select('id, twitch_channel_id, room_settings(settings_json)')
          .eq('is_active', true);
          
        if (!rooms || rooms.length === 0) {
          console.log(`[Twitch Bot Msg] Discarded link; no active rooms are currently running in the database.`);
          return;
        }

        // Search case-insensitively in memory comparing with stored metadata
        const matchedRoom = rooms.find(r => {
          const settingsRaw = Array.isArray(r.room_settings) 
            ? (r.room_settings[0] as any)?.settings_json 
            : (r.room_settings as any)?.settings_json;
          
          const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
            || String(r.twitch_channel_id || '').toLowerCase();
            
          const channelRoomId = tags ? String(tags['room-id'] || tags['room_id'] || '') : null;
          
          return streamerLogin === login || 
                 String(r.twitch_channel_id || '').toLowerCase() === login ||
                 (channelRoomId && String(r.twitch_channel_id || '') === channelRoomId) ||
                 (channelRoomId && String(settingsRaw?.twitchData?.twitchUserId || '') === channelRoomId);
        });

        if (!matchedRoom) {
          console.warn(`[Twitch Bot Msg] No matching active room found in database for channel #${login}. I have ${rooms.length} active rooms.`);
          return;
        }
        
        const roomId = matchedRoom.id;
        const settingsRaw = Array.isArray(matchedRoom.room_settings) ? (matchedRoom.room_settings[0] as any)?.settings_json : (matchedRoom.room_settings as any)?.settings_json;
        const state: any = settingsRaw || {};
        if (!state.settings) {
          console.warn(`[Twitch Bot] Room settings state for room ${roomId} was empty.`);
          return;
        }

        for (const url of urls) {
          const username = tags['username'] || 'TwitchUser';
          const displayName = tags['display-name'] || username;
          const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();

          const rawBadges = tags.badges || {};
          const actualBadges = Object.keys(rawBadges);

          const isHost = userId === state.hostId || actualBadges.includes('broadcaster') || username.toLowerCase() === login;

          const hostUser = (state.users || []).find((u: any) => u.isHost || u.userId === state.hostId);
          let broadcasterId = state.twitchData?.twitchUserId || hostUser?.twitchData?.twitchUserId || matchedRoom.twitch_channel_id;
          const broadcasterToken = state.twitchData?.providerToken || hostUser?.twitchData?.providerToken;

          if (broadcasterId && typeof broadcasterId === 'string' && broadcasterId.includes('-')) {
             broadcasterId = matchedRoom.twitch_channel_id; // fallback
          }

          try {
            await ensureTwitchChatUserRegistered(
              state,
              userId,
              username,
              displayName,
              tags,
              broadcasterId || '',
              broadcasterToken
            );
          } catch (regErr: any) {
            console.error(`[ensureTwitchChatUserRegistered Error]`, regErr.message);
          }

          const userRecord = (state.users || []).find((u: any) => u.userId === userId || u.name?.toLowerCase() === username.toLowerCase() || u.twitchData?.login?.toLowerCase() === username.toLowerCase());

          // 1. BAN AND TIMEOUT ENFORCEMENT
          if (!isHost) {
            const status = checkUserActionStatus(state, userId, username, userId);

            if (status.banned) {
              console.warn(`[Twitch Bot] User @${username} is banned/blacklisted.`);
              // We intentionally skip chat feedback for blacklisted accounts to prevent troll spamming.
              continue;
            }

            if (status.timedOut) {
              console.warn(`[Twitch Bot] User @${username} is on timeout.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Mutado (timeout de ${status.remainingSeconds}s).`);
              continue;
            }
          }

          // 2. URL SANITIZATION AND VALIDATION
          const result = sanitizeAndValidateUrl(url, state.settings);
          if (!result.valid || !result.normalizedUrl) {
            console.warn(`[Twitch Bot] URL validation failed: ${url}. Reason: ${result.error}`);
            const reason = result.error || 'link inválido.';
            sendBotMessage(channel, `@${displayName} ❌ Link inválido: ${reason}`);
            continue;
          }
          const platform = result.platform || 'other';
          const verifyState = await verifyVideoContent(result.normalizedUrl, platform, state.settings?.blockLiveStreams ?? true);
          if (!verifyState.valid) {
            console.warn(`[Twitch Bot] Video content verification failed: ${result.normalizedUrl}. Reason: ${verifyState.error}`);
            const reason = verifyState.error || 'erro de verificação.';
            sendBotMessage(channel, `@${displayName} ❌ Vídeo rejeitado: ${reason}`);
            continue;
          }

          // 3. DUPLICATE CHECK
          const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
          const isDuplicate = (state.queue || []).some((v: any) => extractCanonicalVideoId(v.url, v.platform) === canonicalId);
          if (isDuplicate) {
            console.warn(`[Twitch Bot] Link already present in queue as ${canonicalId}`);
            sendBotMessage(channel, `@${displayName} ⚠️ Já está na fila!`);
            continue;
          }

          // 4. LIMIT AND COOLDOWN CHECKS
          if (!isHost) {
            const maxQueueSize = state.settings?.maxQueueSize !== undefined ? state.settings.maxQueueSize : (state.settings?.max_queue_size ?? 0);
            if (maxQueueSize > 0 && (state.queue || []).length >= maxQueueSize) {
              console.warn(`[Twitch Bot] Queue is full.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Fila cheia (limite ${maxQueueSize}).`);
              continue;
            }

            const userActive = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
            const maxVideos = state.settings?.maxVideosPerUser !== undefined ? state.settings.maxVideosPerUser : (state.settings?.max_videos_per_user ?? 0);
            if (maxVideos > 0 && userActive >= maxVideos) {
              console.warn(`[Twitch Bot] User @${username} has reached the limit of ${maxVideos} videos.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Limite atingido (${maxVideos} vídeo(s) na fila).`);
              continue;
            }

            if (state.settings?.maxSubmissionsPerHour > 0) {
              const oneHourAgo = Date.now() - 3600000;
              const hourlySubmissions = [...(state.queue || []), ...(state.history || [])]
                .filter((v: any) => v.submitterId === userId && v.timestamp && v.timestamp > oneHourAgo).length;
              if (hourlySubmissions >= state.settings.maxSubmissionsPerHour) {
                console.warn(`[Twitch Bot] User @${username} hourly submission limit reached.`);
                sendBotMessage(channel, `@${displayName} ⚠️ Limite por hora atingido (${state.settings.maxSubmissionsPerHour} envios).`);
                continue;
              }
            }

            if (state.settings?.userCooldownSeconds > 0 && userRecord?.lastSubmittedAt) {
              const elapsed = (Date.now() - userRecord.lastSubmittedAt) / 1000;
              if (elapsed < state.settings.userCooldownSeconds) {
                const remaining = Math.ceil(state.settings.userCooldownSeconds - elapsed);
                console.warn(`[Twitch Bot] User @${username} is in individual cooldown.`);
                sendBotMessage(channel, `@${displayName} ⚠️ Cooldown individual (restam ${remaining}s).`);
                continue;
              }
            }

            if (state.settings?.globalCooldownSeconds > 0) {
              let lastGlobalTime = state.lastGlobalSubmissionAt || 0;
              (state.queue || []).forEach((v: any) => {
                if (v.timestamp && v.timestamp > lastGlobalTime) {
                  lastGlobalTime = v.timestamp;
                }
              });
              const elapsed = (Date.now() - lastGlobalTime) / 1000;
              if (elapsed < state.settings.globalCooldownSeconds) {
                const remaining = Math.ceil(state.settings.globalCooldownSeconds - elapsed);
                console.warn(`[Twitch Bot] Global cooldown active.`);
                sendBotMessage(channel, `@${displayName} ⚠️ Canal em cooldown (restam ${remaining}s).`);
                continue;
              }
            }

            const finalIsSubscriber = !!userRecord?.twitchData?.isSubscriber || actualBadges.includes('subscriber') || actualBadges.includes('founder') || !!tags.subscriber;
            if (state.settings?.requireSub && !finalIsSubscriber) {
              console.warn(`[Twitch Bot] User @${username} is not sub.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Apenas inscritos (subs) podem enviar.`);
              continue;
            }

            const finalIsFollower = !!userRecord?.twitchData?.isFollower;
            if (state.settings?.requireFollower && !finalIsFollower) {
              console.warn(`[Twitch Bot] User @${username} is not follower.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Apenas seguidores podem enviar.`);
              continue;
            }

            if (state.settings?.minFollowMinutes > 0) {
              if (!finalIsFollower) {
                sendBotMessage(channel, `@${displayName} ⚠️ Apenas seguidores podem enviar.`);
                continue;
              }
              const finalFollowedAt = userRecord?.twitchData?.followedAt;
              if (finalFollowedAt) {
                const followDate = new Date(finalFollowedAt).getTime();
                const minsDiff = (Date.now() - followDate) / (1000 * 60);
                if (minsDiff < state.settings.minFollowMinutes) {
                  const remaining = Math.ceil(state.settings.minFollowMinutes - minsDiff);
                  console.warn(`[Twitch Bot] User @${username} followed for insufficient duration.`);
                  sendBotMessage(channel, `@${displayName} ⚠️ Siga há mais de ${state.settings.minFollowMinutes}m (faltam ${remaining}m).`);
                  continue;
                }
              }
            }
          }

          let priority_score = 0;
          if (isHost) priority_score += 1000;
          else if (actualBadges.includes('moderator')) priority_score += 50;
          else if (actualBadges.includes('vip')) priority_score += 15;
          else if (userRecord?.twitchData?.isSubscriber || actualBadges.includes('subscriber') || actualBadges.includes('founder')) priority_score += 10;
          else if (userRecord?.twitchData?.isFollower) priority_score += 2;

          const nowD = new Date();
          const dataEnvio = nowD.toLocaleDateString('pt-BR');
          const horaEnvio = nowD.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const newVideo = {
            id: `vid_${canonicalId}_${Date.now()}`,
            submitter: displayName,
            submitterId: userId,
            url: result.normalizedUrl,
            platform,
            title: verifyState.title || 'Vídeo do Chat',
            status: (state.settings?.isManualApprovalRequired && !isHost) ? 'pending' : 'approved',
            timestamp: Date.now(),
            priority_score,
            dataEnvio,
            horaEnvio
          };

          const updatedQueue = [...(state.queue || [])];
          updatedQueue.push(newVideo);

          const updatedUsers = (state.users || []).map((u: any) => {
            if (u.userId === userId) {
              return {
                ...u,
                lastSubmittedAt: Date.now()
              };
            }
            return u;
          });

          const updatedState = { 
            ...state, 
            queue: updatedQueue, 
            users: updatedUsers,
            lastGlobalSubmissionAt: Date.now()
          };

          await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);
          console.log(`[Twitch Bot] Added new video "${newVideo.title}" (${platform}) to room ${roomId} submitted by Chat user @${displayName}`);

          if (ablyRest) {
            const ablyChannel = ablyRest.channels.get(`session:${roomId}`);
            await ablyChannel.publish('session_state', updatedState);
          }

          if (newVideo.status === 'pending') {
            sendBotMessage(channel, `@${displayName} 📥 Vídeo em aprovação.`);
          } else {
            const approvedCount = updatedState.queue.filter((v: any) => v.status === 'approved').length;
            sendBotMessage(channel, `@${displayName} ✅ Vídeo adicionado! Fila: #${approvedCount}.`);
          }
          break;
        }
    } catch(err: any) {
      console.error('[Twitch Bot] Exception encountered while parsing message link:', err.message);
    }
  });
}, 2000);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const sessionWatchedCache = new Map<string, any[]>();

export function updateWatchedCache(roomId: string, watchedVideos: any[]) {
    let cache = sessionWatchedCache.get(roomId) || [];
    const newItems = watchedVideos.map(v => ({
       id: v.id,
       url: v.url,
       usuario: v.submitter,
       timestamp_envio: v.timestamp,
       timestamp_reproducao: v.watchedAt || Date.now(),
       status: 'watched',
       badges: []
    }));
    const unique = [...cache, ...newItems].reduce((acc: any[], current) => {
      const x = acc.find(item => item.id === current.id);
      if (!x) return acc.concat([current]);
      return acc;
    }, []);
    sessionWatchedCache.set(roomId, unique);
}

// Admin / Host route to get fast session memory cache
app.get('/api/sessions/:id/watched_cache', (req, res) => {
   const roomId = req.params.id;
   const cache = sessionWatchedCache.get(roomId) || [];
   res.json({ success: true, cache });
});

// Auto-cleanup DB interval (every 10 mins)
setInterval(async () => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: settings } = await supabaseAdmin.from('room_settings').select('room_id, settings_json');
    if (!settings) return;

    for (const room of settings) {
      // General video table cleanup
      const retentionHours = room.settings_json?.videoRetentionHours ?? room.settings_json?.video_retention_hours ?? 48;
      if (retentionHours > 0 && retentionHours <= 48) {
        const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
        await supabaseAdmin.from('videos').delete().eq('room_id', room.room_id).lt('inserted_at', cutoffTime);
      }

      // 2h Watched Retention Policy
      if (room.settings_json) {
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        let modified = false;
        
        let newQueue = room.settings_json.queue || [];
        let newHistory = room.settings_json.history || [];

        const initialQ = newQueue.length;
        const initialH = newHistory.length;

        newQueue = newQueue.filter((v: any) => !(v.status === 'watched' && v.watchedAt && v.watchedAt < twoHoursAgo));
        newHistory = newHistory.filter((v: any) => !(v.status === 'watched' && v.watchedAt && v.watchedAt < twoHoursAgo));

        if (newQueue.length !== initialQ || newHistory.length !== initialH) {
           await supabaseAdmin.from('room_settings').update({
             settings_json: { ...room.settings_json, queue: newQueue, history: newHistory }
           }).eq('room_id', room.room_id);
        }
      }
    }
  } catch (err) {
    console.error('[Cleanup Interval Error]:', err);
  }
}, 1000 * 60 * 10);

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RATE LIMIT ON HTTP LEVEL
const ipHttpTrack = new Map<string, { count: number, resetTime: number }>();
app.use('/api', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const track = ipHttpTrack.get(ip);
  if (!track || now > track.resetTime) {
    ipHttpTrack.set(ip, { count: 1, resetTime: now + 60000 }); // reset every 60s
    next();
  } else {
    track.count++;
    if (track.count > 120) { // Limit to 120 HTTP API calls per minute
      return res.status(429).json({ error: 'Muitas requisições. Bloqueio por excesso.' });
    }
    next();
  }
});

const WHITELIST_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'redditmedia.com',
  'v.redd.it',
  'redd.it',
  'facebook.com',
  'fb.watch',
  'fb.gg',
  'fbcdn.net',
  'fbsbx.com',
  'vimeo.com'
];

// Content blocklisting preseeds (suspicious / maliciosos / +18 / unknown encurtadores)
const BLOCKLIST_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'onlyfans.com', 'redtube.com', 'chaturbate.com', 
  'phncdn.com', 'livejasmin.com', 'youporn.com', 'bongacams.com', 'stripchat.com', 'tube8.com',
  'bit.ly', 'tinyurl.com', 'is.gd', 'buff.ly', 't.co', 'lnkd.in', 'goo.gl', 'cutt.ly', 'rebrand.ly', 'ow.ly', 'shorturl.at'
];

interface SecurityCheckResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
  platform?: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'other';
}

// XSS/HTML Input sanitizer
function sanitizeInput(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Normalize, parse, check unicode exploits, and blacklist restrictions of incoming URLs
export function sanitizeAndValidateUrl(rawUrl: string, settings: any): SecurityCheckResult {
  try {
    let cleanUrl = rawUrl.trim();
    
    // 1. Validate protocol (HTTPS mandatory)
    if (!cleanUrl.startsWith('https://')) {
      return { valid: false, error: 'Apenas links seguros https:// (HTTPS obrigatório) são aceitos.' };
    }

    // 2. Decode percent encoding to catch obfuscated bypasses
    let decodedUrl = cleanUrl;
    try {
      decodedUrl = decodeURIComponent(cleanUrl);
    } catch(e) {}

    // 3. Parse URL
    const parsedUrl = new URL(decodedUrl);
    let hostname = parsedUrl.hostname.toLowerCase();

    // 4. Handle Punycode and Unicode Detection
    const asciiHostname = punycode.toASCII(hostname);
    if (hostname !== asciiHostname) {
      return { valid: false, error: 'Tentativa de bypass utilizando domínio Unicode/Punycode detectada.' };
    }

    // Check for character variations or weird overlays (Homograph exploits)
    const normalizedHostname = hostname.normalize('NFKC');
    if (normalizedHostname !== hostname) {
      return { valid: false, error: 'Bypass de caracteres mascarados detectado no domínio.' };
    }

    // Block access by IP addresses
    const isIpHost = /^[0-9.]+$/.test(hostname) || hostname.includes(':');
    if (isIpHost) {
      return { valid: false, error: 'Tentativa de submissão por endereço IP direto bloqueada.' };
    }

    const domainMode = settings?.domainMode || 'both';
    let blockDomains = settings?.domainBlacklist && settings?.domainBlacklist?.length > 0 ? settings.domainBlacklist : BLOCKLIST_DOMAINS;
    let whiteDomains = settings?.domainWhitelist && settings?.domainWhitelist?.length > 0 ? settings.domainWhitelist : WHITELIST_DOMAINS;

    // 5. Blocklist review
    if (domainMode === 'both' || domainMode === 'blacklist_only') {
      const hostParts = hostname.split('.');
      for (const blockDomain of blockDomains) {
        if (hostname === blockDomain || hostname.endsWith('.' + blockDomain)) {
          return { valid: false, error: 'Domínio bloqueado pelas configurações da sala (Blacklist).' };
        }
      }
    }

    // 6. Whitelist matching
    let matchedWhitelist = false;
    let platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'other' = 'other';

    if (domainMode === 'both' || domainMode === 'whitelist_only') {
      for (const whitelistDomain of whiteDomains) {
        if (hostname === whitelistDomain || hostname.endsWith('.' + whitelistDomain)) {
          matchedWhitelist = true;
          if (hostname.includes('youtube') || hostname === 'youtu.be') {
            platform = 'youtube';
          } else if (hostname.includes('instagram')) {
            platform = 'instagram';
          } else if (hostname.includes('tiktok')) {
            platform = 'tiktok';
          } else if (hostname.includes('twitter') || hostname === 'x.com' || hostname.endsWith('.x.com')) {
            platform = 'twitter';
          }
          break;
        }
      }
    } else {
      matchedWhitelist = true; // allow all if blacklist_only
      if (hostname.includes('youtube') || hostname === 'youtu.be') {
        platform = 'youtube';
      } else if (hostname.includes('instagram')) {
        platform = 'instagram';
      } else if (hostname.includes('tiktok')) {
        platform = 'tiktok';
      } else if (hostname.includes('twitter') || hostname === 'x.com' || hostname.endsWith('.x.com')) {
        platform = 'twitter';
      }
    }

    // Direct video CDN format backup
    if (!matchedWhitelist) {
      const isDirectFile = parsedUrl.pathname.match(/\.(mp4|webm|ogg|m3u8)$/i);
      if (isDirectFile) {
        platform = 'other';
      } else {
        return { 
          valid: false, 
          error: 'Domínio não está na lista de servidores confiáveis (whitelist). Use apenas canais de vídeo autorizados pelo Streamer.' 
        };
      }
    }

    return {
      valid: true,
      normalizedUrl: parsedUrl.toString(),
      platform
    };
  } catch (err: any) {
    return { valid: false, error: 'URL mal formada ou insolvível.' };
  }
}

// Check DNS presence of the target domain to ensure it is actually online
async function checkDnsHost(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    return new Promise((resolve) => {
      dns.lookup(parsed.hostname, (err, address) => {
        resolve(!err && !!address);
      });
    });
  } catch(e) {
    return false;
  }
}

// Live URL check using oembed or low-timeout HEAD queries to catch 404, 410, etc.
export async function verifyVideoContent(
  url: string, 
  platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'other',
  blockLive: boolean
): Promise<{ valid: boolean, error?: string, title?: string }> {
  try {
    if (platform === 'youtube') {
      // Catch live occurrences
      if (blockLive && (url.includes('/live/') || url.includes('live'))) {
        return { valid: false, error: 'Transmissões ao vivo (Live Streams) estão bloqueadas nesta sala.' };
      }
      
      let title = 'Vídeo do YouTube';
      let isLive = false;
      try {
         const res = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 3500 });
         if (res.status === 200) {
           title = res.data.title || title;
           isLive = (title).toLowerCase().includes('live');
         }
      } catch (oembedErr: any) {
         console.warn(`[Content Check Warning] YouTube oEmbed failed for ${url}:`, oembedErr.message);
      }

      if (blockLive && isLive) {
         return { valid: false, error: 'Transmissões ao vivo (Live Streams) estão desabilitadas nas configurações.' };
      }
      return { valid: true, title };
      
    } else if (platform === 'tiktok') {
      const res = await axios.get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 3500 });
      if (res.status === 200) {
        return { valid: true, title: res.data.title || 'Vídeo do TikTok' };
      }
    } else if (platform === 'instagram') {
      const match = url.match(/(?:instagram\.com)\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_\-]+)/i);
      if (!match) return { valid: false, error: 'Identificador do Instagram mal formado.' };
      
      const checkUrl = `https://www.instagram.com/p/${match[1]}/embed/`;
      const res = await axios.get(checkUrl, { timeout: 3500, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 200) {
        return { valid: true, title: 'Instagram Reel' };
      }
    } else if (platform === 'twitter') {
      return { valid: true, title: 'Vídeo do X/Twitter' };
    } else if (platform === 'other') {
      const res = await axios.head(url, { timeout: 3500, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status >= 200 && res.status < 400) {
        return { valid: true, title: 'Arquivo de Mídia Direta' };
      }
    }
  } catch (err: any) {
    if (err.response && (err.response.status === 404 || err.response.status === 410)) {
      return { valid: false, error: 'O link enviado é inválido ou quebrado (Erro 404 / 410 no servidor).' };
    }
    console.warn(`[Content Check Warning] ${url}:`, err.message);
  }
  // Safe fallback if target server prevents scraping headers but exists
  return { valid: true, title: 'Conteúdo Sincronizado' };
}

// Canonical identification to prevent double entries (youtu.be vs youtube.com, etc)
export function extractCanonicalVideoId(url: string, platform: string): string {
  try {
    const decoded = decodeURIComponent(url);
    if (platform === 'youtube') {
      const match = decoded.match(/(?:v=|shorts\/|embed\/|\/)([a-zA-Z0-9_\-]{11})/);
      return match ? match[1] : decoded;
    } else if (platform === 'instagram') {
      const match = decoded.match(/(?:p|reel|reels|tv)\/([a-zA-Z0-9_\-]+)/);
      return match ? match[1] : decoded;
    } else if (platform === 'tiktok') {
      const match = decoded.match(/\/video\/(\d+)/) || decoded.match(/v\/(\d+)/);
      return match ? match[1] : decoded;
    } else if (platform === 'twitter') {
      const match = decoded.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(\d+)/);
      return match ? match[1] : decoded;
    }
  } catch (e) {}
  return url;
}

// Helper functions to dynamically obtain client_id and check follower/sub states in real-time
async function getTwitchClientId(token: string): Promise<string> {
  try {
     const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: {
           'Authorization': `OAuth ${token}`
         },
         timeout: 4000
     });
     if (valRes.data && valRes.data.client_id) {
        return valRes.data.client_id;
     }
  } catch (e: any) {
     console.error('[Twitch Validation] Error validating token in helper:', e.message);
  }
  return 'gp762nuuoqcoxypju8c569th9wz7q5'; // standard app client ID fallback
}

const followCache = new Map<string, { result: { isFollower: boolean; followedAt?: string }, timestamp: number }>();
const subCache = new Map<string, { result: boolean, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

async function checkTwitchFollower(broadcasterId: string, userId: string, token: string): Promise<{ isFollower: boolean; followedAt?: string }> {
  const cacheKey = `f_${broadcasterId}_${userId}`;
  const cached = followCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;
  
  try {
    const clientId = await getTwitchClientId(token);
    const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}&moderator_id=${broadcasterId}`;
    const res = await axios.get(url, {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    const d = res.data?.data;
    if (d && d.length > 0) {
      const result = { isFollower: true, followedAt: d[0].followed_at };
      followCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
  } catch (err: any) {
    console.warn(`[Twitch Helix Follower Check] API lookup failed:`, err.response?.data || err.message);
  }
  const emptyRes = { isFollower: false };
  followCache.set(cacheKey, { result: emptyRes, timestamp: Date.now() });
  return emptyRes;
}

async function checkTwitchSubscriber(broadcasterId: string, userId: string, token: string): Promise<boolean> {
  const cacheKey = `s_${broadcasterId}_${userId}`;
  const cached = subCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

  try {
    const clientId = await getTwitchClientId(token);
    const url = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&user_id=${userId}`;
    const res = await axios.get(url, {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    const d = res.data?.data;
    if (d && d.length > 0) {
      subCache.set(cacheKey, { result: true, timestamp: Date.now() });
      return true;
    }
  } catch (err: any) {
    console.warn(`[Twitch Helix Subscriber Check] API lookup failed or unauthorized:`, err.response?.data || err.message);
  }
  subCache.set(cacheKey, { result: false, timestamp: Date.now() });
  return false;
}

async function checkUserFollowsBroadcaster(userId: string, broadcasterId: string, token: string): Promise<{ isFollower: boolean; followedAt?: string }> {
  try {
    const cacheKey = `f_${broadcasterId}_${userId}`;
    const cached = followCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

    const clientId = await getTwitchClientId(token);
    const url = `https://api.twitch.tv/helix/channels/followed?user_id=${userId}&broadcaster_id=${broadcasterId}`;
    const res = await axios.get(url, {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    const d = res.data?.data;
    if (d && d.length > 0) {
      const result = { isFollower: true, followedAt: d[0].followed_at };
      followCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
  } catch (err: any) {
    console.warn(`[Twitch Helix User Follows Check] API lookup failed:`, err.response?.data || err.message);
  }
  return { isFollower: false };
}

async function checkUserSubscriberToBroadcaster(broadcasterId: string, userId: string, token: string): Promise<boolean> {
  const cacheKey = `s_${broadcasterId}_${userId}`;
  const cached = subCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

  try {
    const clientId = await getTwitchClientId(token);
    const url = `https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${broadcasterId}&user_id=${userId}`;
    const res = await axios.get(url, {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    const d = res.data?.data;
    if (d && d.length > 0) {
      subCache.set(cacheKey, { result: true, timestamp: Date.now() });
      return true;
    }
  } catch (err: any) {
    console.warn(`[Twitch Helix User Subscription Check] API lookup failed:`, err.response?.data || err.message);
  }
  subCache.set(cacheKey, { result: false, timestamp: Date.now() });
  return false;
}

// Resolve shortened URLs on the server to bypass CORS and find actual video IDs
app.get('/api/resolve', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    const response = await axios.get(targetUrl, {
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    res.json({ url: response.request.res.responseUrl || response.config.url || targetUrl });
  } catch (error: any) {
    // If it fails or times out, return the original URL as a fallback
    res.json({ url: targetUrl });
  }
});

// Proxy route to fetch followed streams and follows list using client provider token to avoid CORS
app.get('/api/twitch/followed', async (req, res) => {
  const token = req.query.token as string;
  const userId = req.query.userId as string;
  if (!token || !userId) {
     return res.status(400).json({ error: 'Token and userId are required' });
  }

  let clientId = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';

  // Try to find the exact client ID of the user's token by validating it
  try {
     const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: {
           'Authorization': `OAuth ${token}`
        },
        timeout: 4000
     });
     if (valRes.data && valRes.data.client_id) {
        clientId = valRes.data.client_id;
     }
  } catch (e: any) {
     console.warn(`[Helix Followed API] Validation check failed:`, e.message);
  }

  let onlineList: any[] = [];
  let followedList: any[] = [];
  let apiError: string | null = null;

  try {
     // 1. Fetch live followed streams
     const streamsRes = await axios.get(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}`, {
        headers: {
           'Client-Id': clientId,
           'Authorization': `Bearer ${token}`
        },
        timeout: 4000
     });
     onlineList = (streamsRes.data?.data || []).map((stream: any) => ({
        ...stream,
        hasOpenedQueueBefore: historyHosts.has(stream.user_login?.toLowerCase())
     }));
  } catch (err: any) {
     console.warn(`[Helix Followed Streams Fail]:`, err.response?.data || err.message);
     apiError = err.response?.data?.message || err.message;
  }

  try {
     // 2. Fetch followed channels overall list
     const followsRes = await axios.get(`https://api.twitch.tv/helix/channels/followed?user_id=${userId}`, {
        headers: {
           'Client-Id': clientId,
           'Authorization': `Bearer ${token}`
        },
        timeout: 4000
     });
     followedList = (followsRes.data?.data || []).map((follow: any) => ({
        ...follow,
        hasOpenedQueueBefore: historyHosts.has(follow.broadcaster_login?.toLowerCase())
     }));
  } catch (err: any) {
     console.warn(`[Helix Followed Channels Fail]:`, err.response?.data || err.message);
     if (!apiError) {
        apiError = err.response?.data?.message || err.message;
     }
  }

  // Gracefully handle complete failure by returning an error message in body instead of a 500 status code
  if (onlineList.length === 0 && followedList.length === 0 && apiError) {
     return res.status(200).json({
        online: [],
        followed: [],
        error: `Failed to retrieve followed list: ${apiError}`
     });
  }

  res.json({
     online: onlineList,
     followed: followedList,
     ...(apiError ? { warning: apiError } : {})
  });
});

// GET /api/sessions/:id/twitch_chatters - Fetch live Twitch chatters (spectators) in broadcaster channel
app.get('/api/sessions/:id/twitch_chatters', async (req, res) => {
  try {
    const roomId = req.params.id;
    const state: any = await getSession(roomId);
    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
    const broadcasterToken = state.twitchData?.providerToken || hostUser?.twitchData?.providerToken;
    const broadcasterId = state.twitchData?.twitchUserId || hostUser?.twitchData?.twitchUserId;

    if (!broadcasterToken || !broadcasterId) {
      return res.status(200).json({ success: false, chatters: [], error: 'Broadcaster unauthenticated or credentials not found.' });
    }

    let clientId = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
    try {
      const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${broadcasterToken}` },
        timeout: 4000
      });
      if (valRes.data && valRes.data.client_id) {
        clientId = valRes.data.client_id;
      }
    } catch (e) {}

    const url = `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`;
    const chattersRes = await axios.get(url, {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${broadcasterToken}`
      },
      timeout: 5000
    });

    const chatters = chattersRes.data?.data || [];
    res.json({ success: true, chatters });
  } catch (err: any) {
    console.error('[Fetch Twitch Chatters Error]', err.response?.data || err.message);
    res.status(200).json({ success: false, chatters: [], error: err.response?.data?.message || err.message || 'Error fetching chatters' });
  }
});

// POST /api/sessions/:id/refresh_user_twitch - Force refresh specific user's Twitch metrics (follower, subscriber, followedAt) in database persistent store
app.post(['/sessions/:id/refresh_user_twitch', '/api/sessions/:id/refresh_user_twitch'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { targetUserId } = req.body?.data || req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Session not found.' });

    const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
    let broadcasterId = state.twitchData?.twitchUserId || hostUser?.twitchData?.twitchUserId;
    const broadcasterToken = state.twitchData?.providerToken || hostUser?.twitchData?.providerToken;

    if (!broadcasterId || (typeof broadcasterId === 'string' && broadcasterId.includes('-'))) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: roomDb } = await supabaseAdmin
          .from('rooms')
          .select('twitch_channel_id')
          .eq('id', roomId)
          .single();
        if (roomDb?.twitch_channel_id && !roomDb.twitch_channel_id.includes('-')) {
          broadcasterId = roomDb.twitch_channel_id;
        }
      } catch (e) {}
    }

    const userRecordIndex = state.users.findIndex((u: any) => u.userId === targetUserId);
    if (userRecordIndex === -1) {
      return res.status(404).json({ error: 'User not found in session.' });
    }

    const userRecord = state.users[userRecordIndex];
    const targetTwitchUserId = userRecord.twitchData?.twitchUserId;
    const userToken = userRecord.twitchData?.providerToken;

    let meetsFollower = false;
    let meetsSub = false;
    let followTimeStr = userRecord.twitchData?.followedAt || null;

    if (targetTwitchUserId && broadcasterId) {
      if (targetTwitchUserId === broadcasterId) {
        meetsFollower = true;
        meetsSub = true;
      } else {
        if (broadcasterToken) {
          try {
            const followCheck = await checkTwitchFollower(broadcasterId, targetTwitchUserId, broadcasterToken);
            if (followCheck.isFollower) {
              meetsFollower = true;
              followTimeStr = followCheck.followedAt || followTimeStr;
            }
          } catch (e) {}

          try {
            const subCheck = await checkTwitchSubscriber(broadcasterId, targetTwitchUserId, broadcasterToken);
            if (subCheck) {
              meetsSub = true;
            }
          } catch (e) {}
        }

        if ((!meetsFollower || !meetsSub) && userToken) {
          try {
            if (!meetsFollower) {
              const followCheckViewer = await checkUserFollowsBroadcaster(targetTwitchUserId, broadcasterId, userToken);
              if (followCheckViewer.isFollower) {
                meetsFollower = true;
                followTimeStr = followCheckViewer.followedAt || followTimeStr;
              }
            }
            if (!meetsSub) {
              const subCheckViewer = await checkUserSubscriberToBroadcaster(broadcasterId, targetTwitchUserId, userToken);
              if (subCheckViewer) {
                meetsSub = true;
              }
            }
          } catch (e) {}
        }
      }
    }

    const updatedTwitchData = {
      ...(userRecord.twitchData || {}),
      isFollower: meetsFollower || !!userRecord.twitchData?.isFollower,
      isSubscriber: meetsSub || !!userRecord.twitchData?.isSubscriber || !!userRecord.twitchData?.badges?.includes('subscriber'),
      followedAt: followTimeStr
    };

    const updatedUsers = [...state.users];
    updatedUsers[userRecordIndex] = {
      ...userRecord,
      twitchData: updatedTwitchData
    };

    const updatedState = { ...state, users: updatedUsers };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    console.error('[Refresh Twitch User Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/instagram-stream', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    const match = videoUrl.match(/(?:instagram\.com)\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_\-]+)/i);
    if (!match) {
      res.status(400).json({ error: 'Invalid Instagram URL' });
      return;
    }
    const igId = match[1];
    const cleanUrl = `https://www.instagram.com/p/${igId}/`;

    console.log(`[Instagram Resolver] Target ID: ${igId}, Normalized URL: ${cleanUrl}`);

    // Resolve using instagram-url-direct pkg
    const instagramGetUrl = typeof instagramGetUrlPkg === 'function' 
      ? instagramGetUrlPkg 
      : (instagramGetUrlPkg as any).instagramGetUrl || (instagramGetUrlPkg as any).default || instagramGetUrlPkg;

    let resolvedVideoUrl = '';

    if (typeof instagramGetUrl === 'function') {
      try {
        console.log('[Instagram Resolver] Attempting instagram-url-direct resolve');
        const data = await instagramGetUrl(cleanUrl);
        console.log('[Instagram Resolver] instagram-url-direct response:', JSON.stringify(data));
        
        if (data) {
          if (data.media_details && Array.isArray(data.media_details)) {
            const videoDetail = data.media_details.find((m: any) => m.type === 'video');
            if (videoDetail && videoDetail.url) {
              resolvedVideoUrl = videoDetail.url;
              console.log('[Instagram Resolver] Extracted from media_details:', resolvedVideoUrl);
            }
          }
          if (!resolvedVideoUrl && data.url_list && Array.isArray(data.url_list) && data.url_list.length > 0) {
            // Check if any of these link paths has mp4 or just grab the first video
            const videoLink = data.url_list.find((link: string) => link.includes('.mp4') || link.includes('video'));
            resolvedVideoUrl = videoLink || data.url_list[0];
            console.log('[Instagram Resolver] Extracted from url_list:', resolvedVideoUrl);
          }
        }
      } catch (err: any) {
        console.error('[Instagram Resolver] instagram-url-direct package failed:', err.message);
      }
    } else {
      console.warn('[Instagram Resolver] instagram-url-direct is not a function:', typeof instagramGetUrl);
    }

    // Secondary backup: try grabbing the meta fields from standard instagram.com page or embeds (proxied to bypass geo-blocks if needed)
    if (!resolvedVideoUrl) {
      const backupEndpoints = [
        `https://www.instagram.com/p/${igId}/embed/captioned/`,
        `https://www.instagram.com/p/${igId}/`
      ];

      for (const endpoint of backupEndpoints) {
        try {
          console.log(`[Instagram Resolver] Attempting scrap fallback relative to: ${endpoint}`);
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 5000
          });

          const html = response.data;
          const ogVideoSecureMatch = html.match(/<meta\s+property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i);
          const ogVideoMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i);
          const videoTagMatch = html.match(/<video[^>]*src=["']([^"']+)["']/i);

          if (ogVideoSecureMatch) {
            resolvedVideoUrl = ogVideoSecureMatch[1];
            break;
          } else if (ogVideoMatch) {
            resolvedVideoUrl = ogVideoMatch[1];
            break;
          } else if (videoTagMatch) {
            resolvedVideoUrl = videoTagMatch[1];
            break;
          }
        } catch (innerErr: any) {
          console.warn(`[Instagram Resolver] Scrap backup endpoint failed for ${endpoint}:`, innerErr.message);
        }
      }
    }

    if (resolvedVideoUrl) {
      // Decode secure properties representation (e.g. standard html quotes &amp;)
      resolvedVideoUrl = resolvedVideoUrl.replace(/&amp;/g, '&');
      res.json({ videoUrl: resolvedVideoUrl, isDirect: true });
      return;
    }

    // Fallback error, let UI present the manual external link button gracefully
    res.json({ 
      error: 'Incapaz de extrair link direto. Proteção do Instagram ativa ou link privado.', 
      videoUrl: videoUrl 
    });
  } catch (error: any) {
    console.error('Error resolving Instagram stream:', error.message);
    res.json({ 
      error: 'Falha durante o processamento do link do Instagram.', 
      videoUrl: videoUrl 
    });
  }
});

// GET /api/media-stream - Universal media resolver (supports Twitter, Reddit, Facebook, Vimeo, and more)
app.get('/api/media-stream', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const cleanUrl = videoUrl.trim();
  console.log(`[Media Stream Resolver] Attempting to resolve: ${cleanUrl}`);

  // Determine dynamic Referer to prevent 403 blocks from specific target CDNs
  let refererHeader = 'https://www.google.com/';
  try {
    const targetParsed = new URL(cleanUrl);
    if (targetParsed.hostname.includes('twitter.com') || targetParsed.hostname.includes('x.com')) {
      refererHeader = 'https://x.com/';
    } else if (targetParsed.hostname.includes('reddit.com') || targetParsed.hostname.includes('redditmedia.com') || targetParsed.hostname.includes('redd.it')) {
      refererHeader = 'https://www.reddit.com/';
    } else if (targetParsed.hostname.includes('facebook.com') || targetParsed.hostname.includes('fb.watch') || targetParsed.hostname.includes('fb.gg')) {
      refererHeader = 'https://www.facebook.com/';
    } else if (targetParsed.hostname.includes('instagram.com')) {
      refererHeader = 'https://www.instagram.com/';
    } else if (targetParsed.hostname.includes('tiktok.com')) {
      refererHeader = 'https://www.tiktok.com/';
    } else if (targetParsed.hostname.includes('vimeo.com')) {
      refererHeader = 'https://vimeo.com/';
    }
  } catch (urlErr) {
    console.warn(`[Media Stream Resolver] Referer URL building failed:`, urlErr);
  }

  // 1. Try resolving using local youtube-dl-exec for robust direct extraction
  try {
    console.log(`[Media Stream Resolver] Querying local youtube-dl-exec...`);
    const youtubedlResult = await youtubedl(cleanUrl, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        `referer:${refererHeader}`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    }) as any;

    if (youtubedlResult && youtubedlResult.formats && youtubedlResult.formats.length > 0) {
      // Filter for progressive MP4 formats (direct HTTP/HTTPS protocol)
      const httpFormats = youtubedlResult.formats.filter((f: any) => 
        f.url && 
        (f.ext === 'mp4' || f.container === 'mp4' || f.protocol === 'https' || f.protocol === 'http') && 
        f.resolution !== 'audio only' &&
        !f.format_id?.includes('audio')
      );

      if (httpFormats.length > 0) {
        // Sort lowest to highest resolution / height
        httpFormats.sort((a: any, b: any) => {
          const aHeight = a.height || parseInt(a.resolution?.split('x')[1]) || 0;
          const bHeight = b.height || parseInt(b.resolution?.split('x')[1]) || 0;
          return aHeight - bHeight;
        });

        const bestFormat = httpFormats[httpFormats.length - 1];
        if (bestFormat && bestFormat.url) {
          console.log(`[Media Stream Resolver] youtube-dl-exec succeeded! Extracted progressive MP4: [${bestFormat.resolution}] ${bestFormat.url}`);
          res.json({ videoUrl: bestFormat.url });
          return;
        }
      }
      
      // Secondary fallback inside ytdl: if no progressive mp4 found, try playing whatever format or url exists
      const fallbackUrl = youtubedlResult.url || youtubedlResult.formats.reverse().find((f: any) => f.url)?.url;
      if (fallbackUrl) {
        console.log(`[Media Stream Resolver] youtube-dl-exec semi-success (non-progressive fallback): ${fallbackUrl}`);
        res.json({ videoUrl: fallbackUrl });
        return;
      }
    } else if (youtubedlResult && youtubedlResult.url) {
      console.log(`[Media Stream Resolver] youtube-dl-exec succeeded with direct URL output: ${youtubedlResult.url}`);
      res.json({ videoUrl: youtubedlResult.url });
      return;
    }
  } catch (err: any) {
    console.error(`[Media Stream Resolver] youtube-dl-exec failed:`, err.message);
  }

  // 2. Cobalt API backup fallback normalization and queries
  let queryUrl = cleanUrl;
  if (queryUrl.includes('/i/status/')) {
    queryUrl = queryUrl.replace('/i/status/', '/tw/status/');
  } else if (queryUrl.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/status\/(\d+)/i)) {
    queryUrl = queryUrl.replace(/\/status\/(\d+)/i, '/tw/status/$1');
  }

  const cobaltServers = [
    'https://cobalt.pyon.cafe/',
    'https://cobalt.fastest.ovh/',
    'https://co.eepy.today/',
    'https://api.cobalt.tools/'
  ];

  for (const apiEndpoint of cobaltServers) {
    try {
      console.log(`[Media Stream Resolver Fallback] Querying API: ${apiEndpoint}`);
      const response = await axios.post(
        apiEndpoint,
        {
          url: queryUrl,
          vQuality: '720',
          aFormat: 'mp4',
          isAudioOnly: false
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      const d = response.data;
      if (d && (d.url || d.text)) {
        const resolvedUrl = d.url || d.text;
        console.log(`[Media Stream Resolver Fallback] Success! Resolved direct URL: ${resolvedUrl}`);
        res.json({ videoUrl: resolvedUrl });
        return;
      }
    } catch (err: any) {
      console.warn(`[Media Stream Resolver Fallback] Failed on ${apiEndpoint}:`, err.response?.data || err.message);
    }
  }

  // Double check if the url is a direct file extension we can play
  if (cleanUrl.match(/\.(mp4|webm|m3u8|mp3|ogg|wav)$/i)) {
    console.log(`[Media Stream Resolver Fallback] Clean URL has a direct extension. Playing natively: ${cleanUrl}`);
    res.json({ videoUrl: cleanUrl });
    return;
  }

  res.json({ error: 'Não foi possível extrair o vídeo direto da origem indicada.', videoUrl: cleanUrl });
});

// GET /api/x-stream - Re-direct alias to /api/media-stream for backwards compatibility
app.get('/api/x-stream', async (req, res) => {
  const videoUrl = req.query.url as string;
  res.redirect(`/api/media-stream?url=${encodeURIComponent(videoUrl)}`);
});

// Proxy direct streaming media to bypass local browser CORS & security headers
app.get('/api/proxy-video', async (req, res) => {
  const mediaUrl = req.query.url as string;
  if (!mediaUrl) {
    res.status(400).send('URL is required');
    return;
  }

  // Dynamically set Referer based on target domain to avoid CDN 403 blocks (e.g. twimg/twitter, facebook, etc.)
  let refererVal = 'https://www.google.com/';
  try {
    const parsedRefUrl = new URL(mediaUrl);
    if (parsedRefUrl.hostname.includes('twimg.com')) {
      refererVal = 'https://x.com/';
    } else if (parsedRefUrl.hostname.includes('instagram.com')) {
      refererVal = 'https://www.instagram.com/';
    } else if (parsedRefUrl.hostname.includes('tiktok.com') || parsedRefUrl.hostname.includes('ttwstatic')) {
      refererVal = 'https://www.tiktok.com/';
    } else if (parsedRefUrl.hostname.includes('fbcdn') || parsedRefUrl.hostname.includes('facebook') || parsedRefUrl.hostname.includes('fbpage')) {
      refererVal = 'https://www.facebook.com/';
    } else if (parsedRefUrl.hostname.includes('reddit') || parsedRefUrl.hostname.includes('redditmedia') || parsedRefUrl.hostname.includes('redd.it')) {
      refererVal = 'https://www.reddit.com/';
    } else if (parsedRefUrl.hostname.includes('vimeo')) {
      refererVal = 'https://vimeo.com/';
    } else {
      refererVal = parsedRefUrl.origin + '/';
    }
  } catch (refErr) {
    console.warn(`[Proxy-Video] Error parsing referer value:`, refErr);
  }

  // Set up headers to forward and bypass CORS/restrictions
  const requestHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': refererVal
  };

  // Support Byte-Range request forwarding (crucial for Chrome/Safari media buffering)
  if (req.headers.range) {
    requestHeaders['Range'] = req.headers.range;
  }

  let responseStream: any = null;

  try {
    const response = await axios({
      method: 'get',
      url: mediaUrl,
      responseType: 'stream',
      headers: requestHeaders,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
      timeout: 15000
    });

    responseStream = response.data;

    // Handle stream errors to prevent server crashing on unhandled network exception
    responseStream.on('error', (streamErr: any) => {
      console.error('[proxy-video stream error]:', streamErr.message);
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
      responseStream.destroy();
    });

    // Handle connection closure or aborts gracefully by destroying the backend CDN stream
    // to prevent memory leaks and "write after end" or EPIPE socket crashes
    req.on('close', () => {
      if (responseStream) {
        responseStream.destroy();
      }
    });

    // Send original headers to stream properly
    const contentType = response.headers['content-type'] || 'video/mp4';
    res.setHeader('Content-Type', String(contentType));

    const contentLength = response.headers['content-length'];
    if (contentLength) {
      res.setHeader('Content-Length', String(contentLength));
    }

    const contentRange = response.headers['content-range'];
    if (contentRange) {
      res.setHeader('Content-Range', String(contentRange));
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Return the appropriate status (e.g., 206 for ranges, or whatever original status)
    res.status(response.status);

    // Pipe response directly to client
    responseStream.pipe(res);
  } catch (err: any) {
    console.error('Error in proxy-video streaming:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Error streaming media through server proxy');
    }
    if (responseStream) {
      responseStream.destroy();
    }
  }
});

// -------------------------------------------------------------
// ABLY REALTIME AUTH & SUPABASE PERSISTENCE REST ENDPOINTS
// -------------------------------------------------------------

// GET & POST /auth/ably-token - Renovação automática de tokens Ably
app.all(['/auth/ably-token', '/api/auth/ably-token'], async (req, res) => {
  try {
    const userId = req.body?.userId || req.query?.userId || req.body?.clientId || req.query?.clientId;
    const roomId = req.body?.roomId || req.query?.roomId;
    if (!userId || !roomId) {
      return res.status(400).json({ error: 'Missing userId or roomId in request (provide in body or query params)' });
    }
    const tokenRequest = await generateAblyTokenRequest(userId as string, roomId as string);
    res.json(tokenRequest);
  } catch (err: any) {
    console.error('[Ably Auth Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions - Criar sessão
app.post(['/sessions', '/api/sessions'], async (req, res) => {
  try {
    const { roomId, hostId, twitchData } = req.body;
    if (!roomId || !hostId) {
      return res.status(400).json({ error: 'Missing roomId or hostId in body' });
    }
    const initialSession = await createSession(roomId, hostId, twitchData);
    
    if (twitchData && twitchData.login) {
      connectBotToChannel(twitchData.login);
    }
    
    res.json({ success: true, session: initialSession });
  } catch (err: any) {
    console.error('[Sessions POST Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/:id - Validar / obter sessão
app.get(['/sessions/:id', '/api/sessions/:id'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const session = await getSession(roomId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (err: any) {
    console.error('[Sessions GET Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /sessions/:id - Encerrar sessão
app.delete(['/sessions/:id', '/api/sessions/:id'], async (req, res) => {
  try {
    const roomId = req.params.id;
    await endSession(roomId);
    sessionWatchedCache.delete(roomId); // Limpar cache completo da memória
    res.json({ success: true, message: 'Session terminated' });
  } catch (err: any) {
    console.error('[Sessions DELETE Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update standard rooms getter to use Supabase instead of in-memory maps
app.get('/api/rooms', async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: activeRoomsDb, error } = await supabaseAdmin
      .from('rooms')
      .select('id, twitch_channel_id, is_active, last_active_at, viewer_count, video_queue_count, room_settings(settings_json)')
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    const activeRooms = (activeRoomsDb || []).map(room => {
      let hostAvatarUrl = '';
      let hostDisplayName = room.twitch_channel_id || 'Streamer';
      
      const settings = Array.isArray(room.room_settings) 
          ? (room.room_settings[0] as any)?.settings_json 
          : (room.room_settings as any)?.settings_json;

      const hostUser = settings?.users?.find?.((u: any) => u.isHost === true);
      const hostTwitch = hostUser?.twitchData || settings?.twitchData;

      if (hostTwitch) {
        hostAvatarUrl = hostTwitch.profileImageUrl || hostTwitch.avatarUrl || '';
        hostDisplayName = hostTwitch.displayName || hostTwitch.login || hostDisplayName;
      }

      return {
        roomId: room.id,
        hostName: hostDisplayName,
        hostAvatar: hostAvatarUrl,
        hostLogin: room.twitch_channel_id || '',
        hostTwitchUserId: room.twitch_channel_id || '',
        usersCount: room.viewer_count || 1,
        queueCount: room.video_queue_count || 0,
        uptime: Date.now() - new Date(room.last_active_at || Date.now()).getTime()
      };
    });

    activeRooms.sort((a, b) => b.usersCount - a.usersCount);
    res.json({ rooms: activeRooms });
  } catch (err: any) {
    console.error('[Rooms API Error]', err.message);
    res.json({ rooms: [] });
  }
});

// -------------------------------------------------------------
// SECURE QUEUE & SESSIONS MUTATIONS ENDPOINTS
// -------------------------------------------------------------

// POST /sessions/:id/join - Join Room
app.post(['/sessions/:id/join', '/api/sessions/:id/join'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { userId, name, twitchData } = req.body;
    const supabaseAdmin = getSupabaseAdmin();

    const state: any = await getSession(roomId);
    if (!state) {
      return res.status(404).json({ error: 'Sala solicitar não foi encontrada.' });
    }

    const cleanUsers = (state.users || []).filter((u: any) => u.userId !== userId);
    
    // Persistent Ban Check
    const username = twitchData?.login || name || 'Viewer';
    if (state.blacklistUsernames?.includes(username.toLowerCase())) {
      return res.status(403).json({ error: 'Você está permanentemente banido desta sala.' });
    }

    // Populate Follower Data on Join using Cached Helper Functions
    let finalTwitchData = { ...twitchData };
    try {
       const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
       let broadcasterId = state.twitchData?.twitchUserId || hostUser?.twitchData?.twitchUserId;
       const targetTwitchUserId = twitchData?.twitchUserId;
       const userToken = twitchData?.providerToken;
       const isStreamerOrHost = userId === state.hostId || twitchData?.isBroadcaster;
       
       if (!isStreamerOrHost && broadcasterId && targetTwitchUserId && userToken && targetTwitchUserId !== broadcasterId) {
          const followCheckViewer = await checkUserFollowsBroadcaster(targetTwitchUserId, broadcasterId, userToken);
          if (followCheckViewer.isFollower) {
            finalTwitchData.isFollower = true;
            finalTwitchData.followedAt = followCheckViewer.followedAt || twitchData?.followedAt || null;
          } else {
             // In case cache shows they don't follow
             finalTwitchData.isFollower = false;
          }
          const subCheckViewer = await checkUserSubscriberToBroadcaster(broadcasterId, targetTwitchUserId, userToken);
          if (subCheckViewer) {
            finalTwitchData.isSubscriber = true;
          } else {
             finalTwitchData.isSubscriber = false;
          }
       }
    } catch(err) { }

    const oldUser = (state.users || []).find((u: any) => u.userId === userId) || {};

    const newUser = {
      id: userId,
      userId,
      name: sanitizeInput(name || 'Viewer').substring(0, 20),
      isHost: state.hostId === userId,
      isWhitelisted: oldUser.isWhitelisted || false,
      strikes: oldUser.strikes || 0,
      isBanned: oldUser.isBanned || state.blacklistUsernames?.includes(username.toLowerCase()) || false,
      timeoutUntil: oldUser.timeoutUntil || undefined,
      lastSubmittedAt: oldUser.lastSubmittedAt || undefined,
      twitchData: finalTwitchData
    };
    cleanUsers.push(newUser);

    const updatedState = { ...state, users: cleanUsers };

    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    // Update rooms columns count
    await supabaseAdmin
      .from('rooms')
      .update({ 
        viewer_count: cleanUsers.length,
        last_active_at: new Date().toISOString()
      })
      .eq('id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/submit_video - Submit Video
app.post(['/sessions/:id/submit_video', '/api/sessions/:id/submit_video'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { userId, data } = req.body;
    const url = data?.url;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const userRecord = state.users.find((u: any) => u.userId === userId);
    
    // ANONYMITY REMOVAL: Require Twitch Data
    if (!userRecord?.twitchData?.login) {
      return res.status(401).json({ error: 'Apenas usuários autenticados com conta da Twitch podem enviar vídeos nesta sessão.' });
    }

    const username = userRecord?.name || userRecord?.twitchData?.displayName || 'Viewer';

    // CHECK FOR BAN OR TIMEOUT (UNIFIED ENFORCEMENT)
    const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ipStr = typeof userIp === 'string' ? userIp.split(',')[0].trim() : '';

    const status = checkUserActionStatus(
      state,
      userId,
      userRecord.twitchData?.login,
      userRecord.twitchData?.twitchUserId,
      ipStr
    );

    if (status.banned) {
      return res.status(403).json({ error: status.reason || 'Você está permanentemente banido desta sala.' });
    }

    if (status.timedOut) {
      return res.status(403).json({ error: `Você está em timeout. Aguarde mais ${status.remainingSeconds} segundos.` });
    }

    // CHECK CORE RULES: Follow, Sub, Cooldowns, Queue Limits, Hourly limits
    const isStreamerOrHost = userId === state.hostId || !!userRecord?.isHost || !!userRecord?.twitchData?.isBroadcaster;

    let finalIsFollower = !!userRecord?.twitchData?.isFollower;
    let finalIsSubscriber = !!userRecord?.twitchData?.isSubscriber || !!userRecord?.twitchData?.badges?.includes('subscriber');
    let finalFollowedAt = userRecord?.twitchData?.followedAt || null;

    if (!isStreamerOrHost) {
      // 1. Queue Limits and Max active videos per user check
      const maxVideosPerUser = state.settings?.maxVideosPerUser !== undefined ? state.settings.maxVideosPerUser : (state.settings?.max_videos_per_user ?? 0);
      const userActiveVideos = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
      if (maxVideosPerUser > 0 && userActiveVideos >= maxVideosPerUser) {
        return res.status(403).json({ error: `Você atingiu o limite de ${maxVideosPerUser} vídeos ativos na fila simultaneamente.` });
      }

      const maxQueueSize = state.settings?.maxQueueSize !== undefined ? state.settings.maxQueueSize : (state.settings?.max_queue_size ?? 0);
      if (maxQueueSize > 0 && (state.queue || []).length >= maxQueueSize) {
        return res.status(403).json({ error: `A fila está cheia com o limite de ${maxQueueSize} vídeos.` });
      }

      // 2. Hourly Rate Limit Check (based on queue + history timestamps)
      if (state.settings?.maxSubmissionsPerHour > 0) {
        const oneHourAgo = Date.now() - 3600000;
        const hourlySubmissions = [...(state.queue || []), ...(state.history || [])]
          .filter((v: any) => v.submitterId === userId && v.timestamp && v.timestamp > oneHourAgo).length;
        if (hourlySubmissions >= state.settings.maxSubmissionsPerHour) {
          return res.status(429).json({ error: `Você atingiu o limite de ${state.settings.maxSubmissionsPerHour} envios por hora.` });
        }
      }

      // 3. User Cooldown Checks
      if (state.settings?.userCooldownSeconds > 0 && userRecord?.lastSubmittedAt) {
        const elapsed = (Date.now() - userRecord.lastSubmittedAt) / 1000;
        if (elapsed < state.settings.userCooldownSeconds) {
          const remaining = Math.ceil(state.settings.userCooldownSeconds - elapsed);
          return res.status(429).json({ error: `Você está em cooldown individual. Aguarde mais ${remaining} segundos.` });
        }
      }

      // 4. Global Cooldown Checks
      if (state.settings?.globalCooldownSeconds > 0) {
        let lastGlobalTime = state.lastGlobalSubmissionAt || 0;
        (state.queue || []).forEach((v: any) => {
          if (v.timestamp && v.timestamp > lastGlobalTime) {
            lastGlobalTime = v.timestamp;
          }
        });
        const elapsed = (Date.now() - lastGlobalTime) / 1000;
        if (elapsed < state.settings.globalCooldownSeconds) {
          const remaining = Math.ceil(state.settings.globalCooldownSeconds - elapsed);
          return res.status(429).json({ error: `O envio global está em cooldown. Aguarde mais ${remaining} segundos.` });
        }
      }

      // 5. Dynamic twitch Follow and Subscription validation using real API metrics with local backup metadata
      const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
      // Let's retrieve a guaranteed numeric broadcaster Twitch user ID
      let broadcasterId = state.twitchData?.twitchUserId;
      if (!broadcasterId || broadcasterId === state.hostId || (typeof broadcasterId === 'string' && broadcasterId.includes('-'))) {
        broadcasterId = hostUser?.twitchData?.twitchUserId;
      }
      if (!broadcasterId || broadcasterId === state.hostId || (typeof broadcasterId === 'string' && broadcasterId.includes('-'))) {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          const { data: roomDb } = await supabaseAdmin
            .from('rooms')
            .select('twitch_channel_id')
            .eq('id', roomId)
            .single();
          if (roomDb?.twitch_channel_id && !roomDb.twitch_channel_id.includes('-')) {
            broadcasterId = roomDb.twitch_channel_id;
          }
        } catch (dbErr) {
          console.error('[Verify Follower] Error fetching room twitch_channel_id:', dbErr);
        }
      }

      const broadcasterToken = state.twitchData?.providerToken || hostUser?.twitchData?.providerToken;
      const targetTwitchUserId = userRecord?.twitchData?.twitchUserId;
      const userToken = userRecord?.twitchData?.providerToken;

      let meetsFollower = false;
      let meetsSub = false;
      let followTimeStr = userRecord?.twitchData?.followedAt;

      // Streamer / host themselves bypass follow/sub constraints
      if (targetTwitchUserId && broadcasterId && targetTwitchUserId === broadcasterId) {
        meetsFollower = true;
        meetsSub = true;
      } else {
        // Direct check: If requireFollower is false and minFollowMinutes is 0, then meetsFollower is true by default
        const needsFollowerCheck = !!(state.settings?.requireFollower || (state.settings?.minFollowMinutes && state.settings.minFollowMinutes > 0));
        const needsSubCheck = !!state.settings?.requireSub;

        meetsFollower = !needsFollowerCheck;
        meetsSub = !needsSubCheck;

        // Vector 1: Check using broadcaster token
        if (broadcasterToken && broadcasterId && targetTwitchUserId && targetTwitchUserId !== broadcasterId) {
          if (needsFollowerCheck) {
            const followCheck = await checkTwitchFollower(broadcasterId, targetTwitchUserId, broadcasterToken);
            if (followCheck.isFollower) {
              meetsFollower = true;
              followTimeStr = followCheck.followedAt || followTimeStr;
            }
          }
          if (needsSubCheck) {
            const subCheck = await checkTwitchSubscriber(broadcasterId, targetTwitchUserId, broadcasterToken);
            if (subCheck) {
              meetsSub = true;
            }
          }
        }

        // Vector 2: Check using VIEWER's own token (active, authenticated viewer)
        if ((!meetsFollower || !meetsSub) && userToken && broadcasterId && targetTwitchUserId && targetTwitchUserId !== broadcasterId) {
          if (needsFollowerCheck && !meetsFollower) {
            const followCheckViewer = await checkUserFollowsBroadcaster(targetTwitchUserId, broadcasterId, userToken);
            if (followCheckViewer.isFollower) {
              meetsFollower = true;
              followTimeStr = followCheckViewer.followedAt || followTimeStr;
            }
          }
          if (needsSubCheck && !meetsSub) {
            const subCheckViewer = await checkUserSubscriberToBroadcaster(broadcasterId, targetTwitchUserId, userToken);
            if (subCheckViewer) {
              meetsSub = true;
            }
          }
        }

        // Vector 3: Local cached context (for extra protection / offline resiliency)
        if (needsFollowerCheck && !meetsFollower) {
          meetsFollower = !!userRecord?.twitchData?.isFollower;
        }
        if (needsSubCheck && !meetsSub) {
          meetsSub = !!userRecord?.twitchData?.isSubscriber || !!userRecord?.twitchData?.badges?.includes('subscriber');
        }
      }

      // Combine direct API and user meta backup for extra safety
      finalIsFollower = meetsFollower || !!userRecord?.twitchData?.isFollower;
      finalIsSubscriber = meetsSub || !!userRecord?.twitchData?.isSubscriber || !!userRecord?.twitchData?.badges?.includes('subscriber');
      finalFollowedAt = followTimeStr || userRecord?.twitchData?.followedAt || null;

      // Rule: Subscriber only mode
      if (state.settings?.requireSub && !finalIsSubscriber) {
        return res.status(403).json({ error: 'Apenas inscritos (subscribers) na Twitch podem enviar vídeos nesta sala.' });
      }

      // Rule: Follower only mode
      if (state.settings?.requireFollower && !finalIsFollower) {
        return res.status(403).json({ error: 'Apenas seguidores na Twitch podem enviar vídeos nesta sala.' });
      }

      // Rule: Minimum follower minutes mode
      if (state.settings?.minFollowMinutes > 0) {
        if (!finalIsFollower) {
          return res.status(403).json({ error: 'Apenas seguidores na Twitch podem enviar vídeos nesta sala.' });
        }
        if (finalFollowedAt) {
          const followDate = new Date(finalFollowedAt).getTime();
          const minsDiff = (Date.now() - followDate) / (1000 * 60);
          if (minsDiff < state.settings.minFollowMinutes) {
            const remaining = Math.ceil(state.settings.minFollowMinutes - minsDiff);
            return res.status(403).json({ 
              error: `Você precisa seguir o canal há pelo menos ${state.settings.minFollowMinutes} minutos. Você segue há ${Math.floor(minsDiff)} minutos (faltam ${remaining} min).` 
            });
          }
        }
      }
    }

    const vCheck = sanitizeAndValidateUrl(url, state.settings);
    if (!vCheck.valid) {
      return res.status(400).json({ error: vCheck.error || 'Link recusado.' });
    }

    const platform = vCheck.platform || 'other';
    const cleanUrl = vCheck.normalizedUrl || url;
    const canonId = extractCanonicalVideoId(cleanUrl, platform);

    const isDuplicate = (state.queue || []).some((v: any) => extractCanonicalVideoId(v.url, v.platform) === canonId);
    if (isDuplicate) {
      return res.status(400).json({ error: 'Este vídeo já está na fila.' });
    }

    const contentCheck = await verifyVideoContent(cleanUrl, platform, state.settings?.blockLiveStreams);
    if (!contentCheck.valid) {
      return res.status(400).json({ error: contentCheck.error || 'Mídia indisponível.' });
    }

    let priority_score = 0;
    if (state.hostId === userId) priority_score += 1000;
    else if (userRecord?.twitchData?.badges?.includes('moderator')) priority_score += 50;
    else if (userRecord?.twitchData?.badges?.includes('vip')) priority_score += 15;
    else if (userRecord?.twitchData?.isSubscriber) priority_score += 10;
    else if (userRecord?.twitchData?.isFollower) priority_score += 2;

    const nowD = new Date();
    const dataEnvio = nowD.toLocaleDateString('pt-BR');
    const horaEnvio = nowD.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const newVideo = {
      id: 'vid_' + Date.now().toString() + Math.random().toString(36).substring(7),
      submitter: username,
      submitterId: userId,
      url: cleanUrl,
      title: sanitizeInput(contentCheck.title || 'Vídeo Sincronizado'),
      platform,
      status: (state.settings?.isManualApprovalRequired && state.hostId !== userId) ? 'pending' : 'approved',
      timestamp: Date.now(),
      priority_score,
      dataEnvio,
      horaEnvio
    };

    const updatedQueue = [...(state.queue || [])];
    updatedQueue.push(newVideo);

    // Save individual Cooldown and global Cooldown timestamp trigger
    const updatedUsers = (state.users || []).map((u: any) => {
      if (u.userId === userId) {
        const uTwitchData = u.twitchData || {};
        return { 
          ...u, 
          lastSubmittedAt: Date.now(),
          twitchData: {
            ...uTwitchData,
            isFollower: finalIsFollower,
            isSubscriber: finalIsSubscriber,
            followedAt: finalFollowedAt
          }
        };
      }
      return u;
    });

    const updatedState = { 
      ...state, 
      queue: updatedQueue, 
      users: updatedUsers,
      lastGlobalSubmissionAt: Date.now() 
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('rooms')
      .update({ video_queue_count: updatedQueue.length })
      .eq('id', roomId);

    try {
      await supabaseAdmin.from('videos').insert({
        room_id: roomId,
        submitted_by: null,
        twitch_user_id: userId,
        video_url: cleanUrl,
        status: newVideo.status,
        priority_score
      });
    } catch (e) {}

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/approve_video - Approve manual submission
app.post(['/sessions/:id/approve_video', '/api/sessions/:id/approve_video'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const videoId = data; // string ID

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedQueue = (state.queue || []).map((v: any) => 
      v.id === videoId ? { ...v, status: 'approved' } : v
    );
    const updatedState = { ...state, queue: updatedQueue };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('videos')
      .update({ status: 'approved' })
      .eq('room_id', roomId)
      .eq('id', videoId); // Assuming id maps, but DB has implicit UUID. We'll update by video_url

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/reject_video - Reject Queue Video
app.post(['/sessions/:id/reject_video', '/api/sessions/:id/reject_video'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const videoId = data;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedQueue = (state.queue || []).filter((v: any) => v.id !== videoId);
    const updatedState = { ...state, queue: updatedQueue };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('rooms')
      .update({ video_queue_count: updatedQueue.length })
      .eq('id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/play_video - Play Video
app.post(['/sessions/:id/play_video', '/api/sessions/:id/play_video'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const videoId = typeof data === 'string' ? data : data?.id;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    // Mark as played/watched in the universal queue
    const updatedQueue = (state.queue || []).map((v: any) => 
      v.id === videoId ? { ...v, status: 'watched', watchedAt: v.watchedAt || Date.now() } : v
    );

    const historyVideos = updatedQueue.filter((v: any) => v.status === 'watched');
    updateWatchedCache(roomId, historyVideos);

    const updatedState = {
      ...state,
      queue: updatedQueue,
      currentVideoId: videoId,
      isPlaying: true,
      currentTime: 0,
      history: historyVideos
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/end_video - Finish playing active video
app.post(['/sessions/:id/end_video', '/api/sessions/:id/end_video'], async (req, res) => {
  try {
    const roomId = req.params.id;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const queue = state.queue || [];
    let currentVideoId = state.currentVideoId;
    let isPlaying = state.isPlaying;

    // Mark current video as 'watched' in the queue (if it isn't already)
    const updatedQueue = queue.map((v: any) => {
      if (v.id === currentVideoId) {
        return { ...v, status: 'watched', watchedAt: v.watchedAt || Date.now() };
      }
      return v;
    });

    // Find the next unplayed video in chronological order (timestamp ASC)
    // Unwatched/unplayed videos are those with status === 'pending' or status === 'approved'
    const unwatched = updatedQueue.filter((v: any) => v.status === 'pending' || v.status === 'approved');

    if (unwatched.length > 0) {
      // Sort chronologically by timestamp
      unwatched.sort((a: any, b: any) => a.timestamp - b.timestamp);
      currentVideoId = unwatched[0].id;
      isPlaying = true;
    } else {
      currentVideoId = null;
      isPlaying = false;
    }

    // Now, let's also update the video status of the new current video in updatedQueue to 'watched' as well
    const finalQueue = updatedQueue.map((v: any) => {
      if (v.id === currentVideoId) {
        return { ...v, status: 'watched', watchedAt: v.watchedAt || Date.now() };
      }
      return v;
    });

    const historyVideos = finalQueue.filter((v: any) => v.status === 'watched');
    updateWatchedCache(roomId, historyVideos);

    const updatedState = {
      ...state,
      queue: finalQueue,
      currentVideoId,
      isPlaying,
      currentTime: 0,
      history: historyVideos
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('rooms')
      .update({ video_queue_count: finalQueue.filter((v: any) => v.status !== 'watched').length })
      .eq('id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/play_previous - Play previous watched history item
app.post(['/sessions/:id/play_previous', '/api/sessions/:id/play_previous'], async (req, res) => {
  try {
    const roomId = req.params.id;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const queue = state.queue || [];
    const currentVideoId = state.currentVideoId;
    const currentVid = queue.find((v: any) => v.id === currentVideoId);

    // Filter for watched videos
    const watchedVids = queue.filter((v: any) => v.status === 'watched' && v.id !== currentVideoId);
    
    let prevVideoId = null;
    if (watchedVids.length > 0) {
      if (currentVid) {
        // Find watched video with nearest smaller timestamp as current
        const smallerTimes = watchedVids.filter((v: any) => v.timestamp < currentVid.timestamp);
        if (smallerTimes.length > 0) {
          smallerTimes.sort((a: any, b: any) => b.timestamp - a.timestamp);
          prevVideoId = smallerTimes[0].id;
        } else {
          // Fallback: just play the watched one with the largest timestamp
          watchedVids.sort((a: any, b: any) => b.timestamp - a.timestamp);
          prevVideoId = watchedVids[0].id;
        }
      } else {
        // Just take the last watched video chronologically
        watchedVids.sort((a: any, b: any) => b.timestamp - a.timestamp);
        prevVideoId = watchedVids[0].id;
      }
    }

    if (prevVideoId) {
      const updatedState = {
        ...state,
        currentVideoId: prevVideoId,
        isPlaying: true,
        currentTime: 0
      };

      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin
        .from('room_settings')
        .update({ settings_json: updatedState })
        .eq('room_id', roomId);

      if (ablyRest) {
        const channel = ablyRest.channels.get(`session:${roomId}`);
        await channel.publish('session_state', updatedState);
      }

      return res.json({ success: true, session: updatedState });
    }

    res.json({ success: true, session: state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST /sessions/:id/update_settings - Update Moderator Rules
app.post(['/sessions/:id/update_settings', '/api/sessions/:id/update_settings'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedState = {
      ...state,
      settings: {
        ...(state.settings || {}),
        ...data
      }
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ 
        settings_json: updatedState,
        require_sub: data.requireSub ?? state.settings?.requireSub ?? false,
        require_follower: data.requireFollower ?? state.settings?.requireFollower ?? false,
        cooldown_seconds: data.userCooldownSeconds ?? state.settings?.userCooldownSeconds ?? 60,
        max_videos_per_user: data.maxVideosPerUser ?? state.settings?.maxVideosPerUser ?? 2,
        max_queue_size: data.maxQueueSize ?? state.settings?.maxQueueSize ?? 50,
        min_follow_days: data.minFollowMinutes ? Math.ceil(data.minFollowMinutes / 1440) : (state.settings?.minFollowMinutes ? Math.ceil(state.settings.minFollowMinutes / 1440) : 0)
      })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/toggle_whitelist - Toggle user VIP state
app.post(['/sessions/:id/toggle_whitelist', '/api/sessions/:id/toggle_whitelist'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const targetUserId = data;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedUsers = (state.users || []).map((u: any) => {
      if (u.userId === targetUserId) {
        return { ...u, isWhitelisted: !u.isWhitelisted };
      }
      return u;
    });

    const updatedState = { ...state, users: updatedUsers };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Moderation Action to Twitch Real-Time Helix API Channel Moderation
async function executeTwitchModeration(
  roomId: string, 
  state: any, 
  targetTwitchUserId: string, 
  action: 'ban' | 'timeout' | 'unban', 
  options?: { durationSeconds?: number, reason?: string, username?: string }
) {
  // 1. Send native Twitch chat command fallback via botClient to guarantee instantaneous action matching user expectation!
  try {
    const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
    const channelName = state.twitchData?.login || hostUser?.twitchData?.login;
    const targetUser = state.users?.find((u: any) => u.userId === targetTwitchUserId || u.twitchData?.twitchUserId === targetTwitchUserId);
    const targetUsername = options?.username || targetUser?.twitchData?.login || targetUser?.name;

    if (botClient && channelName && targetUsername) {
      const channelPattern = channelName.startsWith('#') ? channelName.toLowerCase() : `#${channelName.toLowerCase()}`;
      if (action === 'ban') {
        const cleanReason = (options?.reason || 'Moderado via Painel Live Queue').replace(/[\r\n]/g, ' ');
        console.log(`[Twitch IRC Moderation Sync] Executed native command: /ban ${targetUsername} ${cleanReason} inside ${channelPattern}`);
        botClient.say(channelPattern, `/ban ${targetUsername} ${cleanReason}`).catch(err => {
          console.warn('[Twitch IRC Moderation Sync say(ban)] error:', err.message);
        });
      } else if (action === 'timeout') {
        const durationSec = options?.durationSeconds || 600;
        const cleanReason = (options?.reason || 'Moderado via Painel Live Queue').replace(/[\r\n]/g, ' ');
        console.log(`[Twitch IRC Moderation Sync] Executed native command: /timeout ${targetUsername} ${durationSec} ${cleanReason} inside ${channelPattern}`);
        botClient.say(channelPattern, `/timeout ${targetUsername} ${durationSec} ${cleanReason}`).catch(err => {
          console.warn('[Twitch IRC Moderation Sync say(timeout)] error:', err.message);
        });
      } else if (action === 'unban') {
        console.log(`[Twitch IRC Moderation Sync] Executed native command: /unban ${targetUsername} inside ${channelPattern}`);
        botClient.say(channelPattern, `/unban ${targetUsername}`).catch(err => {
          console.warn('[Twitch IRC Moderation Sync say(unban)] error:', err.message);
        });
      }
    }
  } catch (ircModErr: any) {
    console.warn('[Twitch IRC Direct Chat Command Fallback Error]', ircModErr.message);
  }

  // 2. Perform Standard Twitch Helix API Call
  try {
    const hostUser = state.users?.find((u: any) => u.isHost || u.userId === state.hostId);
    const broadcasterToken = state.twitchData?.providerToken || hostUser?.twitchData?.providerToken;
    let broadcasterId = state.twitchData?.twitchUserId || hostUser?.twitchData?.twitchUserId;

    if (!broadcasterToken) {
      console.log(`[Twitch Sync Moderation API] Skipped API call: Broadcaster tokens are not present for room ${roomId}`);
      return true; // Already executed via IRC chat command!
    }

    if (!targetTwitchUserId) {
      console.log(`[Twitch Sync Moderation API] Skipped API call: Target Twitch User ID is missing`);
      return false;
    }

    if (!broadcasterId || broadcasterId.includes('-')) {
       try {
         const supabaseAdmin = getSupabaseAdmin();
         const { data: roomDb } = await supabaseAdmin
           .from('rooms')
           .select('twitch_channel_id')
           .eq('id', roomId)
           .single();
         if (roomDb?.twitch_channel_id && !roomDb.twitch_channel_id.includes('-')) {
           broadcasterId = roomDb.twitch_channel_id;
         }
       } catch (e) {}
    }

    let clientId = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
    let validatedBroadcasterId: string | null = null;

    // Validate using OAuth header
    try {
      const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${broadcasterToken}` },
        timeout: 3000
      });
      if (valRes.data) {
        if (valRes.data.client_id) clientId = valRes.data.client_id;
        if (valRes.data.user_id) validatedBroadcasterId = valRes.data.user_id;
      }
    } catch (e: any) {
      // Try Bearer header fallback
      try {
        const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
          headers: { 'Authorization': `Bearer ${broadcasterToken}` },
          timeout: 3000
        });
        if (valRes.data) {
          if (valRes.data.client_id) clientId = valRes.data.client_id;
          if (valRes.data.user_id) validatedBroadcasterId = valRes.data.user_id;
        }
      } catch (innerErr) {}
    }

    // Overwrite broadcasterId if token validation gave us a real numeric twitch ID
    if (validatedBroadcasterId) {
      broadcasterId = validatedBroadcasterId;
    }

    if (!broadcasterId || broadcasterId.includes('-')) {
      console.log(`[Twitch Sync Moderation API] Skipped API call: Broadcaster ID could not be matched (ID: ${broadcasterId})`);
      return true;
    }

    const headers = {
      'Client-Id': clientId,
      'Authorization': `Bearer ${broadcasterToken}`,
      'Content-Type': 'application/json'
    };

    if (action === 'ban' || action === 'timeout') {
      const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`;
      const duration = action === 'timeout' ? (options?.durationSeconds || 600) : undefined;
      const body = {
        data: {
          user_id: targetTwitchUserId,
          reason: options?.reason || 'Moderado através do Painel de Vídeos Live Queue',
          ...(duration ? { duration } : {})
        }
      };

      console.log(`[Twitch Sync Moderation API] Sending ${action.toUpperCase()} action on twitch for user ID: ${targetTwitchUserId} (Broadcaster ID: ${broadcasterId})`);
      const res = await axios.post(url, body, { headers, timeout: 5000 });
      console.log(`[Twitch Sync Moderation API] Response status: ${res.status}`);
      return true;
    } else if (action === 'unban') {
      const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&user_id=${targetTwitchUserId}`;
      console.log(`[Twitch Sync Moderation API] Sending UNBAN action on twitch for user ID: ${targetTwitchUserId} (Broadcaster ID: ${broadcasterId})`);
      const res = await axios.delete(url, { headers, timeout: 5000 });
      console.log(`[Twitch Sync Moderation API] Response status: ${res.status}`);
      return true;
    }
  } catch (err: any) {
    console.error(`[Twitch Sync Moderation API Error] Action: ${action}, Target: ${targetTwitchUserId}:`, err.response?.data || err.message);
    return false;
  }
}

// POST /sessions/:id/admin_action - Generic Administrative Actions
app.post(['/sessions/:id/admin_action', '/api/sessions/:id/admin_action'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const { action, userId: targetUserId } = data || {};

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    let updatedUsers = [...(state.users || [])];
    let updatedAllBans = [...(state.allBans || [])];
    let updatedBlacklist = [...(state.blacklistUsernames || [])];

    if (action === 'remove_strikes') {
      updatedUsers = updatedUsers.map((u: any) => 
        u.userId === targetUserId ? { ...u, strikes: 0 } : u
      );
    } else if (action === 'lift_restrictions' || action === 'forgive') {
      // PERDOAR: Clear ban, timeout, and strikes
      updatedUsers = updatedUsers.map((u: any) => {
        if (u.userId === targetUserId) {
          return { 
            ...u, 
            isBanned: false, 
            timeoutUntil: 0, 
            strikes: 0, 
            shadowBanned: false, 
            restrictedUntil: 0 
          };
        }
        return u;
      });

      // Also mark ban as inactive in history if exists
      updatedAllBans = updatedAllBans.map((b: any) => 
        b.userId === targetUserId ? { ...b, active: false } : b
      );

      // Remove from username blacklist if possible
      const targetUser = updatedUsers.find((u: any) => u.userId === targetUserId);
      if (targetUser?.twitchData?.login) {
        const login = targetUser.twitchData.login.toLowerCase();
        updatedBlacklist = updatedBlacklist.filter(u => u.toLowerCase() !== login);
      }

      // Sync unban to Twitch!
      const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
      if (targetTwitchUserId) {
         await executeTwitchModeration(roomId, state, targetTwitchUserId, 'unban');
      }
    }

    const updatedState = { 
      ...state, 
      users: updatedUsers, 
      allBans: updatedAllBans, 
      blacklistUsernames: updatedBlacklist 
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    console.error('[Admin Action Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/forgive_user - Full forgiveness (Lift ban, clear strikes/timeouts)
app.post(['/sessions/:id/unban_user', '/api/sessions/:id/unban_user', '/sessions/:id/forgive_user', '/api/sessions/:id/forgive_user'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const targetUserId = typeof data === 'string' ? data : (data?.userId || data);

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    // Logical redirection to Admin Action "forgive" logic
    let updatedUsers = [...(state.users || [])];
    let updatedAllBans = [...(state.allBans || [])];
    let updatedBlacklist = [...(state.blacklistUsernames || [])];

    updatedUsers = updatedUsers.map((u: any) => {
      if (u.userId === targetUserId) {
        return { 
          ...u, 
          isBanned: false, 
          timeoutUntil: 0, 
          strikes: 0, 
          shadowBanned: false, 
          restrictedUntil: 0 
        };
      }
      return u;
    });

    updatedAllBans = updatedAllBans.map((b: any) => 
      b.userId === targetUserId ? { ...b, active: false } : b
    );

    const targetUser = updatedUsers.find((u: any) => u.userId === targetUserId);
    if (targetUser?.twitchData?.login) {
      const login = targetUser.twitchData.login.toLowerCase();
      updatedBlacklist = updatedBlacklist.filter(u => u.toLowerCase() !== login);
    }
    
    // Attempt second backup check if username is explicitly known from ban record
    const banRecord = (state.allBans || []).find((b: any) => b.userId === targetUserId);
    if (banRecord?.username) {
        const bl = banRecord.username.toLowerCase();
        updatedBlacklist = updatedBlacklist.filter(u => u.toLowerCase() !== bl);
    }

    // Unban via Twitch Native Moderation Helix API
    const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || banRecord?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
    if (targetTwitchUserId) {
       await executeTwitchModeration(roomId, state, targetTwitchUserId, 'unban');
    }

    const updatedState = { ...state, users: updatedUsers, allBans: updatedAllBans, blacklistUsernames: updatedBlacklist };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/give_strike - Issue warning strike
app.post(['/sessions/:id/give_strike', '/api/sessions/:id/give_strike'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const targetUserId = data?.userId;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    let shouldBan = false;
    let targetUsername = 'unknown';

    const targetUser = (state.users || []).find((u: any) => u.userId === targetUserId);
    const targetLogin = targetUser?.twitchData?.login?.toLowerCase();
    const targetTwitchId = targetUser?.twitchData?.twitchUserId;
    if (targetUser?.twitchData?.login) {
      targetUsername = targetUser.twitchData.login;
    } else if (targetUser?.name) {
      targetUsername = targetUser.name;
    }

    const updatedUsers = (state.users || []).map((u: any) => {
      const uLogin = u.twitchData?.login?.toLowerCase();
      const uTwitchId = u.twitchData?.twitchUserId;
      const isMatch = u.userId === targetUserId || 
                      (targetLogin && uLogin === targetLogin) || 
                      (targetTwitchId && uTwitchId === targetTwitchId) || 
                      (targetTwitchId && u.userId === targetTwitchId);

      if (isMatch) {
        const newStrikes = (u.strikes || 0) + 1;
        const maxStrikes = state.settings?.maxStrikesBeforeBan || 5;
        if (newStrikes >= maxStrikes) {
           shouldBan = true;
           return { ...u, strikes: newStrikes, isBanned: true };
        }
        return { ...u, strikes: newStrikes };
      }
      return u;
    });

    let updatedState = { ...state, users: updatedUsers };

    if (shouldBan) {
       const blacklistUsernames = [...(state.blacklistUsernames || [])];
       if (!blacklistUsernames.includes(targetUsername.toLowerCase())) {
          blacklistUsernames.push(targetUsername.toLowerCase());
       }
       const newBan = {
          id: 'ban_' + Date.now(),
          userId: targetUserId,
          username: targetUsername,
          ip: '',
          banType: 'permanent',
          reason: 'Atingiu o limite máximo de strikes.',
          moderator: 'System',
          createdAt: Date.now(),
          active: true,
          history: [{ timestamp: Date.now(), action: 'ban', reason: 'Atingiu limite de strikes', moderator: 'System' }]
       };
       const allBans = [...(state.allBans || []), newBan];
       updatedState = { ...updatedState, blacklistUsernames, allBans };

       // Sync automatic strike limit ban to Twitch
       const targetUser = (state.users || []).find((u: any) => u.userId === targetUserId);
       const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
       if (targetTwitchUserId) {
          executeTwitchModeration(roomId, state, targetTwitchUserId, 'ban', {
             reason: 'Ban automático: Atingiu limite de strikes no painel Live Queue'
          }).catch(err => console.error('[Twitch Direct Ban Error on Strike limit]', err.message));
       }
    }

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
      if (shouldBan) {
         await channel.publish('kick', { userId: targetUserId, reason: 'Atingiu o limite máximo de strikes.' });
      }
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/timeout_user - Timeout/Mute user
app.post(['/sessions/:id/timeout_user', '/api/sessions/:id/timeout_user'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const { userId: targetUserId, minutes } = data || {};

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const durationMinutes = minutes || 5; // Default to 5 minutes if not specified
    const timeoutUntil = Date.now() + (durationMinutes * 60 * 1000);
    
    const targetUser = (state.users || []).find((u: any) => u.userId === targetUserId);
    const targetLogin = targetUser?.twitchData?.login?.toLowerCase();
    const targetTwitchId = targetUser?.twitchData?.twitchUserId;

    const updatedUsers = (state.users || []).map((u: any) => {
      const uLogin = u.twitchData?.login?.toLowerCase();
      const uTwitchId = u.twitchData?.twitchUserId;
      const isMatch = u.userId === targetUserId || 
                      (targetLogin && uLogin === targetLogin) || 
                      (targetTwitchId && uTwitchId === targetTwitchId) || 
                      (targetTwitchId && u.userId === targetTwitchId);

      if (isMatch) {
        return { ...u, timeoutUntil };
      }
      return u;
    });

    // Timeout user through Twitch Native Moderation Helix API
    const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
    if (targetTwitchUserId) {
      await executeTwitchModeration(roomId, state, targetTwitchUserId, 'timeout', {
        durationSeconds: durationMinutes * 60,
        reason: 'Timeout / Silenciamento aplicado via Painel Live Queue'
      });
    }

    const updatedState = { ...state, users: updatedUsers };
    
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/ban_user - Permanent ban user
app.post(['/sessions/:id/ban_user', '/api/sessions/:id/ban_user'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const { userId: targetUserId, banType, reason } = data;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    // Handle TIMEOUT logic if banType is temporary
    if (banType === 'temporary') {
      const timeoutUntil = Date.now() + (10 * 60 * 1000); // 10 mins default for dashboard "temporary"
      
      const targetUser = (state.users || []).find((u: any) => u.userId === targetUserId);
      const targetLogin = targetUser?.twitchData?.login?.toLowerCase();
      const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
      if (targetTwitchUserId) {
         await executeTwitchModeration(roomId, state, targetTwitchUserId, 'timeout', {
           durationSeconds: 10 * 60,
           reason: 'Ban Temporário aplicado via Painel Live Queue'
         });
      }

      const updatedUsers = (state.users || []).map((u: any) => {
        const uLogin = u.twitchData?.login?.toLowerCase();
        const uTwitchId = u.twitchData?.twitchUserId;
        const isMatch = u.userId === targetUserId || 
                        (targetLogin && uLogin === targetLogin) || 
                        (targetTwitchUserId && uTwitchId === targetTwitchUserId) || 
                        (targetTwitchUserId && u.userId === targetTwitchUserId);

        if (isMatch) return { ...u, timeoutUntil };
        return u;
      });
      const updatedState = { ...state, users: updatedUsers };
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);
      if (ablyRest) {
        const channel = ablyRest.channels.get(`session:${roomId}`);
        await channel.publish('session_state', updatedState);
      }
      return res.json({ success: true, session: updatedState });
    }

    // Permanent Ban
    const targetUser = (state.users || []).find((u: any) => u.userId === targetUserId);
    const targetUsername = targetUser?.twitchData?.login || targetUser?.name || 'unknown';
    const targetLogin = targetUser?.twitchData?.login?.toLowerCase();
    const targetTwitchUserId = targetUser?.twitchData?.twitchUserId || (/^\d+$/.test(targetUserId) ? targetUserId : null);
    
    const blacklistUsernames = [...(state.blacklistUsernames || [])];
    if (targetUsername !== 'unknown' && !blacklistUsernames.map(n => n.toLowerCase()).includes(targetUsername.toLowerCase())) {
      blacklistUsernames.push(targetUsername.toLowerCase());
    }

    // Ban through Twitch Native Moderation Helix API
    if (targetTwitchUserId) {
       await executeTwitchModeration(roomId, state, targetTwitchUserId, 'ban', {
         reason: reason || 'Banido permanentemente através do Painel Live Queue'
       });
    }

    // Create Persistent Ban Record
    const newBan: any = {
      id: 'ban_' + Date.now(),
      userId: targetUserId,
      username: targetUsername,
      ip: targetUser?.ip || '',
      banType: banType || 'permanent',
      reason: reason || 'Banido permanentemente pelo moderador.',
      moderator: 'Host',
      createdAt: Date.now(),
      active: true,
      history: [{
        timestamp: Date.now(),
        action: 'ban',
        reason: reason || 'Banido pelo moderador',
        moderator: 'Host'
      }]
    };

    const allBans = [...(state.allBans || [])];
    allBans.push(newBan);

    const updatedUsers = (state.users || []).map((u: any) => {
      const uLogin = u.twitchData?.login?.toLowerCase();
      const uTwitchId = u.twitchData?.twitchUserId;
      const isMatch = u.userId === targetUserId || 
                      (targetLogin && uLogin === targetLogin) || 
                      (targetTwitchUserId && uTwitchId === targetTwitchUserId) || 
                      (targetTwitchUserId && u.userId === targetTwitchUserId);

      if (isMatch) {
        return { ...u, isBanned: true };
      }
      return u;
    });

    // Clean user submitted pending and active videos upon permanent ban
    const updatedQueue = (state.queue || []).filter((v: any) => {
       const isMatch = v.submitterId === targetUserId || 
                       (targetTwitchUserId && v.submitterId === targetTwitchUserId) || 
                       (targetUsername && v.submitter?.toLowerCase() === targetUsername.toLowerCase());
       return !isMatch;
    });

    const updatedState = { ...state, users: updatedUsers, queue: updatedQueue, blacklistUsernames, allBans };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
      // Publish a specific kick event so the client knows it was banned immediately
      await channel.publish('kick', { userId: targetUserId, reason: reason || 'Banido permanentemente.' });
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/clear_audit_logs - Clear audit trail
app.post(['/sessions/:id/clear_audit_logs', '/api/sessions/:id/clear_audit_logs'], async (req, res) => {
  try {
    const roomId = req.params.id;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedState = { ...state, auditLogs: [] };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/end_session - End session
app.post(['/sessions/:id/end_session', '/api/sessions/:id/end_session'], async (req, res) => {
  try {
    const roomId = req.params.id;
    await endSession(roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_ended', null);
    }

    res.json({ success: true, message: 'Session ended successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sessions/:id/leave_session - Leave session
app.post(['/sessions/:id/leave_session', '/api/sessions/:id/leave_session'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { userId } = req.body;

    const state: any = await getSession(roomId);
    if (!state) return res.json({ success: true });

    const filteredUsers = (state.users || []).filter((u: any) => u.userId !== userId);
    const updatedState = { ...state, users: filteredUsers };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('rooms')
      .update({ viewer_count: filteredUsers.length })
      .eq('id', roomId);

    if (ablyRest) {
      const channel = ablyRest.channels.get(`session:${roomId}`);
      await channel.publish('session_state', updatedState);
    }

    res.json({ success: true, session: updatedState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SERVER LIFECYCLE
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files but disable serving index.html automatically (to allow injection)
    app.use(express.static(path.join(process.cwd(), 'dist'), { index: false }));
    
    let indexHtmlContent = '';
    try {
      indexHtmlContent = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf-8');
    } catch (e) {
      console.error('Failed to read dist/index.html', e);
    }

    app.get('*', (req, res) => {
      if (indexHtmlContent) {
        const envScript = `
  <script id="env-payload">
    window.__RUNTIME_CONFIG__ = {
      VITE_SUPABASE_URL: ${JSON.stringify(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')},
      VITE_SUPABASE_ANON_KEY: ${JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '')}
    };
  </script>
`;
        const injectedHtml = indexHtmlContent.replace('<head>', `<head>${envScript}`);
        res.send(injectedHtml);
      } else {
        res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
