import { useState, useEffect, useRef, useMemo } from 'react';
import { socket, getBackendUrl } from '../socket';
import { SessionState } from '../types';
import ReactPlayer from 'react-player';
import { 
  MonitorPlay, ZoomIn, ZoomOut, Expand, Maximize, AlertCircle, SkipForward, SkipBack, 
  Check, X, ShieldCheck, Cast, Play, Pause, History, Crop, Video, VideoOff, 
  ExternalLink, Loader2, Users, Compass, Plus, Link2, Copy, LogOut, Layers, Heart, ShieldAlert
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import * as Ably from 'ably';

import AdminDashboard from './AdminDashboard';
import SettingsView from './SettingsView';
import { Settings } from 'lucide-react';

const Player = ReactPlayer as any;

// Utility functions
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
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('twitch.tv')) return 'Twitch';
  if (url.includes('facebook.com')) return 'Facebook';
  return 'Web Vídeo';
};

const isYouTubeShort = (url: string) => url.includes('youtube.com/shorts') || url.includes('youtu.be/shorts');
const isInstagram = (url: string) => url.includes('instagram.com');
const isTikTok = (url: string) => url.includes('tiktok.com');

const getInitials = (name: string) => name.trim().substring(0, 2).toUpperCase();

const renderUserAvatar = (user: any, sizeClass = "w-6 h-6") => {
  if (user?.twitchData?.avatarUrl) {
    return (
      <img 
        src={user.twitchData.avatarUrl} 
        alt={user.submitter || '?'} 
        referrerPolicy="no-referrer"
        className={`${sizeClass} object-cover border border-[#404040] bg-[#121212] shrink-0`}
      />
    );
  }
  const name = user?.submitter || '?';
  const color = user?.twitchData?.color || '#505050';
  return (
    <div 
      className={`${sizeClass} flex items-center justify-center font-bold text-[10px] text-white shrink-0 border border-[#404040]`}
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  );
};

const renderTwitchBadgesHost = (twitchData: any) => {
  const badges = twitchData?.badges || [];
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0 mt-0.5">
      {badges.map((b: string) => {
        if (b === 'broadcaster') return <span key={b} className="bg-[#FF3B30] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm shadow-sm">👑 STR</span>;
        if (b === 'moderator') return <span key={b} className="bg-[#00AD03] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm shadow-sm">🛡️ MOD</span>;
        if (b === 'vip') return <span key={b} className="bg-[#E25CFF] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm shadow-sm">💎 VIP</span>;
        if (b === 'subscriber' || b === 'founder') return <span key={b} className="bg-[#8205B3] text-white text-[8px] font-black uppercase tracking-tight px-1 rounded-sm shadow-sm">⭐ SUB</span>;
        return null;
      })}
    </div>
  );
};

interface CustPlayerProps { url: string; getRatioClass: () => string; webcamStream: MediaStream | null; WebcamPreview: React.ComponentType; }

function CustomInstagramPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  // IG logic... (Keeping minimal for functionality to work via API as before)
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const igId = getInstagramId(url);

  useEffect(() => {
    if (!igId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${getBackendUrl()}/api/instagram-stream?url=${encodeURIComponent(`https://www.instagram.com/p/${igId}/`)}`)
      .then(res => res.json())
      .then(data => { if (data.videoUrl && !data.error) setVideoUrl(data.videoUrl); else setError('Restrito'); })
      .catch(() => setError('Erro'))
      .finally(() => setLoading(false));
  }, [igId]);

  if (!igId) return <div className="text-center p-8 bg-[#151515]">Link inválido</div>;
  if (loading) return <div className={clsx("relative flex items-center justify-center bg-[#0A0A0A]", getRatioClass())}><Loader2 className="w-8 h-8 animate-spin text-[#FF6B35]" /></div>;
  if (error || !videoUrl) return <div className={clsx("relative flex items-center justify-center bg-[#0A0A0A]", getRatioClass())}><span className="text-white text-xs">Acesso restrito - abra externamente</span></div>;

  return (
    <div className={clsx("relative bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center", getRatioClass())}>
       <WebcamPreview />
       <video src={`/api/proxy-video?url=${encodeURIComponent(videoUrl)}`} className="w-full h-full object-contain" controls autoPlay loop playsInline />
    </div>
  );
}

function CustomYouTubeShortsPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const ytId = getYouTubeId(url);
  if (!ytId) return <div className="text-center p-8 bg-[#151515]">Link inválido</div>;
  return (
    <div className={clsx("relative bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center", getRatioClass())}>
       <WebcamPreview />
       <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`} className="w-full h-full max-h-screen border-0" allowFullScreen allow="autoplay; picture-in-picture"></iframe>
    </div>
  );
}

function CustomYouTubePlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const ytId = getYouTubeId(url);
  if (!ytId) return <div className="text-center p-8 bg-[#151515]">Link inválido</div>;
  return (
    <div className={clsx("relative bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center", getRatioClass())}>
       <WebcamPreview />
       <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1&controls=1&loop=1&playlist=${ytId}&rel=0`} className="w-full h-full border-0 aspect-video" allowFullScreen allow="autoplay; picture-in-picture"></iframe>
    </div>
  );
}

function CustomTikTokPlayer({ url, getRatioClass, webcamStream, WebcamPreview }: CustPlayerProps) {
  const id = getTikTokId(url);
  if (!id) return <div className="text-center p-8 bg-[#151515]">Link inválido</div>;
  return (
    <div className={clsx("relative bg-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center", getRatioClass())}>
       <WebcamPreview />
       <iframe src={`https://www.tiktok.com/player/v1/${id}?&autoplay=1&loop=1&music_info=0`} className="w-full h-full border-0" allowFullScreen allow="autoplay; picture-in-picture"></iframe>
    </div>
  );
}

export interface UniversalVideo {
  id: string;
  url: string;
  submitter: string;
  submitterId?: string;
  twitchData?: any;
  is_watched: boolean;
  inserted_at: string;
}

// Custom Hook to sync Universal Queue across Supabase and Ably explicitly
function useQueueSync(roomId: string | null, sessionUsers: any[]) {
  const [universalQueue, setUniversalQueue] = useState<UniversalVideo[]>([]);
  
  useEffect(() => {
    if (!roomId) return;
    let active = true;

    // 1. Persistência Inicial: Buscar estado real via Supabase
    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('room_id', roomId)
        .order('inserted_at', { ascending: true });
        
      if (data && active && !error) {
        const mapped = data.map(v => {
           const u = sessionUsers.find(su => su.userId === v.submitted_by || (su.twitchData?.login && su.twitchData.login === v.twitch_user_id));
           return {
              id: v.id,
              url: v.video_url,
              submitter: u?.name || v.twitch_user_id || 'Usuário',
              twitchData: u?.twitchData,
              is_watched: v.status === 'played' || v.status === 'watched', // Converts Supabase text standard to client-side boolean map
              inserted_at: v.inserted_at
           };
        });
        setUniversalQueue(mapped);
      }
    };
    fetchInitial();

    // 2. Realtime Event Sync using Ably channels to enforce optimistic propagation
    let ably: Ably.Realtime | null = null;
    let channel: any = null;
    try {
      ably = new Ably.Realtime({ authUrl: `${getBackendUrl()}/api/auth/ably-token?userId=host&roomId=${roomId}` });
      channel = ably.channels.get(`session:${roomId}`);
      
      channel.subscribe('new_video', (msg: any) => {
         const v = msg.data;
         if (!active) return;
         setUniversalQueue(prev => {
            if (prev.find(item => item.id === v.id)) return prev;
            const u = sessionUsers.find(su => su.userId === v.submitted_by);
            return [...prev, {
                id: v.id,
                url: v.video_url || v.url,
                submitter: u?.name || v.twitch_user_id || 'Usuário',
                twitchData: u?.twitchData || v.twitch_data,
                is_watched: false,
                inserted_at: v.inserted_at || new Date().toISOString()
            }].sort((a,b) => new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime());
         });
      });

      channel.subscribe('video_updated', (msg: any) => {
         const { id, is_watched, status } = msg.data;
         if (!active) return;
         setUniversalQueue(prev => prev.map(v => v.id === id ? { ...v, is_watched: is_watched || status === 'played' } : v));
      });
    } catch(e) { }

    // Fallback: Supabase native postgres changes to ensure fault-tolerance
    const sub = supabase.channel(`public:videos:room_id=eq.${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos', filter: `room_id=eq.${roomId}` }, (payload) => {
          if (!active) return;
          setUniversalQueue(prev => prev.map(v => 
             v.id === payload.new.id ? { ...v, is_watched: payload.new.status === 'played' || payload.new.is_watched === true } : v
          ));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'videos', filter: `room_id=eq.${roomId}` }, (payload) => {
          if (!active) return;
          setUniversalQueue(prev => {
             if (prev.find(item => item.id === payload.new.id)) return prev;
             const u = sessionUsers.find(su => su.userId === payload.new.submitted_by);
             return [...prev, {
                id: payload.new.id,
                url: payload.new.video_url,
                submitter: u?.name || payload.new.twitch_user_id || 'Usuário',
                twitchData: u?.twitchData,
                is_watched: payload.new.status === 'played',
                inserted_at: payload.new.inserted_at
             }].sort((a,b) => new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime());
          });
      })
      .subscribe();

    return () => {
       active = false;
       if (channel) channel.unsubscribe();
       if (ably) ably.close();
       supabase.removeChannel(sub);
    };
  }, [roomId, sessionUsers]);

  const markAsWatched = async (id: string) => {
     // Optimist UI Response First
     setUniversalQueue(prev => prev.map(v => v.id === id ? { ...v, is_watched: true } : v));
     try {
       // Persist into database using REST/RPC (we reuse the schema standard status='played' to emulate is_watched logically)
       await supabase.from('videos').update({ status: 'played' }).eq('id', id);
     } catch (err) {}
  };

  return { universalQueue, markAsWatched };
}


export default function HostView({ session }: { session: SessionState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'watched' | 'submit' | 'participants' | 'moderation' | 'settings'>('queue');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9' | 'auto'>('auto');
  
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  
  // Custom Architecture Hook
  const { universalQueue, markAsWatched } = useQueueSync(session.id, session.users);

  // Derive split queues for UI layout based uniquely on is_watched boolean property
  const todoQueue = useMemo(() => universalQueue.filter(v => !v.is_watched), [universalQueue]);
  const watchedQueue = useMemo(() => universalQueue.filter(v => v.is_watched), [universalQueue]);
  
  const activeVideo = useMemo(() => universalQueue.find(v => v.id === activeVideoId), [universalQueue, activeVideoId]);

  useEffect(() => {
     if (activeVideo) {
        if (isInstagram(activeVideo.url) || isTikTok(activeVideo.url) || isYouTubeShort(activeVideo.url)) {
           setAspectRatio('9:16');
        } else {
           setAspectRatio('auto');
        }
     }
  }, [activeVideo?.url]);

  const toggleWebcam = async () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
      } catch (err) {
         console.error(err);
      }
    }
  };

  const webcamRefCallback = (el: HTMLVideoElement | null) => {
    if (el && webcamStream) el.srcObject = webcamStream;
  };

  const handleSelectVideo = async (video: UniversalVideo) => {
     // Mark local active and broadcast to viewers
     setActiveVideoId(video.id);
     socket.emit('play_video', video.id);
     
     // 1. Move para a aba "Já Vistos" atualizando o status is_watched
     await markAsWatched(video.id);
  };

  const playNext = async () => {
     const nextVideo = todoQueue[0];
     if (nextVideo) {
        if (activeVideoId) {
           await markAsWatched(activeVideoId);
        }
        setActiveVideoId(nextVideo.id);
        await markAsWatched(nextVideo.id);
        socket.emit('play_video', nextVideo.id);
     }
  };

  const playPrevious = () => {
     const lastWatched = watchedQueue[watchedQueue.length - 1]; // get the most recent watched
     if (lastWatched) {
        setActiveVideoId(lastWatched.id);
        socket.emit('play_video', lastWatched.id);
     }
  };

  const getRatioClass = () => {
    if (aspectRatio === '9:16') return 'aspect-[9/16] h-screen w-auto shadow-2xl transition-all';
    return 'aspect-video w-full max-w-[98%] max-h-[86vh]';
  };

  const WebcamPreview = () => {
    if (!webcamStream) return null;
    const isVertical = activeVideo && (isInstagram(activeVideo.url) || isTikTok(activeVideo.url) || isYouTubeShort(activeVideo.url));
    if (isVertical) {
      return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] h-24 bg-[#0D0D0D] border border-[#222222] rounded overflow-hidden z-30 pointer-events-none">
           <video ref={webcamRefCallback} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
           <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[8px] uppercase font-bold text-white flex items-center gap-1">
              <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></span> REC
           </div>
        </div>
      );
    }
    return (
      <div className="absolute top-4 left-4 w-28 h-28 bg-[#0D0D0D] border border-[#2d2d2d] rounded overflow-hidden z-30 pointer-events-none">
         <video ref={webcamRefCallback} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden select-none">
      
      {/* SIDEBAR NAVIGATION MODULE */}
      <div className="flex h-full flex-shrink-0 z-20 border-r border-[#222222] bg-[#1A1A1A]">
        {/* Nav Rail / Toolbar */}
        <div className="w-16 flex flex-col items-center py-4 justify-between bg-[#1A1A1A] h-full border-r border-[#222222]">
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-10 h-10 rounded bg-[#FF6B35]/15 border border-[#FF6B35]/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#FF6B35]" />
            </div>
            <div className="h-px w-8 bg-[#2d2d2d] mb-2"></div>
            
            <nav className="flex flex-col items-center gap-3 w-full px-2">
              <button onClick={() => { setActiveTab('queue'); setSidebarOpen(true); }} className={clsx("w-11 h-11 rounded flex items-center justify-center transition-colors relative", activeTab === 'queue' ? "bg-[#FF6B35] text-white" : "text-[#B0B0B0] hover:bg-[#222222] hover:text-white")} title="Fila Principal (A Fazer)">
                <Compass className="w-5 h-5" />
                {todoQueue.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#FF8C42] rounded-full"></span>}
              </button>
              <button onClick={() => { setActiveTab('watched'); setSidebarOpen(true); }} className={clsx("w-11 h-11 rounded flex items-center justify-center transition-colors", activeTab === 'watched' ? "bg-[#FF6B35] text-white" : "text-[#B0B0B0] hover:bg-[#222222] hover:text-white")} title="Já Vistos">
                <History className="w-5 h-5" />
              </button>
              <button onClick={() => { setActiveTab('participants'); setSidebarOpen(true); }} className={clsx("w-11 h-11 rounded flex items-center justify-center transition-colors", activeTab === 'participants' ? "bg-[#FF6B35] text-white" : "text-[#B0B0B0] hover:bg-[#222222] hover:text-white")} title="Participantes">
                <Users className="w-5 h-5" />
              </button>
            </nav>
          </div>
          
          <div className="flex flex-col items-center gap-3">
             <button onClick={() => { window.location.href = '/' }} className="w-11 h-11 rounded flex items-center justify-center text-[#F44336] bg-[#F44336]/10 hover:bg-[#F44336] hover:text-white transition-colors" title="Encerrar Sessão">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Collapsible Panel Container */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="h-full overflow-hidden flex flex-col bg-[#1A1A1A] border-r border-[#222222]">
              <div className="w-[280px] flex flex-col h-full">
                
                {/* Header */}
                <div className="p-4 border-b border-[#222222] flex items-center justify-between bg-[#1D1D1D]">
                  {activeTab === 'queue' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Fila Principal</span>}
                  {activeTab === 'watched' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Já Vistos</span>}
                  {activeTab === 'participants' && <span className="text-xs font-black uppercase tracking-wider text-white font-mono">Participantes</span>}
                  
                  <button onClick={() => setSidebarOpen(false)} className="p-1 px-2 text-[#B0B0B0] hover:text-white rounded transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activeTab === 'queue' && (
                    <div className="space-y-3">
                       <h4 className="text-[10px] font-bold text-[#FF8C42] uppercase tracking-wider font-mono">
                         Fila A Fazer ({todoQueue.length})
                       </h4>
                       <div className="space-y-3">
                         {todoQueue.map((v, idx) => (
                            <div key={v.id} onClick={() => handleSelectVideo(v)} className={clsx(
                              "border p-3 rounded-md group transition-all text-left relative overflow-hidden cursor-pointer",
                              activeVideoId === v.id ? "bg-[#1A1A1A] border-[#FF6B35]/50 shadow-[0_0_15px_rgba(255,107,53,0.1)]" : "bg-[#222222] border-[#2c2c2c] hover:border-[#FF8C42]/40"
                            )}>
                              {activeVideoId === v.id && <div className="absolute top-0 left-0 w-1 h-full bg-[#FF6B35]"></div>}
                              
                              <div className="flex justify-between items-center gap-2 mb-2">
                                <span className="text-[10px] font-black font-mono text-[#FF8C42] bg-[#FF8C42]/10 px-1.5 py-0.5 rounded-sm">Nº {idx + 1}</span>
                                <span className="text-[9px] bg-[#121212] border border-[#2c2c2c] px-1.5 py-0.5 rounded text-[#B0B0B0] font-mono">{getPlatformLabel(v.url)}</span>
                              </div>
                              
                              <p className={clsx("text-xs truncate font-mono mb-2", activeVideoId === v.id ? "text-white font-bold" : "text-[#B0B0B0]")}>{v.url}</p>
                              
                              <div className="flex justify-between items-center bg-[#1a1a1a]/40 border-t border-[#2c2c2c]/60 pt-2.5 mt-2.5 -mx-3 -mb-3 px-3 pb-3">
                                 <div className="flex items-center gap-2 min-w-0">
                                   {renderUserAvatar(v, "w-6 h-6 rounded-full")}
                                   <div className="flex flex-col min-w-0">
                                      <span className="text-[11px] font-bold truncate leading-tight" style={{ color: v.twitchData?.color || '#FFFFFF' }}>@{v.submitter}</span>
                                      {renderTwitchBadgesHost(v.twitchData)}
                                   </div>
                                 </div>
                                 <button onClick={(e) => { e.stopPropagation(); handleSelectVideo(v) }} className="px-2.5 py-1.5 bg-[#FF6B35] hover:bg-[#e2531b] text-white font-bold text-[9px] uppercase rounded-sm shadow-md transition-colors shrink-0">
                                   Assistir
                                 </button>
                              </div>
                            </div>
                         ))}
                         {todoQueue.length === 0 && <p className="text-xs text-[#505050] italic pt-2">A fila universal está vazia.</p>}
                       </div>
                    </div>
                  )}

                  {activeTab === 'watched' && (
                    <div className="space-y-3">
                       <h4 className="text-[10px] font-bold text-[#B0B0B0] uppercase tracking-wider font-mono">
                         Finalizados ({watchedQueue.length})
                       </h4>
                       <div className="space-y-3">
                         {watchedQueue.map((v, idx) => (
                            <div key={v.id} onClick={() => { setActiveVideoId(v.id); socket.emit('play_video', v.id) }} className="bg-[#222222] border border-[#2c2c2c] p-3 rounded-md cursor-pointer hover:bg-[#2c2c2c] transition-colors text-left group">
                              <p className="text-xs text-[#B0B0B0] truncate font-mono line-through decoration-[#505050] group-hover:no-underline">{v.url}</p>
                              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#2c2c2c]/40">
                                {renderUserAvatar(v, "w-5 h-5 rounded-full grayscale opacity-70")}
                                <span className="text-[10px] font-bold text-[#888888] truncate" style={{ color: v.twitchData?.color }}>@{v.submitter}</span>
                                {renderTwitchBadgesHost(v.twitchData)}
                              </div>
                            </div>
                         ))}
                         {watchedQueue.length === 0 && <p className="text-xs text-[#505050] italic pt-2">Sem histórico.</p>}
                       </div>
                    </div>
                  )}

                  {activeTab === 'participants' && (
                    <div className="space-y-3">
                       {session.users.map(u => (
                          <div key={u.id} className="flex items-center gap-3 bg-[#222222] p-2.5 rounded-md border border-[#2c2c2c] text-left">
                            {renderUserAvatar({ submitter: u.name, twitchData: u.twitchData }, "w-8 h-8 rounded-full border border-[#404040]")}
                            <div className="flex-1 min-w-0">
                               <span className="text-xs font-bold block truncate" style={{ color: u.twitchData?.color || '#FFFFFF' }}>@{u.name}</span>
                               <div className="flex items-center mt-0.5">
                                  {renderTwitchBadgesHost(u.twitchData)}
                               </div>
                            </div>
                          </div>
                       ))}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CENTRAL STAGE (VIDEO PLAYER) */}
      <main className="flex-1 relative bg-[#0A0A0A] flex flex-col items-center justify-center overflow-hidden z-10" ref={containerRef}>
         
         {/* Live Badge Top */}
         <div className="absolute top-6 left-6 flex items-center gap-3 z-40 bg-[#121212]/80 backdrop-blur-md px-3 py-1.5 rounded-full shadow-xl border border-[#333333]">
           <div className="w-2 h-2 rounded-full bg-[#F44336] animate-pulse"></div>
           <span className="text-[10px] font-black uppercase tracking-widest font-mono text-[#F44336]">AO VIVO</span>
         </div>

         <div className="absolute top-6 right-6 flex items-center gap-2 z-40">
            <button onClick={toggleWebcam} className={clsx("p-2.5 rounded-full border transition-all cursor-pointer backdrop-blur-md", webcamStream ? "bg-[#FF6B35] text-white border-[#FF6B35]" : "bg-[#1A1A1A]/80 text-[#B0B0B0] border-[#333333] hover:text-white")} title="Alternar Câmera de Reação">
              {webcamStream ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
         </div>

         {activeVideo ? (
           <div className="w-full h-full flex items-center justify-center relative pointer-events-auto">
             {isInstagram(activeVideo.url) ? (
                <CustomInstagramPlayer url={activeVideo.url} getRatioClass={getRatioClass} webcamStream={webcamStream} WebcamPreview={WebcamPreview} />
             ) : isTikTok(activeVideo.url) ? (
                <CustomTikTokPlayer url={activeVideo.url} getRatioClass={getRatioClass} webcamStream={webcamStream} WebcamPreview={WebcamPreview} />
             ) : isYouTubeShort(activeVideo.url) ? (
                <CustomYouTubeShortsPlayer url={activeVideo.url} getRatioClass={getRatioClass} webcamStream={webcamStream} WebcamPreview={WebcamPreview} />
             ) : (
                <CustomYouTubePlayer url={activeVideo.url} getRatioClass={getRatioClass} webcamStream={webcamStream} WebcamPreview={WebcamPreview} />
             )}
           </div>
         ) : (
           <div className="flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-[#151515] rounded-full flex items-center justify-center border border-[#222222]">
                 <MonitorPlay className="w-8 h-8 text-[#505050]" />
              </div>
              <h2 className="text-xl font-bold font-sans text-[#EFEFEF]">Pronto para Reagir!</h2>
              <p className="text-sm font-mono text-[#888888] max-w-sm text-center">Inicie um vídeo da fila de reprodução na barra lateral esquerda para projetá-lo aqui.</p>
           </div>
         )}

         {/* Bottom Action Bar */}
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-40 bg-[#151515]/90 backdrop-blur-lg px-6 py-3 rounded-full border border-[#2c2c2c] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <button onClick={playPrevious} className="p-2.5 rounded-full hover:bg-[#333333] text-[#EFEFEF] transition-colors cursor-pointer" title="Vídeo Anterior">
              <SkipBack className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-[#333333] mx-2"></div>
            <button onClick={playNext} className="p-2.5 rounded-full hover:bg-[#333333] text-[#FF6B35] transition-colors cursor-pointer" title="Avançar Fila e Marcar Visto">
              <SkipForward className="w-5 h-5" />
            </button>
         </div>

      </main>

    </div>
  );
}
