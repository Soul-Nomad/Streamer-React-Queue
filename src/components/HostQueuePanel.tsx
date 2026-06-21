import { useState } from 'react';
import { SessionState, Video } from '../types';
import { 
  Play, Check, X, Search, Filter, Clock, Eye, List, Compass, AlertCircle, Twitch, Terminal
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import InteractiveQueueCard from './InteractiveQueueCard';

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
  </svg>
);

interface HostQueuePanelProps {
  session: SessionState;
  playVideo: (id: string) => void;
  reject: (id: string) => void;
  approve: (id: string) => void;
  unwatchVideo: (id: string) => void;
}

export default function HostQueuePanel({ session, playVideo, reject, approve, unwatchVideo }: HostQueuePanelProps) {
  const [tab, setTab] = useState<'pending' | 'watched' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [badgeFilter, setBadgeFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const getPlatformLabel = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('twitch.tv')) return 'Twitch';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
    if (url.includes('x.com') || url.includes('twitter.com')) return 'X / Twitter';
    return 'Web Video';
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'tiktok': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
      case 'instagram': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
      case 'twitch': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'x / twitter': return 'text-sky-400 bg-sky-400/10 border-sky-400/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const renderTwitchBadges = (user: any) => {
    const badges = user?.twitchData?.badges || [];
    if (badges.length === 0) return null;
    return (
      <div className="flex items-center gap-1 shrink-0">
        {badges.map((b: string) => {
          if (b === 'broadcaster') {
            return (
              <span key={b} className="bg-red-600 text-white text-[8px] font-black uppercase tracking-wider px-1 rounded-sm border border-red-500/30" title="Streamer (Broadcaster)">
                👑 STR
              </span>
            );
          }
          if (b === 'moderator') {
            return (
              <span key={b} className="bg-green-600 text-white text-[8px] font-black uppercase tracking-wider px-1 rounded-sm border border-green-500/30" title="Moderator">
                ⚔️ MOD
              </span>
            );
          }
          if (b === 'vip') {
            return (
              <span key={b} className="bg-purple-600 text-white text-[8px] font-black uppercase tracking-wider px-1 rounded-sm border border-purple-500/30" title="VIP">
                💎 VIP
              </span>
            );
          }
          if (b === 'subscriber') {
            return (
              <span key={b} className="bg-amber-500 text-black text-[8px] font-black uppercase tracking-wider px-1 rounded-sm border border-amber-400/30" title="Inscrito (Subscriber)">
                ⭐ SUB
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  };

  const renderAvatar = (user: any, name: string) => {
    if (user?.twitchData?.avatarUrl) {
      return (
        <img 
          src={user.twitchData.avatarUrl} 
          alt={name} 
          referrerPolicy="no-referrer"
          className="w-5 h-5 rounded-full object-cover border border-zinc-700 bg-neutral-900 shrink-0"
        />
      );
    }
    const color = user?.twitchData?.color || '#555555';
    const initials = name.trim().substring(0, 2).toUpperCase() || '?';
    return (
      <div 
        className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] text-white shrink-0 border border-zinc-700"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  };

  const queue = session.queue || [];

  // Filter video list based on selected tab
  const filteredByTab = queue.filter((v: Video) => {
    if (tab === 'pending') {
      return v.status === 'pending' || v.status === 'approved' || v.status === 'playing';
    }
    if (tab === 'watched') {
      return v.status === 'watched';
    }
    return true; // Tab 'all'
  });

  // Sort and apply user search & filter controls
  const processedVideos = filteredByTab
    .filter((v: Video) => {
      const matchSearch = 
        v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        v.submitter.toLowerCase().includes(searchQuery.toLowerCase()) || 
        v.url.toLowerCase().includes(searchQuery.toLowerCase());

      const sender = session.users.find(u => u.name === v.submitter || u.userId === v.submitterId);
      const badges = sender?.twitchData?.badges || [];
      
      let matchBadge = true;
      if (badgeFilter !== 'all') {
        matchBadge = badges.includes(badgeFilter) || (badgeFilter === 'subscriber' && !!sender?.twitchData?.isSubscriber);
      }

      const platform = getPlatformLabel(v.url).toLowerCase();
      let matchPlatform = true;
      if (platformFilter !== 'all') {
        matchPlatform = platform === platformFilter.toLowerCase();
      }

      return matchSearch && matchBadge && matchPlatform;
    })
    .sort((a: Video, b: Video) => {
      // For unwatched/pending list, order chronologically by timestamp ASC
      if (tab === 'pending') {
        return a.timestamp - b.timestamp;
      }
      // For watched/all lists, we can show youngest or chronological
      return b.timestamp - a.timestamp;
    });

  const formatTime = (secs?: number) => {
    if (secs === undefined || isNaN(secs) || secs === 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeQueue = queue.filter((v: Video) => v.status !== 'watched');
  const totalVideos = queue.length;
  const watchedVideos = queue.filter((v: Video) => v.status === 'watched').length;
  const currentProgressNum = session.currentVideoId ? watchedVideos + 1 : watchedVideos;
  
  const totalDurationSecs = activeQueue.reduce((acc, v) => acc + (v.duration || 0), 0);
  const fallbackDurationSecs = activeQueue.reduce((acc, v) => acc + (v.duration || 180), 0);

  const formatQueueDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <div className="flex flex-col h-full bg-[#111116] border-r border-[#1f1f2e] text-zinc-100 font-sans select-none" id="host_queue_panel">
      {/* Session/Header statistics */}
      <div className="p-3 bg-zinc-950 border-b border-[#1f1f2e] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-zinc-300">
          <List className="w-4 h-4 text-orange-500" />
          <span>Fila de Mídia</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-zinc-900 border border-[#1f1f2e] px-1.5 py-0.5 rounded text-zinc-400">
            TOTAL: {queue.length}
          </span>
          <span className="text-[10px] font-mono bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded text-orange-400">
            ATUAL: {queue.filter(v => v.status !== 'watched').length}
          </span>
        </div>
      </div>

      {/* Progresso e Estimativa Banner */}
      <div className="px-3 py-2 bg-zinc-900/30 border-b border-[#1f1f2e] flex items-center justify-between text-[10.5px] font-mono">
        <div className="text-zinc-300 font-bold">
          Progresso: <span className="text-orange-400">{currentProgressNum} de {totalVideos}</span>
        </div>
        <div className="text-zinc-300 font-bold flex items-center gap-1" title="Soma das durações dos vídeos restantes">
          <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span>Fila: {formatQueueDuration(totalDurationSecs || fallbackDurationSecs)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 bg-zinc-950/40 p-1 border-b border-[#1f1f2e]">
        <button
          onClick={() => setTab('pending')}
          className={clsx(
            "py-1.5 text-[11px] font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer",
            tab === 'pending' 
              ? "text-orange-400 border-orange-500 bg-zinc-900/50" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/20"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Fila ({queue.filter(v => v.status !== 'watched').length})
        </button>
        <button
          onClick={() => setTab('watched')}
          className={clsx(
            "py-1.5 text-[11px] font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer",
            tab === 'watched' 
              ? "text-green-400 border-green-500 bg-zinc-900/50" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/20"
          )}
        >
          <Eye className="w-3.5 h-3.5" />
          Vistos ({queue.filter(v => v.status === 'watched').length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={clsx(
            "py-1.5 text-[11px] font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer",
            tab === 'all' 
              ? "text-cyan-400 border-cyan-500 bg-zinc-900/50" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/20"
          )}
        >
          <Compass className="w-3.5 h-3.5" />
          Todos ({queue.length})
        </button>
      </div>

      {/* Search and Filters panel */}
      <div className="p-3 bg-[#111116] border-b border-[#1f1f2e] space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Busca instantânea..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950/60 border border-[#1f1f2e] rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-zinc-700 text-zinc-100 placeholder-zinc-500 font-mono transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1 bg-zinc-950/60 border border-[#1f1f2e] rounded px-2 py-1 focus-within:border-zinc-700 transition-colors">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={badgeFilter}
              onChange={(e) => setBadgeFilter(e.target.value)}
              className="w-full bg-transparent text-[10px] text-zinc-400 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100">Badge: Todos</option>
              <option value="broadcaster" className="bg-zinc-900 text-zinc-100">Broadcasters</option>
              <option value="moderator" className="bg-zinc-900 text-zinc-100">Moderadores</option>
              <option value="vip" className="bg-zinc-900 text-zinc-100">VIPs</option>
              <option value="subscriber" className="bg-zinc-900 text-zinc-100">Inscritos</option>
            </select>
          </div>
          <div className="flex items-center gap-1 bg-zinc-950/60 border border-[#1f1f2e] rounded px-2 py-1 focus-within:border-zinc-700 transition-colors">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full bg-transparent text-[10px] text-zinc-400 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100">Plataforma</option>
              <option value="youtube" className="bg-zinc-900 text-zinc-100">YouTube</option>
              <option value="tiktok" className="bg-zinc-900 text-zinc-100">TikTok</option>
              <option value="instagram" className="bg-zinc-900 text-zinc-100">Instagram</option>
              <option value="twitch" className="bg-zinc-900 text-zinc-100">Twitch</option>
            </select>
          </div>
        </div>
      </div>

      {/* Video Cards Grid/List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-180px)]">
        <AnimatePresence initial={false}>
          {processedVideos.map((vid: Video, index: number) => {
            const isCurrent = session.currentVideoId === vid.id;
            const sender = session.users.find(u => u.name === vid.submitter || u.userId === vid.submitterId);
            const platform = getPlatformLabel(vid.url);
            const platformColor = getPlatformColor(platform);
            
            // Calculate progress/time indicators
            const duration = vid.duration || 0;
            let progressPercent = 0;
            let progressText = '--:-- / --:--';

            if (isCurrent) {
              const currentSeconds = Math.floor(session.currentTime || 0);
              progressPercent = duration > 0 ? Math.min(100, (currentSeconds / duration) * 100) : 0;
              progressText = `${formatTime(currentSeconds)} / ${formatTime(duration)}`;
            } else if (vid.status === 'watched') {
              progressPercent = 100;
              progressText = `Visto (${formatTime(duration || 180)})`;
            } else {
              progressPercent = 0;
              progressText = duration > 0 ? `Duração: ${formatTime(duration)}` : 'Duração: --:--';
            }
            
            return (
              <InteractiveQueueCard
                key={vid.id}
                video={vid}
                session={session}
                variant="host"
                index={tab === 'pending' ? index + 1 : undefined}
                isCurrent={isCurrent}
                playVideo={playVideo}
                reject={reject}
                approve={approve}
                unwatchVideo={unwatchVideo}
              />
            );
          })}
        </AnimatePresence>

        {processedVideos.length === 0 && (
          <div className="py-12 px-4 text-center text-zinc-600 flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="w-6 h-6 text-zinc-700" />
            <p className="text-xs italic font-mono">Nenhum vídeo nesta aba</p>
          </div>
        )}
      </div>
    </div>
  );
}
