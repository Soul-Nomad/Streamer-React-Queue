import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
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

import AdminDashboard from './AdminDashboard';

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

    fetch(`/api/instagram-stream?url=${encodeURIComponent(targetUrl)}`)
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
      <div className="flex flex-col items-center justify-center p-8 bg-[#161a22] border border-[#222735] rounded-3xl h-96 w-full max-w-xs text-center">
         <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
         <span className="text-[#a0aec0] font-semibold text-sm">Link do Instagram inválido</span>
         <span className="text-[#64748b] text-xs mt-1">Insira um link de post ou Reel público.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-[#1b1f2b]/80 p-8 text-center", getRatioClass())}>
         <WebcamPreview />
         <Loader2 className="w-10 h-10 text-[#7c73e6] animate-spin mb-4" />
         <span className="text-[#cbd5e1] font-bold text-sm tracking-wide font-sans">Processando Reel do Instagram</span>
         <span className="text-[#47526d] text-xs mt-1 font-mono">Bypass de iframe...</span>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-[#1b1f2b]/80 p-6 text-center", getRatioClass())}>
         <WebcamPreview />
         <AlertCircle className="w-10 h-10 text-[#e0a670] mb-3" />
         <span className="text-[#cbd5e1] font-bold text-sm">Restrição do Instagram Ativa</span>
         <p className="text-[#828ba0] text-xs mt-2 leading-relaxed">
            Este conteúdo requer autenticação ou possui restrição de compartilhamento externa.
         </p>
         <a 
            href={url} 
            target="_blank" 
            rel="noreferrer noopener" 
            className="mt-6 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#222735] border border-[#2d3345] hover:bg-[#2c3245] text-[#cbd5e1] font-bold text-xs transition-all text-center cursor-pointer"
         >
            <ExternalLink className="w-3.5 h-3.5" />
            Visualizar no Instagram
         </a>
      </div>
    );
  }

  return (
    <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1b1f2b]/80 select-none shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
          <video
             src={`/api/proxy-video?url=${encodeURIComponent(videoUrl)}`}
             className="w-full h-full max-h-[92vh] md:max-h-[94vh] xl:max-h-[95vh] rounded-xl bg-[#06070a] object-contain z-10"
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
       <div className="flex flex-col items-center justify-center p-8 bg-[#161a22] border border-[#222735] rounded-3xl h-96 w-full max-w-xs text-center">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#a0aec0] font-semibold text-sm">Link do YouTube Shorts inválido</span>
       </div>
     );
  }

  const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`;

  return (
    <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1b1f2b]/80 shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
          <iframe
             src={embedUrl}
             className="w-full h-full min-h-[480px] md:min-h-[560px] xl:min-h-[88vh] border-0 rounded-xl bg-[#06070a]"
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
       <div className="flex flex-col items-center justify-center p-8 bg-[#161a22] border border-[#222735] rounded-3xl h-96 w-full max-w-xs text-center">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#a0aec0] font-semibold text-sm">Link do YouTube inválido</span>
       </div>
     );
  }

  const embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`;

  return (
    <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1b1f2b]/80 shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
          <iframe
             src={embedUrl}
             className="w-full h-full min-h-[480px] md:min-h-[560px] xl:min-h-[88vh] border-0 rounded-xl bg-[#06070a] aspect-video"
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
       <div className="flex flex-col items-center justify-center p-8 bg-[#161a22] border border-[#222735] rounded-3xl h-96 w-full max-w-xs text-center">
          <AlertCircle className="w-8 h-8 text-[#e0a670] mb-2" />
          <span className="text-[#a0aec0] font-semibold text-sm">Link do TikTok inválido</span>
          <span className="text-[#64748b] text-xs mt-1">Certifique-se de que é um link público de vídeo.</span>
       </div>
     );
  }

  const embedUrl = `https://www.tiktok.com/embed/v2/${tiktokId}`;

  return (
    <div className={clsx("relative w-full bg-[#06070a] rounded-2xl overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1b1f2b]/80 shadow-2xl", getRatioClass())}>
       <WebcamPreview />
       <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
          <iframe
             src={embedUrl}
             className="w-full h-full min-h-[480px] md:min-h-[560px] xl:min-h-[88vh] border-0 rounded-xl bg-[#06070a]"
             scrolling="no"
             allowFullScreen
             allow="autoplay; encrypted-media; picture-in-picture"
          ></iframe>
       </div>
    </div>
  );
}

export default function HostView({ session }: { session: SessionState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9' | 'auto'>('auto');
  const [cropOverlay, setCropOverlay] = useState<boolean>(true);
  const [aspectMenuOpen, setAspectMenuOpen] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Collapse sidebar controllers
  const [activeTab, setActiveTab] = useState<'queue' | 'submit' | 'participants' | 'history' | 'moderation'>('queue');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

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
        fetch(`/api/resolve?url=${encodeURIComponent(currentVideo.url)}`)
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
  const playNext = () => socket.emit('end_video');
  const playPrevious = () => socket.emit('play_previous');
  const playVideo = (id: string) => socket.emit('play_video', id);

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

  const selectTab = (tab: 'queue' | 'submit' | 'participants' | 'history' | 'moderation') => {
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
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] h-24 md:h-28 bg-[#0c0e12]/90 border border-[#222735] rounded-xl overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
           <video
              ref={webcamRefCallback}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
           />
           <div className="absolute bottom-1.5 right-1.5 bg-[#0c0e12]/80 border border-[#b28282]/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-[#b28282] flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1 h-1 rounded-full bg-[#b28282] animate-pulse"></span>
              REACTION
           </div>
        </div>
      );
    }
    
    return (
      <div className="absolute top-4 left-4 w-24 h-24 md:w-28 md:h-28 bg-[#000000]/90 border border-[#2d3345] rounded-xl overflow-hidden z-30 shadow-none pointer-events-none transition-all duration-300">
         <video
            ref={webcamRefCallback}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
         />
         <div className="absolute bottom-1.5 right-1.5 bg-[#0c0e12]/85 border border-[#8c92ac]/30 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-extrabold text-[#cbd5e1] flex items-center gap-1 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-[#8c92ac] animate-ping"></span>
            HOST
         </div>
      </div>
    );
  };

  const getRatioClass = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] w-full max-w-[560px] md:max-w-[620px] xl:max-w-[660px] max-h-[94vh] md:max-h-[96vh] xl:max-h-[97vh]';
      case '4:5':
        return 'aspect-[4/5] w-full max-w-[620px] md:max-w-[660px] xl:max-w-[700px] max-h-[80vh] md:max-h-[84vh] xl:max-h-[88vh]';
      case '1:1':
        return 'aspect-square w-full max-w-[720px] md:max-w-[760px] xl:max-w-[800px] max-h-[76vh] md:max-h-[80vh] xl:max-h-[84vh]';
      case '16:9':
        return 'aspect-video w-full max-w-[98%] xl:max-w-[98%] max-h-[86vh] md:max-h-[88vh] xl:max-h-[90vh]';
      case 'auto':
      default:
        if (currentVideo) {
          if (isInstagram(currentVideo.url)) return 'aspect-[9/16] w-full max-w-[560px] md:max-w-[620px] xl:max-w-[660px] max-h-[94vh] md:max-h-[96vh] xl:max-h-[97vh]';
          if (isTikTok(currentVideo.url)) return 'aspect-[9/16] w-full max-w-[560px] md:max-w-[620px] xl:max-w-[660px] max-h-[94vh] md:max-h-[96vh] xl:max-h-[97vh]';
          if (isYouTubeShort(currentVideo.url)) return 'aspect-[9/16] w-full max-w-[560px] md:max-w-[620px] xl:max-w-[660px] max-h-[94vh] md:max-h-[96vh] xl:max-h-[97vh]';
        }
        return 'aspect-video w-full max-w-[98%] xl:max-w-[98%] max-h-[86vh] md:max-h-[88vh] xl:max-h-[90vh]';
    }
  };

  return (
    <div className="flex h-screen bg-[#0c0e12] text-[#e2e8f0] font-sans overflow-hidden select-none">
      
      {/* LEFT SIDEBAR DECK: Highly layout optimized & minimalist */}
      <div className="flex h-full flex-shrink-0 z-20 border-r border-[#1b1f2b] bg-[#11141c]">
        {/* Nav Rail / Toolbar Icons: Always visible, only 64px (w-16) wide */}
        <div className="w-16 flex flex-col items-center py-4 justify-between bg-[#11141c] h-full border-r border-[#1b1f2b]/60">
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="w-10 h-10 rounded-xl bg-[#222735] border border-[#2d3345] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#9c8cb3]" />
            </div>

            <div className="h-px w-8 bg-[#1f2430]"></div>

            {/* Main Tabs */}
            <nav className="flex flex-col items-center gap-3 w-full px-2">
              <button 
                onClick={() => selectTab('queue')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center relative transition-all cursor-pointer group",
                  activeTab === 'queue' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Página de Fila"
              >
                <Compass className="w-5 h-5" />
                {pendingVideos.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#e0a670] rounded-full ring-2 ring-[#11141c]"></span>
                )}
              </button>

              <button 
                onClick={() => selectTab('submit')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'submit' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Adicionar Vídeo"
              >
                <Plus className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('participants')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'participants' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Participantes"
              >
                <Users className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('history')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'history' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Histórico"
              >
                <History className="w-5 h-5" />
              </button>

              <button 
                onClick={() => selectTab('moderation')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group",
                  activeTab === 'moderation' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Moderação e Segurança"
              >
                <ShieldCheck className="w-5 h-5 text-[#977af3]" />
                {session.auditLogs?.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#b28282] rounded-full ring-2 ring-[#11141c]"></span>
                )}
              </button>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
            {/* End session or Invite Info */}
            <button 
              onClick={copyInvite}
              className={clsx(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                copied ? "bg-[#8caf9b]/20 text-[#8caf9b]" : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
              )}
              title="Copiar Link de Convite"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => socket.emit('end_session')} 
              className="w-11 h-11 rounded-xl flex items-center justify-center text-[#b28282] hover:text-[#f8fafc] hover:bg-[#b28282]/10 transition-all cursor-pointer"
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
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-hidden flex flex-col bg-[#11141c] border-r border-[#1b1f2b]/30"
            >
              <div className="w-64 flex flex-col h-full">
                
                {/* Panel Header */}
                <div className="p-4 border-b border-[#1b1f2b]/60 flex items-center justify-between">
                  {activeTab === 'queue' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Fila de Vídeos</span>}
                  {activeTab === 'submit' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Adicionar Vídeo</span>}
                  {activeTab === 'participants' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Participantes</span>}
                  {activeTab === 'history' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Histórico</span>}
                  
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b] rounded-lg transition-all cursor-pointer"
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
                      <div className="bg-[#1b1f2b] p-3 rounded-xl border border-[#2d3345]/50 flex items-center justify-between font-mono">
                        <span className="text-[10px] uppercase font-bold text-[#828ba0]">CÓDIGO SALA:</span>
                        <span className="text-sm font-extrabold tracking-widest text-[#9c8cb3]">{session.id}</span>
                      </div>

                      {/* Pending approvals */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">
                          Pendentes de aprovação ({pendingVideos.length})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {pendingVideos.map(video => (
                            <div key={video.id} className="bg-[#161a22] border border-[#e0a670]/20 p-2.5 rounded-xl text-left">
                              <p className="text-xs text-[#cbd5e1] truncate font-medium mb-1.5">{video.url}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#828ba0] font-mono">De: @{video.submitter}</span>
                                <div className="flex gap-1.5">
                                  <button onClick={() => approve(video.id)} className="p-1 bg-[#8caf9b]/10 hover:bg-[#8caf9b]/25 text-[#8caf9b] rounded-lg cursor-pointer" title="Aprovar">
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => reject(video.id)} className="p-1 bg-[#b28282]/10 hover:bg-[#b28282]/25 text-[#b28282] rounded-lg cursor-pointer" title="Rejeitar">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {pendingVideos.length === 0 && (
                            <p className="text-[11px] text-[#47526d] italic">Nenhum vídeo pendente</p>
                          )}
                        </div>
                      </div>

                      {/* Approved items */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">
                          Fila Ativa ({approvedVideos.length})
                        </h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {approvedVideos.map(vid => {
                            const isCurrent = session.currentVideoId === vid.id;
                            return (
                              <div 
                                key={vid.id} 
                                className={clsx(
                                  "border p-2.5 rounded-xl group transition-all text-left relative overflow-hidden",
                                  isCurrent 
                                    ? "bg-[#222735] border-[#9c8cb3]/40" 
                                    : "bg-[#161a22] border-[#222735] hover:border-[#2d3345]"
                                )}
                              >
                                {isCurrent && (
                                  <div className="absolute top-0 left-0 w-1 h-full bg-[#9c8cb3]"></div>
                                )}
                                <p className={clsx("text-xs truncate font-medium mb-1", isCurrent ? "text-[#f8fafc]" : "text-[#cbd5e1]")}>{vid.url}</p>
                                <div className="flex justify-between items-center mt-1">
                                  <span className={clsx("text-[9px] font-mono", isCurrent ? "text-[#9c8cb3]" : "text-[#828ba0]")}>@{vid.submitter}</span>
                                  <div className="flex gap-1">
                                    {!isCurrent && (
                                      <button onClick={() => playVideo(vid.id)} className="p-1 hover:bg-[#2d3345] text-[#8caf9b] rounded-lg cursor-pointer">
                                        <Play className="w-3 h-3 fill-current" />
                                      </button>
                                    )}
                                    <button onClick={() => reject(vid.id)} className="p-1 hover:bg-[#2d3345] text-[#b28282] rounded-lg cursor-pointer">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {approvedVideos.length === 0 && (
                            <p className="text-[11px] text-[#47526d] italic">Nenhum vídeo aprovado</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: DIRECT SUBMISSION FOR HOST */}
                  {activeTab === 'submit' && (
                    <div className="space-y-3.5">
                      <div className="text-[11px] text-[#828ba0]">
                        Envie links de vídeo do YouTube, Reels do Instagram, TikTok ou links diretos.
                      </div>
                      <div className="space-y-3">
                        <input 
                          type="text" 
                          value={directUrl}
                          onChange={e => setDirectUrl(e.target.value)}
                          placeholder="https://youtube.com/watch?..."
                          className="w-full bg-[#0c0e12] border border-[#222735] rounded-xl px-3.5 py-2.5 text-xs text-[#cbd5e1] placeholder-[#47526d] focus:outline-none focus:border-[#7c73e6] font-medium"
                        />
                        <button 
                          onClick={handleDirectSubmit}
                          disabled={!directUrl.trim().startsWith('http')}
                          className="w-full bg-[#7c73e6] hover:bg-[#6c62da] disabled:bg-[#222735] disabled:text-[#47526d] text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Adicionar à Fila
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: PARTICIPANTS */}
                  {activeTab === 'participants' && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider block">
                        Usuários conectados ({session.users.length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {session.users.map(u => {
                          const userColor = getAvatarColor(u.name);
                          const initials = getInitials(u.name);
                          return (
                            <div key={u.id} className="flex items-center gap-2.5 bg-[#161a22] p-2 rounded-xl border border-[#222735]/40 text-left">
                              <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] text-white", userColor)}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-semibold text-[#cbd5e1] block truncate">
                                  @{u.name}
                                </span>
                                <span className="text-[8px] text-[#828ba0] font-mono leading-none block uppercase">
                                  {u.isHost ? 'ORGANIZADOR / HOST' : 'CONVIDADO'}
                                </span>
                              </div>
                              {u.isHost && (
                                <div className="w-1.5 h-1.5 rounded-full bg-[#8caf9b]"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: HISTORIC WATCHED */}
                  {activeTab === 'history' && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider block">
                        Histórico de reprodução ({session.history.length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {session.history.map(vid => (
                          <div key={vid.id} onClick={() => playVideo(vid.id)} className="bg-[#161a22]/50 border border-[#222735]/30 p-2.5 rounded-xl cursor-pointer hover:bg-[#161a22] transition-colors text-left group">
                            <p className="text-xs text-[#828ba0] truncate font-medium line-through decoration-[#47526d] group-hover:no-underline">{vid.url}</p>
                            <p className="text-[8.5px] text-[#47526d] mt-1 font-mono">De: @{vid.submitter}</p>
                          </div>
                        ))}
                        {session.history.length === 0 && (
                          <p className="text-[11px] text-[#47526d] italic">Sessão vazia</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: LOGS, SETTINGS & AUDIT MODERATION */}
                  {activeTab === 'moderation' && (
                    <div className="space-y-4">
                      {/* Section 1: Policies and Rules */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider block font-mono">Políticas de Segurança</span>
                        <div className="bg-[#161a22] p-3 rounded-xl border border-[#222735] space-y-3.5 text-left">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={!!session.settings?.isManualApprovalRequired}
                              onChange={e => socket.emit('update_settings', { isManualApprovalRequired: e.target.checked })}
                              className="accent-[#7c73e6] cursor-pointer"
                            />
                            <span className="text-xs text-[#cbd5e1] font-medium select-none">Aprovação Prévia</span>
                          </label>

                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={!!session.settings?.blockLiveStreams}
                              onChange={e => socket.emit('update_settings', { blockLiveStreams: e.target.checked })}
                              className="accent-[#7c73e6] cursor-pointer"
                            />
                            <span className="text-xs text-[#cbd5e1] font-medium select-none">Bloquear Transmissão Ao Vivo</span>
                          </label>

                          <div className="h-px bg-[#222735]/85"></div>

                          {/* Numeric Restrictions */}
                          <div className="space-y-2 text-left">
                            <div>
                              <span className="text-[9.5px] text-[#828ba0] uppercase font-mono block">Cooldown Global (segundos):</span>
                              <input 
                                type="number"
                                min="0"
                                value={session.settings?.globalCooldownSeconds ?? 5}
                                onChange={e => socket.emit('update_settings', { globalCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[#0c0e12] border border-[#2d3345] rounded-xl px-2.5 py-1.5 text-xs text-[#cbd5e1] focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[9.5px] text-[#828ba0] uppercase font-mono block">Cooldown Espectador (segundos):</span>
                              <input 
                                type="number"
                                min="0"
                                value={session.settings?.userCooldownSeconds ?? 60}
                                onChange={e => socket.emit('update_settings', { userCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0) })}
                                className="w-full bg-[#0c0e12] border border-[#2d3345] rounded-xl px-2.5 py-1.5 text-xs text-[#cbd5e1] focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[9.5px] text-[#828ba0] uppercase font-mono block">Máx Slides / Hora:</span>
                              <input 
                                type="number"
                                min="1"
                                value={session.settings?.maxSubmissionsPerHour ?? 15}
                                onChange={e => socket.emit('update_settings', { maxSubmissionsPerHour: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-full bg-[#0c0e12] border border-[#2d3345] rounded-xl px-2.5 py-1.5 text-xs text-[#cbd5e1] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Active User Control */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider block font-mono">Controle de Público</span>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {session.users.filter(u => u.id !== socket.id).map(user => (
                            <div key={user.id} className="bg-[#161a22] border border-[#222735] p-2.5 rounded-xl text-left space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#cbd5e1] truncate">@{user.name}</span>
                                <span className="text-[9px] font-bold font-mono text-[#b28282] uppercase">
                                  {user.strikes || 0}/5 strikes
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-1 mt-1">
                                <button 
                                  onClick={() => socket.emit('toggle_whitelist', user.id)}
                                  className={clsx(
                                    "px-1.5 py-1 rounded-lg text-[9px] font-mono font-bold border transition-colors cursor-pointer",
                                    user.isWhitelisted 
                                      ? "bg-[#8caf9b]/15 text-[#8caf9b] border-[#8caf9b]/35" 
                                      : "bg-[#1b1f2b] text-[#828ba0] border-[#222735]/80 hover:text-[#cbd5e1]"
                                  )}
                                >
                                  {user.isWhitelisted ? 'VIP ON' : 'VIP OFF'}
                                </button>
                                <button 
                                  onClick={() => socket.emit('give_strike', { userId: user.id })}
                                  className="px-1.5 py-1 bg-[#e0a670]/10 hover:bg-[#e0a670]/20 border border-[#e0a670]/30 text-[#e0a670] rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                                >
                                  +1 Strike
                                </button>
                                <button 
                                  onClick={() => socket.emit('ban_user', { userId: user.id })}
                                  className="px-1.5 py-1 bg-[#b28282]/10 hover:bg-[#b28282]/20 border border-[#b28282]/30 text-[#b28282] rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                                >
                                  Banir
                                </button>
                              </div>
                            </div>
                          ))}
                          {session.users.filter(u => u.id !== socket.id).length === 0 && (
                            <p className="text-[11px] text-[#47526d] italic text-left">Nenhum espectador na sala</p>
                          )}
                        </div>
                      </div>

                      {/* Section 3: Audit System Terminal */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-0.5">
                          <span className="text-[10px] font-bold text-[#b28282] uppercase tracking-wider font-mono">Eventos Compartilhados</span>
                          <button 
                            onClick={() => socket.emit('clear_audit_logs')}
                            className="text-[9px] text-[#828ba0] hover:text-[#f8fafc] underline cursor-pointer"
                          >
                            Limpar
                          </button>
                        </div>
                        <div className="bg-[#0c0e12] border border-[#222735] p-2 rounded-xl text-left font-mono text-[8.5px] overflow-y-auto max-h-40 space-y-1.5">
                          {session.auditLogs?.slice().reverse().map(log => {
                            const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const severityCol = log.severity === 'high' ? 'text-[#b28282] font-bold' : log.severity === 'medium' ? 'text-[#e0a670]' : 'text-[#8caf9b]';
                            return (
                              <div key={log.id} className="border-b border-[#222735]/40 pb-1 last:border-0 leading-relaxed">
                                <span className="text-[#47526d] mr-1">{timeStr}</span>
                                <span className={clsx("uppercase", severityCol)}>[{log.type}]</span>{' '}
                                <span className="text-[#cbd5e1]">{log.message}</span>
                              </div>
                            );
                          })}
                          {(!session.auditLogs || session.auditLogs.length === 0) && (
                            <p className="text-[#47526d] italic font-mono">Sem logs cadastrados.</p>
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
      <main className="flex-1 relative bg-[#06070a] flex flex-col items-center justify-center overflow-hidden z-10" ref={containerRef}>
        
        {activeTab === 'moderation' ? (
          <AdminDashboard session={session} />
        ) : (
          <>
            {/* Dynamic Citation / Title Banner Overlay (Bottom-left of central video canvas) */}
            {currentVideo && (
              <div className="absolute bottom-5 left-5 z-40 hidden md:flex items-center gap-3 bg-[#0c0e12]/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-[#222735]/60 pointer-events-none max-w-sm">
                <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white", getAvatarColor(currentVideo.submitter))}>
                  {getInitials(currentVideo.submitter)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <span className="text-[10px] font-bold text-[#a3c9b8] uppercase tracking-wider font-mono block">Enviado por:</span>
                  <span className="text-xs font-bold text-[#cbd5e1] block truncate">@{currentVideo.submitter}</span>
                  <span className="text-[9px] text-[#47526d] truncate block font-mono mt-0.5">{currentVideo.url}</span>
                </div>
              </div>
            )}

        {/* REELS STYLE RIGHT DOCK: Floating vertical widget control actions */}
        {currentVideo && (
          <div className="absolute right-5 bottom-12 z-40 flex flex-col items-center gap-3.5 bg-[#0c0e12]/40 p-2 rounded-2xl border border-[#222735]/40">
            {/* Previous */}
            <button 
              onClick={() => playPrevious()} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm group"
              title="Anterior"
            >
              <SkipBack className="w-4 h-4 text-[#cbd5e1]" />
            </button>

            {/* Next / skip */}
            <button 
              onClick={() => playNext()} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm group"
              title="Próximo"
            >
              <SkipForward className="w-4 h-4 text-[#cbd5e1]" />
            </button>

            <div className="h-px w-6 bg-[#1f2430]"></div>

            {/* Zoom controls */}
            <button 
              onClick={() => setZoom(z => Math.min(z + 0.1, 2))} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-[#cbd5e1]" />
            </button>

            <span className="text-[10px] font-semibold text-[#828ba0] font-mono select-none">
              {Math.round(zoom * 100)}%
            </span>

            <button 
              onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-[#cbd5e1]" />
            </button>

            <button 
              onClick={() => setZoom(1)} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Ajustar"
            >
              <Expand className="w-4 h-4 text-[#cbd5e1]" />
            </button>

            <div className="h-px w-6 bg-[#1f2430]"></div>

            {/* Hardware Web connection / Webcam and fullscreen */}
            <button 
              onClick={toggleWebcam} 
              className={clsx(
                "w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-sm",
                webcamStream 
                  ? "bg-[#b28282]/20 border-[#b28282] text-[#b28282] animate-pulse" 
                  : "bg-[#11141c]/90 border-[#222735] text-[#cbd5e1] hover:bg-[#222735]"
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
                    className="absolute right-12 z-55 flex items-center gap-2 px-3.5 py-2 bg-[#0c0e12]/95 backdrop-blur-md border border-[#222735] rounded-xl shadow-2xl whitespace-nowrap"
                  >
                    <span className="text-[#828ba0] font-bold text-[9px] uppercase tracking-wider font-mono mr-1 select-none">Aspecto:</span>
                    {(['auto', '9:16', '4:5', '1:1', '16:9'] as const).map(ratio => (
                      <button
                        key={ratio}
                        onClick={() => {
                          setAspectRatio(ratio);
                        }}
                        className={clsx(
                          "px-2 py-0.5 rounded-lg text-[9px] uppercase tracking-widest font-mono font-semibold transition-all cursor-pointer",
                          aspectRatio === ratio
                            ? "bg-[#7c73e6] text-[#f8fafc]"
                            : "bg-[#161a22] text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#222735]"
                        )}
                      >
                        {ratio}
                      </button>
                    ))}
                    <span className="h-3 w-px bg-[#2d3345] mx-1"></span>
                    <button
                      onClick={() => setCropOverlay(!cropOverlay)}
                      className={clsx(
                        "flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9px] tracking-wider uppercase font-mono transition-all cursor-pointer border border-[#222735]",
                        cropOverlay
                          ? "bg-[#8caf9b]/15 text-[#8caf9b] border-[#8caf9b]/35"
                          : "bg-[#161a22] text-[#828ba0] hover:text-[#f8fafc]"
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
                    ? "bg-[#7c73e6]/25 border-[#7c73e6]/80 text-[#918bf2] shadow-[0_0_12px_rgba(124,115,230,0.15)]"
                    : "bg-[#11141c]/90 border-[#222735] text-[#cbd5e1] hover:bg-[#222735]"
                )}
                title="Proporção e Crop (Suporte)"
              >
                <Layers className="w-4 h-4" />
              </button>
            </div>


            <button 
              onClick={toggleFullscreen} 
              className="w-10 h-10 rounded-full bg-[#11141c]/90 border border-[#222735] text-[#cbd5e1] hover:bg-[#222735] flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Tela Inteira"
            >
              <Maximize className="w-4 h-4 text-[#cbd5e1]" />
            </button>
          </div>
        )}

        

        {/* CANVAS: Scalable Active Frame */}
        <div 
          className="relative w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ease-out"
          style={{ transform: `scale(${zoom})` }}
        >
          {currentVideo ? (
             <div className={clsx("relative w-full max-h-screen bg-[#06070a] overflow-hidden flex flex-col items-center justify-center", isFullscreen ? 'h-screen w-screen' : 'w-full px-2 md:px-3 lg:px-4')}>
                {/* Loader when resolving links */}
                {resolving && (
                   <div className="absolute inset-0 bg-[#06070a]/90 backdrop-blur-md z-45 flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#7c73e6] animate-spin mb-3" />
                      <p className="text-xs font-semibold tracking-wider text-[#cbd5e1] font-mono uppercase">Decodificando player em 9:16...</p>
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
                   <div className="relative w-full max-w-[540px] h-full max-h-[82vh] bg-[#161a22] rounded-2xl overflow-hidden border border-[#222735]/80 pointer-events-auto flex items-center justify-center p-4 shadow-2xl">
                      <WebcamPreview />
                      <div className="w-full h-full overflow-y-auto overflow-x-hidden">
                         <XEmbed url={resolvedUrl} width="100%" />
                      </div>
                   </div>
                ) : isLinkedIn(resolvedUrl) ? (
                   <div className="relative w-full max-w-[540px] h-full max-h-[82vh] bg-[#161a22] rounded-2xl overflow-hidden border border-[#222735]/80 pointer-events-auto flex items-center justify-center p-4 shadow-2xl">
                      <WebcamPreview />
                      <div className="w-full h-full overflow-y-auto overflow-x-hidden">
                         <LinkedInEmbed url={resolvedUrl} width="100%" />
                      </div>
                   </div>
                ) : (
                    <div className={clsx("relative w-full bg-black rounded-2xl overflow-hidden pointer-events-auto flex flex-col items-center justify-center border border-[#1b1f2b]/80 shadow-2xl", getRatioClass())}>
                        <WebcamPreview />
                        <div className={clsx("w-full h-full flex items-center justify-center p-2 transition-all duration-300", webcamStream ? "pt-[150px]" : "pt-2")}>
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
          ) : (
             <div className="flex flex-col items-center text-center p-12 bg-[#11141c]/50 backdrop-blur-lg rounded-2xl border border-[#222735] max-w-md mx-4 select-none">
                <Cast className="w-12 h-12 text-[#47526d] mb-6" />
                <h2 className="text-lg font-bold uppercase tracking-[0.2em] mb-2 text-[#f8fafc]">Tela Ociosa</h2>
                <p className="text-xs text-[#828ba0] mb-6 leading-relaxed max-w-xs">Aguardando participantes enviarem vídeos para o código de sala fornecido abaixo.</p>
                
                <div className="flex items-center gap-4 bg-[#0c0e12] p-4 rounded-xl border border-[#222735]/60 text-xs w-full">
                  <div className="flex flex-col items-start pr-3 border-r border-[#1e2330] flex-1">
                     <span className="text-[#828ba0] uppercase font-bold tracking-wider text-[9px]">LINK DA SALA</span>
                     <span className="text-[#cbd5e1] font-mono mt-0.5 text-[10px] truncate w-full">{window.location.host}/?room={session.id}</span>
                  </div>
                  <div className="flex flex-col items-center pl-1 shrink-0">
                     <span className="text-[#828ba0] uppercase font-bold tracking-wider text-[9px] mb-0.5">CÓDIGO</span>
                     <span className="text-[#9c8cb3] font-bold text-sm tracking-widest font-mono">{session.id}</span>
                  </div>
                </div>

                <button 
                  onClick={copyInvite} 
                  className="mt-4 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#222735] border border-[#2d3345] rounded-xl text-xs hover:bg-[#2c3245] text-[#cbd5e1] font-bold w-full transition-all cursor-pointer capitalize"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "Link Copiado!" : "Copiar Link de Convite"}
                </button>
             </div>
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
}
