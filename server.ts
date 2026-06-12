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

import tmi from 'tmi.js';

let botClient: tmi.Client | null = null;
const activeChannels = new Set<string>();

export function connectBotToChannel(channelName: string) {
  if (!channelName) return;
  const login = channelName.toLowerCase();
  if (!activeChannels.has(login)) {
     activeChannels.add(login);
     console.log(`[Twitch Bot] Adding channel #${login} to queue/monitored set (Bot Ready: ${!!botClient})`);
     if (botClient) {
       botClient.join(login).catch((err) => {
         console.error(`[Twitch Bot] Error joining channel #${login}:`, err.message);
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
        || room.twitch_channel_id?.toLowerCase();
        
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
  if (!botClient) return;
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

// Bot Init inside server
setTimeout(() => {
  const botUsername = process.env.TWITCH_BOT_USERNAME || '';
  const botOauthToken = process.env.TWITCH_BOT_OAUTH_TOKEN || '';
  
  const clientOptions: any = {
    options: { debug: false },
    connection: { reconnect: true, secure: true }
  };
  
  if (botUsername && botOauthToken) {
    console.log(`[Twitch Bot] Initializing authenticated Twitch IRC bot client as @${botUsername}...`);
    clientOptions.identity = {
      username: botUsername.toLowerCase(),
      password: botOauthToken.startsWith('oauth:') ? botOauthToken : `oauth:${botOauthToken}`
    };
  } else {
    console.log('[Twitch Bot] Initializing anonymous read-only Twitch IRC bot client...');
  }
  
  botClient = new tmi.Client(clientOptions);
  
  botClient.connect().catch((connectErr) => {
    console.error('[Twitch Bot] Connection error during initial connect:', connectErr.message);
  });

  botClient.on('connected', (address, port) => {
    console.log(`[Twitch Bot] Successfully connected to Twitch IRC server: ${address}:${port}`);
    
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
  
  botClient.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.includes('http://') && !message.includes('https://')) return;
    
    const urls = message.match(/https?:\/\/[^\s]+/g);
    if (!urls || urls.length === 0) return;

    const login = (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();
    console.log(`[Twitch Bot] Scraped video link message in channel #${login} from @${tags.username}: ${message}`);
    
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: rooms } = await supabaseAdmin
          .from('rooms')
          .select('id, twitch_channel_id, room_settings(settings_json)')
          .eq('is_active', true);
          
        if (!rooms || rooms.length === 0) {
          console.log(`[Twitch Bot] Discarded link; no active rooms are currently running in the database.`);
          return;
        }

        // Search case-insensitively in memory comparing with stored metadata
        const matchedRoom = rooms.find(r => {
          const settingsRaw = Array.isArray(r.room_settings) 
            ? (r.room_settings[0] as any)?.settings_json 
            : (r.room_settings as any)?.settings_json;
          
          const streamerLogin = settingsRaw?.twitchData?.login?.toLowerCase() 
            || r.twitch_channel_id?.toLowerCase();
            
          return streamerLogin === login;
        });

        if (!matchedRoom) {
          console.warn(`[Twitch Bot] No matching active room found in database for channel #${login}`);
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

          const result = sanitizeAndValidateUrl(url, state.settings);
          if (!result.valid || !result.normalizedUrl) {
            console.warn(`[Twitch Bot] URL validation failed: ${url}. Reason: ${result.error}`);
            const reason = result.error || 'Mala formatação ou plataforma não suportada';
            sendBotMessage(channel, `@${displayName} ❌ Link inválido. Motivo: ${reason}`);
            continue;
          }
          const platform = result.platform || 'other';
          const verifyState = await verifyVideoContent(result.normalizedUrl, platform, state.settings?.blockLiveStreams ?? true);
          if (!verifyState.valid) {
            console.warn(`[Twitch Bot] Video content verification failed: ${result.normalizedUrl}. Reason: ${verifyState.error}`);
            const reason = verifyState.error || 'Falha ao analisar o vídeo';
            sendBotMessage(channel, `@${displayName} ❌ Falha no vídeo da ${platform.toUpperCase()}: ${reason}`);
            continue;
          }

          const canonicalId = extractCanonicalVideoId(result.normalizedUrl, platform);
          const isDuplicate = (state.queue || []).some((v: any) => v.id.includes(canonicalId));
          if (isDuplicate) {
            console.warn(`[Twitch Bot] Link already present in queue as ${canonicalId}`);
            sendBotMessage(channel, `@${displayName} ⚠️ Este vídeo já está na fila!`);
            continue;
          }

          const userId = tags['user-id'] || 'usr_' + crypto.randomUUID();

          const rawBadges = tags.badges || {};
          const actualBadges = Object.keys(rawBadges);

          const isHost = userId === state.hostId || actualBadges.includes('broadcaster');
          if (!isHost) {
            if (state.blacklistUsernames?.includes(username.toLowerCase())) {
              console.warn(`[Twitch Bot] User @${username} is blacklisted.`);
              // We intentionally skip chat feedback for blacklisted accounts to prevent troll spamming.
              continue;
            }
            const userActive = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
            const maxVideos = state.settings?.maxVideosPerUser !== undefined ? state.settings.maxVideosPerUser : (state.settings?.max_videos_per_user ?? 0);
            if (maxVideos > 0 && userActive >= maxVideos) {
              console.warn(`[Twitch Bot] User @${username} has reached the limit of ${maxVideos} videos.`);
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

          await supabaseAdmin.from('room_settings').update({ settings_json: updatedState }).eq('room_id', roomId);
          console.log(`[Twitch Bot] Added new video "${newVideo.title}" (${platform}) to room ${roomId} submitted by Chat user @${displayName}`);

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
      
      const res = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 3500 });
      if (res.status === 200) {
        // Double check live streams via keyword if check exists
        if (blockLive && (res.data.title || '').toLowerCase().includes('live')) {
          return { valid: false, error: 'Transmissões ao vivo (Live Streams) estão desabilitadas nas configurações.' };
        }
        return { valid: true, title: res.data.title || 'Vídeo do YouTube' };
      }
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
    const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`;
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

    // CHECK FOR BAN OR TIMEOUT
    if (userRecord.isBanned) {
      return res.status(403).json({ error: 'Você está permanentemente banido desta sala.' });
    }

    if (userRecord.timeoutUntil && Date.now() < userRecord.timeoutUntil) {
      const remaining = Math.ceil((userRecord.timeoutUntil - Date.now()) / 1000);
      return res.status(403).json({ error: `Você está em timeout. Aguarde mais ${remaining} segundos.` });
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

    const updatedUsers = (state.users || []).map((u: any) => {
      if (u.userId === targetUserId) {
        targetUsername = u?.twitchData?.login || u?.name || 'unknown';
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
    
    const updatedUsers = (state.users || []).map((u: any) => {
      if (u.userId === targetUserId) {
        return { ...u, timeoutUntil };
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
      const updatedUsers = (state.users || []).map((u: any) => {
        if (u.userId === targetUserId) return { ...u, timeoutUntil };
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
    
    const blacklistUsernames = [...(state.blacklistUsernames || [])];
    if (!blacklistUsernames.includes(targetUsername.toLowerCase())) {
      blacklistUsernames.push(targetUsername.toLowerCase());
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
      if (u.userId === targetUserId) {
        return { ...u, isBanned: true };
      }
      return u;
    });

    const updatedState = { ...state, users: updatedUsers, blacklistUsernames, allBans };

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
