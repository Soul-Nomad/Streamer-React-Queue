import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import axios from 'axios';
import dns from 'dns';
import punycode from 'punycode';
import crypto from 'crypto';
import fs from 'fs';
// @ts-ignore
import instagramGetUrlPkg from 'instagram-url-direct';
import { dbStore } from './src/database.js';

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
const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json());

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

// Logging security issues in the audit trail
function logSessionSecurityActivity(
  session: any, 
  type: 'spam' | 'malicious_url' | 'unicode_bypass' | 'duplicate' | 'rate_limit' | 'strike_ban' | 'admin_action' | 'abuse_attempt',
  message: string,
  username: string,
  ip: string,
  severity: 'low' | 'medium' | 'high'
) {
  if (!session.auditLogs) {
    session.auditLogs = [];
  }
  const log = {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    timestamp: Date.now(),
    type,
    message,
    username: username || 'AnonymousUser',
    ip: ip || 'unknown',
    severity
  };
  session.auditLogs.unshift(log);
  if (session.auditLogs.length > 300) {
    session.auditLogs.pop();
  }
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

// Programmatically resolve Instagram reel stream URL to display in native video players without iframe security blockades
app.get('/api/rooms', (req, res) => {
  const activeRooms = Array.from(sessions.values()).map(sess => {
    const host = sess.users.find((u: any) => u.isHost);
    return {
      roomId: sess.id,
      hostName: host?.name || 'Unknown',
      hostAvatar: host?.twitchData?.avatarUrl || '',
      hostLogin: host?.twitchData?.login || '',
      hostTwitchUserId: sess.hostTwitchUserId || host?.twitchData?.twitchUserId || '',
      usersCount: sess.users.length,
      queueCount: sess.queue.length,
      uptime: Date.now() - (sess.createdAt || Date.now())
    };
  });
  // Sort by users count descending
  activeRooms.sort((a, b) => b.usersCount - a.usersCount);
  res.json({ rooms: activeRooms });
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Temporary in-memory store for sessions
const sessions = new Map<string, any>();
const userTokensPrivateMap = new Map<string, string>();

function sanitizeTwitchData(twitchData: any) {
  if (!twitchData) return undefined;
  const { providerToken, ...rest } = twitchData;
  return rest;
}

async function verifyRealTwitchData(session: any, user: any) {
  if (!user.twitchData) return;

  const userToken = userTokensPrivateMap.get(user.id);
  
  // Dynamically resolve client ID for the viewer's token
  let viewerClientId = process.env.TWITCH_CLIENT_ID;
  if (userToken) {
     try {
        const valRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
           headers: {
              'Authorization': `OAuth ${userToken}`
           }
        });
        if (valRes.data && valRes.data.client_id) {
           viewerClientId = valRes.data.client_id;
        }
     } catch (e: any) {
        console.warn(`[Twitch Auth] Viewer token validation failed:`, e.response?.data || e.message);
     }
  }
  if (!viewerClientId) {
     viewerClientId = 'gp762nuuoqcoxypju8c569th9wz7q5'; // default fallback
  }

  let realTwitchUserId = user.twitchData.twitchUserId;
  let realDisplayName = user.twitchData.displayName;
  let realLogin = user.twitchData.login;
  let realAvatarUrl = user.twitchData.avatarUrl;

  // 1. Double check the viewer's token to get their real ID/profile and prevent spoofing.
  if (userToken) {
     try {
        const uRes = await axios.get('https://api.twitch.tv/helix/users', {
           headers: {
              'Client-Id': viewerClientId,
              'Authorization': `Bearer ${userToken}`
           }
        });

        if (uRes.data && uRes.data.data && uRes.data.data.length > 0) {
           const uData = uRes.data.data[0];
           realTwitchUserId = uData.id;
           realDisplayName = uData.display_name;
           realLogin = uData.login;
           realAvatarUrl = uData.profile_image_url;

           user.twitchData.twitchUserId = realTwitchUserId;
           user.twitchData.displayName = realDisplayName;
           user.twitchData.login = realLogin;
           user.twitchData.avatarUrl = realAvatarUrl;
        }
     } catch (e: any) {
        console.warn(`[Twitch Auth] Profile verification failed for user metadata check:`, e.response?.data || e.message);
     }
  }

  if (user.isHost) {
     broadcastSessionState(session.id);
     return; // Host is exempted from viewer limits check
  }

  // 2. Query following/sub status using the streamer's (host's) token!
  const hostToken = session.hostTwitchToken;
  const hostTwitchUserId = session.hostTwitchUserId;

  if (!hostTwitchUserId || !realTwitchUserId) {
     console.log(`[Twitch Check] Skipped verification for @${user.name}. Missing realTwitchUserId or hostTwitchUserId.`);
     broadcastSessionState(session.id);
     return;
  }

  if (!hostToken && !userToken) {
     console.log(`[Twitch Check] Skipped verification for @${user.name}. Both hostToken and userToken are missing.`);
     broadcastSessionState(session.id);
     return;
  }

  // Dynamically resolve client ID for the host's token
  let hostClientId = process.env.TWITCH_CLIENT_ID;
  if (hostToken) {
     try {
        const hostValRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
           headers: {
              'Authorization': `OAuth ${hostToken}`
           }
        });
        if (hostValRes.data && hostValRes.data.client_id) {
           hostClientId = hostValRes.data.client_id;
        }
     } catch (e: any) {
        console.warn(`[Twitch Auth] Host token validation check failed:`, e.response?.data || e.message);
     }
  }
  if (!hostClientId) {
     hostClientId = 'gp762nuuoqcoxypju8c569th9wz7q5'; // default fallback
  }

  let isFollower = false;
  let followedAt: string | undefined = undefined;
  let isSubscriber = false;
  let isModerator = false;

  const mask = (t: string | null | undefined) => t ? `${t.substring(0, 5)}...${t.substring(t.length - 5)}` : 'NULL';
  console.log(`[Twitch Verification Start] User: @${user.name} (viewerID: ${realTwitchUserId}), HostID: ${hostTwitchUserId}. HostToken: ${mask(hostToken)}, ViewerToken: ${mask(userToken)}`);

  // A. Fetch follow status via Host Token (Broadcaster API)
  if (hostToken) {
     try {
        const followRes = await axios.get('https://api.twitch.tv/helix/channels/followers', {
           params: {
              broadcaster_id: hostTwitchUserId,
              user_id: realTwitchUserId
           },
           headers: {
              'Client-Id': hostClientId,
              'Authorization': `Bearer ${hostToken}`
           }
        });

        if (followRes.data && followRes.data.data && followRes.data.data.length > 0) {
           isFollower = true;
           followedAt = followRes.data.data[0].followed_at;
           console.log(`[Twitch Check] Checked via Host Token: @${user.name} IS following host since ${followedAt}`);
        } else {
           console.log(`[Twitch Check] Checked via Host Token: @${user.name} is NOT following host`);
        }
     } catch (e: any) {
        console.warn(`[Twitch Check] Follow check via Host Token error for @${user.name}:`, e.response?.data || e.message);
     }
  }

  // Fallback follow check using viewer's own token (Helix channels/followed endpoint)
  if (!isFollower && userToken) {
     try {
        console.log(`[Twitch Check Fallback] Attempting follow check via Viewer Token for @${user.name}...`);
        const followedRes = await axios.get('https://api.twitch.tv/helix/channels/followed', {
           params: {
              user_id: realTwitchUserId,
              broadcaster_id: hostTwitchUserId
           },
           headers: {
              'Client-Id': viewerClientId,
              'Authorization': `Bearer ${userToken}`
           }
        });

        if (followedRes.data && followedRes.data.data && followedRes.data.data.length > 0) {
           isFollower = true;
           followedAt = followedRes.data.data[0].followed_at;
           console.log(`[Twitch Check Fallback Success] Follow verified via Viewer Token: @${user.name} follows host since ${followedAt}`);
        } else {
           console.log(`[Twitch Check Fallback Success] Follow checked via Viewer Token: @${user.name} is NOT following host`);
        }
     } catch (e: any) {
        console.warn(`[Twitch Check Fallback] Follow check via Viewer Token failed for @${user.name}:`, e.response?.data || e.message);
     }
  }

  // B. Fetch subscription status via Host Token (Broadcaster API)
  if (hostToken) {
     try {
        const subRes = await axios.get('https://api.twitch.tv/helix/subscriptions', {
           params: {
              broadcaster_id: hostTwitchUserId,
              user_id: realTwitchUserId
           },
           headers: {
              'Client-Id': hostClientId,
              'Authorization': `Bearer ${hostToken}`
           }
        });

        if (subRes.data && subRes.data.data && subRes.data.data.length > 0) {
           isSubscriber = true;
           console.log(`[Twitch Check] Checked via Host Token: @${user.name} IS subscriber`);
        } else {
           console.log(`[Twitch Check] Checked via Host Token: @${user.name} is NOT subscriber`);
        }
     } catch (e: any) {
        console.log(`[Twitch Check] Sub checked via Host Token (no subscription or restricted for @${user.name}):`, e.response?.data?.message || e.message);
     }
  }

  // Fallback subscription check using viewer's own token (Helix users/subscriptions endpoint)
  if (!isSubscriber && userToken) {
     try {
        console.log(`[Twitch Check Fallback] Attempting subscription check via Viewer Token for @${user.name}...`);
        const subResViewer = await axios.get('https://api.twitch.tv/helix/users/subscriptions', {
           params: {
              broadcaster_id: hostTwitchUserId,
              user_id: realTwitchUserId
           },
           headers: {
              'Client-Id': viewerClientId,
              'Authorization': `Bearer ${userToken}`
           }
        });

        if (subResViewer.data && subResViewer.data.data && subResViewer.data.data.length > 0) {
           isSubscriber = true;
           console.log(`[Twitch Check Fallback Success] Subscription verified via Viewer Token: @${user.name} is subscribed to host`);
        } else {
           console.log(`[Twitch Check Fallback Success] Subscription checked via Viewer Token: @${user.name} is NOT subscribed to host`);
        }
     } catch (e: any) {
        // Since Twitch returns a 404 if not subscribed, this is the expected branch for non-subs
        console.log(`[Twitch Check Fallback] Subscription check via Viewer Token finished (non-sub or error) for @${user.name}:`, e.response?.data?.message || e.message);
     }
  }

  // C. Fetch moderator status via Host Token (Broadcaster API)
  if (hostToken) {
     try {
        const modRes = await axios.get('https://api.twitch.tv/helix/moderation/moderators', {
           params: {
              broadcaster_id: hostTwitchUserId,
              user_id: realTwitchUserId
           },
           headers: {
              'Client-Id': hostClientId,
              'Authorization': `Bearer ${hostToken}`
           }
        });

        if (modRes.data && modRes.data.data && modRes.data.data.length > 0) {
           isModerator = true;
        }
     } catch (e: any) {
        console.log(`[Twitch Check] Moderator check error for @${user.name}:`, e.response?.data?.message || e.message);
        // Fallback to client-side badge trust if API is blocked but viewer lists moderator badge
        if (user.twitchData?.badges?.includes('moderator')) {
           isModerator = true;
           console.log(`[Twitch Check Fallback] Moderator verified via viewer badge for @${user.name}`);
        }
     }
  } else {
     if (user.twitchData?.badges?.includes('moderator')) {
        isModerator = true;
     }
  }

  if (user.twitchData?.badges?.includes('subscriber')) {
     if (!isSubscriber) {
        isSubscriber = true;
        console.log(`[Twitch Check Fallback] Subscriber verified via viewer badge for @${user.name}`);
     }
  }

  user.twitchData.isFollower = isFollower;
  user.twitchData.followedAt = followedAt;
  user.twitchData.isSubscriber = isSubscriber;
  user.twitchData.isModerator = isModerator;

  // Rebuild Twitch badges
  const badges: string[] = [];
  if (user.twitchData.isBroadcaster) badges.push('broadcaster');
  if (user.twitchData.isModerator) badges.push('moderator');
  if (user.twitchData.isVip) badges.push('vip');
  if (user.twitchData.isSubscriber) badges.push('subscriber');
  user.twitchData.badges = badges;

  console.log(`[Twitch Verify Done] @${user.name} checked. Follower: ${isFollower} (${followedAt || 'no'}), Sub: ${isSubscriber}, Mod: ${isModerator}`);

  broadcastSessionState(session.id);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastSessionState(roomId: string) {
  const session = sessions.get(roomId);
  if (!session) return;

  // Compile active user statistics live to send to Host
  const activeUserListWithStats = session.users.map((u: any) => {
    const profile = dbStore.getProfile(u.userId || '');
    return {
      ...u,
      twitchData: sanitizeTwitchData(u.twitchData),
      reputation: profile?.reputation ?? 50,
      totalSubmitted: profile?.totalSubmitted ?? 0,
      approvedCount: profile?.approvedCount ?? 0,
      rejectedCount: profile?.rejectedCount ?? 0,
      playedCount: profile?.playedCount ?? 0,
      restrictedUntil: profile?.restrictedUntil,
      timeoutUntil: profile?.timeoutUntil,
      shadowBanned: profile?.shadowBanned,
      adminNotes: profile?.adminNotes ?? [],
      firstAccess: profile?.firstAccess,
      lastAccess: profile?.lastAccess,
      averageCooldown: profile ? dbStore.getAverageCooldown(profile) : 0
    };
  });

  const fullStateForHost = {
    ...session,
    users: activeUserListWithStats,
    allBans: dbStore.getBanRecords(),
    allHistoryLogs: dbStore.getHistoryLogs(),
    suspiciousAlerts: dbStore.getLiveAlerts(),
    allUserProfiles: dbStore.getAllProfiles()
  };

  const simpleStateForUsers = {
    ...session,
    users: session.users.map((u: any) => {
      const profile = dbStore.getProfile(u.userId || '');
      return {
        id: u.id,
        userId: u.userId,
        name: u.name,
        isHost: u.isHost,
        isWhitelisted: u.isWhitelisted,
        strikes: u.strikes,
        isBanned: u.isBanned,
        reputation: profile?.reputation ?? 50,
        restrictedUntil: profile?.restrictedUntil,
        timeoutUntil: profile?.timeoutUntil,
        shadowBanned: profile?.shadowBanned,
        twitchData: sanitizeTwitchData(u.twitchData)
      };
    })
  };

  // Emit uniquely to host vs rest
  const hostSocketId = session.hostId;
  const hostSocket = io.sockets.sockets.get(hostSocketId);
  if (hostSocket) {
    hostSocket.emit('session_state', fullStateForHost);
  }

  // To other room members (who are not host)
  session.users.forEach((user: any) => {
    if (user.id !== hostSocketId) {
      const uSocket = io.sockets.sockets.get(user.id);
      if (uSocket) {
        uSocket.emit('session_state', simpleStateForUsers);
      }
    }
  });
}

io.on('connection', (socket) => {
  const clientIpFull = (socket.handshake.headers['x-forwarded-for'] as string) || socket.handshake.address || '127.0.0.1';
  const clientIp = clientIpFull.split(',')[0].trim();
  let currentUser: any = { 
    id: socket.id, 
    userId: '', 
    name: 'Anonymous', 
    isHost: false, 
    roomId: null as string | null,
    ip: clientIp,
    isWhitelisted: false,
    strikes: 0,
    isBanned: false
  };

  socket.on('create_session', (data: { name: string; userId?: string; twitchData?: any }) => {
    currentUser.name = sanitizeInput(data.name || 'Streamer').substring(0, 20);
    
    // Check excessive session creation (limit 6 per 10 mins per IP)
    const recentSessLogs = dbStore.getHistoryLogs().filter(log => log.status === 'approved' && log.platform === 'other' && log.timestamp > Date.now() - 600000 && log.actionDetails?.includes(clientIp));
    if (recentSessLogs.length >= 6) {
      dbStore.triggerAlert({
        userId: 'system',
        username: currentUser.name,
        ip: clientIp,
        type: 'session_abuse',
        message: `Atividade suspeita: Tentativa de criação excessiva de salas pelo IP ${clientIp}.`,
        severity: 'high'
      });
      socket.emit('error', 'Criação excessiva de salas suspensa temporariamente por segurança.');
      return;
    }

    const roomId = generateRoomId();
    currentUser.userId = data.userId || getPersistentUserId(clientIp);
    currentUser.isHost = true;
    currentUser.roomId = roomId;

    const tData = { ...(data.twitchData || {}) };
    const hostToken = tData?.providerToken || null;
    const hostTwitchUserId = tData?.twitchUserId || null;
    if (tData) delete tData.providerToken;

    if (hostToken) {
       userTokensPrivateMap.set(socket.id, hostToken);
    }

    currentUser.twitchData = {
      ...tData,
      isBroadcaster: true,
      badges: Array.from(new Set([...(tData.badges || []), 'broadcaster']))
    };

    if (currentUser.twitchData && currentUser.twitchData.login) {
      addHistoryHost(currentUser.twitchData.login);
    }

    // Resolve persistent profile
    const profile = dbStore.getOrCreateUserProfile(currentUser.userId, currentUser.name, clientIp);
    currentUser.strikes = profile.strikes;

    const newSession = {
      id: roomId,
      hostId: socket.id,
      hostUserId: currentUser.userId,
      hostOfflineTimeout: null as any,
      hostWarningTimeout: null as any,
      createdAt: Date.now(),
      users: [currentUser],
      queue: [],
      currentVideoId: null,
      history: [],
      isPlaying: false,
      currentTime: 0,
      hostTwitchToken: hostToken,
      hostTwitchUserId: hostTwitchUserId,
      settings: {
        isManualApprovalRequired: false,
        maxVideoDuration: 300, 
        blockLiveStreams: true,
        globalCooldownSeconds: 5,
        userCooldownSeconds: 30,
        maxSubmissionsPerHour: 60,
        maxStrikesBeforeBan: 5,
        domainMode: 'both' as const,
        domainWhitelist: [],
        domainBlacklist: [],
        requireFollower: false,
        requireSub: false,
        minFollowMinutes: 0
      },
      blacklistIPs: [],
      blacklistUsernames: [],
      auditLogs: [],
      rejectedCanonicalIds: new Set<string>()
    };

    sessions.set(roomId, newSession);
    socket.join(roomId);
    socket.emit('session_created', roomId);

    socket.emit('user_profile_registered', { userId: currentUser.userId, name: currentUser.name });

    dbStore.logEvent({
      videoId: 'session_init',
      url: 'room:' + roomId,
      platform: 'other',
      title: 'Sala Criada',
      submitterName: currentUser.name,
      submitterId: currentUser.userId,
      status: 'approved',
      actionDetails: `Nova sala criada pelo Streamer @${currentUser.name}.`
    });

    logSessionSecurityActivity(
      newSession,
      'admin_action',
      `Nova sala de streaming criada pelo host @${currentUser.name}.`,
      currentUser.name,
      clientIp,
      'low'
    );

    broadcastSessionState(roomId);
  });

  socket.on('join_session', (data: { roomId: string; name: string; userId?: string; twitchData?: any }) => {
    const roomId = (data.roomId || '').toUpperCase();
    const session = sessions.get(roomId);
    
    if (!session) {
      socket.emit('error', 'A sala solicitada não foi encontrada.');
      return;
    }

    const cleanUsername = sanitizeInput(data.name || 'Participant').trim().substring(0, 20);
    const userId = data.userId || getPersistentUserId(clientIp);

    // 1. Check persistent ban database
    const activeBans = dbStore.getBansOfUserAndIp(userId, clientIp);
    const blockedBan = activeBans.find(ban => ban.banType === 'global' || ban.banType === 'permanent' || ban.banType === 'temporary');
    if (blockedBan) {
      socket.emit('error', `Acesso negado: Você está banido permanentemente/temporariamente nesta plataforma. Motivo: ${blockedBan.reason}`);
      socket.disconnect();
      return;
    }

    // 2. Check timeout restriction expiry
    const profile = dbStore.getOrCreateUserProfile(userId, cleanUsername, clientIp);
    if (profile.timeoutUntil && profile.timeoutUntil > Date.now()) {
      const remainingSeconds = Math.ceil((profile.timeoutUntil - Date.now()) / 1000);
      socket.emit('error', `Acesso negado: Sua conta está em timeout por mais ${remainingSeconds}s devido a advertências.`);
      socket.disconnect();
      return;
    }

    currentUser.name = cleanUsername;
    currentUser.userId = userId;
    currentUser.roomId = roomId;
    currentUser.strikes = profile.strikes;

    const tData = { ...(data.twitchData || {}) };
    const userToken = tData?.providerToken || null;
    if (tData) delete tData.providerToken;

    if (userToken) {
       userTokensPrivateMap.set(socket.id, userToken);
    }

    currentUser.twitchData = data.twitchData ? tData : null;

    if (session.hostUserId === userId) {
      currentUser.isHost = true;
      session.hostId = socket.id;
      if (userToken) {
         session.hostTwitchToken = userToken;
      }
      if (tData?.twitchUserId) {
         session.hostTwitchUserId = tData.twitchUserId;
      }
      if (session.hostOfflineTimeout) {
        clearTimeout(session.hostOfflineTimeout);
        session.hostOfflineTimeout = null;
      }
      if (session.hostWarningTimeout) {
        clearTimeout(session.hostWarningTimeout);
        session.hostWarningTimeout = null;
      }
    }
    
    // Check shadow ban and restricted upload status
    const isShadowBannedInBans = activeBans.some(ban => ban.banType === 'shadow');
    if (isShadowBannedInBans || profile.shadowBanned) {
      currentUser.shadowBanned = true;
    }

    const isUploadRestricted = activeBans.some(ban => ban.banType === 'restrict_upload');
    if (isUploadRestricted || (profile.restrictedUntil && profile.restrictedUntil > Date.now())) {
      currentUser.restrictedUntil = profile.restrictedUntil || Date.now() + 600000;
    }

    const existingIndex = session.users.findIndex((u: any) => u.userId === userId);
    if (existingIndex === -1) {
      session.users.push({ ...currentUser });
    } else {
      session.users[existingIndex].id = socket.id;
      session.users[existingIndex].isHost = currentUser.isHost;
      session.users[existingIndex].name = currentUser.name;
      session.users[existingIndex].twitchData = currentUser.twitchData;
      session.users[existingIndex].strikes = currentUser.strikes;
    }
    
    socket.join(roomId);
    socket.emit('user_profile_registered', { userId, name: cleanUsername });

    // Participation reputation boost
    if (profile.reputation < 85 && profile.strikes === 0) {
      dbStore.adjustReputation(userId, 5, 'Participação ativa na sala');
    }

    logSessionSecurityActivity(
      session,
      'admin_action',
      `Novo espectador @${cleanUsername} conectou à sala.`,
      cleanUsername,
      clientIp,
      'low'
    );
    
    broadcastSessionState(roomId);

    if (currentUser.twitchData && userToken) {
       const userInSession = session.users.find((u: any) => u.id === socket.id);
       if (userInSession) {
          verifyRealTwitchData(session, userInSession).catch(err => {
             console.error(`Error verifying Twitch user on join:`, err);
          });
       }
    }
  });

  socket.on('refresh_twitch_status', () => {
    if (!currentUser.roomId) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const userInSession = session.users.find((u: any) => u.id === socket.id) || currentUser;
    verifyRealTwitchData(session, userInSession).catch(err => {
       console.error('Error in refresh_twitch_status:', err);
    });
  });

  socket.on('submit_video', async (data: { url: string; captchaPayload?: { num1: number; num2: number; answer: string } }) => {
    if (!currentUser.roomId) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const roomInUser = session.users.find((u: any) => u.id === socket.id);
    const userId = roomInUser?.userId || currentUser.userId;
    const profile = dbStore.getProfile(userId);
    const isWhitelistedParticipant = !!roomInUser?.isWhitelisted;

    // Check Timeout expiration
    if (profile && profile.timeoutUntil && profile.timeoutUntil > Date.now()) {
      socket.emit('error', 'Seu usuário está suspenso temporariamente (Timeout ativo).');
      return;
    }

    // Check RESTRICT_VIDEO_UPLOAD ban
    if (profile && profile.restrictedUntil && profile.restrictedUntil > Date.now()) {
      const rem = Math.ceil((profile.restrictedUntil - Date.now()) / 1000);
      socket.emit('error', `Seu privilégio de enviar vídeos está suspenso por mais ${rem} segundos.`);
      
      dbStore.triggerAlert({
        userId,
        username: currentUser.name,
        ip: clientIp,
        type: 'rule_bypass',
        message: `@${currentUser.name} tentou enviar vídeos enquanto estava sob restrição de uploads.`,
        severity: 'medium'
      });
      return;
    }

    // A. SPAM PROTECTION & RATE LIMIT CHECKS (Skip for hosts & whitelisted guests)
    if (!currentUser.isHost && !isWhitelistedParticipant) {
       const now = Date.now();
       
       // 1. Rapid submissions
       const lastSub = roomInUser?.lastSubmitted || 0;
       const timeDiff = now - lastSub;
       if (timeDiff < 2000) { // Click spamming threshold: 2 seconds
          if (roomInUser) {
             roomInUser.strikes = (roomInUser.strikes || 0) + 1;
             currentUser.strikes = roomInUser.strikes;
             
             dbStore.adjustReputation(userId, -15, 'Tentativa de spam click rápido');
             dbStore.updateProfile(userId, (p) => {
               p.strikes = currentUser.strikes;
               p.allTimeStrikes += 1;
             });
          }

          dbStore.triggerAlert({
             userId,
             username: currentUser.name,
             ip: clientIp,
             type: 'action_spam',
             message: `Atividade suspeita: Spam click violado por @${currentUser.name} (+1 Strike).`,
             severity: 'medium'
          });
          logSessionSecurityActivity(
             session,
             'spam',
             `Spam de requisições: Envio extremamente rápido por @${currentUser.name}. Strike atribuído (+1). Total: ${roomInUser?.strikes}`,
             currentUser.name,
             clientIp,
             'medium'
          );
          socket.emit('error', `Atividade automatizada suspeita detectada! Cooldown violado (+1 Strike). Total: ${roomInUser?.strikes || 0}/5`);
          
          if (roomInUser && roomInUser.strikes >= (session.settings.maxStrikesBeforeBan || 5)) {
             handleUserAutoban(session, roomInUser, socket);
          }
          broadcastSessionState(currentUser.roomId);
          return;
       }

       // 2. Room Global Cooldown Check
       const globalCooldownTrack = session.lastGlobalSubmitted || 0;
       const globalDiff = now - globalCooldownTrack;
       const globalCooldownValueInMs = (session.settings.globalCooldownSeconds || 5) * 1000;
       if (globalDiff < globalCooldownValueInMs) {
          const remainingSeconds = Math.ceil((globalCooldownValueInMs - globalDiff) / 1000);
          socket.emit('error', `A sala está em cooldown global. Aguarde ${remainingSeconds}s para enviar outro link.`);
          return;
       }

       // 3. User Specific Cooldown check
       const userCooldownValueInMs = (session.settings.userCooldownSeconds !== undefined ? session.settings.userCooldownSeconds : 30) * 1000;
       if (timeDiff < userCooldownValueInMs) {
          const remainingSeconds = Math.ceil((userCooldownValueInMs - timeDiff) / 1000);
          socket.emit('error', `Aguarde o seu cooldown. Faltam ${remainingSeconds} segundos.`);
          return;
       }

       // 4. Hourly Submissions Limit
       roomInUser.submissionsTimeline = (roomInUser.submissionsTimeline || []).filter((time: number) => now - time < 3600000);
       const limitPerHour = session.settings.maxSubmissionsPerHour !== undefined ? session.settings.maxSubmissionsPerHour : 60;
       if (roomInUser.submissionsTimeline.length >= limitPerHour) {
          logSessionSecurityActivity(
            session,
            'rate_limit',
            `Tentativa de ultrapassar limite de envios por hora (${limitPerHour}/h) de @${currentUser.name}.`,
            currentUser.name,
            clientIp,
            'low'
          );
          socket.emit('error', `Limite máximo de envios por hora atingido (${limitPerHour} envios por hora).`);
          return;
       }

       // 5. Bot protection verification check
       if (!data.captchaPayload || typeof data.captchaPayload.num1 !== 'number' || typeof data.captchaPayload.num2 !== 'number') {
          socket.emit('error', 'Verificação antibot ativa: Refaça a operação resolvendo a pergunta matemática.');
          return;
       }
       const sumExpected = data.captchaPayload.num1 + data.captchaPayload.num2;
       if (Number(data.captchaPayload.answer) !== sumExpected) {
          roomInUser.strikes = (roomInUser.strikes || 0) + 1;
          logSessionSecurityActivity(
            session,
            'abuse_attempt',
            `Falha em resolver o capctha antibot por @${currentUser.name}. Esperado: ${sumExpected}, digitado: ${data.captchaPayload.answer}. (+1 Strike)`,
            currentUser.name,
            clientIp,
            'medium'
          );
          socket.emit('error', `Resposta de verificação incorreta. Você recebeu +1 strike. total: ${roomInUser.strikes}/5`);
          if (roomInUser.strikes >= 5) {
             handleUserAutoban(session, roomInUser, socket);
          }
          broadcastSessionState(currentUser.roomId);
          return;
       }
       // 6. Twitch Settings Check (Followers / Subs)
       const userInSession = session.users.find((u: any) => u.id === socket.id) || currentUser;

       // Fast, real-time status pull right before check to bypass caching/spoofing
       try {
          await verifyRealTwitchData(session, userInSession);
       } catch (e) {
          console.error('[Twitch Submit Trigger] Error auto-refreshing user state on video submission:', e);
       }

       const isBroadcaster = !!userInSession.twitchData?.isBroadcaster;
       const isModerator = !!userInSession.twitchData?.isModerator;
       const isVip = !!userInSession.twitchData?.isVip;
       const isBypassed = isBroadcaster || isModerator || isVip || currentUser.isHost || isWhitelistedParticipant;

       if (!isBypassed) {
          if (session.settings.requireFollower) {
             if (!userInSession.twitchData?.isFollower) {
                socket.emit('error', 'O Streamer ativou o modo Somente Seguidores. Você precisa seguir o canal para enviar vídeos.');
                return;
             }
             
             // Validate minFollowMinutes
             const requiredMin = session.settings.minFollowMinutes || 0;
             if (requiredMin > 0) {
                const followedAtStr = userInSession.twitchData?.followedAt;
                let followAgeMinutes = 0;
                if (followedAtStr) {
                   const followedAtDate = new Date(followedAtStr);
                   const diffMs = Date.now() - followedAtDate.getTime();
                   followAgeMinutes = Math.max(0, Math.floor(diffMs / 60000));
                }

                if (followAgeMinutes < requiredMin) {
                   const diffMin = requiredMin - followAgeMinutes;
                   let timeStr = "";
                   if (diffMin < 60) {
                      timeStr = `${diffMin} minuto(s)`;
                   } else if (diffMin < 2880) { // less than 2 days
                      const hrs = Math.floor(diffMin / 60);
                      const mins = diffMin % 60;
                      timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                   } else {
                      const days = Math.floor(diffMin / 1440);
                      const hrs = Math.ceil((diffMin % 1440) / 60);
                      timeStr = `${days} dia(s) e ${hrs} hora(s)`;
                   }
                   socket.emit('error', `O Streamer exige tempo mínimo de follow de ${requiredMin} minutos (${(requiredMin / 1440).toFixed(1)} dias). Ainda faltam ${timeStr} de follow.`);
                   return;
                }
             }
          }
          if (session.settings.requireSub) {
             if (!userInSession.twitchData?.isSubscriber) {
                socket.emit('error', 'O Streamer ativou o modo Somente Inscritos. Apenas subs podem enviar vídeos.');
                return;
             }
          }
       }
    }

    // B. URL SANITIZATION & SECURITY VALIDATIONS
    const urlValidation = sanitizeAndValidateUrl(data.url, session.settings);
    if (!urlValidation.valid || !urlValidation.normalizedUrl || !urlValidation.platform) {
       // Suspect or malicious domains trigger infractions
       let strikeCount = 0;
       if (roomInUser && !currentUser.isHost) {
          roomInUser.strikes = (roomInUser.strikes || 0) + 1;
          strikeCount = roomInUser.strikes;
       }
       
       logSessionSecurityActivity(
         session,
         'malicious_url',
         `Link recusado: ${urlValidation.error || 'Tentativa maliciosa'}. Escaneado: "${data.url}" por @${currentUser.name}.`,
         currentUser.name,
         clientIp,
         'high'
       );
       
       socket.emit('error', `Link Proibido / Suspeito: ${urlValidation.error || 'Malicioso'}.` + 
          (!currentUser.isHost ? ` Você recebeu +1 strike (${strikeCount}/5).` : ''));

       if (!currentUser.isHost && strikeCount >= 5 && roomInUser) {
          handleUserAutoban(session, roomInUser, socket);
       }
       broadcastSessionState(currentUser.roomId);
       return;
    }

    const normalizedUrl = urlValidation.normalizedUrl;
    const platform = urlValidation.platform;

    // Non-blocking DNS and details resolver
    checkDnsHost(normalizedUrl).then(async (domainExists) => {
       if (!domainExists) {
          logSessionSecurityActivity(
            session,
            'malicious_url',
            `Falso domínio: Hostine destino não responde a consultas DNS. URL: ${normalizedUrl}`,
            currentUser.name,
            clientIp,
            'medium'
          );
          socket.emit('error', 'O site informado não existe ou está temporariamente fora do ar (falha de DNS).');
          return;
       }

       // Checks for duplication using Canonical Extract
       const targetId = extractCanonicalVideoId(normalizedUrl, platform);

       // Is it already in queue?
       const isDuplicatedInQueue = session.queue.some((v: any) => extractCanonicalVideoId(v.url, v.platform) === targetId);
       if (isDuplicatedInQueue) {
          logSessionSecurityActivity(
            session,
            'duplicate',
            `Link duplicado barrado: Vídeo já na playlist. Canonical: ${targetId}`,
            currentUser.name,
            clientIp,
            'low'
          );
          socket.emit('error', 'Esse mesmo vídeo já está aguardando na fila de reprodução!');
          return;
       }

       // Was it played recently?
       const maxHistoryLookbehind = session.history.slice(-15);
       const isDuplicatedInHistory = maxHistoryLookbehind.some((v: any) => extractCanonicalVideoId(v.url, v.platform) === targetId);
       if (isDuplicatedInHistory) {
          logSessionSecurityActivity(
            session,
            'duplicate',
            `Repetição de histórico barrada: Vídeo reproduzido recentemente. Canonical: ${targetId}`,
            currentUser.name,
            clientIp,
            'low'
          );
          socket.emit('error', 'Este vídeo foi exibido recentemente na live e não pode ser repetido agora.');
          return;
       }

       // Video attributes and live-locking checks
       const resDetail = await verifyVideoContent(normalizedUrl, platform, session.settings.blockLiveStreams);
       if (!resDetail.valid) {
          logSessionSecurityActivity(
            session,
            'malicious_url',
            `Processo de link vetado: ${resDetail.error}`,
            currentUser.name,
            clientIp,
            'medium'
          );
          socket.emit('error', resDetail.error || 'Erro ao validar fluxo de transmissão de vídeo.');
          return;
       }

       const newVideo = {
         id: Date.now().toString() + Math.random().toString(36).substring(7),
         submitter: currentUser.name,
         submitterId: socket.id,
         url: normalizedUrl,
         title: resDetail.title || 'Vídeo',
         platform,
         status: (currentUser.isHost || isWhitelistedParticipant || !session.settings.isManualApprovalRequired) ? 'approved' : 'pending',
         timestamp: Date.now(),
         aspectRatio: platform === 'instagram' || platform === 'tiktok' ? '9:16' : 'auto'
       };

       session.queue.push(newVideo);

       // Log success and track statistics
       if (!currentUser.isHost) {
          if (roomInUser) {
             roomInUser.lastSubmitted = Date.now();
             roomInUser.submissionsTimeline = roomInUser.submissionsTimeline || [];
             roomInUser.submissionsTimeline.push(Date.now());
          }
          session.lastGlobalSubmitted = Date.now();
       }

       logSessionSecurityActivity(
         session,
         'admin_action',
         `Link adicionado (${platform}). Status: [${newVideo.status}] por: @${currentUser.name}`,
         currentUser.name,
         clientIp,
         'low'
       );

       if ((currentUser.isHost || isWhitelistedParticipant || !session.settings.isManualApprovalRequired) && 
           session.queue.filter((v: any) => v.status === 'approved').length === 1 && !session.currentVideoId) {
          session.currentVideoId = newVideo.id;
       }

       broadcastSessionState(currentUser.roomId);
    });
  });

  socket.on('approve_video', (videoId: string) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const video = session.queue.find((v: any) => v.id === videoId);
    if (video) {
       video.status = 'approved';
       if (!session.currentVideoId) {
          session.currentVideoId = video.id;
       }
       logSessionSecurityActivity(
         session,
         'admin_action',
         `Vídeo de @${video.submitter} aprovado manualmente pelo streamer. URL: ${video.url}`,
         currentUser.name,
         clientIp,
         'low'
       );
       broadcastSessionState(currentUser.roomId);
    }
  });

  // Host rejects video WITH automatic reason registration
  socket.on('reject_video', (data: string | { videoId: string; reason?: string }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const videoId = typeof data === 'string' ? data : data.videoId;
    const rejectionReason = typeof data === 'string' ? 'Fora do tema ou recusado' : (data.reason || 'Recusado pelo Streamer');

    const video = session.queue.find((v: any) => v.id === videoId);
    session.queue = session.queue.filter((v: any) => v.id !== videoId);
    
    if (video) {
       const canonical = extractCanonicalVideoId(video.url, video.platform);
       session.rejectedCanonicalIds.add(canonical);

       dbStore.adjustReputation(video.submitterId, -12, 'Vídeo Rejeitado');
       dbStore.updateProfile(video.submitterId, (p) => { p.rejectedCount += 1; });

       dbStore.logEvent({
         videoId: video.id,
         url: video.url,
         platform: video.platform,
         title: video.title,
         submitterName: video.submitter,
         submitterId: video.submitterId,
         status: 'rejected',
         moderatorName: currentUser.name,
         rejectionReason,
         actionDetails: `Vídeo rejeitado por @${currentUser.name}. Motivo: ${rejectionReason}`
       });

       logSessionSecurityActivity(
         session,
         'admin_action',
         `Vídeo de @${video.submitter} rejeitado. Motivo: "${rejectionReason}"`,
         currentUser.name,
         clientIp,
         'low'
       );

       io.to(video.submitterId).emit('error', `Seu vídeo foi rejeitado por: "${rejectionReason}"`);
    }
    broadcastSessionState(currentUser.roomId);
  });

  socket.on('reorder_queue', (newQueue: any[]) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
      session.queue = newQueue;
      broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('play_video', (videoId: string) => {
     if (!currentUser.roomId || !currentUser.isHost) return;
     const session = sessions.get(currentUser.roomId);
     if (!session) return;
     
     session.currentVideoId = videoId;
     session.isPlaying = true;
     broadcastSessionState(currentUser.roomId);
  });

  socket.on('sync_playback', (data: { isPlaying: boolean, currentTime: number }) => {
     if (!currentUser.roomId || !currentUser.isHost) return;
     const session = sessions.get(currentUser.roomId);
     if (session) {
        session.isPlaying = data.isPlaying;
        session.currentTime = data.currentTime;
        socket.to(currentUser.roomId).emit('sync_playback_remote', {
           isPlaying: data.isPlaying,
           currentTime: data.currentTime,
           timestamp: Date.now()
        });
     }
  });

  socket.on('update_settings', (newSettings: any) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
      session.settings = { ...session.settings, ...newSettings };
      logSessionSecurityActivity(
        session,
        'admin_action',
        'Configurações de segurança / moderação atualizadas pelo streamer.',
        currentUser.name,
        clientIp,
        'low'
      );
      broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('toggle_whitelist', (targetUserId: string) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
       const user = session.users.find((u: any) => u.id === targetUserId || u.userId === targetUserId);
       if (user) {
          user.isWhitelisted = !user.isWhitelisted;
          // Synchronize with VIP badge
          if (!user.twitchData) user.twitchData = {};
          user.twitchData.isVip = user.isWhitelisted;
          const badges: string[] = user.twitchData.badges || [];
          if (user.isWhitelisted) {
            if (!badges.includes('vip')) badges.push('vip');
          } else {
            const index = badges.indexOf('vip');
            if (index > -1) badges.splice(index, 1);
          }
          user.twitchData.badges = badges;

          logSessionSecurityActivity(
            session,
            'admin_action',
            `Status de whitelist (VIP) do participante @${user.name} alterado para: ${user.isWhitelisted}`,
            currentUser.name,
            clientIp,
            'low'
          );
          broadcastSessionState(currentUser.roomId);
       }
    }
  });

  socket.on('toggle_twitch_role', (data: { targetUserId: string; role: 'isSubscriber' | 'isModerator' | 'isVip' }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
      const user = session.users.find((u: any) => u.id === data.targetUserId || u.userId === data.targetUserId);
      if (user) {
        if (!user.twitchData) {
          user.twitchData = {};
        }
        
        user.twitchData[data.role] = !user.twitchData[data.role];
        
        // Also sync isWhitelisted with isVip
        if (data.role === 'isVip') {
          user.isWhitelisted = user.twitchData.isVip;
        }

        const badges: string[] = [];
        if (user.twitchData.isBroadcaster) badges.push('broadcaster');
        if (user.twitchData.isModerator) badges.push('moderator');
        if (user.twitchData.isVip) badges.push('vip');
        if (user.twitchData.isSubscriber) badges.push('subscriber');
        user.twitchData.badges = badges;

        logSessionSecurityActivity(
          session,
          'admin_action',
          `Cargo ${data.role} do participante @${user.name} alterado para: ${user.twitchData[data.role]}`,
          currentUser.name,
          clientIp,
          'low'
        );
        broadcastSessionState(currentUser.roomId);
      }
    }
  });

  // STRIKES & PROGRESSIVE TIMEOUTS
  socket.on('timeout_user', (data: { userId: string; minutes?: number; reason?: string }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;
    const user = session.users.find((u: any) => u.userId === data.userId || u.id === data.userId);
    if (user) {
        const mins = data.minutes || 10;
        const endTimeout = Date.now() + (mins * 60 * 1000);
        dbStore.updateProfile(user.userId, (p) => { p.timeoutUntil = endTimeout; });
        user.timeoutUntil = endTimeout;
        const reason = data.reason || 'Comportamento inadequado';
        
        logSessionSecurityActivity(
           session,
           'strike_ban',
           `Timeout de ${mins} min aplicado a @${user.name}. Razão: "${reason}".`,
           currentUser.name,
           clientIp,
           'medium'
        );
        
        dbStore.triggerAlert({
           userId: user.userId,
           username: user.name,
           ip: user.ip || 'unknown',
           type: 'session_abuse',
           message: `TIMEOUT: @${user.name} foi suspenso por ${mins} minutos pela moderação.`,
           severity: 'medium'
        });

        io.to(user.id).emit('error', `SUSPENSÃO: Você foi suspenso por ${mins} minutos pela moderação.`);
        broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('give_strike', (data: { userId: string; reason?: string }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const user = session.users.find((u: any) => u.userId === data.userId || u.id === data.userId);
    if (user) {
       user.strikes = (user.strikes || 0) + 1;
       const strikesNow = user.strikes;
       const targetSockId = user.id;
       const strikeReason = data.reason || 'Acúmulo de conduta inadequada';

       dbStore.adjustReputation(user.userId, -15, `Strike aplicado (+1) por ${currentUser.name}`);
       dbStore.updateProfile(user.userId, (p) => {
         p.strikes = strikesNow;
         p.allTimeStrikes += 1;
       });

       logSessionSecurityActivity(
         session,
         'strike_ban',
         `Strike (+1) atribuído manualmente a @${user.name}. Razão: "${strikeReason}". Total: ${strikesNow}/5`,
         currentUser.name,
         clientIp,
         'medium'
       );

       io.to(targetSockId).emit('error', `ADVERTÊNCIA: Você recebeu +1 strike da moderação! Motivo: ${strikeReason}. Total: ${strikesNow}/5`);

       // PROGRESSIVE PUNISHMENTS MATRIX
       if (strikesNow === 3) {
         const endRest = Date.now() + 10 * 60 * 1000;
         dbStore.updateProfile(user.userId, (p) => { p.restrictedUntil = endRest; });
         user.restrictedUntil = endRest;

         dbStore.triggerAlert({
           userId: user.userId,
           username: user.name,
           ip: user.ip || 'unknown',
           type: 'rule_bypass',
           message: `Restrição de Envio Ativada: @${user.name} recebeu penalidade de uploads bloqueados por 10 minutos (3 strikes).`,
           severity: 'medium'
         });

         io.to(targetSockId).emit('error', 'PENALIDADE: Envio de vídeos suspenso por 10 minutos devido ao acúmulo de 3 strikes.');
       } 
       else if (strikesNow === 4) {
         const endTimeout = Date.now() + 30 * 60 * 1000;
         dbStore.updateProfile(user.userId, (p) => { p.timeoutUntil = endTimeout; });
         user.timeoutUntil = endTimeout;

         dbStore.triggerAlert({
           userId: user.userId,
           username: user.name,
           ip: user.ip || 'unknown',
           type: 'rule_bypass',
           message: `TIMEOUT ATIVO: @${user.name} foi desconectado e suspenso do chat por 30 minutos (4 strikes).`,
           severity: 'high'
         });

         io.to(targetSockId).emit('error', 'SUSPENSÃO: Você foi banido temporariamente (Timeout de 30 minutos) por atingir 4 strikes.');
         
         const targetSocket = io.sockets.sockets.get(targetSockId);
         if (targetSocket) {
            targetSocket.disconnect();
         }
         session.users = session.users.filter((u: any) => u.id !== targetSockId && u.userId !== user.userId);
       } 
       else if (strikesNow >= (session.settings.maxStrikesBeforeBan || 5)) {
          handleUserAutoban(session, user, io.sockets.sockets.get(targetSockId));
       }

       broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('ban_user', (data: { userId: string; reason?: string; banType?: 'global' | 'permanent' | 'temporary' | 'shadow' | 'restrict_upload' }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    const user = session.users.find((u: any) => u.userId === data.userId || u.id === data.userId);
    if (user) {
       const uUserId = user.userId;
       const uSocketId = user.id;
       const uIp = user.ip || 'unknown';
       const banType = data.banType || 'global';
       const reason = data.reason || 'Comportamento suspeito / abuso grave';

       dbStore.addBanRecord({
         id: Date.now().toString() + Math.random().toString(36).substring(7),
         userId: uUserId,
         username: user.name,
         ip: uIp,
         banType,
         reason,
         moderator: currentUser.name,
         createdAt: Date.now(),
         expiresAt: banType === 'temporary' ? Date.now() + 24 * 60 * 60 * 1000 : undefined
       });

       dbStore.adjustReputation(uUserId, -50, `Banimento (${banType}) aplicado por host`);

       logSessionSecurityActivity(
         session,
         'strike_ban',
         `Participante @${user.name} BANIDO (${banType}) pelo Streamer. Razão: "${reason}"`,
         currentUser.name,
         clientIp,
         'high'
       );
       
       if (banType === 'restrict_upload') {
          const endRest = Date.now() + 24 * 60 * 60 * 1000;
          dbStore.updateProfile(user.userId, p => p.restrictedUntil = endRest);
          user.restrictedUntil = endRest;
          io.to(uSocketId).emit('error', `ATENÇÃO: Seus envios de vídeos foram restritos pelo Streamer.`);
       } else if (banType !== 'shadow') {
          io.to(uSocketId).emit('error', `BANIMENTO: Você foi banido pelo Streamer da plataforma. Razão: ${reason}`);
          const targetSocket = io.sockets.sockets.get(uSocketId);
          if (targetSocket) {
             targetSocket.disconnect();
          }
          session.users = session.users.filter((u: any) => u.userId !== uUserId && u.id !== uSocketId);
       } else {
          // Shadow ban keeps them connected but disconnected from state impacts
          user.shadowBanned = true;
          dbStore.updateProfile(user.userId, p => p.shadowBanned = true);
       }
       broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('clear_audit_logs', () => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
       session.auditLogs = [];
       broadcastSessionState(currentUser.roomId);
    }
  });

  socket.on('play_previous', () => {
     if (!currentUser.roomId || !currentUser.isHost) return;
     const session = sessions.get(currentUser.roomId);
     if (!session) return;
     
     if (session.history.length > 0) {
        const prevVideo = session.history.pop();
        prevVideo.status = 'approved';
        session.queue.unshift(prevVideo);
        session.currentVideoId = prevVideo.id;
        session.isPlaying = true;
        
        broadcastSessionState(currentUser.roomId);
     }
  });

  socket.on('end_video', () => {
     if (!currentUser.roomId || !currentUser.isHost) return;
     const session = sessions.get(currentUser.roomId);
     if (!session) return;
     
     if (session.currentVideoId) {
        const video = session.queue.find((v: any) => v.id === session.currentVideoId);
        if (video) {
           video.status = 'watched';
           session.history.push(video);
           session.queue = session.queue.filter((v: any) => v.id !== session.currentVideoId);
        }
     }
     
     // Find next approved video
     const nextVideo = session.queue.find((v: any) => v.status === 'approved');
     if (nextVideo) {
        session.currentVideoId = nextVideo.id;
        session.isPlaying = true;
     } else {
        session.currentVideoId = null;
        session.isPlaying = false;
     }
     
     broadcastSessionState(currentUser.roomId);
  });

  socket.on('end_session', () => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (session) {
      if (session.hostOfflineTimeout) clearTimeout(session.hostOfflineTimeout);
      if (session.hostWarningTimeout) clearTimeout(session.hostWarningTimeout);
    }
    io.to(currentUser.roomId).emit('session_ended');
    sessions.delete(currentUser.roomId);
  });

  socket.on('unban_user', (userId: string) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    dbStore.removeBanRecord(userId, currentUser.name, 'Removido pelo host');
    const session = sessions.get(currentUser.roomId);
    if (session) broadcastSessionState(currentUser.roomId);
  });



  socket.on('admin_action', (data: { action: string; userId: string; payload?: any }) => {
    if (!currentUser.roomId || !currentUser.isHost) return;
    const session = sessions.get(currentUser.roomId);
    if (!session) return;

    if (data.action === 'remove_strikes') {
      dbStore.updateProfile(data.userId, p => p.strikes = 0);
      const user = session.users.find((u: any) => u.userId === data.userId);
      if (user) user.strikes = 0;
    } else if (data.action === 'add_note') {
      dbStore.updateProfile(data.userId, p => {
        p.adminNotes = p.adminNotes || [];
        p.adminNotes.push(`[${new Date().toLocaleDateString()}] ${data.payload.note}`);
      });
    } else if (data.action === 'lift_restrictions') {
      dbStore.updateProfile(data.userId, p => {
        p.restrictedUntil = undefined;
        p.timeoutUntil = undefined;
        p.shadowBanned = false;
        p.strikes = 0;
      });
      const user = session.users.find((u: any) => u.userId === data.userId);
      if (user) user.strikes = 0;
    }

    broadcastSessionState(currentUser.roomId);
  });

  socket.on('leave_session', () => {
    userTokensPrivateMap.delete(socket.id);
    if (currentUser.roomId) {
      const session = sessions.get(currentUser.roomId);
      if (session) {
        session.users = session.users.filter((u: any) => u.id !== socket.id);
        if (currentUser.isHost) {
           const isHostStillConnected = session.users.some((u: any) => u.isHost === true || u.userId === session.hostUserId);
           if (!isHostStillConnected) {
              if (session.hostOfflineTimeout) {
                clearTimeout(session.hostOfflineTimeout);
              }
              if (session.hostWarningTimeout) {
                clearTimeout(session.hostWarningTimeout);
              }
              
              session.hostWarningTimeout = setTimeout(() => {
                 io.to(currentUser.roomId).emit('error', 'Atenção: Sala será encerrada em 1 hora por falta de interação do Host (ausente).');
              }, 23 * 60 * 60 * 1000); // 23h
              
              session.hostOfflineTimeout = setTimeout(() => {
                 io.to(currentUser.roomId).emit('session_ended');
                 sessions.delete(currentUser.roomId);
              }, 24 * 60 * 60 * 1000); // 24h
           } else {
              broadcastSessionState(currentUser.roomId);
           }
        } else {
           broadcastSessionState(currentUser.roomId);
        }
      }
      socket.leave(currentUser.roomId);
      currentUser.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    userTokensPrivateMap.delete(socket.id);
    if (currentUser.roomId) {
      const session = sessions.get(currentUser.roomId);
      if (session) {
        session.users = session.users.filter((u: any) => u.id !== socket.id);
        
        if (currentUser.isHost) {
           const isHostStillConnected = session.users.some((u: any) => u.isHost === true || u.userId === session.hostUserId);
           if (!isHostStillConnected) {
              // Deliver a 24-hour reconnect timeout grace period to prevent dropped sessions.
              if (session.hostOfflineTimeout) {
                 clearTimeout(session.hostOfflineTimeout);
              }
              if (session.hostWarningTimeout) {
                 clearTimeout(session.hostWarningTimeout);
              }
              
              session.hostWarningTimeout = setTimeout(() => {
                 io.to(currentUser.roomId).emit('error', 'Atenção: Sala será encerrada em 1 hora por falta de interação do Host (ausente).');
              }, 23 * 60 * 60 * 1000); // 23h
              
              session.hostOfflineTimeout = setTimeout(() => {
                 io.to(currentUser.roomId).emit('session_ended');
                 sessions.delete(currentUser.roomId);
              }, 24 * 60 * 60 * 1000); // 24h
           } else {
              broadcastSessionState(currentUser.roomId);
           }
        } else {
           broadcastSessionState(currentUser.roomId);
        }
      }
    }
  });
});

function handleUserAutoban(session: any, user: any, socket: any) {
  const uUserId = user.userId;
  const uIp = user.ip || 'unknown';

  dbStore.addBanRecord({
     id: Date.now().toString() + Math.random().toString(36).substring(7),
     userId: uUserId,
     username: user.name,
     ip: uIp,
     banType: 'global',
     reason: 'Banimento automático do Sistema (+5 strikes ou abuso detectado)',
     moderator: 'SISTEMA',
     createdAt: Date.now()
  });

  dbStore.adjustReputation(uUserId, -50, 'Banimento Automático do Sistema');

  logSessionSecurityActivity(
    session,
    'strike_ban',
    `Usuário @${user.name} banido automaticamente por atingir o limite de strikes ou violar política grave.`,
    'SISTEMA',
    uIp,
    'high'
  );

  if (socket) {
     socket.emit('error', 'EXPULSÃO: Você foi banido permanentemente do ecossistema por excesso de strikes / abuso (+5 strikes).');
     socket.disconnect();
  }
  session.users = session.users.filter((u: any) => u.userId !== uUserId && u.id !== user.id);
}

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
      const fs = await import('fs');
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
      VITE_SUPABASE_ANON_KEY: ${JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '')},
      VITE_BACKEND_URL: ${JSON.stringify(process.env.VITE_BACKEND_URL || '')}
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
