import { useState, useEffect, useRef, useMemo } from 'react';
import { socket, getBackendUrl } from '../socket';
import { SessionState, User } from '../types';
import ReactPlayer from 'react-player';
import { LinkedInEmbed } from 'react-social-media-embed';
import { 
  MonitorPlay, ZoomIn, ZoomOut, Expand, Maximize, AlertCircle, SkipForward, SkipBack, 
  Check, X, ShieldCheck, Cast, Play, Pause, History, Crop, Video, VideoOff, 
  ExternalLink, Loader2, Users, Compass, Plus, Link2, Copy, LogOut, Layers, Heart, Settings, Terminal, ShieldAlert, Award, AlertTriangle, MessageSquare, Clock, RefreshCw,
  Radio, CassetteTape
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'motion/react';
import { supabase } from '../lib/supabase';

import AdminDashboard from './AdminDashboard';
import SettingsView from './SettingsView';
import HostQueuePanel from './HostQueuePanel';
import HostUserProfile from './HostUserProfile';
import HostAuditLogs from './HostAuditLogs';

const Player = ReactPlayer as any;

const getInstagramId = (url: string) => {
  try {
    const match = url.match(/(?:instagram\.com)\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_\-]+)/i);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
};

const getTikTokId = (url: string) => {
  try {
    const match = url.match(/\/video\/(\d+)/);
    if (match) return match[1];
    const match2 = url.match(/v\/(\d+)/);
    if (match2) return match2[1];
  } catch (e) {}
  return null;
};

const getYouTubeId = (url: string) => {
  try {
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com')) {
      const urlObj = new URL(url);
      let v = urlObj.searchParams.get('v');
      if (!v) {
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'embed' && pathParts[1]) {
          v = pathParts[1];
        } else if (pathParts[0] === 'shorts' && pathParts[1]) {
          v = pathParts[1];
        } else if (urlObj.hostname === 'youtu.be') {
          v = pathParts[0];
        }
      }
      return v;
    }
  } catch (e) {}
  return null;
};

const isYouTubeShort = (url: string) => {
  return url.includes('youtube.com/shorts') || url.includes('youtu.be/shorts');
};

const isInstagram = (url: string) => url.includes('instagram.com');
const isTikTok = (url: string) => url.includes('tiktok.com');

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-[#8c92ac]',
    'bg-[#b39c82]',
    'bg-[#9c8cb3]',
    'bg-[#8caf9b]',
    'bg-[#b28282]',
    'bg-[#aba682]',
    'bg-[#8b9cb3]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => {
  return name.trim().substring(0, 2).toUpperCase();
};

const renderUserAvatar = (user: any, sizeClass = "w-6 h-6") => {
  if (user?.twitchData?.avatarUrl) {
    return (
      <img 
        src={user.twitchData.avatarUrl} 
        alt={user.name || user.submitter} 
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-sm object-cover border border-[#404040] bg-[#121212] shrink-0`}
      />
    );
  }
  const name = user?.name || user?.submitter || '?';
  const initials = getInitials(name);
  const color = user?.twitchData?.color || '#505050';
  return (
    <div 
      className={`${sizeClass} rounded-sm flex items-center justify-center font-bold text-[10px] text-white shrink-0 border border-[#404040]`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
};

const renderTwitchBadgesHost = (user: any) => {
  const badges = user?.twitchData?.badges || [];
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {badges.map((b: string) => {
        if (b === 'broadcaster') {
          return (
            <span key={b} className="bg-[#FF3B30] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#FF3B30]/30 animate-pulse" title="Broadcaster (Streamer)">
              👑 STR
            </span>
          );
        }
        if (b === 'moderator') {
          return (
            <span key={b} className="bg-[#4CAF50] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#4CAF50]/30" title="Moderador">
              🛡️ MOD
            </span>
          );
        }
        if (b === 'vip') {
          return (
            <span key={b} className="bg-[#E25CFF] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#E25CFF]/30" title="VIP">
              💎 VIP
            </span>
          );
        }
        if (b === 'subscriber') {
          return (
            <span key={b} className="bg-[#FFD700] text-black text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#FFB300]/30" title="Inscrito">
              ⭐ SUB
            </span>
          );
        }
        return null;
      })}
    </div>
  );
};

interface CustPlayerProps {
  url: string;
  getRatioClass: () => string;
  webcamStream: MediaStream | null;
  WebcamPreview: React.ComponentType;
}

function CustomInstagramPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const igId = getInstagramId(url);

  useEffect(() => {
    let active = true;

    if (!igId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setVideoUrl(null);

    const targetUrl = `https://www.instagram.com/p/${igId}/`;

    fetch(`${getBackendUrl()}/api/instagram-stream?url=${encodeURIComponent(targetUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Erro ao obter fluxo de transmissão');
        return res.json();
      })
      .then((data) => {
        if (active) {
          if (data.videoUrl && !data.error) {
            setVideoUrl(data.videoUrl);
          } else {
            setError(data.error || 'Não foi possível carregar o vídeo. Tente abrir diretamente no app.');
          }
        }
      })
      .catch((err) => {
        console.error("Instagram resolver error:", err);
        if (active) {
          setError('Ocorreu um erro ao carregar o vídeo de forma direta.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [igId]);

  if (!igId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center">
         <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
         <span className="text-[#B0B0B0] font-semibold text-sm">Link do Instagram inválido</span>
         <span className="text-[#888888] text-xs mt-1">Insira um link de post ou Reel público.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={clsx("relative w-full bg-[#0A0A0A] rounded-sm overflow-hidden flex flex-col items-center justify-center border border-[#1f1f1f]/80 p-8 text-center", getRatioClass())}>
         <WebcamPreview />
         <Loader2 className="w-10 h-10 text-[#FF6B35] animate-spin mb-4" />
         <span className="text-[#EFEFEF] font-bold text-sm tracking-wide font-sans">Processando Reel do Instagram</span>
         <span className="text-[#505050] text-xs mt-1 font-mono">Bypass de iframe...</span>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className={clsx("relative w-full bg-[#0A0A0A] rounded-sm overflow-hidden flex flex-col items-center justify-center border border-[#1f1f1f]/80 p-6 text-center", getRatioClass())}>
         <WebcamPreview />
         <AlertCircle className="w-10 h-10 text-[#e0a670] mb-3" />
         <span className="text-[#EFEFEF] font-bold text-sm">Restrição do Instagram Ativa</span>
         <p className="text-[#B0B0B0] text-xs mt-2 leading-relaxed font-sans">
            Este conteúdo requer autenticação ou possui restrição de compartilhamento externa.
         </p>
         <a 
            href={url} 
            target="_blank" 
            rel="noreferrer noopener" 
            className="mt-6 flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#222222] border border-[#2d2d2d] hover:bg-[#2c2c2c] text-[#EFEFEF] font-bold text-xs transition-all text-center cursor-pointer font-mono"
         >
            <ExternalLink className="w-3.5 h-3.5" />
            Visualizar no Instagram
         </a>
      </div>
    );
  }

  return (
    <div className={clsx("relative bg-[#0A0A0A] rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 select-none shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-0 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-0")}>
          <video
             src={`/api/proxy-video?url=${encodeURIComponent(videoUrl)}`}
             className="w-full h-full min-h-screen h-screen max-h-screen rounded-sm bg-[#0A0A0A] object-contain z-10"
             controls
             autoPlay
             loop
             playsInline
          />
       </div>
    </div>
  );
}

function CustomExtractorPlayer({ url, getRatioClass, webcamStream, WebcamPreview, platformName = 'Vídeo' }: CustPlayerProps & { platformName?: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);
    setVideoUrl(null);

    fetch(`${getBackendUrl()}/api/media-stream?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Erro ao obter fluxo de transmissão');
        return res.json();
      })
      .then((data) => {
        if (active) {
          if (data.videoUrl && !data.error) {
            setVideoUrl(data.videoUrl);
          } else {
            setError(data.error || 'Não foi possível carregar o vídeo.');
          }
        }
      })
      .catch((err) => {
        console.error("Extractor player error:", err);
        if (active) {
          setError('Ocorreu um erro ao carregar o vídeo de forma direta.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className={clsx("relative w-full bg-[#0A0A0A] rounded-sm overflow-hidden flex flex-col items-center justify-center border border-[#1f1f1f]/80 p-8 text-center", getRatioClass())}>
         <WebcamPreview />
         <Loader2 className="w-10 h-10 text-[#FF6B35] animate-spin mb-4" />
         <span className="text-[#EFEFEF] font-bold text-sm tracking-wide font-sans">Processando Vídeo do {platformName}</span>
         <span className="text-[#505050] text-xs mt-1 font-mono">Processando fluxo direto...</span>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className={clsx("relative w-full bg-[#0A0A0A] rounded-sm overflow-hidden flex flex-col items-center justify-center border border-[#1f1f1f]/80 p-6 text-center", getRatioClass())}>
         <WebcamPreview />
         <AlertCircle className="w-10 h-10 text-[#e0a670] mb-3" />
         <span className="text-[#EFEFEF] font-bold text-sm">Problema ao Extrair Vídeo</span>
         <p className="text-[#B0B0B0] text-xs mt-2 leading-relaxed">
            Este conteúdo pode não conter vídeo, ser privado ou possui restrições de reprodução direta.
         </p>
         <a 
            href={url} 
            target="_blank" 
            rel="noreferrer noopener" 
            className="mt-6 flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#222222] border border-[#2d2d2d] hover:bg-[#2c2c2c] text-[#EFEFEF] font-bold text-xs transition-all text-center cursor-pointer font-mono"
         >
            <ExternalLink className="w-3.5 h-3.5" />
            Visualizar no {platformName}
         </a>
      </div>
    );
  }

  return (
    <div className={clsx("relative bg-[#0A0A0A] rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 select-none shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-0 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-0")}>
          <video
             src={`/api/proxy-video?url=${encodeURIComponent(videoUrl)}`}
             className="w-full h-full min-h-screen h-screen max-h-screen rounded-sm bg-[#0A0A0A] object-contain z-10"
             controls
             autoPlay
             loop
             playsInline
          />
       </div>
    </div>
  );
}

function CustomYouTubeShortsPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const ytId = getYouTubeId(url);

  if (!ytId) {
     return (
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center font-sans">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#B0B0B0] font-semibold text-sm">Link do YouTube Shorts inválido</span>
       </div>
     );
  }

  const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`;

  return (
    <div className={clsx("relative bg-[#0A0A0A] rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-0 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-0")}>
          <iframe
             src={embedUrl}
             className="w-full h-full min-h-screen h-screen max-h-screen border-0 rounded-sm bg-[#0A0A0A]"
             allowFullScreen
             allow="autoplay; encrypted-media; picture-in-picture"
          ></iframe>
       </div>
    </div>
  );
}

function CustomYouTubePlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const ytId = getYouTubeId(url);

  if (!ytId) {
     return (
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center font-sans">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#B0B0B0] font-semibold text-sm">Link do YouTube inválido</span>
       </div>
     );
  }

  const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`;

  return (
    <div className={clsx("relative w-full bg-[#0A0A0A] rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
          <iframe
             src={embedUrl}
             className="w-full h-full min-h-[480px] md:min-h-[560px] xl:min-h-[88vh] border-0 rounded-sm bg-[#0A0A0A] aspect-video"
             allowFullScreen
             allow="autoplay; encrypted-media; picture-in-picture"
          ></iframe>
       </div>
    </div>
  );
}

function CustomTikTokPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const tiktokId = getTikTokId(url);

  if (!tiktokId) {
     return (
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center font-sans">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#B0B0B0] font-semibold text-sm">Link do TikTok inválido</span>
          <span className="text-[#888888] text-xs mt-1">Certifique-se de que é um link público de vídeo.</span>
       </div>
     );
  }

  const embedUrl = `https://www.tiktok.com/player/v1/${tiktokId}?&autoplay=1&loop=1&music_info=0&description=0`;

  return (
    <div className={clsx("relative bg-[#0A0A0A] rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 shadow-2xl w-full h-full", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-0 transition-all duration-300 relative overflow-hidden", webcamStream ? "pt-[150px]" : "pt-0")}>
          <iframe
             src={embedUrl}
             className="w-full h-full border-0 rounded-sm bg-[#0A0A0A]"
             allowFullScreen
             allow="autoplay; encrypted-media; picture-in-picture"
          ></iframe>
       </div>
    </div>
  );
}

export default function HostView({ session }: { session: SessionState }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Advanced infinite parallax scroll engines with dynamic physics and multi-layered depth
  const { scrollY } = useScroll();

  // 1. Nebula Background: Slow organic sine-wave horizontal/vertical sway and breathing that never run off-screen
  const rawBgY = useTransform(scrollY, (v) => Math.sin(v / 500) * 40);
  const bgY = useSpring(rawBgY, { stiffness: 15, damping: 25, mass: 1 });
  const rawBgScale = useTransform(scrollY, (v) => 1.05 + Math.cos(v / 800) * 0.03);
  const bgScale = useSpring(rawBgScale, { stiffness: 15, damping: 25, mass: 1 });

  // 2. Seamless Infinite Tech Grid: Math loop at exactly grid height (60px) to scroll infinitely with ZERO jumps or snaps
  const rawGridY = useTransform(scrollY, (v) => -(v % 60));
  const gridY = useSpring(rawGridY, { stiffness: 45, damping: 22 });

  // 3. Multi-Depth Floating Micro-Stars: Individual depth sways that flutter dynamically on scroll
  const depthSlowY = useTransform(scrollY, (v) => Math.sin(v / 300) * 20);
  const depthSlowX = useTransform(scrollY, (v) => Math.cos(v / 350) * 10);

  const depthMediumY = useTransform(scrollY, (v) => Math.sin(v / 200) * 45);
  const depthMediumX = useTransform(scrollY, (v) => Math.cos(v / 240) * 20);

  const depthFastY = useTransform(scrollY, (v) => Math.sin(v / 140) * 70);
  const depthFastX = useTransform(scrollY, (v) => Math.cos(v / 160) * 30);

  const STARS_PRESET = useMemo(() => [
    { top: "12%", left: "8%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "22%", left: "85%", size: "w-1 h-1", depth: "medium" },
    { top: "45%", left: "12%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "62%", left: "80%", size: "w-1 h-1", depth: "medium" },
    { top: "78%", left: "18%", size: "w-1.5 h-1.5 bg-accent/40 animate-pulse", depth: "fast" },
    { top: "34%", left: "73%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "88%", left: "55%", size: "w-1 h-1", depth: "medium" },
    { top: "8%", left: "92%", size: "w-1.5 h-1.5 bg-white/40 animate-pulse", depth: "fast" },
    { top: "52%", left: "77%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "94%", left: "28%", size: "w-1 h-1", depth: "medium" },
    { top: "6%", left: "42%", size: "w-1 h-1", depth: "medium" },
    { top: "58%", left: "48%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "28%", left: "28%", size: "w-1.5 h-1.5 bg-[#00FF66]/30 animate-pulse", depth: "fast" },
    { top: "72%", left: "62%", size: "w-1 h-1", depth: "medium" },
    { top: "38%", left: "94%", size: "w-0.5 h-0.5", depth: "slow" },
  ], []);
  
  // App Navigation and Main tab
  const [activeTab, setActiveTab] = useState<'player' | 'submit' | 'participants' | 'moderation' | 'settings'>('player');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Twitch Chatters states
  const [twitchChatters, setTwitchChatters] = useState<any[]>([]);
  const [loadingChatters, setLoadingChatters] = useState<boolean>(false);

  const [feedbackMsg, setFeedbackMsg] = useState<{title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info'} | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9' | 'auto'>('auto');
  const [cropOverlay, setCropOverlay] = useState<boolean>(true);
  const [aspectMenuOpen, setAspectMenuOpen] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [optimisticLoading, setOptimisticLoading] = useState<boolean>(false);
  const [directUrl, setDirectUrl] = useState('');

  const fetchTwitchChatters = async () => {
    if (!session?.id) return;
    setLoadingChatters(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/sessions/${session.id}/twitch_chatters`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.chatters) {
          setTwitchChatters(data.chatters);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Twitch chatters:", err);
    } finally {
      setLoadingChatters(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'participants') {
      fetchTwitchChatters();
    }
  }, [activeTab, session?.id]);

  useEffect(() => {
    const fetchAndSyncSettings = async () => {
      let targetRoomId = localStorage.getItem('active_supabase_room_id');
      const { data: userData } = await supabase.auth.getUser();
      
      if (userData?.user) {
        if (!targetRoomId) {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('id')
            .eq('owner_id', userData.user.id)
            .single();
          if (roomData?.id) {
            targetRoomId = roomData.id;
            localStorage.setItem('active_supabase_room_id', roomData.id);
          }
        }

        if (targetRoomId) {
          localStorage.setItem('active_room_id', targetRoomId);
          let { data: settingsData } = await supabase
            .from('room_settings')
            .select('*')
            .eq('room_id', targetRoomId)
            .single();

          if (settingsData) {
            const merged = {
               ...settingsData,
               ...(settingsData.settings_json || {})
            };
            
            socket.emit('update_settings', {
              domainMode: merged.domain_mode,
              domainWhitelist: merged.domain_whitelist || [],
              domainBlacklist: merged.domain_blacklist || [],
              requireFollower: merged.require_follower,
              requireSub: merged.require_sub,
              isManualApprovalRequired: merged.isManualApprovalRequired,
              blockLiveStreams: merged.blockLiveStreams,
              globalCooldownSeconds: merged.globalCooldownSeconds ?? 5,
              userCooldownSeconds: merged.cooldown_seconds ?? 30,
              maxSubmissionsPerHour: merged.maxSubmissionsPerHour ?? 60
            });
          }
        }
      }
    };

    fetchAndSyncSettings();
  }, []);

  const showFeedback = (title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    setFeedbackMsg({ title, desc, type });
  };

  useEffect(() => {
    if (feedbackMsg) {
      const t = setTimeout(() => setFeedbackMsg(null), 4500);
      return () => clearTimeout(t);
    }
  }, [feedbackMsg]);

  const toggleWebcam = async () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
      showFeedback("Câmera Desativada", "A transmissão da webcam de reação foi encerrada.", 'info');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
        showFeedback("Reação Ativada", "Webcam integrada com sucesso sobre o player.", 'success');
      } catch (err) {
        console.error("Erro ao acessar a webcam:", err);
        alert("Não foi possível acessar a câmera do dispositivo. Certifique-se de dar permissão ao navegador.");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  const webcamRefCallback = (el: HTMLVideoElement | null) => {
    if (el && webcamStream) {
       el.srcObject = webcamStream;
    }
  };
  
  const currentVideo = session.queue.find(v => v.id === session.currentVideoId) || session.history.find(v => v.id === session.currentVideoId);
  const activeSender = currentVideo ? (session.users.find(u => u.name === currentVideo.submitter || u.userId === currentVideo.submitterId) || null) : null;
  const focusUser = activeSender || selectedUser || null;

  // Track the playing video sender in real-time when the active video shifts
  useEffect(() => {
    setSelectedUser(null);
  }, [session.currentVideoId]);

  // URL resolution effect to handle shortened links
  useEffect(() => {
    if (optimisticLoading) {
      setOptimisticLoading(false);
    }
    
    if (currentVideo) {
      setResolvedUrl(currentVideo.url);
      
      const isShortened = currentVideo.url.includes('vm.tiktok.com') || 
                          currentVideo.url.includes('vt.tiktok.com') || 
                          currentVideo.url.includes('v.tiktok.com') || 
                          currentVideo.url.includes('t.tiktok.com') || 
                          currentVideo.url.includes('ig.me') || 
                          currentVideo.url.includes('youtu.be/shorts');
                          
      if (isShortened) {
        setResolving(true);
        fetch(`${getBackendUrl()}/api/resolve?url=${encodeURIComponent(currentVideo.url)}`)
          .then(res => res.json())
          .then(data => {
            if (data.url) {
              setResolvedUrl(data.url);
            }
          })
          .catch(err => {
            console.error("Erro ao resolver URL:", err);
          })
          .finally(() => {
            setResolving(false);
          });
      }
    } else {
      setResolvedUrl('');
    }
  }, [currentVideo?.id]);

  // Reset aspect ratios based on resolved video type
  useEffect(() => {
    const videoUrl = resolvedUrl || currentVideo?.url;
    if (videoUrl) {
      if (videoUrl.includes('instagram.com') || videoUrl.includes('tiktok.com') || isYouTubeShort(videoUrl)) {
        setAspectRatio('9:16');
        setCropOverlay(true);
      } else {
        setAspectRatio('auto');
        setCropOverlay(false);
      }
    }
  }, [resolvedUrl, currentVideo?.id]);

  // Keybindings
  useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        
        if (e.key === 'ArrowRight' || e.key === 'n') {
           playNext();
        } else if (e.key === 'ArrowLeft' || e.key === 'p') {
           playPrevious();
        } else if (e.key === '=' || e.key === '+') {
           setZoom(z => Math.min(z + 0.1, 2));
        } else if (e.key === '-') {
           setZoom(z => Math.max(z - 0.1, 0.5));
        } else if (e.key === '0') {
           setZoom(1);
        } else if (e.key === 'f') {
           toggleFullscreen();
        }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session.currentVideoId, resolvedUrl]);

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
         containerRef.current?.requestFullscreen().catch(err => {
            console.error("Error attempting to enable fullscreen:", err);
         });
      } else {
         document.exitFullscreen();
      }
  };

  useEffect(() => {
      const handleFullscreenChange = () => {
         setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const approve = (id: string) => {
    socket.emit('approve_video', id);
    showFeedback('Vídeo Aprovado', 'Vídeo movido para a fila ativa de reprodução.', 'success');
  };
  
  const reject = (id: string) => {
    socket.emit('reject_video', id);
    showFeedback('Vídeo Removido', 'Vídeo descartado do sistema.', 'info');
  };
  
  const playNext = () => {
    setOptimisticLoading(true);
    socket.emit('end_video');
  };
  
  const playPrevious = () => {
    setOptimisticLoading(true);
    socket.emit('play_previous');
  };
  
  const playVideo = (id: string) => {
    setOptimisticLoading(true);
    socket.emit('play_video', id);
  };

  const handleDirectSubmit = () => {
    if (!directUrl.trim().startsWith('http')) return;
    socket.emit('submit_video', { url: directUrl.trim() });
    setDirectUrl('');
    setActiveTab('player');
    showFeedback('Injetando Mídia', 'Vídeo enviado com prioridade de Host.', 'success');
  };

  const copyInvite = () => {
    const inviteLink = `${window.location.origin}/?room=${session.id}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showFeedback('Link Copiado!', 'Compartilhe com seus espectadores para receber mídias.', 'success');
  };

  const handleEndSession = () => {
    if (confirm("Deseja realmente fechar a transmissão e encerrar esta sessão de fila?")) {
      socket.emit('end_session');
    }
  };

  const WebcamPreview = () => {
    if (!webcamStream) return null;
    
    const isVertical = currentVideo && (currentVideo.url.includes('instagram.com') || currentVideo.url.includes('tiktok.com') || isYouTubeShort(currentVideo.url));
    
    if (isVertical) {
      return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] h-24 md:h-28 bg-[#0D0D0D]/90 border border-zinc-800 rounded-sm overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
           <video
              ref={webcamRefCallback}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
           />
           <div className="absolute bottom-1.5 right-1.5 bg-[#0D0D0D]/80 border border-orange-500/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-orange-400 flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse"></span>
              REACTION
           </div>
        </div>
      );
    }
    
    return (
      <div className="absolute top-4 left-4 w-24 h-24 md:w-28 md:h-28 bg-[#000000]/90 border border-zinc-800 rounded-sm overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
         <video
            ref={webcamRefCallback}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
         />
         <div className="absolute bottom-1.5 right-1.5 bg-[#0D0D0D]/85 border border-orange-500/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-zinc-100 flex items-center gap-1 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-orange-500 animate-ping"></span>
            HOST
         </div>
      </div>
    );
  };

  const getRatioClass = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] h-full h-screen max-h-screen !max-h-screen w-auto !w-auto shadow-2xl transition-all duration-300';
      case '4:5':
        return 'aspect-[4/5] w-full max-w-[620px] md:max-w-[660px] xl:max-w-[700px] max-h-[80vh] md:max-h-[84vh] xl:max-h-[88vh]';
      case '1:1':
        return 'aspect-square w-full max-w-[720px] md:max-w-[760px] xl:max-w-[800px] max-h-[76vh] md:max-h-[80vh] xl:max-h-[84vh]';
      case '16:9':
        return 'aspect-video w-full max-w-[98%] xl:max-w-[98%] max-h-[86vh] md:max-h-[88vh] xl:max-h-[90vh]';
      case 'auto':
      default:
        if (currentVideo) {
          if (currentVideo.url.includes('instagram.com') || currentVideo.url.includes('tiktok.com') || isYouTubeShort(currentVideo.url)) {
            return 'aspect-[9/16] h-full h-screen max-h-screen !max-h-screen w-auto !w-auto shadow-2xl transition-all duration-300';
          }
        }
        return 'aspect-video w-full max-w-[98%] xl:max-w-[98%] max-h-[86vh] md:max-h-[88vh] xl:max-h-[90vh]';
    }
  };

  return (
    <div className="crt-screen flex flex-col h-screen text-[#efefef] font-sans overflow-hidden select-none relative antialiased" id="streamer_host_view">
      {/* Parallax Background Canvas with nebula image */}
      <motion.div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat z-0 pointer-events-none"
        style={{ 
          backgroundImage: "url('/Background.jpeg')",
          y: bgY,
          scale: bgScale,
        }}
      />

      {/* 1. Seamless Infinite Cyberpunk Digital Grid (Seamless 60px modulus vertical scroll) */}
      <motion.div 
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(145, 70, 255, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(145, 70, 255, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          y: gridY,
        }}
      />

      {/* 2. Procedural Multi-Depth Stars (Infinite Scroll Sway) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {STARS_PRESET.map((star, idx) => {
          let transformX = depthSlowX;
          let transformY = depthSlowY;
          if (star.depth === "medium") {
            transformX = depthMediumX;
            transformY = depthMediumY;
          } else if (star.depth === "fast") {
            transformX = depthFastX;
            transformY = depthFastY;
          }
          return (
            <motion.div
              key={idx}
              className={`absolute rounded-full bg-white/50 ${star.size}`}
              style={{
                top: star.top,
                left: star.left,
                x: transformX,
                y: transformY,
              }}
            />
          );
        })}
      </div>
      
      {/* Dark Translucent overlay to maintain extreme contrast and layout elegance */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none z-0" />
      
      {/* Background Cathode sweeping scanning bar */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00FF66]/2 to-transparent h-1 opacity-20 pointer-events-none animate-pulse-phosphor z-50 transform translate-y-0" style={{ animationDuration: '8s' }} />

      {/* 1. Global Gradient Header Bar */}
      <header className="h-16 bg-black/40 backdrop-blur-md border-b border-white/10 px-4 flex items-center justify-between relative shrink-0 z-10">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-[#9146FF] to-emerald-400" />
        
        {/* Brand & Room Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF66] animate-pulse border border-[#00FF66]/40" />
            <h1 className="text-sm font-black uppercase tracking-wider font-mono bg-gradient-to-r from-[#9146FF] to-orange-400 bg-clip-text text-transparent">Live Console</h1>
          </div>
          <span className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
            <span className="text-zinc-550 uppercase">SALA:</span>
            <span className="text-orange-400 font-extrabold tracking-widest">{session.id}</span>
          </div>
        </div>

        {/* Central Widescreen Navigation controls */}
        <nav className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('player')}
            className={clsx(
              "px-3.5 py-1.5 rounded-sm text-[11px] font-black font-mono tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'player' 
                ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" 
                : "text-zinc-450 hover:text-zinc-100 hover:bg-black/30 border border-transparent"
            )}
          >
            <Radio className="w-3.5 h-3.5" />
            WORKSPACE
          </button>
          
          <button
            onClick={() => setActiveTab('submit')}
            className={clsx(
              "px-3.5 py-1.5 rounded-sm text-[11px] font-black font-mono tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'submit' 
                ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" 
                : "text-zinc-455 hover:text-zinc-100 hover:bg-black/30 border border-transparent"
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            MANUAL
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={clsx(
              "px-3.5 py-1.5 rounded-sm text-[11px] font-black font-mono tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'participants' 
                ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" 
                : "text-zinc-455 hover:text-zinc-100 hover:bg-black/30 border border-transparent"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            ESPECTADORES ({session.users.length})
          </button>

          <button
            onClick={() => setActiveTab('moderation')}
            className={clsx(
              "px-3.5 py-1.5 rounded-sm text-[11px] font-black font-mono tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'moderation' 
                ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" 
                : "text-zinc-455 hover:text-zinc-100 hover:bg-black/30 border border-transparent"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            MODERAÇÃO
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              "px-3.5 py-1.5 rounded-sm text-[11px] font-black font-mono tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'settings' 
                ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" 
                : "text-zinc-455 hover:text-zinc-100 hover:bg-black/30 border border-transparent"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            CONFIGURAÇÕES
          </button>
        </nav>

        {/* Global actions: Copy link & Log out */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyInvite}
            className="px-3 py-1.5 text-xs font-bold font-mono tracking-wider hover:bg-black/40 border border-white/10 rounded transition-all cursor-pointer flex items-center gap-1.5 text-zinc-300 hover:text-white"
          >
            <Copy className="w-3.5 h-3.5 text-orange-400" />
            {copied ? "COPIADO!" : "CONVITE"}
          </button>
          
          <button
            onClick={handleEndSession}
            className="p-1 px-2 hover:bg-red-650/10 text-zinc-400 hover:text-red-500 border border-transparent hover:border-red-500/20 rounded transition-all cursor-pointer"
            title="Encerrar Sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Responsive Multi-Column Layout Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
        
        {/* COLUMN 1: Persistent Queue (Visible across all tabs for instant tracking!) */}
        <aside className="w-80 shrink-0 h-full overflow-hidden flex flex-col border-r border-white/10">
          <HostQueuePanel 
            session={session} 
            playVideo={playVideo} 
            reject={reject} 
            approve={approve} 
          />
        </aside>

        {/* WORKSPACE AREA: Center & Right sections loaded conditionally */}
        <main className="flex-1 flex min-w-0 h-full relative overflow-hidden bg-transparent">
          
          {activeTab === 'moderation' && (
            <div className="w-full h-full overflow-y-auto bg-black/10 backdrop-blur-sm">
              <AdminDashboard session={session} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="w-full h-full overflow-y-auto bg-black/10 backdrop-blur-sm">
              <SettingsView session={session} />
            </div>
          )}

          {activeTab === 'submit' && (
            <div className="flex-1 flex items-center justify-center p-6 bg-transparent">
              <div className="w-full max-w-sm bg-black/60 border border-white/10 p-6 space-y-4 rounded shadow-2xl backdrop-blur-md">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold uppercase font-mono tracking-wider text-orange-400">Injeção Manual de Mídias</h3>
                  <p className="text-[10.5px] text-zinc-450">Envie um link de vídeo diretamente sobrepondo cooldowns ou regras de validações normais de viewers.</p>
                </div>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={directUrl}
                    onChange={e => setDirectUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-black/45 border border-white/10 rounded px-3 py-2.5 text-xs text-white placeholder-zinc-550 focus:outline-none focus:border-[#9146FF] font-mono"
                  />
                  <button 
                    onClick={handleDirectSubmit}
                    disabled={!directUrl.trim().startsWith('http')}
                    className="w-full bg-[#9146FF] hover:bg-[#9146FF]/80 disabled:bg-white/5 disabled:text-zinc-650 text-white font-black py-2.5 rounded text-xs transition-colors cursor-pointer font-mono shadow-[0_0_15px_rgba(145,70,255,0.15)]"
                  >
                    INJETAR AGORA
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-[#0a0a0f] space-y-6">
              
              {/* Header block with actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-4 gap-3">
                <div className="space-y-1 text-left">
                  <h3 className="text-sm font-extrabold uppercase font-mono tracking-wider text-orange-400 flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-500" />
                    Controle de Espectadores & Live da Twitch
                  </h3>
                  <p className="text-[11px] text-zinc-500">Mapeamento em tempo real de quem está no chat do stream contra os participantes logados.</p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={fetchTwitchChatters}
                    disabled={loadingChatters}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 rounded text-[11px] font-mono text-zinc-300 disabled:text-zinc-600 transition cursor-pointer"
                  >
                    <RefreshCw className={clsx("w-3.5 h-3.5", loadingChatters && "animate-spin")} />
                    {loadingChatters ? "Sincronizando..." : "Sincronizar Twitch Chat"}
                  </button>
                </div>
              </div>

              {/* Two grids */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                
                {/* COLUMN 1: Session application participants */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-zinc-950/80 px-3 py-2 border-l-2 border-orange-500 rounded border border-zinc-800">
                    <span className="text-xs font-mono font-bold uppercase text-zinc-300">Conectados na Sala ({session.users.length})</span>
                    <span className="text-[9px] bg-orange-500/10 text-orange-400 font-mono px-2 py-0.5 rounded border border-orange-500/20">APP ACTIVE</span>
                  </div>

                  {session.users.length === 0 ? (
                    <div className="p-8 border border-zinc-900 bg-zinc-950/20 text-center rounded">
                      <p className="text-xs text-zinc-600 font-mono italic">Nenhum espectador logado na sala no momento.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
                      {session.users.map(u => {
                        const inTwitchChat = twitchChatters.some(tc => tc.user_login?.toLowerCase() === u.twitchData?.login?.toLowerCase() || tc.user_name?.toLowerCase() === u.name?.toLowerCase());
                        return (
                          <div 
                            key={u.id} 
                            onClick={() => { setSelectedUser(u); setActiveTab('player'); }}
                            className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 hover:border-orange-500/50 rounded-sm cursor-pointer transition-all duration-200"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 text-left">
                              {renderUserAvatar(u, "w-8 h-8")}
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold truncate" style={{ color: u.twitchData?.color || '#FFFFFF' }}>
                                  @{u.name}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {renderTwitchBadgesHost(u)}
                                  <span className={clsx(
                                    "text-[8px] font-mono font-bold uppercase rounded px-1",
                                    inTwitchChat ? "bg-green-500/10 text-green-400" : "bg-zinc-900 text-zinc-600"
                                  )}>
                                    {inTwitchChat ? 'TWITCH CHAT' : 'OFF CHAT'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded">
                                STRIKES: {u.strikes || 0}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* COLUMN 2: Twitch Stream Chat Viewers */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-zinc-950/80 px-3 py-2 border-l-2 border-purple-500 rounded border border-zinc-800">
                    <span className="text-xs font-mono font-bold uppercase text-zinc-300">Ao Vivo no Chat da Twitch ({twitchChatters.length})</span>
                    <span className="text-[9px] bg-purple-500/10 text-purple-400 font-mono px-2 py-0.5 rounded border border-purple-500/20">STREAM REAL-TIME</span>
                  </div>

                  {loadingChatters && twitchChatters.length === 0 ? (
                    <div className="p-8 border border-zinc-900 bg-zinc-950/20 text-center rounded flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                      <p className="text-xs text-zinc-500 font-mono">Buscando listagem Helix da Twitch...</p>
                    </div>
                  ) : twitchChatters.length === 0 ? (
                    <div className="p-8 border border-zinc-900 bg-zinc-950/20 text-center rounded space-y-2">
                      <p className="text-xs text-zinc-600 font-mono italic">Nenhum espectador detectado no chat ou credenciais da Twitch ausentes.</p>
                      <button 
                        onClick={fetchTwitchChatters}
                        className="text-[10px] font-mono text-purple-400 hover:underline px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded mx-auto block cursor-pointer"
                      >
                        Tentar Carregar
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
                      {twitchChatters.map(chatter => {
                        const boundUser = session.users.find(u => u.name?.toLowerCase() === chatter.user_login?.toLowerCase() || u.twitchData?.login?.toLowerCase() === chatter.user_login?.toLowerCase());
                        return (
                          <div 
                            key={chatter.user_id}
                            onClick={() => {
                              if (boundUser) {
                                setSelectedUser(boundUser);
                                setActiveTab('player');
                              }
                            }}
                            className={clsx(
                              "flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-900 rounded-sm transition duration-250 text-left",
                              boundUser ? "hover:border-purple-500/50 cursor-pointer" : "opacity-75"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {boundUser?.twitchData?.avatarUrl ? (
                                <img src={boundUser.twitchData.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-zinc-800" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#9146FF]/10 text-[#9146FF] border border-[#9146FF]/30 flex items-center justify-center font-black text-xs font-mono">
                                  T
                                </div>
                              )}
                              
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold truncate text-zinc-300">
                                  @{chatter.user_name}
                                </span>
                                <span className="text-[8.5px] text-zinc-600 font-mono font-bold uppercase mt-0.5">
                                  ID: {chatter.user_id}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {boundUser ? (
                                <span className="text-[8.5px] font-bold font-mono px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded">
                                  SALA APP
                                </span>
                              ) : (
                                <span className="text-[8.5px] font-medium font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-850 text-zinc-500 rounded">
                                  SÓ LIVE
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {activeTab === 'player' && (
            <div className="flex-1 flex overflow-hidden min-w-0 relative h-full">
              
              {/* CENTER COLUMN: Central visual Video Player Workspace */}
              <div className="flex-1 flex flex-col min-w-0 h-full relative" ref={containerRef}>
                
                {/* Floating Aspect controls bar at bottom left */}
                {currentVideo && !isFullscreen && (
                  <div className="absolute right-5 bottom-12 z-40 flex flex-col items-center gap-3 bg-zinc-950/60 p-2 border border-zinc-800 rounded">
                    
                    {/* Prev & Next Controls */}
                    <button 
                      onClick={playPrevious} 
                      disabled={optimisticLoading}
                      className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center transition-all cursor-pointer shadow disabled:opacity-30"
                      title="Mídia Anterior (ArrowLeft / P)"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={playNext} 
                      disabled={optimisticLoading}
                      className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 flex items-center justify-center transition-all cursor-pointer shadow disabled:opacity-30"
                      title="Próxima Mídia (ArrowRight / N)"
                    >
                      <SkipForward className="w-4 h-4 text-orange-400" />
                    </button>

                    <div className="h-px w-6 bg-zinc-800" />

                    {/* Quick Link Opener */}
                    <button 
                      onClick={() => {
                        const videoUrl = resolvedUrl || currentVideo?.url;
                        if (videoUrl) window.open(videoUrl, '_blank', 'noopener,noreferrer');
                      }}
                      className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center transition-all cursor-pointer shadow"
                      title="Acessar Canal Original"
                    >
                      <ExternalLink className="w-4 h-4 text-[#efefef] hover:text-orange-400" />
                    </button>

                    {/* Hardware integrations */}
                    <button 
                      onClick={toggleWebcam} 
                      className={clsx(
                        "w-10 h-10 rounded border flex items-center justify-center transition-all cursor-pointer shadow",
                        webcamStream 
                          ? "bg-orange-950/45 border-orange-500 text-orange-400 animate-pulse" 
                          : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      )}
                      title="Ativar Webcam de Reação"
                    >
                      {webcamStream ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => setAspectMenuOpen(!aspectMenuOpen)}
                      className={clsx(
                        "w-10 h-10 rounded border flex items-center justify-center transition-all cursor-pointer shadow",
                        aspectMenuOpen
                          ? "bg-orange-950/45 border-orange-500 text-orange-400"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300"
                      )}
                      title="Modo Crop e Proporção"
                    >
                      <Layers className="w-4 h-4" />
                    </button>

                    <div className="h-px w-6 bg-zinc-800" />

                    <button 
                      onClick={toggleFullscreen} 
                      className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center transition-all cursor-pointer shadow"
                      title="Modo Tela Inteira (F)"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                    
                    {/* Zoom details */}
                    <div className="text-[9px] font-mono font-bold text-zinc-500 pt-1">
                      Z: {Math.round(zoom * 100)}%
                    </div>
                  </div>
                )}

                {/* Aspect ratio pop-up overlay */}
                <AnimatePresence>
                  {aspectMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      className="absolute right-18 bottom-28 z-50 p-3 bg-zinc-950 border border-zinc-800 rounded-sm shadow-2xl flex flex-col gap-2 font-mono text-xs text-left"
                    >
                      <span className="text-zinc-500 font-bold block mb-1">PROPORÇÃO TELA:</span>
                      {(['auto', '9:16', '4:5', '1:1', '16:9'] as const).map(ratio => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={clsx(
                            "px-2.5 py-1 text-left rounded-sm font-bold uppercase transition-all cursor-pointer",
                            aspectRatio === ratio
                              ? "bg-orange-600 text-white"
                              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                          )}
                        >
                          PROPORÇÃO {ratio}
                        </button>
                      ))}
                      <div className="h-px bg-zinc-800 my-1" />
                      <button
                        onClick={() => setCropOverlay(!cropOverlay)}
                        className={clsx(
                          "px-2 py-1 text-center rounded-sm font-bold uppercase transition-all border border-zinc-800 cursor-pointer",
                          cropOverlay ? "bg-orange-950/45 text-orange-400 border-orange-500/20" : "bg-zinc-900 text-zinc-500"
                        )}
                      >
                        SUPORTE SMART CROP
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main scale canvas viewport */}
                <div 
                  className="flex-1 relative w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ease-out z-10"
                  style={{ transform: `scale(${zoom})` }}
                >
                  {optimisticLoading && (
                    <div className="w-[90%] max-w-4xl aspect-video bg-zinc-950 rounded-sm border border-zinc-800 flex flex-col items-center justify-center animate-pulse shadow-2xl">
                      <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
                      <span className="text-zinc-300 font-extrabold text-xs font-mono uppercase tracking-widest">Sintonizando canais...</span>
                      <span className="text-zinc-600 text-[10px] mt-1 font-sans">Preparando a próxima reprodução</span>
                    </div>
                  )}

                  {!optimisticLoading && currentVideo ? (
                    <div className={clsx("relative w-full max-h-full h-full bg-[#040406] flex items-center justify-center select-none", isFullscreen ? 'w-screen h-screen' : 'px-4 py-8')}>
                      {resolving && (
                        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-45 flex flex-col items-center justify-center">
                          <Loader2 className="w-8 h-8 text-orange-400 animate-spin mb-3" />
                          <p className="text-xs font-black tracking-widest text-[#efefef] font-mono uppercase">Limpando frames de redirecionamento...</p>
                        </div>
                      )}

                      {/* Video extraction renderer mapping */}
                      {isInstagram(resolvedUrl) ? (
                         <CustomInstagramPlayer 
                            url={resolvedUrl} 
                            getRatioClass={getRatioClass} 
                            webcamStream={webcamStream} 
                            WebcamPreview={WebcamPreview} 
                         />
                      ) : isTikTok(resolvedUrl) ? (
                         <CustomTikTokPlayer 
                            url={resolvedUrl} 
                            getRatioClass={getRatioClass} 
                            webcamStream={webcamStream} 
                            WebcamPreview={WebcamPreview} 
                         />
                      ) : isYouTubeShort(resolvedUrl) ? (
                          <CustomYouTubeShortsPlayer 
                             url={resolvedUrl} 
                             getRatioClass={getRatioClass} 
                             webcamStream={webcamStream} 
                             WebcamPreview={WebcamPreview} 
                          />
                       ) : getYouTubeId(resolvedUrl) ? (
                          <CustomYouTubePlayer 
                             url={resolvedUrl} 
                             getRatioClass={getRatioClass} 
                             webcamStream={webcamStream} 
                             WebcamPreview={WebcamPreview} 
                          />
                       ) : (
                          <div className={clsx("relative bg-black rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-zinc-800 shadow-2xl", getRatioClass())}>
                              <WebcamPreview />
                              <div className={clsx("w-full h-full flex items-center justify-center p-0 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-0")}>
                                 <Player
                                    url={resolvedUrl || currentVideo.url}
                                    playing={session.isPlaying}
                                    controls
                                    width="100%"
                                    height="100%"
                                    onEnded={() => playNext()}
                                 />
                              </div>
                           </div>
                      )}
                    </div>
                  ) : !optimisticLoading ? (
                    <div className="flex flex-col items-stretch text-center p-8 bg-[#13131a] border border-[#1f1f2e] max-w-sm mx-4 select-none rounded-none shadow-2xl relative overflow-hidden pb-16">
                      {/* Animated Top Gradient Strip */}
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-orange-500 via-purple-400 to-emerald-400 animate-gradient-x" />
                      
                      <div className="flex flex-col items-center mb-6">
                        <div className="p-3 bg-orange-500/10 border border-orange-500/20 mb-4 rounded">
                          <Cast className="w-8 h-8 text-orange-400 animate-pulse" />
                        </div>
                        <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-100 font-mono">Aguardando Mídias</h2>
                        <p className="text-[10.5px] text-zinc-500 mt-1.5 leading-relaxed font-sans px-2">
                          Sua sala está ativa e pronta para receber conteúdos. Siga as instruções abaixo para começar.
                        </p>
                      </div>

                      <div className="space-y-4 mb-6 text-left border-y border-zinc-800/80 py-5 font-sans text-xs">
                        <h3 className="text-[9.5px] font-black text-zinc-500 uppercase tracking-wider font-mono px-1">Métodos de Envio Ativos:</h3>
                        
                        <div className="flex gap-3">
                          <span className="w-6 h-6 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono rounded-full">1</span>
                          <div className="leading-tight">
                            <h4 className="font-bold text-zinc-300">Chat da Stream (Twitch)</h4>
                            <p className="text-[10.5px] text-zinc-500 mt-0.5">Espectadores podem enviar links de vídeos diretamente no chat. O bot captura e coloca na fila.</p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <span className="w-6 h-6 bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono rounded-full">2</span>
                          <div className="leading-tight">
                            <h4 className="font-bold text-zinc-300">Convite via Link</h4>
                            <p className="text-[10.5px] text-zinc-500 mt-0.5">Copie o link abaixo para convidados externos ou para quem prefere enviar pela plataforma.</p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <span className="w-6 h-6 bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono rounded-full">3</span>
                          <div className="leading-tight">
                            <h4 className="font-bold text-zinc-300 font-sans">Gestão da Fila</h4>
                            <p className="text-[10.5px] text-zinc-500 mt-0.5">As mídias enviadas aparecerão na <strong className="text-zinc-400">coluna à esquerda</strong> para sua moderação.</p>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={copyInvite}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-widest transition-all rounded-sm shadow-lg shadow-orange-900/20 mb-6"
                      >
                        <Link2 className="w-4 h-4" />
                        Copiar Link de Convite
                      </button>

                      <div className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/5 border border-emerald-500/10 rounded-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 font-mono">
                          BOT DE CHAT CONECTADO E MONITORANDO
                        </span>
                      </div>

                      {/* Development Banner Strip */}
                      <div className="absolute bottom-0 left-0 right-0 bg-orange-500/10 border-t border-orange-500/20 py-2.5 px-4 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#e2531b] flex items-center justify-center gap-2">
                          <AlertTriangle className="w-3 h-3 animate-pulse" />
                          Ambiente de Desenvolvimento • Instabilidade Possível
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Fixed Video Metadata Panel Card (Below/Under the video player area) */}
                {currentVideo && (
                  <div className="p-3 bg-zinc-950 border-t border-[#1f1f2e] shrink-0 flex items-center justify-between text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      {renderUserAvatar(activeSender, "w-10 h-10 border border-zinc-800")}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[9px] font-black tracking-wider uppercase font-mono text-zinc-500">
                          <span>Espectador:</span>
                          <span className="text-orange-400">@{currentVideo.submitter}</span>
                          {renderTwitchBadgesHost(activeSender)}
                        </div>
                        <h4 className="text-xs font-black text-zinc-200 truncate pr-4 mt-0.5" title={currentVideo.title || "Sem título informado"}>
                          {currentVideo.title || "Mídia Sincronizada Ativa"}
                        </h4>
                        <span className="text-[10px] text-zinc-500 font-mono truncate block mt-0.5 max-w-[450px]" title={currentVideo.url}>
                          {currentVideo.url}
                        </span>
                      </div>
                    </div>
                    {/* Date/Time detail labels */}
                    {activeSender && (
                      <div className="flex flex-col items-end gap-1 shrink-0 text-right text-[10px] font-mono">
                        <span className="text-zinc-500 uppercase">Enviado em:</span>
                        <span className="text-zinc-300 font-extrabold flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded leading-none">
                          <Clock className="w-3.5 h-3.5 text-zinc-500" />
                          {(activeSender as any).horaEnvio || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* COLUMN 3: Right side detailed Participant profiling desk and Audit logs footer */}
              <aside className="w-80 shrink-0 h-full overflow-hidden flex flex-col border-l border-[#1f1f2e] bg-[#111116]">
                <div className="flex-1 min-h-0">
                  <HostUserProfile 
                    session={session} 
                    currentUser={focusUser} 
                    twitchChatters={twitchChatters}
                    onShowFeedback={showFeedback} 
                  />
                </div>
                <div className="h-[210px] border-t border-[#1f1f2e] shrink-0">
                  <HostAuditLogs 
                    session={session} 
                    onShowFeedback={showFeedback} 
                  />
                </div>
              </aside>

            </div>
          )}
        </main>
      </div>

      {/* Global alert feedback overlay bar */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={clsx(
              "fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 border rounded-sm shadow-2xl flex flex-col gap-1.5 backdrop-blur-md max-w-sm w-full mx-4 text-left font-sans select-none",
              feedbackMsg.type === 'success' && "bg-[#111116]/95 border-green-500/40 text-green-400",
              feedbackMsg.type === 'warning' && "bg-[#111116]/95 border-amber-500/40 text-amber-400",
              feedbackMsg.type === 'error' && "bg-[#111116]/95 border-red-500/40 text-red-500",
              feedbackMsg.type === 'info' && "bg-[#111116]/95 border-orange-500/40 text-orange-400"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-current" />
              <h5 className="text-[10px] uppercase font-black tracking-widest font-mono shrink-0 leading-none">{feedbackMsg.title}</h5>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-300 font-sans border-t border-zinc-800/60 pt-1.5">{feedbackMsg.desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
