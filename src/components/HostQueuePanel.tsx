import { useState } from 'react';
import { SessionState, Video } from '../types';
import { 
  Play, Check, X, Search, Filter, Clock, Eye, List, Compass, AlertCircle, Twitch, Terminal
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

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
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

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
    return null;
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
      const twitch = sender?.twitchData;
      const platform = getPlatformLabel(v.url).toLowerCase();
      let matchPlatform = true;
      if (platformFilter !== 'all') {
        if (platformFilter === 'x') {
          matchPlatform = platform.includes('x') || platform.includes('twitter');
        } else if (platformFilter === 'other') {
          matchPlatform = platform.includes('web video') || platform.includes('facebook') || (!['youtube', 'tiktok', 'instagram', 'twitch'].some(p => platform.includes(p)));
        } else {
          matchPlatform = platform.includes(platformFilter.toLowerCase());
        }
      }

      let matchSource = true;
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'site') {
          matchSource = !v.source || v.source === 'site' || v.source === 'api';
        } else {
          matchSource = v.source === sourceFilter;
        }
      }

      return matchSearch && matchPlatform && matchSource;
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

  const totalVideos = queue.length;
  const watchedVideos = queue.filter((v: Video) => v.status === 'watched').length;
  const currentProgressNum = session.currentVideoId ? watchedVideos + 1 : watchedVideos;

  return (
    <div className="flex flex-col h-full bg-black/40 backdrop-blur-md text-zinc-100 font-sans select-none" id="host_queue_panel">
      {/* Session/Header statistics */}
      <div className="p-3 bg-black/30 backdrop-blur-sm border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-zinc-300">
          <List className="w-4 h-4 text-orange-500" />
          <span>Fila de Mídia</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-black/35 backdrop-blur-sm border border-white/10 px-1.5 py-0.5 rounded text-zinc-400">
            TOTAL: {queue.length}
          </span>
          <span className="text-[10px] font-mono bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded text-orange-400">
            ATUAL: {queue.filter(v => v.status !== 'watched').length}
          </span>
        </div>
      </div>

      {/* Progresso Banner */}
      <div className="px-3 py-2 bg-black/20 border-b border-white/10 flex items-center justify-between text-[10.5px] font-mono">
        <div className="text-zinc-300 font-bold mx-auto">
          Progresso da Fila: <span className="text-orange-400">{currentProgressNum} de {totalVideos}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 bg-black/25 p-1 border-b border-white/10">
        <button
          onClick={() => setTab('pending')}
          className={clsx(
            "py-1.5 text-[11px] font-bold font-mono transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer",
            tab === 'pending' 
              ? "text-orange-400 border-orange-500 bg-white/5" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5"
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
              ? "text-green-400 border-green-500 bg-white/5" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5"
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
              ? "text-cyan-400 border-cyan-500 bg-white/5" 
              : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5"
          )}
        >
          <Compass className="w-3.5 h-3.5" />
          Todos ({queue.length})
        </button>
      </div>

      {/* Search and Filters panel */}
      <div className="p-3 bg-black/20 border-b border-white/10 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Busca instantânea..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/35 hover:bg-black/45 border border-white/10 rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-white/20 text-zinc-100 placeholder-zinc-500 font-mono transition-colors backdrop-blur-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1 bg-black/35 border border-white/10 rounded px-1.5 py-1 focus-within:border-white/20 transition-colors backdrop-blur-sm">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full bg-transparent text-[9.5px] text-zinc-400 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
            >
              <option value="all" className="bg-zinc-950 text-zinc-100">Plataforma</option>
              <option value="youtube" className="bg-zinc-950 text-zinc-100">YouTube</option>
              <option value="tiktok" className="bg-zinc-950 text-zinc-100">TikTok</option>
              <option value="instagram" className="bg-zinc-950 text-zinc-100">Instagram</option>
              <option value="twitch" className="bg-zinc-950 text-zinc-100">Twitch</option>
              <option value="x" className="bg-zinc-950 text-zinc-100">Twitter / X</option>
              <option value="other" className="bg-zinc-950 text-zinc-100">Outros / Direto</option>
            </select>
          </div>
          <div className="flex items-center gap-1 bg-black/35 border border-white/10 rounded px-1.5 py-1 focus-within:border-white/20 transition-colors backdrop-blur-sm">
            <Filter className="w-3 h-3 text-zinc-500 shrink-0" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full bg-transparent text-[9.5px] text-zinc-400 focus:outline-none border-0 p-0 leading-tight cursor-pointer"
            >
              <option value="all" className="bg-zinc-950 text-zinc-100">Origem: Todas</option>
              <option value="twitch" className="bg-zinc-950 text-zinc-100">Chat Twitch</option>
              <option value="discord" className="bg-zinc-950 text-zinc-100">Bot Discord</option>
              <option value="site" className="bg-zinc-950 text-zinc-100">Site / Manual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Video Cards Grid/List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-180px)]">
        <AnimatePresence initial={false}>
          {(() => {
            // Sort users once by karma score to identify top 1, 2, 3 premium viewers
            const sortedUsers = [...(session.users || [])]
              .filter(u => !u.isHost)
              .sort((a, b) => {
                const scoreA = a.karmaDetails?.karma_score ?? a.reputation ?? 0;
                const scoreB = b.karmaDetails?.karma_score ?? b.reputation ?? 0;
                return scoreB - scoreA;
              });

            const top1 = sortedUsers[0];
            const top2 = sortedUsers[1];
            const top3 = sortedUsers[2];

            const getCloseTonsGradient = (color: string) => {
              let hex = color ? color.trim() : '#555555';
              if (!hex.startsWith('#')) {
                return `linear-gradient(to bottom, ${hex}, rgba(255, 255, 255, 0.02))`;
              }
              if (hex.length === 4) {
                hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
              }
              const r = parseInt(hex.substring(1, 3), 16);
              const g = parseInt(hex.substring(3, 5), 16);
              const b = parseInt(hex.substring(5, 7), 16);
              if (isNaN(r) || isNaN(g) || isNaN(b)) {
                return `linear-gradient(to bottom, ${color}, rgba(255, 255, 255, 0.02))`;
              }

              const rNorm = r / 255;
              const gNorm = g / 255;
              const bNorm = b / 255;
              const max = Math.max(rNorm, gNorm, bNorm);
              const min = Math.min(rNorm, gNorm, bNorm);
              let h = 0;
              let s = 0;
              const l = (max + min) / 2;

              if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                  case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
                  case gNorm: h = (bNorm - rNorm) / d + 2; break;
                  case bNorm: h = (rNorm - gNorm) / d + 4; break;
                }
                h /= 6;
              }

              const h1 = Math.round(h * 360);
              const s1 = Math.round(s * 100);
              const l1 = Math.round(l * 100);

              const h2 = (h1 + 12) % 360;
              const s2 = s1;
              const l2 = Math.max(12, l1 - 25);

              return `linear-gradient(to bottom, hsl(${h1}, ${s1}%, ${l1}%), hsl(${h2}, ${s2}%, ${l2}%))`;
            };

            return processedVideos.map((vid: Video, index: number) => {
              const isCurrent = session.currentVideoId === vid.id;
              const sender = session.users.find(u => u.name === vid.submitter || u.userId === vid.submitterId);
              const platform = getPlatformLabel(vid.url);
              const platformColor = getPlatformColor(platform);
              
              const spectatorColor = sender?.twitchData?.color || (vid.source === 'twitch' ? '#9146ff' : vid.source === 'discord' ? '#5865F2' : '#00FA6D');
              
              return (
                <motion.div
                  key={vid.id}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -5, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 180, damping: 20 }}
                  whileHover={{ scale: 1.015, y: -2, transition: { duration: 0.12 } }}
                  className={clsx(
                    "group relative w-full text-left p-3 block transition-all duration-300 overflow-hidden rounded-md cursor-pointer select-none",
                    isCurrent 
                      ? "bg-[#0d0d11]/95 border border-orange-500/25 shadow-[0_4px_25px_rgba(255,107,53,0.1)] backdrop-blur-sm" 
                      : "bg-[#0a0a0d]/90 border border-[#16161c] hover:border-zinc-800/80 hover:bg-[#0d0d11] backdrop-blur-sm shadow-md"
                  )}
                >
                    {/* Top Details */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        {tab === 'pending' && (
                          <span className="text-orange-400 font-extrabold pr-0.5"># {index + 1}</span>
                        )}
                        {isCurrent ? (
                          <span className="text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/30 text-[8px] tracking-wide font-extrabold uppercase animate-pulse flex items-center gap-1">
                            <span className="h-1 w-1 rounded-full bg-orange-500"></span>
                            Em Reprodução
                          </span>
                        ) : vid.status === 'pending' ? (
                          <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[8px] tracking-wide font-extrabold uppercase">
                            Pendente
                          </span>
                        ) : vid.status === 'approved' ? (
                          <span className="text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 text-[8px] tracking-wide font-extrabold uppercase">
                            Na Fila
                          </span>
                        ) : vid.status === 'watched' ? (
                          <span className="text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 text-[8px] tracking-wide font-extrabold uppercase">
                            Visto
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {vid.source === 'twitch' && (
                          <div className="text-[#9146FF] bg-[#9146FF]/10 p-0.5 rounded" title="Enviado pela Twitch">
                            <Twitch className="w-3.5 h-3.5 fill-current" />
                          </div>
                        )}
                        {vid.source === 'discord' && (
                          <div className="text-[#5865F2] bg-[#5865F2]/10 p-0.5 rounded" title="Enviado pelo Discord">
                            <DiscordIcon className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {(!vid.source || vid.source === 'site') && (
                          <div className="text-[#00FF66] bg-[#00FF66]/10 p-0.5 rounded" title="Enviado pelo Site">
                            <Terminal className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <span className={clsx("text-[8px] px-1 py-0.5 rounded border font-mono tracking-wider uppercase font-bold", platformColor)}>
                          {platform}
                        </span>
                      </div>
                    </div>

                    {/* Title & Link */}
                    <h4 className={clsx(
                      "text-xs font-bold line-clamp-1 break-all mb-1 font-sans",
                      isCurrent ? "text-orange-300" : "text-zinc-100 group-hover:text-orange-400"
                    )}>
                      {vid.title || "Mídia Sincronizada"}
                    </h4>
                    <p className="text-[10px] text-zinc-500 truncate font-mono mb-2" title={vid.url}>
                      {vid.url}
                    </p>

                    {/* Submitter User Profile */}
                    <div className="flex items-center justify-between gap-1 border-t border-white/10 pt-2 mt-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {renderAvatar(sender, vid.submitter)}
                        {(() => {
                          const isTop1 = top1 && (vid.submitterId === top1.userId || vid.submitter === top1.name);
                          const isTop2 = top2 && (vid.submitterId === top2.userId || vid.submitter === top2.name);
                          const isTop3 = top3 && (vid.submitterId === top3.userId || vid.submitter === top3.name);

                          if (isTop1) {
                            return (
                              <span className="text-[13.5px] font-black truncate leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-450 to-orange-500 [text-shadow:_0_1px_5px_rgba(245,158,11,0.15)] shrink-0">
                                @{vid.submitter} ★
                              </span>
                            );
                          }
                          if (isTop2) {
                            return (
                              <span className="text-[13.5px] font-black truncate leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-200 via-zinc-400 to-slate-200 [text-shadow:_0_1px_5px_rgba(203,213,225,0.15)] shrink-0">
                                @{vid.submitter} ★
                              </span>
                            );
                          }
                          if (isTop3) {
                            return (
                              <span className="text-[13.5px] font-black truncate leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-700 to-orange-300 [text-shadow:_0_1px_5px_rgba(180,83,9,0.15)] shrink-0">
                                @{vid.submitter} ★
                              </span>
                            );
                          }
                          return (
                            <span className="text-[13.5px] font-extrabold text-white truncate leading-tight tracking-tight shrink-0">
                              @{vid.submitter}
                            </span>
                          );
                        })()}
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
                          className="p-1 items-center justify-center bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded transition-all cursor-pointer" 
                          title="Tocar Agora"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                      )}
                    {vid.status === 'watched' && (
                      <button 
                        onClick={() => unwatchVideo(vid.id)} 
                        className="p-1 items-center justify-center bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white border border-cyan-500/20 rounded transition-all cursor-pointer" 
                        title="Restaurar para Fila"
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                    )}
                    <button 
                      onClick={() => reject(vid.id)} 
                      className="p-1 items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-550/20 rounded transition-all cursor-pointer" 
                      title="Excluir / Rejeitar"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        })()}
      </AnimatePresence>

        {processedVideos.length === 0 && (
          <div className="py-12 px-4 text-center text-zinc-650 flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="w-6 h-6 text-zinc-700" />
            <p className="text-xs italic font-mono">Nenhum vídeo nesta aba</p>
          </div>
        )}
      </div>
    </div>
  );
}
