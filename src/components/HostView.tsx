import { useState, useEffect, useRef } from 'react';
import { socket, getBackendUrl } from '../socket';
import { SessionState } from '../types';
import ReactPlayer from 'react-player';
import { XEmbed, LinkedInEmbed } from 'react-social-media-embed';
import { 
  MonitorPlay, ZoomIn, ZoomOut, Expand, Maximize, AlertCircle, SkipForward, SkipBack, 
  Check, X, ShieldCheck, Cast, Play, Pause, History, Crop, Video, VideoOff, 
  ExternalLink, Loader2, Users, Compass, Plus, Link2, Copy, LogOut, Layers, Heart
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';

import AdminDashboard from './AdminDashboard';
import SettingsView from './SettingsView';
import { Settings } from 'lucide-react';

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

const getPlatformLabel = (url: string) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return url.includes('/shorts') ? 'YouTube Shorts' : 'YouTube';
  }
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('twitch.tv')) return 'TwitchClips';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('facebook.com')) return 'Facebook';
  return 'Web Video';
};

const isYouTubeShort = (url: string) => {
  return url.includes('youtube.com/shorts') || url.includes('youtu.be/shorts');
};

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-[#8c92ac]', // desaturated soft slate-blue
    'bg-[#b39c82]', // desaturated soft peach-brown
    'bg-[#9c8cb3]', // desaturated soft purple
    'bg-[#8caf9b]', // desaturated soft sage green
    'bg-[#b28282]', // desaturated soft dusty rose
    'bg-[#aba682]', // desaturated soft olive
    'bg-[#8b9cb3]', // desaturated soft ocean
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
            <span key={b} className="bg-[#FF3B30] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#FF3B30]/30" title="Broadcaster (Streamer)">
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
         <p className="text-[#B0B0B0] text-xs mt-2 leading-relaxed">
            Este conteúdo requer autenticação ou possui restrição de compartilhamento externa.
         </p>
         <a 
            href={url} 
            target="_blank" 
            rel="noreferrer noopener" 
            className="mt-6 flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#222222] border border-[#2d2d2d] hover:bg-[#2c2c2c] text-[#EFEFEF] font-bold text-xs transition-all text-center cursor-pointer"
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

function CustomYouTubeShortsPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const ytId = getYouTubeId(url);

  if (!ytId) {
     return (
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center">
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
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center">
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
       <div className="flex flex-col items-center justify-center p-8 bg-[#151515] border border-[#222222] rounded-sm h-96 w-full max-w-xs text-center">
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
  const [feedbackMsg, setFeedbackMsg] = useState<{title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info'} | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9' | 'auto'>('auto');
  const [cropOverlay, setCropOverlay] = useState<boolean>(true);
  const [aspectMenuOpen, setAspectMenuOpen] = useState<boolean>(false);
  const [modMenuOpen, setModMenuOpen] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [optimisticLoading, setOptimisticLoading] = useState<boolean>(false);

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
  
  // Collapse sidebar controllers
  const [activeTab, setActiveTab] = useState<'queue' | 'submit' | 'participants' | 'history' | 'moderation' | 'settings'>('queue');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const feedbackTimeoutId = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = (title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    setFeedbackMsg({ title, desc, type });
    if (feedbackTimeoutId.current) clearTimeout(feedbackTimeoutId.current);
    feedbackTimeoutId.current = setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Directly submit video URL on host
  const [directUrl, setDirectUrl] = useState<string>('');

  const toggleWebcam = async () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
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
  const pendingVideos = session.queue.filter(v => v.status === 'pending');
  const approvedVideos = session.queue.filter(v => v.status === 'approved');

  // URL resolution effect to handle shortened links
  useEffect(() => {
    // Clear optimistic loading when video changes
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
            console.error("Erro ao resolver URL mais curta:", err);
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
      if (isInstagram(videoUrl)) {
        setAspectRatio('9:16');
        setCropOverlay(true);
      } else if (isTikTok(videoUrl)) {
        setAspectRatio('9:16');
        setCropOverlay(true);
      } else if (isYouTubeShort(videoUrl)) {
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
           socket.emit('end_video');
        } else if (e.key === 'ArrowLeft' || e.key === 'p') {
           socket.emit('play_previous');
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
  }, [session.currentVideoId]);

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

  const approve = (id: string) => socket.emit('approve_video', id);
  const reject = (id: string) => socket.emit('reject_video', id);
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

  const isInstagram = (url: string) => url.includes('instagram.com');
  const isTikTok = (url: string) => url.includes('tiktok.com');
  const isX = (url: string) => url.includes('x.com') || url.includes('twitter.com');
  const isLinkedIn = (url: string) => url.includes('linkedin.com');

  const handleDirectSubmit = () => {
    if (!directUrl.trim().startsWith('http')) return;
    socket.emit('submit_video', { url: directUrl.trim() });
    setDirectUrl('');
    // Automatically switch back to Queue tab to see it
    setActiveTab('queue');
  };

  const copyInvite = () => {
    const inviteLink = `${window.location.origin}/?room=${session.id}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectTab = (tab: 'queue' | 'submit' | 'participants' | 'history' | 'moderation' | 'settings') => {
    if (activeTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveTab(tab);
      setSidebarOpen(true);
    }
  };

  const WebcamPreview = () => {
    if (!webcamStream) return null;
    
    const isVertical = currentVideo && (isInstagram(currentVideo.url) || isTikTok(currentVideo.url) || isYouTubeShort(currentVideo.url));
    
    if (isVertical) {
      return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] h-24 md:h-28 bg-[#0D0D0D]/90 border border-[#222222] rounded-sm overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
           <video
              ref={webcamRefCallback}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
           />
           <div className="absolute bottom-1.5 right-1.5 bg-[#0D0D0D]/80 border border-[#b28282]/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-[#b28282] flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1 h-1 rounded-full bg-[#b28282] animate-pulse"></span>
              REACTION
           </div>
        </div>
      );
    }
    
    return (
      <div className="absolute top-4 left-4 w-24 h-24 md:w-28 md:h-28 bg-[#000000]/90 border border-[#2d2d2d] rounded-sm overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
         <video
            ref={webcamRefCallback}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
         />
         <div className="absolute bottom-1.5 right-1.5 bg-[#0D0D0D]/85 border border-[#8c92ac]/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-[#EFEFEF] flex items-center gap-1 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-[#8c92ac] animate-ping"></span>
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
          if (isInstagram(currentVideo.url)) return 'aspect-[9/16] h-full h-screen max-h-screen !max-h-screen w-auto !w-auto shadow-2xl transition-all duration-300';
          if (isTikTok(currentVideo.url)) return 'aspect-[9/16] h-full h-screen max-h-screen !max-h-screen w-auto !w-auto shadow-2xl transition-all duration-300';
          if (isYouTubeShort(currentVideo.url)) return 'aspect-[9/16] h-full h-screen max-h-screen !max-h-screen w-auto !w-auto shadow-2xl transition-all duration-300';
        }
        return 'aspect-video w-full max-w-[98%] xl:max-w-[98%] max-h-[86vh] md:max-h-[88vh] xl:max-h-[90vh]';
    }
  };

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden select-none">
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={clsx(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 border rounded-sm shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-sm w-full mx-4",
              feedbackMsg.type === 'success' && "bg-[#151515]/95 border-[#8caf9b]/40 text-[#8caf9b]",
              feedbackMsg.type === 'warning' && "bg-[#151515]/95 border-[#fcd34d]/45 text-[#fcd34d]",
              feedbackMsg.type === 'error' && "bg-[#151515]/95 border-[#F44336]/40 text-[#F44336]",
              feedbackMsg.type === 'info' && "bg-[#151515]/95 border-[#FF6B35]/40 text-[#FF6B35]"
            )}
          >
            <div className="flex-1 text-left">
              <h5 className="text-[10px] uppercase font-black tracking-wider leading-none font-mono opacity-80">{feedbackMsg.title}</h5>
              <p className="text-xs text-white mt-1 font-sans">{feedbackMsg.desc}</p>
            </div>
            <button 
              onClick={() => setFeedbackMsg(null)}
              className="p-1 hover:bg-white/10 rounded-sm text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* LEFT SIDEBAR DECK: Highly layout optimized & minimalist */}
      <div className="flex h-full flex-shrink-0 z-20 border-r border-[#222222] bg-[#1A1A1A]">
        {/* Nav Rail / Toolbar Icons: Always visible, only 64px (w-16) wide */}
        <div className="w-16 flex flex-col items-center py-4 justify-between bg-[#1A1A1A] h-full border-r border-[#222222]">
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="w-10 h-10 rounded bg-[#FF6B35]/15 border border-[#FF6B35]/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#FF6B35]" />
            </div>

            <div className="h-px w-8 bg-[#2d2d2d]"></div>

            {/* Main Tabs */}
            <nav className="flex flex-col items-center gap-3 w-full px-2">
              <button 
                onClick={() => selectTab('queue')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center relative transition-all cursor-pointer group",
                  activeTab === 'queue' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Página de Fila"
              >
                <Compass className="w-5 h-5" />
                {pendingVideos.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#FF8C42] rounded-full ring-2 ring-[#1A1A1A]"></span>
                )}
              </button>

              <button 
                onClick={() => selectTab('submit')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'submit' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Adicionar Vídeo"
              >
                <Plus className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('participants')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'participants' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Participantes"
              >
                <Users className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('history')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'history' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Histórico"
              >
                <History className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('moderation')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer relative group",
                  activeTab === 'moderation' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Moderação e Segurança"
              >
                <ShieldCheck className="w-5 h-5 text-[#FF8C42]" />
                {session.auditLogs?.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#F44336] rounded-full ring-2 ring-[#1A1A1A]"></span>
                )}
              </button>

              <button 
                onClick={() => selectTab('settings')}
                className={clsx(
                  "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'settings' && sidebarOpen 
                    ? "bg-[#FF6B35] text-white" 
                    : "text-[#B0B0B0] hover:text-white hover:bg-[#222222]"
                )}
                title="Configurações"
              >
                <Settings className="w-5 h-5" />
              </button>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
            {/* End session or Invite Info */}
            <button 
              onClick={copyInvite}
              className={clsx(
                "w-11 h-11 rounded flex items-center justify-center transition-all cursor-pointer relative border",
                copied 
                  ? "bg-[#4CAF50]/20 text-[#4CAF50] border-[#4CAF50]/30" 
                  : "text-[#B0B0B0] border-[#222222] hover:text-white hover:bg-[#222222]"
              )}
              title="Copiar Link de Convite"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => {
                const activeRoomId = localStorage.getItem('active_room_id');
                socket.emit('end_session', { roomId: activeRoomId || undefined });
                localStorage.removeItem('active_room_id');
                localStorage.removeItem('active_role');
                localStorage.removeItem('active_session_payload');
              }} 
              className="w-11 h-11 rounded-sm flex items-center justify-center text-[#F44336] bg-[#F44336]/10 hover:text-white hover:bg-[#F44336] transition-all cursor-pointer animate-fade-in"
              title="Encerrar Sessão"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Panel Container: 256px layout (w-64) */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full overflow-hidden flex flex-col bg-[#1A1A1A] border-r border-[#222222]"
            >
              <div className="w-64 flex flex-col h-full">
                
                {/* Panel Header */}
                <div className="p-4 border-b border-[#222222] flex items-center justify-between bg-[#1D1D1D]">
                  {activeTab === 'queue' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Fila de Vídeos</span>}
                  {activeTab === 'submit' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Adicionar Vídeo</span>}
                  {activeTab === 'participants' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Participantes</span>}
                  {activeTab === 'history' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Histórico</span>}
                  {activeTab === 'moderation' && <span className="text-xs font-black uppercase tracking-wider text-[#FF6B35] font-mono">Painel de Moderação</span>}
                  {activeTab === 'settings' && <span className="text-xs font-black uppercase tracking-wider text-[#FF6B35] font-mono">Configurações</span>}
                  
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 px-2 text-[#B0B0B0] hover:text-white hover:bg-[#222222] rounded transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5">

                  {/* ACTIVE TAB: QUEUE (Approved / Pending) */}
                  {activeTab === 'queue' && (
                    <div className="space-y-4">
                      {/* Room Code Badge */}
                      <div className="bg-[#222222] p-3 rounded border border-[#2d2d2d] flex items-center justify-between font-mono">
                        <span className="text-[10px] uppercase font-bold text-[#B0B0B0]">CÓDIGO SALA:</span>
                        <span className="text-sm font-extrabold tracking-widest text-[#FF6B35]">{session.id}</span>
                      </div>

                      {/* Pending approvals */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#FF8C42] uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-[#FF8C42] animate-pulse rounded-sm"></span>
                          Pendentes de aprovação ({pendingVideos.length})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {pendingVideos.map(video => {
                            const sender = session.users.find(u => u.name === video.submitter || u.userId === video.submitterId);
                            return (
                              <div key={video.id} className="bg-[#222222] border border-[#2c2c2c] p-2.5 rounded text-left">
                                <p className="text-xs text-[#FFFFFF] truncate font-mono mb-2">{video.url}</p>
                                <div className="flex items-center justify-between gap-2 border-t border-[#2c2c2c]/50 pt-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {renderUserAvatar(sender, "w-4 h-4")}
                                    <span 
                                      className="text-[10.5px] font-bold truncate"
                                      style={{ color: sender?.twitchData?.color || '#FF8C42' }}
                                    >
                                      @{video.submitter}
                                    </span>
                                    {renderTwitchBadgesHost(sender)}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => approve(video.id)} className="p-1 bg-[#4CAF50]/10 hover:bg-[#4CAF50]/30 text-[#4CAF50] rounded cursor-pointer border border-[#4CAF50]/20" title="Aprovar">
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => reject(video.id)} className="p-1 bg-[#F44336]/10 hover:bg-[#F44336]/30 text-[#F44336] rounded cursor-pointer border border-[#F44336]/20" title="Rejeitar">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {pendingVideos.length === 0 && (
                            <p className="text-[11px] text-[#505050] italic py-2">Nenhum vídeo pendente</p>
                          )}
                        </div>
                      </div>

                      {/* Approved items */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#B0B0B0] uppercase tracking-wider">
                          Fila Ativa ({approvedVideos.length})
                        </h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {approvedVideos.map((vid, idx) => {
                            const isCurrent = session.currentVideoId === vid.id;
                            const sender = session.users.find(u => u.name === vid.submitter || u.userId === vid.submitterId);
                            return (
                              <div 
                                key={vid.id} 
                                className={clsx(
                                  "border p-2.5 rounded group transition-all text-left relative overflow-hidden",
                                  isCurrent 
                                    ? "bg-[#1A1A1A] border-[#FF6B35]/40" 
                                    : "bg-[#222222] border-[#2c2c2c] hover:border-[#FF8C42]/30"
                                )}
                              >
                                {isCurrent && (
                                  <div className="absolute top-0 left-0 w-1 h-full bg-[#FF6B35]"></div>
                                )}
                                <div className="flex justify-between items-center gap-2 mb-1.5 min-w-0">
                                  <span className="text-[9px] font-bold font-mono text-[#FF8C42]">Nº {idx + 1}</span>
                                  <span className="text-[9px] bg-[#121212]/80 px-1 py-0.5 rounded text-[#B0B0B0] font-mono leading-none">{getPlatformLabel(vid.url)}</span>
                                </div>
                                <p className={clsx("text-xs truncate font-mono mb-1.5", isCurrent ? "text-white font-bold" : "text-[#B0B0B0]")}>{vid.url}</p>
                                <div className="flex justify-between items-center gap-2 border-t border-[#2c2c2c]/40 pt-1.5 mt-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {renderUserAvatar(sender, "w-4 h-4")}
                                    <span 
                                      className="text-[10.5px] font-bold truncate"
                                      style={{ color: sender?.twitchData?.color || '#FFFFFF' }}
                                    >
                                      @{vid.submitter}
                                    </span>
                                    {renderTwitchBadgesHost(sender)}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    {!isCurrent && (
                                      <button onClick={() => playVideo(vid.id)} className="p-1 hover:bg-[#1A1A1A] text-[#4CAF50] rounded cursor-pointer border border-[#2c2c2c]" title="Tocar Agora">
                                        <Play className="w-3 h-3 fill-current" />
                                      </button>
                                    )}
                                    <button onClick={() => reject(vid.id)} className="p-1 hover:bg-[#1A1A1A] text-[#F44336] rounded cursor-pointer border border-[#2c2c2c]" title="Remover">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {approvedVideos.length === 0 && (
                            <p className="text-[11px] text-[#505050] italic py-3">Nenhum vídeo aprovado na fila</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: DIRECT SUBMISSION FOR HOST */}
                  {activeTab === 'submit' && (
                    <div className="space-y-3.5 text-left">
                      <div className="text-[11px] text-[#B0B0B0]">
                        Envie links de vídeo do YouTube, Reels do Instagram, TikTok ou links diretos.
                      </div>
                      <div className="space-y-3">
                        <input 
                          type="text" 
                          value={directUrl}
                          onChange={e => setDirectUrl(e.target.value)}
                          placeholder="https://youtube.com/watch?..."
                          className="w-full bg-[#121212] border border-[#2c2c2c] rounded px-3 py-2.5 text-xs text-white placeholder-[#505050] focus:outline-none focus:border-[#FF6B35] font-medium"
                        />
                        <button 
                          onClick={handleDirectSubmit}
                          disabled={!directUrl.trim().startsWith('http')}
                          className="w-full bg-[#FF6B35] hover:bg-[#e2531b] disabled:bg-[#222222] disabled:text-[#505050] text-white font-bold py-2.5 rounded text-xs transition-colors cursor-pointer"
                        >
                          Adicionar à Fila
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: PARTICIPANTS */}
                  {activeTab === 'participants' && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-[10px] font-bold text-[#B0B0B0] uppercase tracking-wider block">
                        Usuários conectados ({session.users.length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {session.users.map(u => {
                          return (
                            <div key={u.id} className="flex items-center gap-2.5 bg-[#222222] p-2 rounded border border-[#2c2c2c] text-left">
                              {renderUserAvatar(u, "w-7 h-7")}
                              <div className="flex-1 min-w-0">
                                <span 
                                  className="text-xs font-bold block truncate"
                                  style={{ color: u.twitchData?.color || '#FFFFFF' }}
                                >
                                  @{u.name}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {renderTwitchBadgesHost(u)}
                                  <span className="text-[8px] text-[#B0B0B0] font-mono leading-none block uppercase">
                                    {u.isHost ? 'BROADCASTER' : 'ESPECTADOR'}
                                  </span>
                                </div>
                              </div>
                              {u.isHost && (
                                <div className="w-1.5 h-1.5 rounded-sm bg-[#4CAF50] shrink-0"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: HISTORIC WATCHED */}
                  {activeTab === 'history' && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-[10px] font-bold text-[#B0B0B0] uppercase tracking-wider block">
                        Histórico de reprodução ({session.history.length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {session.history.map(vid => {
                          const sender = session.users.find(u => u.name === vid.submitter || u.userId === vid.submitterId);
                          return (
                            <div key={vid.id} onClick={() => playVideo(vid.id)} className="bg-[#222222] border border-[#2c2c2c] p-2.5 rounded cursor-pointer hover:bg-[#2c2c2c] transition-colors text-left group">
                              <p className="text-xs text-[#B0B0B0] truncate font-mono line-through decoration-[#505050] group-hover:no-underline">{vid.url}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[#2c2c2c]/40">
                                {renderUserAvatar(sender, "w-4 h-4")}
                                <span className="text-[9.5px] text-[#B0B0B0] font-mono truncate">@{vid.submitter}</span>
                              </div>
                            </div>
                          );
                        })}
                        {session.history.length === 0 && (
                          <p className="text-[11px] text-[#505050] italic py-2">Nenhum histórico disponível</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: LOGS, SETTINGS & AUDIT MODERATION */}
                  {activeTab === 'settings' && (
                    <div className="space-y-4 text-center">
                       <p className="text-sm text-[#B0B0B0] max-w-sm mt-8">O painel de configurações principais está aberto no centro da tela.</p>
                    </div>
                  )}

                  {activeTab === 'moderation' && (
                    <div className="space-y-4">
                      {/* Section 2: Active User Control */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-[#B0B0B0] uppercase tracking-wider block font-mono">Controle de Público</span>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {session.users.filter(u => u.id !== socket.id).map(user => (
                            <div key={user.id} className="bg-[#151515] border border-[#222222] p-2.5 rounded-sm text-left space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#EFEFEF] truncate">@{user.name}</span>
                                <span className="text-[9px] font-bold font-mono text-[#b28282] uppercase">
                                  {user.strikes || 0}/5 strikes
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-1 mt-1">
                                <button 
                                  onClick={() => { socket.emit('toggle_whitelist', user.id); showFeedback('VIP Atualizado', `Status VIP de @${user.name} alterado.`, 'success'); }}
                                  className={clsx(
                                    "px-1.5 py-1 rounded-sm text-[9px] font-mono font-bold border transition-colors cursor-pointer",
                                    user.isWhitelisted 
                                      ? "bg-[#8caf9b]/15 text-[#8caf9b] border-[#8caf9b]/35" 
                                      : "bg-[#1f1f1f] text-[#B0B0B0] border-[#222222]/80 hover:text-[#EFEFEF]"
                                  )}
                                >
                                  {user.isWhitelisted ? 'VIP ON' : 'VIP OFF'}
                                </button>
                                <button 
                                  onClick={() => { socket.emit('give_strike', { userId: user.id }); showFeedback('Strike Aplicado', `Adicionado 1 strike para @${user.name}`); }}
                                  className="px-1.5 py-1 bg-[#fcd34d]/10 hover:bg-[#fcd34d]/20 border border-[#fcd34d]/30 text-[#fcd34d] rounded-sm text-[9px] font-mono font-bold cursor-pointer transition-colors"
                                >
                                  +1 Strike
                                </button>
                                <button 
                                  onClick={() => { socket.emit('ban_user', { userId: user.id }); showFeedback('Usuário Banido', `@${user.name} foi removido.`); }}
                                  className="px-1.5 py-1 bg-[#F44336]/10 hover:bg-[#F44336]/20 border border-[#F44336]/30 text-[#F44336] rounded-sm text-[9px] font-mono font-bold cursor-pointer transition-colors"
                                >
                                  Banir
                                </button>
                              </div>
                            </div>
                          ))}
                          {session.users.filter(u => u.id !== socket.id).length === 0 && (
                            <p className="text-[11px] text-[#505050] italic text-left">Nenhum espectador na sala</p>
                          )}
                        </div>
                      </div>

                      {/* Section 3: Audit System Terminal */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-0.5">
                          <span className="text-[10px] font-bold text-[#b28282] uppercase tracking-wider font-mono">Eventos Compartilhados</span>
                          <button 
                            onClick={() => socket.emit('clear_audit_logs')}
                            className="text-[9px] text-[#B0B0B0] hover:text-[#FFFFFF] underline cursor-pointer"
                          >
                            Limpar
                          </button>
                        </div>
                        <div className="bg-[#0D0D0D] border border-[#222222] p-2 rounded-sm text-left font-mono text-[8.5px] overflow-y-auto max-h-40 space-y-1.5">
                          {session.auditLogs?.slice().reverse().map(log => {
                            const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const severityCol = log.severity === 'high' ? 'text-[#b28282] font-bold' : log.severity === 'medium' ? 'text-[#e0a670]' : 'text-[#8caf9b]';
                            return (
                              <div key={log.id} className="border-b border-[#222222]/40 pb-1 last:border-0 leading-relaxed">
                                <span className="text-[#505050] mr-1">{timeStr}</span>
                                <span className={clsx("uppercase", severityCol)}>[{log.type}]</span>{' '}
                                <span className="text-[#EFEFEF]">{log.message}</span>
                              </div>
                            );
                          })}
                          {(!session.auditLogs || session.auditLogs.length === 0) && (
                            <p className="text-[#505050] italic font-mono">Sem logs cadastrados.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CENTER WORKSPACE: Extremely spacious visual video area */}
      <main className="flex-1 relative bg-[#0A0A0A] flex flex-col items-center justify-center overflow-hidden z-10" ref={containerRef}>
        
        {activeTab === 'moderation' ? (
          <AdminDashboard session={session} />
        ) : activeTab === 'settings' ? (
          <SettingsView session={session} />
        ) : (
          <>
            {/* Dynamic Citation / Title Banner Overlay (Bottom-left of central video canvas) */}
            {(() => {
              if (!currentVideo) return null;
              const sender = session.users.find(u => u.name === currentVideo.submitter || u.userId === currentVideo.submitterId);
              return (
                <div 
                  className={clsx(
                    "absolute bottom-5 left-5 z-40 hidden md:flex items-stretch gap-0 bg-[#1A1A1A]/95 rounded border border-[#222222] shadow-2xl transition-all duration-300",
                    modMenuOpen ? "max-w-md" : "max-w-sm"
                  )}
                  onMouseEnter={() => setModMenuOpen(true)}
                  onMouseLeave={() => setModMenuOpen(false)}
                >
                  <div className="flex items-center gap-3 px-4 py-3 min-w-0">
                    {renderUserAvatar(sender, "w-10 h-10")}
                    <div className="flex-1 min-w-0 text-left">
                      <span className="text-[9px] font-bold text-[#FF8C42] uppercase tracking-wider font-mono block">Enviado por:</span>
                      <div className="flex items-center gap-1.5 truncate mt-0.5">
                        <span 
                          className="text-sm font-black block truncate"
                          style={{ color: sender?.twitchData?.color || '#FFFFFF' }}
                        >
                          @{currentVideo.submitter}
                        </span>
                        {renderTwitchBadgesHost(sender)}
                      </div>
                      <span className="text-[9px] text-[#B0B0B0] truncate block font-mono mt-0.5">{currentVideo.url}</span>
                    </div>
                  </div>

                  <AnimatePresence>
                    {modMenuOpen && sender && !sender.isHost && (
                      <motion.div 
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center border-l border-[#2c2c2c] bg-[#151515] overflow-hidden rounded-r"
                      >
                        <div className="flex flex-col h-full w-20">
                          <button 
                            title="10 Min Timeout"
                            onClick={(e) => { e.stopPropagation(); socket.emit('timeout_user', { userId: sender.id, minutes: 10 }); showFeedback('Timeout Aplicado', `@${sender.name} silenciado por 10 min`, 'warning'); }}
                            className="flex-1 px-1 text-[9px] font-bold font-mono text-[#fcd34d] hover:bg-[#fcd34d]/20 hover:text-white transition-colors border-b border-[#2c2c2c] cursor-pointer"
                          >
                            TIMEOUT
                          </button>
                          <button 
                            title="+1 Strike"
                            onClick={(e) => { e.stopPropagation(); socket.emit('give_strike', { userId: sender.id }); showFeedback('Strike Aplicado', `@${sender.name} recebeu +1 strike`, 'warning'); }}
                            className="flex-1 px-1 text-[9px] font-bold font-mono text-[#FF8C42] hover:bg-[#FF8C42]/20 hover:text-white transition-colors border-b border-[#2c2c2c] cursor-pointer"
                          >
                            STRIKE
                          </button>
                          <button 
                            title="Banir"
                            onClick={(e) => { e.stopPropagation(); socket.emit('ban_user', { userId: sender.id }); showFeedback('Usuário Banido', `@${sender.name} banido da sala`, 'error'); }}
                            className="flex-1 px-1 text-[9px] font-bold font-mono text-[#F44336] hover:bg-[#F44336]/20 hover:text-white transition-colors cursor-pointer"
                          >
                            BANIR
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })()}

        {/* REELS STYLE RIGHT DOCK: Floating vertical widget control actions */}
        {currentVideo && (
          <div className="absolute right-5 bottom-12 z-40 flex flex-col items-center gap-3.5 bg-[#0D0D0D]/40 p-2 rounded-sm border border-[#222222]/40">
            {/* Previous */}
            <button 
              onClick={() => playPrevious()} 
              disabled={optimisticLoading}
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] disabled:opacity-50 disabled:cursor-wait flex items-center justify-center transition-all cursor-pointer shadow-sm group"
              title="Anterior"
            >
              <SkipBack className="w-4 h-4 text-[#EFEFEF]" />
            </button>

            {/* Next / skip */}
            <button 
              onClick={() => playNext()} 
              disabled={optimisticLoading}
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] disabled:opacity-50 disabled:cursor-wait flex items-center justify-center transition-all cursor-pointer shadow-sm group"
              title="Próximo"
            >
              <SkipForward className="w-4 h-4 text-[#EFEFEF]" />
            </button>

            {/* Quick access shortcut to open actual video url */}
            <button 
              onClick={() => {
                const videoUrl = resolvedUrl || currentVideo?.url;
                if (videoUrl) {
                  window.open(videoUrl, '_blank', 'noopener,noreferrer');
                }
              }}
              disabled={!(resolvedUrl || currentVideo?.url)}
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shadow-sm group"
              title="Acessar Link do Vídeo (Abre em outra aba)"
            >
              <ExternalLink className="w-4 h-4 text-[#EFEFEF] group-hover:text-[#FF6B35]" />
            </button>

            <div className="h-px w-6 bg-[#1f1f1f]"></div>

            {/* Zoom controls */}
            <button 
              onClick={() => setZoom(z => Math.min(z + 0.1, 2))} 
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-[#EFEFEF]" />
            </button>

            <span className="text-[10px] font-semibold text-[#B0B0B0] font-mono select-none">
              {Math.round(zoom * 100)}%
            </span>

            <button 
              onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} 
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-[#EFEFEF]" />
            </button>

            <button 
              onClick={() => setZoom(1)} 
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Ajustar"
            >
              <Expand className="w-4 h-4 text-[#EFEFEF]" />
            </button>

            <div className="h-px w-6 bg-[#1f1f1f]"></div>

            {/* Hardware Web connection / Webcam and fullscreen */}
            <button 
              onClick={toggleWebcam} 
              className={clsx(
                "w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-sm",
                webcamStream 
                  ? "bg-[#b28282]/20 border-[#b28282] text-[#b28282] animate-pulse" 
                  : "bg-[#1A1A1A]/90 border-[#222222] text-[#EFEFEF] hover:bg-[#222222]"
              )}
              title="Ativar Webcam"
            >
              {webcamStream ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>

            
            {/* Proporção Button (Expandable overlay) */}
            
            {/* Controles de Proporção expansíveis de alta qualidade */}
            <div className="relative flex items-center">
              <AnimatePresence>
                {aspectMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ originX: 1, originY: 0.5 }}
                    className="absolute right-12 z-55 flex items-center gap-2 px-3.5 py-2 bg-[#0D0D0D]/95 backdrop-blur-md border border-[#222222] rounded-sm shadow-2xl whitespace-nowrap"
                  >
                    <span className="text-[#B0B0B0] font-bold text-[9px] uppercase tracking-wider font-mono mr-1 select-none">Aspecto:</span>
                    {(['auto', '9:16', '4:5', '1:1', '16:9'] as const).map(ratio => (
                      <button
                        key={ratio}
                        onClick={() => {
                          setAspectRatio(ratio);
                        }}
                        className={clsx(
                          "px-2 py-0.5 rounded-sm text-[9px] uppercase tracking-widest font-mono font-semibold transition-all cursor-pointer",
                          aspectRatio === ratio
                            ? "bg-[#FF6B35] text-[#FFFFFF]"
                            : "bg-[#151515] text-[#B0B0B0] hover:text-[#FFFFFF] hover:bg-[#222222]"
                        )}
                      >
                        {ratio}
                      </button>
                    ))}
                    <span className="h-3 w-px bg-[#2d2d2d] mx-1"></span>
                    <button
                      onClick={() => setCropOverlay(!cropOverlay)}
                      className={clsx(
                        "flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-[9px] tracking-wider uppercase font-mono transition-all cursor-pointer border border-[#222222]",
                        cropOverlay
                          ? "bg-[#8caf9b]/15 text-[#8caf9b] border-[#8caf9b]/35"
                          : "bg-[#151515] text-[#B0B0B0] hover:text-[#FFFFFF]"
                      )}
                    >
                      <Crop className="w-3 h-3" />
                      <span>{cropOverlay ? "Limpo" : "Suporte"}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={() => setAspectMenuOpen(prev => !prev)}
                className={clsx(
                  "w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-sm",
                  aspectMenuOpen
                    ? "bg-[#FF6B35]/25 border-[#FF6B35]/80 text-[#918bf2] shadow-[0_0_12px_rgba(124,115,230,0.15)]"
                    : "bg-[#1A1A1A]/90 border-[#222222] text-[#EFEFEF] hover:bg-[#222222]"
                )}
                title="Proporção e Crop (Suporte)"
              >
                <Layers className="w-4 h-4" />
              </button>
            </div>


            <button 
              onClick={toggleFullscreen} 
              className="w-10 h-10 rounded-full bg-[#1A1A1A]/90 border border-[#222222] text-[#EFEFEF] hover:bg-[#222222] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Tela Inteira"
            >
              <Maximize className="w-4 h-4 text-[#EFEFEF]" />
            </button>
          </div>
        )}

        

        {/* CANVAS: Scalable Active Frame */}
        <div 
          className="relative w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ease-out"
          style={{ transform: `scale(${zoom})` }}
        >
          {optimisticLoading && (
            <div className={clsx("relative w-full max-h-[80vh] h-full bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center border border-[#1f1f1f]/80 shadow-2xl animate-pulse aspect-video max-w-4xl rounded-sm")}>
                <Loader2 className="w-10 h-10 text-[#FF6B35] animate-spin mb-4" />
                <span className="text-[#EFEFEF] font-bold text-sm tracking-wide font-sans">Afinando transmissores...</span>
                <span className="text-[#505050] text-[10px] mt-2 block">Preparando o próximo vídeo da fila</span>
            </div>
          )}

          {!optimisticLoading && currentVideo ? (
             <div className={clsx("relative w-full max-h-screen bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center", isFullscreen ? 'h-screen w-screen' : 'w-full px-2 md:px-3 lg:px-4')}>
                {/* Loader when resolving links */}
                {resolving && (
                   <div className="absolute inset-0 bg-[#0A0A0A]/90 backdrop-blur-md z-45 flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin mb-3" />
                      <p className="text-xs font-semibold tracking-wider text-[#EFEFEF] font-mono uppercase">Decodificando player em 9:16...</p>
                   </div>
                )}

                {/* Selective Video Engines */}
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
                 ) : isX(resolvedUrl) ? (
                   <div className="relative w-full max-w-[540px] h-full max-h-[82vh] bg-[#151515] rounded-sm overflow-hidden border border-[#222222]/80 pointer-events-auto flex items-center justify-center p-4 shadow-2xl">
                      <WebcamPreview />
                      <div className="w-full h-full overflow-y-auto overflow-x-hidden">
                         <XEmbed url={resolvedUrl} width="100%" />
                      </div>
                   </div>
                ) : isLinkedIn(resolvedUrl) ? (
                   <div className="relative w-full max-w-[540px] h-full max-h-[82vh] bg-[#151515] rounded-sm overflow-hidden border border-[#222222]/80 pointer-events-auto flex items-center justify-center p-4 shadow-2xl">
                      <WebcamPreview />
                      <div className="w-full h-full overflow-y-auto overflow-x-hidden">
                         <LinkedInEmbed url={resolvedUrl} width="100%" />
                      </div>
                   </div>
                ) : (
                    <div className={clsx("relative bg-black rounded-sm overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1f1f1f]/80 shadow-2xl", getRatioClass())}>
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
             <div className="flex flex-col items-stretch text-center p-8 bg-[#16161c] border border-[#22222d] max-w-sm mx-4 select-none rounded-none shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#FF6B35] via-[#9146FF] to-[#10B981]" />
                
                <div className="flex flex-col items-center mb-6">
                  <div className="p-3 bg-[#FF6B35]/10 border border-[#FF6B35]/25 mb-4 rounded-none">
                    <Cast className="w-8 h-8 text-[#FF6B35]" />
                  </div>
                  <h2 className="text-md font-extrabold uppercase tracking-widest text-[#FFFFFF] font-sans">Sala ociosa</h2>
                  <p className="text-[11px] text-[#B0B0B0] mt-1.5 leading-relaxed max-w-xs font-sans">Sua sala de mídia está ativa e pronta para reproduzir transmissões.</p>
                </div>

                {/* Paso a paso onboarding visual */}
                <div className="space-y-4 mb-6 text-left border-y border-[#20202b]/70 py-4">
                  <h3 className="text-[9px] font-black text-[#8c92ac] uppercase tracking-widest font-mono">Guia de Uso Rápido:</h3>
                  
                  <div className="flex gap-3">
                    <span className="w-5 h-5 bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">1</span>
                    <div className="leading-tight">
                      <h4 className="text-[11px] font-extrabold text-slate-200 font-sans">Envie o Link de Convite</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-sans">Copie o link abaixo e compartilhe com seu chat ou moderadores.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-5 h-5 bg-[#9146FF]/20 text-[#9146FF] border border-[#9146FF]/30 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">2</span>
                    <div className="leading-tight">
                      <h4 className="text-[11px] font-extrabold text-slate-200 font-sans font-sans">Público Envia Vídeos</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-sans">Seus viewers escolhem vídeos do YouTube, Instagram, TikTok e Twitch.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-5 h-5 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">3</span>
                    <div className="leading-tight">
                      <h4 className="text-[11px] font-extrabold text-slate-200 font-sans font-sans">Gerencie na Esquerda</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-sans">Use a barra lateral esquerda para aceitar mídias e controlar a fila.</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2.5 bg-[#0D0D12] p-3 border border-[#20202d] text-xs">
                  <div className="flex items-center justify-between text-left">
                    <div className="min-w-0 pr-3">
                      <span className="text-[#8c92ac] uppercase font-bold tracking-widest text-[8px] font-mono block">CÓDIGO DE ACESSO</span>
                      <span className="text-[#10B981] font-black text-sm tracking-wider font-mono mt-0.5 block">{session.id}</span>
                    </div>
                    <button 
                      onClick={copyInvite} 
                      className="px-3 py-1.5 bg-[#1F1F2A] hover:bg-[#282836] hover:text-white border border-[#2d2d3e] text-slate-300 font-bold font-mono text-[9px] uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      {copied ? "COPIADO!" : "COPIAR LINK"}
                    </button>
                  </div>
                </div>
             </div>
          ) : null}
        </div>
        </>
        )}
      </main>
    </div>
  );
}
