import tmi from 'tmi.js';
import { getSupabaseAdmin, getSession } from './src/lib/supabase.js';
import { sanitizeAndValidateUrl, extractCanonicalVideoId, verifyVideoContent } from './server.js';
import crypto from 'crypto';
import { ablyRest } from './src/lib/ably.js';

let botClient: tmi.Client | null = null;
const activeChannels = new Set<string>();

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
            sendBotMessage(channel, `@${displayName} ❌ Link inválido. Motivo: ${reason}`);
            continue;
          }

          const platform = result.platform || 'other';
          const verifyState = await verifyVideoContent(
            result.normalizedUrl,
            platform,
            state.settings?.blockLiveStreams ?? true
          );

          if (!verifyState.valid) {
            console.warn(`[Twitch Bot Ref] Video content verification failed. Reason: ${verifyState.error}`);
            const reason = verifyState.error || 'Falha ao analisar o vídeo';
            sendBotMessage(channel, `@${displayName} ❌ Falha no vídeo da ${platform.toUpperCase()}: ${reason}`);
            continue;
          }

          const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
          const isDuplicate = (state.queue || []).some((v: any) => v.id.includes(canonicalId));
          if (isDuplicate) {
            console.warn(`[Twitch Bot Ref] Link already present in queue.`);
            sendBotMessage(channel, `@${displayName} ⚠️ Este vídeo já está na fila!`);
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
              sendBotMessage(channel, `@${displayName} ⚠️ Limite atingido! Você só pode enviar até ${maxVideos} vídeo(s) na fila.`);
              continue;
            }
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
            sendBotMessage(channel, `✨ @${displayName}, seu vídeo de ${platform.toUpperCase()} ("${newVideo.title}") foi enviado e está aguardando aprovação dos moderadores! 📝`);
          } else {
            const approvedCount = updatedQueue.filter(v => v.status === 'approved').length;
            sendBotMessage(channel, `🎉 @${displayName}, seu vídeo de ${platform.toUpperCase()} ("${newVideo.title}") foi adicionado com sucesso! (Fila Pos: #${approvedCount}) 🎬`);
          }
          break;
        }
    } catch(err) {}
  });
}
