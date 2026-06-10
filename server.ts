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

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Auto-cleanup DB interval (every 10 mins)
setInterval(async () => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: settings } = await supabaseAdmin.from('room_settings').select('room_id, settings_json');
    if (!settings) return;

    for (const room of settings) {
      const retentionHours = room.settings_json?.videoRetentionHours ?? room.settings_json?.video_retention_hours ?? 48;
      if (retentionHours <= 0 || retentionHours > 48) continue;
      const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
      
      await supabaseAdmin.from('videos')
        .delete()
        .eq('room_id', room.room_id)
        .lt('inserted_at', cutoffTime);
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
  'tiktok.com'
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
  platform?: 'youtube' | 'instagram' | 'tiktok' | 'other';
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
function sanitizeAndValidateUrl(rawUrl: string, settings: any): SecurityCheckResult {
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
    let platform: 'youtube' | 'instagram' | 'tiktok' | 'other' = 'other';

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
async function verifyVideoContent(
  url: string, 
  platform: 'youtube' | 'instagram' | 'tiktok' | 'other',
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
function extractCanonicalVideoId(url: string, platform: string): string {
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
    }
  } catch (e) {}
  return url;
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

// Proxy direct streaming media to bypass local browser CORS & security headers
app.get('/api/proxy-video', async (req, res) => {
  const mediaUrl = req.query.url as string;
  if (!mediaUrl) {
    res.status(400).send('URL is required');
    return;
  }

  // Set up headers to forward and bypass CORS/restrictions
  const requestHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.instagram.com/'
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

    const newUser = {
      id: userId,
      userId,
      name: sanitizeInput(name || 'Viewer').substring(0, 20),
      isHost: state.hostId === userId,
      isWhitelisted: false,
      strikes: 0,
      isBanned: false,
      twitchData
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

    const newVideo = {
      id: 'vid_' + Date.now().toString() + Math.random().toString(36).substring(7),
      submitter: username,
      submitterId: userId,
      url: cleanUrl,
      title: sanitizeInput(contentCheck.title || 'Vídeo Sincronizado'),
      platform,
      status: (state.settings?.isManualApprovalRequired && state.hostId !== userId) ? 'pending' : 'approved',
      timestamp: Date.now(),
      priority_score
    };

    const updatedQueue = [...(state.queue || [])];
    updatedQueue.push(newVideo);

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

    const updatedState = {
      ...state,
      currentVideoId: videoId,
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
    let history = state.history || [];

    const activeIndex = queue.findIndex((v: any) => v.id === currentVideoId);
    if (activeIndex !== -1) {
      const played = queue.splice(activeIndex, 1)[0];
      played.status = 'watched';
      history = [played, ...history].slice(0, 50);
    }

    if (queue.length > 0) {
      // Sort and select next
      queue.sort((a: any, b: any) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return a.timestamp - b.timestamp;
      });
      currentVideoId = queue[0].id;
      isPlaying = true;
    } else {
      currentVideoId = null;
      isPlaying = false;
    }

    const updatedState = {
      ...state,
      queue,
      currentVideoId,
      isPlaying,
      currentTime: 0,
      history
    };

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('room_settings')
      .update({ settings_json: updatedState })
      .eq('room_id', roomId);

    await supabaseAdmin
      .from('rooms')
      .update({ video_queue_count: queue.length })
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

    const history = state.history || [];
    if (history.length === 0) return res.json({ success: true, session: state });

    const previous = history.shift();
    previous.status = 'playing';

    const queue = [previous, ...(state.queue || [])];

    const updatedState = {
      ...state,
      queue,
      currentVideoId: previous.id,
      isPlaying: true,
      currentTime: 0,
      history
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

// POST /sessions/:id/unban_user - Lift ban
app.post(['/sessions/:id/unban_user', '/api/sessions/:id/unban_user'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const targetUserId = typeof data === 'string' ? data : data?.userId;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const allBans = (state.allBans || []).map((b: any) => {
      if (b.userId === targetUserId) return { ...b, active: false };
      return b;
    });

    const banRecord = (state.allBans || []).find((b: any) => b.userId === targetUserId);
    const targetUsername = banRecord?.username?.toLowerCase();

    const blacklistUsernames = (state.blacklistUsernames || []).filter((u: string) => u.toLowerCase() !== targetUsername);

    const updatedState = { ...state, allBans, blacklistUsernames };

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

// POST /sessions/:id/give_strike - Issue warning strike
app.post(['/sessions/:id/give_strike', '/api/sessions/:id/give_strike'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const targetUserId = data?.userId;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const updatedUsers = (state.users || []).map((u: any) => {
      if (u.userId === targetUserId) {
        return { ...u, strikes: (u.strikes || 0) + 1 };
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

// POST /sessions/:id/timeout_user - Timeout/Mute user
app.post(['/sessions/:id/timeout_user', '/api/sessions/:id/timeout_user'], async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data } = req.body;
    const { userId: targetUserId, minutes } = data;

    const state: any = await getSession(roomId);
    if (!state) return res.status(404).json({ error: 'Sala não encontrada.' });

    const timeoutUntil = Date.now() + (minutes * 60 * 1000);
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
      // ONLY publish session_state to avoid duplicate "error/status" messages if client handles it manually
      await channel.publish('session_state', updatedState);
      // Removed the 'error' publish to avoid duplication on client screen
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

    const filteredUsers = (state.users || []).filter((u: any) => u.userId !== targetUserId);
    const updatedState = { ...state, users: filteredUsers, blacklistUsernames, allBans };

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
