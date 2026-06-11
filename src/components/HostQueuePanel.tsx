import { useState } from 'react';
import { SessionState, Video } from '../types';
import { 
  Play, Check, X, Search, Filter, Clock, Eye, List, Compass, Sparkles, AlertCircle
} from 'lucide-react';
import clsx from 'clsx';

interface HostQueuePanelProps {
  session: SessionState;
  playVideo: (id: string) => void;
  reject: (id: string) => void;
  approve: (id: string) => void;
}

export default function HostQueuePanel({ session, playVideo, reject, approve }: HostQueuePanelProps) {
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
      case 'instagram': return 'text-pink-500 bg-pink-500/10 border-pink-500/20';
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

  return (
    <div className="flex flex-col h-full bg-[#111116] border-r border-[#1f1f2e] text-zinc-100 font-sans" id="host_queue_panel">
      {/* Session/Header statistics */}
      <div className="p-3 bg-zinc-950 border-b border-[#1f1f2e] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-zinc-300">
          <List className="w-4 h-4 text-purple-500" />
          <span>Fila de Mídia</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
            TOTAL: {queue.length}
          </span>
          <span className="text-[10px] font-mono bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded text-purple-400">
            ATULA: {queue.filter(v => v.status !== 'watched').length}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 bg-zinc-950/60 p-1 border-b border-[#1f1f2e]">
        <button
          onClick={() => setTab('pending')}
          className={clsx(
            "py-1.5 text-xs font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer",
            tab === 'pending' 
              ? "text-purple-400 border-purple-500 bg-zinc-900/60" 
              : "text-zinc-400 border-transparent hover:text-zinc-200"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Na Fila ({queue.filter(v => v.status !== 'watched').length})
        </button>
        <button
          onClick={() => setTab('watched')}
          className={clsx(
            "py-1.5 text-xs font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer",
            tab === 'watched' 
              ? "text-green-400 border-green-500 bg-zinc-900/60" 
              : "text-zinc-400 border-transparent hover:text-zinc-200"
          )}
        >
          <Eye className="w-3.5 h-3.5" />
          Já Vistos ({queue.filter(v => v.status === 'watched').length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={clsx(
            "py-1.5 text-xs font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer",
            tab === 'all' 
              ? "text-cyan-400 border-cyan-500 bg-zinc-900/60" 
              : "text-zinc-400 border-transparent hover:text-zinc-200"
          )}
        >
          <Compass className="w-3.5 h-3.5" />
          Todos ({queue.length})
        </button>
      </div>

      {/* Search and Filters panel */}
      <div className="p-3 bg-zinc-950/40 border-b border-[#1f1f2e] space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Busca instantânea..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-purple-600 text-zinc-100 placeholder-zinc-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 rounded px-2 py-1">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={badgeFilter}
              onChange={(e) => setBadgeFilter(e.target.value)}
              className="w-full bg-transparent text-[10px] text-zinc-300 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100">Badge: Todos</option>
              <option value="broadcaster" className="bg-zinc-900 text-zinc-100">Broadcasters</option>
              <option value="moderator" className="bg-zinc-900 text-zinc-100">Moderadores</option>
              <option value="vip" className="bg-zinc-900 text-zinc-100">VIPs</option>
              <option value="subscriber" className="bg-zinc-900 text-zinc-100">Inscritos</option>
            </select>
          </div>
          <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 rounded px-2 py-1">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full bg-transparent text-[10px] text-zinc-300 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
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
        {processedVideos.map((vid: Video, index: number) => {
          const isCurrent = session.currentVideoId === vid.id;
          const sender = session.users.find(u => u.name === vid.submitter || u.userId === vid.submitterId);
          const platform = getPlatformLabel(vid.url);
          const platformColor = getPlatformColor(platform);
          
          return (
            <div
              key={vid.id}
              className={clsx(
                "group relative border rounded-sm p-3 block text-left transition-all duration-300 overflow-hidden",
                isCurrent 
                  ? "bg-[#181822] border-purple-500/60 glow-purple" 
                  : "bg-[#16161d]/90 border-transparent hover:border-zinc-800 hover:bg-[#1b1b24]/60"
              )}
            >
              {isCurrent && (
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-pink-500"></div>
              )}

              {/* Top Details */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1 text-[9px] font-mono">
                  {tab === 'pending' && (
                    <span className="text-purple-400 font-extrabold pr-1"># {index + 1}</span>
                  )}
                  {vid.status === 'pending' && (
                    <span className="text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 text-[8px] tracking-wide font-extrabold uppercase animate-pulse">Pendente</span>
                  )}
                  {vid.status === 'approved' && (
                    <span className="text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded border border-purple-500/20 text-[8px] tracking-wide font-extrabold uppercase">Aprovado</span>
                  )}
                  {vid.status === 'watched' && (
                    <span className="text-green-400 bg-green-500/10 px-1 py-0.5 rounded border border-green-500/20 text-[8px] tracking-wide font-extrabold uppercase">Visto</span>
                  )}
                </div>
                <span className={clsx("text-[8px] px-1 py-0.5 rounded border font-mono tracking-wider uppercase shrink-0 font-bold", platformColor)}>
                  {platform}
                </span>
              </div>

              {/* Title & Link */}
              <h4 className={clsx(
                "text-xs font-bold line-clamp-1 break-all mb-1 font-sans",
                isCurrent ? "text-purple-300" : "text-zinc-100 group-hover:text-purple-400"
              )}>
                {vid.title || "Mídia Sincronizada"}
              </h4>
              <p className="text-[10px] text-zinc-500 truncate font-mono mb-2" title={vid.url}>
                {vid.url}
              </p>

              {/* Submitter User Profile */}
              <div className="flex items-center justify-between gap-1 border-t border-zinc-800/60 pt-2 mt-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {renderAvatar(sender, vid.submitter)}
                  <span 
                    className="text-[10.5px] font-bold truncate leading-none"
                    style={{ color: sender?.twitchData?.color || '#a1a1aa' }}
                  >
                    @{vid.submitter}
                  </span>
                  {renderTwitchBadges(sender)}
                </div>

                {/* Individual Action Controls */}
                <div className="flex gap-1 shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {vid.status === 'pending' && (
                    <button 
                      onClick={() => approve(vid.id)} 
                      className="p-1 items-center justify-center bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 rounded transition-all cursor-pointer" 
                      title="Aprovar Vídeo"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                  {!isCurrent && (vid.status === 'approved' || vid.status === 'pending') && (
                    <button 
                      onClick={() => playVideo(vid.id)} 
                      className="p-1 items-center justify-center bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white border border-purple-500/20 rounded transition-all cursor-pointer" 
                      title="Tocar Agora"
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                  )}
                  <button 
                    onClick={() => reject(vid.id)} 
                    className="p-1 items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 rounded transition-all cursor-pointer" 
                    title="Excluir / Rejeitar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

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
