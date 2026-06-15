import tmi from 'tmi.js';
import { getSupabaseAdmin, getSession } from './src/lib/supabase.js';
import { sanitizeAndValidateUrl, extractCanonicalVideoId, verifyVideoContent } from './server.js';
import crypto from 'crypto';
import { ablyRest } from './src/lib/ably.js';
import axios from 'axios';

// Register or update active user record in session state for Twitch chat submitter
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

  // Find if user already exists
  let userIndex = state.users.findIndex((u: any) => u.userId === userId || u.name?.toLowerCase() === username.toLowerCase());
  let existingUser = userIndex !== -1 ? state.users[userIndex] : null;

  let avatarUrl = existingUser?.twitchData?.avatarUrl || '';
  let login = existingUser?.twitchData?.login || username.toLowerCase();
  let finalDisplayName = existingUser?.twitchData?.displayName || displayName;

  // Retrieve user profiles via Helix if token is present and details are missing
  if (broadcasterToken && (!avatarUrl || !login || !finalDisplayName)) {
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
      console.warn(`[Twitch Bot Info Retrieve Failure] id=${userId}:`, e.message);
    }
  }

  // Fallback avatar/defaults if still empty
  if (!avatarUrl) {
    avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;
  }

  // Parse tags for basic subscriber/moderator indicators as backup
  const rawBadges = tags && tags.badges ? Object.keys(tags.badges) : [];
  let isSubscriber = rawBadges.includes('subscriber') || !!tags?.subscriber;
  let isModerator = rawBadges.includes('moderator') || rawBadges.includes('broadcaster');
  let isVip = rawBadges.includes('vip');
  
  let isFollower = existingUser?.twitchData?.isFollower || false;
  let followedAt = existingUser?.twitchData?.followedAt || null;

  // Query real-time metrics (follow and subscription) using Broadcaster's Authenticated token
  if (broadcasterToken && broadcasterId && userId !== broadcasterId) {
    try {
      let clientId = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
      const rootRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${broadcasterToken}` },
        timeout: 3000
      }).catch(() => null);
      if (rootRes && rootRes.data && rootRes.data.client_id) {
        clientId = rootRes.data.client_id;
      }

      // 1. Follow confirmation
      const followUrl = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}&moderator_id=${broadcasterId}`;
      const fRes = await axios.get(followUrl, {
        headers: {
          'Client-Id': clientId,
          'Authorization': `Bearer ${broadcasterToken}`
        },
        timeout: 4000
      }).catch(() => null);
      if (fRes && fRes.data?.data && fRes.data.data.length > 0) {
        isFollower = true;
        followedAt = fRes.data.data[0].followed_at;
      }

      // 2. Subscription confirmation
      const subUrl = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&user_id=${userId}`;
      const sRes = await axios.get(subUrl, {
        headers: {
          'Client-Id': clientId,
          'Authorization': `Bearer ${broadcasterToken}`
        },
        timeout: 4000
      }).catch(() => null);
      if (sRes && sRes.data?.data && sRes.data.data.length > 0) {
        isSubscriber = true;
      }
    } catch (e: any) {
      console.warn(`[Twitch Bot Follower Sync Error] id=${userId}:`, e.message);
    }
  } else if (userId === broadcasterId) {
    isFollower = true;
    isSubscriber = true;
  }

  const twitchData = {
    avatarUrl,
    login: login.toLowerCase(),
    displayName: finalDisplayName,
    twitchUserId: userId,
    isSubscriber,
    isModerator,
    isVip,
    isBroadcaster: userId === broadcasterId,
    isFollower,
    followedAt,
    color: tags?.color || '#9146FF',
    badges: rawBadges
  };

  const formattedUser = {
    id: userId,
    userId,
    name: finalDisplayName,
    isHost: userId === broadcasterId,
    isWhitelisted: existingUser?.isWhitelisted || false,
    strikes: existingUser?.strikes || 0,
    isBanned: existingUser?.isBanned || false,
    timeoutUntil: existingUser?.timeoutUntil || undefined,
    lastSubmittedAt: Date.now(),
    twitchData
  };

  if (userIndex !== -1) {
    state.users[userIndex] = formattedUser;
  } else {
    state.users.push(formattedUser);
  }
}

let botClient: tmi.Client | null = null;
const activeChannels = new Set<string>();
const recentlyProcessedVideos = new Set<string>();

export function connectBotToChannel(channelName: string) {
  if (!channelName) return;
  const login = channelName.toLowerCase();
  if (!activeChannels.has(login)) {
     activeChannels.add(login);
     console.log(`[Twitch Bot Ref] Adding channel #${login} to queue/monitored set (Bot Ready: ${!!botClient})`);
     if (botClient) {
       botClient.join(login).catch((err) => {
         console.error(`[Twitch Bot Ref] Error joining channel #${login}:`, err.message);
       });
     }
  }
}

async function joinAllActiveRooms() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select('id, twitch_channel_id, room_settings(settings_json)')
      .eq('is_active', true);
      
    if (error || !rooms) return;
    
    for (const room of rooms) {
      const settingsRaw = Array.isArray(room.room_settings) 
        ? (room.room_settings[0] as any)?.settings_json 
        : (room.room_settings as any)?.settings_json;
      
      const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
        || room.twitch_channel_id?.toLowerCase();
        
      if (streamerLogin && !streamerLogin.includes('-') && streamerLogin.length > 2) {
         connectBotToChannel(streamerLogin);
      }
    }
  } catch (err: any) {
    console.error('[Twitch Bot Ref] Failed to auto-join active rooms:', err.message);
  }
}

// Helper to send messages safely back to Twitch chat (requires authenticated bot config)
function sendBotMessage(channel: string, message: string) {
  if (!botClient) return;
  console.log(`[Twitch Bot Ref Chat Feedback] Sending to ${channel}: ${message}`);
  const botUsername = process.env.TWITCH_BOT_USERNAME || '';
  const botOauthToken = process.env.TWITCH_BOT_OAUTH_TOKEN || '';
  if (!botUsername || !botOauthToken) {
    console.log('[Twitch Bot Ref Chat Feedback] Skipping chat response because credentials are not configured (running in read-only anonymous mode).');
    return;
  }
  botClient.say(channel, message).catch((err) => {
    console.error(`[Twitch Bot Ref Chat Feedback] Failed to send message to Twitch chat channel ${channel}:`, err.message);
  });
}

export function initTwitchBot() {
  const botUsername = process.env.TWITCH_BOT_USERNAME || '';
  const botOauthToken = process.env.TWITCH_BOT_OAUTH_TOKEN || '';
  
  const clientOptions: any = {
    options: { debug: true, messagesLogLevel: "info" },
    connection: { reconnect: true, secure: true }
  };
  
  if (botUsername && botOauthToken) {
    console.log(`[Twitch Bot Ref] Initializing authenticated client for user: @${botUsername}`);
    clientOptions.identity = {
      username: botUsername.toLowerCase(),
      password: botOauthToken.startsWith('oauth:') ? botOauthToken : `oauth:${botOauthToken}`
    };
  } else {
    console.log('[Twitch Bot Ref] Initializing anonymous read-only Twitch client...');
  }

  botClient = new tmi.Client(clientOptions);

  botClient.connect().catch(console.error);

  botClient.on('connected', (address, port) => {
    console.log(`[Twitch Bot Ref] Connected to Twitch IRC: ${address}:${port}`);
    for (const chan of activeChannels) {
      botClient?.join(chan).catch(console.error);
    }
    joinAllActiveRooms();
  });

  botClient.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.includes('http://') && !message.includes('https://')) return;

    const urls = message.match(/https?:\/\/[^\s]+/g);
    if (!urls || urls.length === 0) return;

    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();
    
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: rooms } = await supabaseAdmin
           .from('rooms')
           .select('id, twitch_channel_id, room_settings(settings_json)')
           .eq('is_active', true);
           
        if (!rooms || rooms.length === 0) return;
        
        const matchedRoom = rooms.find(r => {
          const settingsRaw = Array.isArray(r.room_settings) 
            ? (r.room_settings[0] as any)?.settings_json 
            : (r.room_settings as any)?.settings_json;
          
          const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
            || r.twitch_channel_id?.toLowerCase();
            
          return streamerLogin === login;
        });

        if (!matchedRoom) return;
        
        const roomId = matchedRoom.id;
        const settingsRaw = Array.isArray(matchedRoom.room_settings) ? (matchedRoom.room_settings[0] as any)?.settings_json : (matchedRoom.room_settings as any)?.settings_json;
        const state: any = settingsRaw || {};
        if (!state.settings) return;

        for (const url of urls) {
          const username = tags['username'] || 'TwitchUser';
          const displayName = tags['display-name'] || username;

          const result = sanitizeAndValidateUrl(url, state.settings);
          if (!result.valid || !result.normalizedUrl) {
            console.warn(`[Twitch Bot Ref] URL validation failed: ${url}. Reason: ${result.error}`);
            const reason = result.error || 'Mala formatação ou plataforma não suportada';
            sendBotMessage(channel, `@${displayName} ❌ Link inválido: ${reason}`);
            continue;
          }

          const platform = result.platform || 'other';
          const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
          const uniqKey = `${roomId}:${canonicalId}`;

          // 1. Check synchronous in-memory lock first to prevent quick-succession race conditions
          // Silently drop duplicate fast-succession messages within 15s to avoid duplicate messages spamming the chat
          if (recentlyProcessedVideos.has(uniqKey)) {
            console.warn(`[Twitch Bot Ref @Deduplication] Prevented duplicate processing of video key: ${uniqKey}`);
            continue;
          }

          // 2. Check existing queue for persistence deduplication
          const isDuplicate = (state.queue || []).some((v: any) => 
            v.id.includes(canonicalId) && (v.status === 'pending' || v.status === 'approved' || !v.status)
          );
          if (isDuplicate) {
            console.warn(`[Twitch Bot Ref] Link already present in queue.`);
            sendBotMessage(channel, `@${displayName} ⚠️ Este vídeo já está na fila.`);
            continue;
          }

          // 3. Register synchronous lock immediately BEFORE any async processes occur to block duplicate incoming streams
          recentlyProcessedVideos.add(uniqKey);
          const timeoutId = setTimeout(() => {
            recentlyProcessedVideos.delete(uniqKey);
          }, 15000); // 15 seconds window

          const verifyState = await verifyVideoContent(
            result.normalizedUrl,
            platform,
            state.settings?.blockLiveStreams ?? true
          );

          if (!verifyState.valid) {
            console.warn(`[Twitch Bot Ref] Video content verification failed. Reason: ${verifyState.error}`);
            const reason = verifyState.error || 'Falha ao analisar o vídeo';
            sendBotMessage(channel, `@${displayName} ❌ Erro no vídeo: ${reason}`);
            // Remove the lock on verification failure so the user can re-try
            clearTimeout(timeoutId);
            recentlyProcessedVideos.delete(uniqKey);
            continue;
          }

          const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();

          const rawBadges = tags.badges || {};
          const actualBadges = Object.keys(rawBadges);

          const isHost = userId === state.hostId || actualBadges.includes('broadcaster');
          if (!isHost) {
            if (state.blacklistUsernames?.includes(username.toLowerCase())) {
              console.warn(`[Twitch Bot Ref] User @${username} is blacklisted.`);
              continue;
            }
            const userActive = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
            const maxVideos = state.settings?.maxVideosPerUser || state.settings?.max_videos_per_user || 2;
            if (userActive >= maxVideos) {
              console.warn(`[Twitch Bot Ref] User @${username} has reached limits.`);
              sendBotMessage(channel, `@${displayName} ⚠️ Limite de ${maxVideos} vídeo(s) atingido.`);
              continue;
            }
          }

          // Register or update active room participant record for this Twitch chat submitter
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

          const newVideo = {
            id: `vid_${canonicalId}_${Date.now()}`,
            submitter: displayName,
            submitterId: userId,
            url: result.normalizedUrl,
            platform,
            title: verifyState.title || 'Vídeo do Chat',
            status: state.settings?.isManualApprovalRequired ? 'pending' : 'approved',
            timestamp: Date.now()
          };

          const updatedQueue = [...(state.queue || []), newVideo];
          const updatedState = { ...state, queue: updatedQueue };

          await supabaseAdmin.from('room_settings')
             .update({ settings_json: updatedState })
             .eq('room_id', roomId);

          if (ablyRest) {
            const ablyChannel = ablyRest.channels.get(`session:${roomId}`);
            await ablyChannel.publish('session_state', updatedState);
          }

          // Success chat notifications
          if (newVideo.status === 'pending') {
            sendBotMessage(channel, `@${displayName} 📝 Vídeo enviado para moderação.`);
          } else {
            const approvedCount = updatedQueue.filter(v => v.status === 'approved').length;
            sendBotMessage(channel, `@${displayName} ✅ Vídeo adicionado! Posição: #${approvedCount}`);
          }
          break;
        }
    } catch(err) {}
  });
}
