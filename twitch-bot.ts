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

export function initTwitchBot() {
  botClient = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: { reconnect: true, secure: true }
  });

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
          const result = sanitizeAndValidateUrl(url, state.settings);
          if (!result.valid || !result.normalizedUrl) continue;

          const platform = result.platform || 'other';
          const verifyState = await verifyVideoContent(
            result.normalizedUrl,
            platform,
            state.settings?.blockLiveStreams ?? true
          );

          if (!verifyState.valid) continue;

          const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
          const isDuplicate = (state.queue || []).some((v: any) => v.id.includes(canonicalId));
          if (isDuplicate) continue;

          const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();
          const username = tags['username'] || 'TwitchUser';
          const displayName = tags['display-name'] || username;

          const rawBadges = tags.badges || {};
          const actualBadges = Object.keys(rawBadges);

          const isHost = userId === state.hostId || actualBadges.includes('broadcaster');
          if (!isHost) {
            if (state.blacklistUsernames?.includes(username.toLowerCase())) continue;
            const userActive = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
            const maxVideos = state.settings?.maxVideosPerUser || state.settings?.max_videos_per_user || 2;
            if (userActive >= maxVideos) continue;
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

          if (botClient && process.env.TWITCH_BOT_USERNAME) {
             const position = updatedQueue.filter(v => v.status === 'approved').length;
             const estLengthStr = position * 3;
             const prefix = state.settings?.isManualApprovalRequired ? 'Seu vídeo foi para aprovação.' : `Seu vídeo foi adicionado à fila (Pos: #${position}, Tempo est: ~${estLengthStr}m).`;
             botClient.say(channel, `@${displayName} ${prefix}`);
          }
          break;
        }
    } catch(err) {}
  });
}
