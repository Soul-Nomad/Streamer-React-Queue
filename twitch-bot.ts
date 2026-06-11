import tmi from 'tmi.js';
import { getSupabaseAdmin, getSession } from './src/lib/supabase.js';
// We would import the helper functions, but Node ESM syntax for local imports needs .js
import { sanitizeAndValidateUrl, extractCanonicalVideoId, verifyVideoContent } from './server.js';
import crypto from 'crypto';
import { ablyRest } from './src/lib/ably.js';

let botClient: tmi.Client | null = null;
const activeChannels = new Set<string>();

export function initTwitchBot() {
  botClient = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: { reconnect: true, secure: true },
    // If you add a bot token later, pass identity here:
    // identity: { username: process.env.TWITCH_BOT_USERNAME, password: process.env.TWITCH_BOT_PASSWORD }
  });

  botClient.connect().catch(console.error);

  botClient.on('message', async (channel, tags, message, self) => {
    if (self) return;

    // Ignore commands, only process links
    if (!message.includes('http://') && !message.includes('https://')) return;

    const urls = message.match(/https?:\/\/[^\s]+/g);
    if (!urls || urls.length === 0) return;

    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();
    
    // Find room associated with this channel
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rooms } = await supabaseAdmin
       .from('rooms')
       .select('id')
       .eq('twitch_channel_id', login)
       .eq('is_active', true);
       
    if (!rooms || rooms.length === 0) return;
    
    const roomId = rooms[0].id;
    const state: any = await getSession(roomId);
    if (!state) return;

    for (const url of urls) {
      const result = sanitizeAndValidateUrl(url, state.settings);
      if (!result.valid || !result.normalizedUrl) {
         // Optionally notify in chat
         continue;
      }

      const platform = result.platform || 'other';
      
      // Perform content verification
      const verifyState = await verifyVideoContent(
        result.normalizedUrl,
        platform,
        state.settings?.blockLiveStreams ?? true
      );

      if (!verifyState.valid) {
         continue;
      }

      const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
      const isDuplicate = (state.queue || []).some((v: any) => v.id.includes(canonicalId));
      if (isDuplicate) {
         continue;
      }

      const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();
      const username = tags['username'] || 'TwitchUser';
      const displayName = tags['display-name'] || username;

      // Extract Badges
      const rawBadges = tags.badges || {};
      const actualBadges = Object.keys(rawBadges);

      // Check max limitations and rules
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

      // If we have a bot token configured, we can reply in chat
      if (botClient && process.env.TWITCH_BOT_USERNAME) {
         const position = updatedQueue.filter(v => v.status === 'approved').length;
         const estLengthStr = position * 3;
         const prefix = state.settings?.isManualApprovalRequired ? 'Seu vídeo foi para aprovação.' : `Seu vídeo foi adicionado à fila (Pos: #${position}, Tempo est: ~${estLengthStr}m).`;
         botClient.say(channel, `@${displayName} ${prefix}`);
      }
      
      // Stop after processing the first valid link in the message to prevent link-spam parsing 
      break;
    }
  });
}

export function connectBotToChannel(channelName: string) {
  if (!botClient || !channelName) return;
  const login = channelName.toLowerCase();
  if (!activeChannels.has(login)) {
     activeChannels.add(login);
     botClient.join(login).catch(console.error);
  }
}
