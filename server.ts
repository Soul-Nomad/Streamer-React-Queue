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
// @ts-ignore
import instagramGetUrlPkg from 'instagram-url-direct';
import { dbStore } from './src/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
function sanitizeAndValidateUrl(rawUrl: string): SecurityCheckResult {
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

    // 5. Blocklist review
    const hostParts = hostname.split('.');
    for (const blockDomain of BLOCKLIST_DOMAINS) {
      if (hostname === blockDomain || hostname.endsWith('.' + blockDomain)) {
        return { valid: false, error: 'Domínio bloqueado. Classificação: Conteúdo Suspeito/Adulto (+18) ou Encurtador Proibido.' };
      }
    }

    // 6. Whitelist matching
    let matchedWhitelist = false;
    let platform: 'youtube' | 'instagram' | 'tiktok' | 'other' = 'other';

    for (const whitelistDomain of WHITELIST_DOMAINS) {
      if (hostname === whitelistDomain || hostname.endsWith('.' + whitelistDomain)) {
        matchedWhitelist = true;
        if (whitelistDomain.includes('youtube') || whitelistDomain === 'youtu.be') {
          platform = 'youtube';
        } else if (whitelistDomain.includes('instagram')) {
          platform = 'instagram';
        } else if (whitelistDomain.includes('tiktok')) {
          platform = 'tiktok';
        }
        break;
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
          error: 'Domínio não está na lista de servidores confiáveis (whitelist). Use apenas YouTube, Instagram, TikTok ou canais de vídeo autorizados.' 
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
        shadowBanned: profile?.shadowBanned
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
  let currentUser = { 
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

  socket.on('create_session', (data: { name: string; userId?: string }) => {
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

    // Resolve persistent profile
    const profile = dbStore.getOrCreateUserProfile(currentUser.userId, currentUser.name, clientIp);
    currentUser.strikes = profile.strikes;

    const newSession = {
      id: roomId,
      hostId: socket.id,
      users: [currentUser],
      queue: [],
      currentVideoId: null,
      history: [],
      isPlaying: false,
      currentTime: 0,
      settings: {
        isManualApprovalRequired: false,
        maxVideoDuration: 300, 
        blockLiveStreams: true,
        globalCooldownSeconds: 5,
        userCooldownSeconds: 60,
        maxSubmissionsPerHour: 15,
        maxStrikesBeforeBan: 5
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
      actionDetails: `Nova sala criada pelo Streamer @${currentUser.name}. IP: ${clientIp}`
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

  socket.on('join_session', (data: { roomId: string; name: string; userId?: string }) => {
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
  });

  socket.on('submit_video', (data: { url: string; captchaPayload?: { num1: number; num2: number; answer: string } }) => {
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
       const userCooldownValueInMs = (session.settings.userCooldownSeconds || 60) * 1000;
       if (timeDiff < userCooldownValueInMs) {
          const remainingSeconds = Math.ceil((userCooldownValueInMs - timeDiff) / 1000);
          socket.emit('error', `Aguarde o seu cooldown. Faltam ${remainingSeconds} segundos.`);
          return;
       }

       // 4. Hourly Submissions Limit
       roomInUser.submissionsTimeline = (roomInUser.submissionsTimeline || []).filter((time: number) => now - time < 3600000);
       if (roomInUser.submissionsTimeline.length >= (session.settings.maxSubmissionsPerHour || 15)) {
          logSessionSecurityActivity(
            session,
            'rate_limit',
            `Tentativa de ultrapassar limite de envios por hora (${session.settings.maxSubmissionsPerHour}/h) de @${currentUser.name}.`,
            currentUser.name,
            clientIp,
            'low'
          );
          socket.emit('error', `Limite máximo de envios por hora atingido (${session.settings.maxSubmissionsPerHour} envios por hora).`);
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
    }

    // B. URL SANITIZATION & SECURITY VALIDATIONS
    const urlValidation = sanitizeAndValidateUrl(data.url);
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
       const user = session.users.find((u: any) => u.id === targetUserId);
       if (user) {
          user.isWhitelisted = !user.isWhitelisted;
          logSessionSecurityActivity(
            session,
            'admin_action',
            `Status de whitelist do participante @${user.name} alterado para: ${user.isWhitelisted}`,
            currentUser.name,
            clientIp,
            'low'
          );
          broadcastSessionState(currentUser.roomId);
       }
    }
  });

  // STRIKES & PROGRESSIVE TIMEOUTS
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

  socket.on('disconnect', () => {
    if (currentUser.roomId) {
      const session = sessions.get(currentUser.roomId);
      if (session) {
        session.users = session.users.filter((u: any) => u.id !== socket.id);
        
        if (currentUser.isHost) {
           io.to(currentUser.roomId).emit('session_ended');
           sessions.delete(currentUser.roomId);
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
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
