import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Play, Check, X, Clock, ExternalLink, Twitch, Terminal, Sparkles, Award, Star, Flame, Radio, Youtube, Instagram, HelpCircle, Music
} from 'lucide-react';
import { clsx } from 'clsx';
import { SessionState, Video, User } from '../types';

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
  </svg>
);

// Get the user tier properties
export function getUserTierInfo(user: User | undefined) {
  if (!user) {
    return {
      rank: 0,
      label: '📼 VISITANTE',
      badgeColor: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
      gradientBorder: 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40',
      liquidGradient: 'from-zinc-600 to-zinc-400',
      glowShadow: 'shadow-none',
      cardClass: 'text-xs p-3',
      badgeIcon: HelpCircle,
      textColor: 'text-zinc-400',
      karmaBadge: 'Fita Nova',
      karmaColor: 'text-zinc-500',
      inkAmount: 1
    };
  }

  const isBroadcaster = user.twitchData?.isBroadcaster || user.twitchData?.badges?.includes('broadcaster') || user.isHost;
  const isModerator = user.twitchData?.isModerator || user.twitchData?.badges?.includes('moderator');
  const isVip = user.twitchData?.isVip || user.twitchData?.badges?.includes('vip');
  const isSubscriber = user.twitchData?.isSubscriber || user.twitchData?.badges?.includes('subscriber');
  
  const karmaScore = user.karmaDetails?.karma_score ?? user.reputation ?? 0;
  
  // Custom karma category details
  let karmaCategory = 'Fita Nova';
  let karmaColor = 'text-zinc-400';
  if (karmaScore >= 1000) {
    karmaCategory = 'Lenda Analógica';
    karmaColor = 'text-fuchsia-400';
  } else if (karmaScore >= 500) {
    karmaCategory = 'Arquivista';
    karmaColor = 'text-orange-400';
  } else if (karmaScore >= 200) {
    karmaCategory = 'Curador';
    karmaColor = 'text-amber-400';
  } else if (karmaScore >= 50) {
    karmaCategory = 'Colecionador';
    karmaColor = 'text-emerald-400';
  }

  // Broadcaster / Streamer / Owner (Rank 5)
  if (isBroadcaster) {
    return {
      rank: 5,
      label: '👑 SUPREMO',
      badgeColor: 'text-rose-400 bg-rose-500/15 border-rose-500/30 font-black animate-pulse',
      gradientBorder: 'border-red-500/40 hover:border-red-500 bg-gradient-to-br from-red-950/30 via-zinc-950/90 to-zinc-950 shadow-[0_0_20px_rgba(239,68,68,0.15)]',
      liquidGradient: 'from-red-600 via-rose-500 to-amber-500',
      glowShadow: 'glow-orange',
      cardClass: 'p-4 md:p-5 border-2',
      badgeIcon: Sparkles,
      textColor: 'text-red-400',
      karmaBadge: karmaCategory,
      karmaColor: karmaColor,
      inkAmount: 5
    };
  }

  // Moderator / Guard (Rank 4)
  if (isModerator) {
    return {
      rank: 4,
      label: '🛡️ STAFF MOD',
      badgeColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 font-bold',
      gradientBorder: 'border-emerald-500/30 hover:border-emerald-500/80 bg-gradient-to-br from-emerald-950/20 via-zinc-950 to-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
      liquidGradient: 'from-emerald-500 via-teal-400 to-cyan-500',
      glowShadow: 'glow-success',
      cardClass: 'p-4 border',
      badgeIcon: Flame,
      textColor: 'text-emerald-400',
      karmaBadge: karmaCategory,
      karmaColor: karmaColor,
      inkAmount: 4
    };
  }

  // VIP / Donor / Subscriber Elite (Rank 3)
  if (isVip) {
    return {
      rank: 3,
      label: '💎 ELITE VIP',
      badgeColor: 'text-fuchsia-400 bg-fuchsia-500/15 border-fuchsia-500/30 font-extrabold',
      gradientBorder: 'border-purple-500/30 hover:border-purple-500 bg-gradient-to-br from-purple-950/20 via-zinc-950 to-zinc-950 shadow-[0_0_15px_rgba(168,85,247,0.08)]',
      liquidGradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
      glowShadow: 'glow-purple',
      cardClass: 'p-3.5 border',
      badgeIcon: Award,
      textColor: 'text-fuchsia-400',
      karmaBadge: karmaCategory,
      karmaColor: karmaColor,
      inkAmount: 3
    };
  }

  // Live Subscriber (Rank 2)
  if (isSubscriber) {
    return {
      rank: 2,
      label: '⭐ SUB INSCRITO',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20 font-bold',
      gradientBorder: 'border-amber-600/20 hover:border-amber-500 bg-gradient-to-br from-amber-950/10 via-zinc-950 to-zinc-950',
      liquidGradient: 'from-amber-500 via-yellow-400 to-orange-500',
      glowShadow: 'shadow-[0_0_12px_rgba(245,158,11,0.05)]',
      cardClass: 'p-3 border',
      badgeIcon: Star,
      textColor: 'text-amber-400',
      karmaBadge: karmaCategory,
      karmaColor: karmaColor,
      inkAmount: 2
    };
  }

  // High Curation/Reputation (Rank 1)
  if (karmaScore >= 200) {
    return {
      rank: 1,
      label: '🔮 CURADOR',
      badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20 font-medium',
      gradientBorder: 'border-cyan-500/10 hover:border-cyan-500/40 bg-zinc-950/80',
      liquidGradient: 'from-cyan-500 to-indigo-500',
      glowShadow: 'shadow-none',
      cardClass: 'p-3 border',
      badgeIcon: Award,
      textColor: 'text-cyan-400',
      karmaBadge: karmaCategory,
      karmaColor: karmaColor,
      inkAmount: 1.5
    };
  }

  // Standard Viewer (Rank 0)
  return {
    rank: 0,
    label: '📼 ESPECTADOR',
    badgeColor: 'text-zinc-400 bg-zinc-800/40 border-zinc-700/30',
    gradientBorder: 'border-[#1f1f2e] hover:border-zinc-700 bg-zinc-950/40',
    liquidGradient: 'from-zinc-500 to-zinc-400',
    glowShadow: 'shadow-none',
    cardClass: 'p-3 border',
    badgeIcon: Clock,
    textColor: 'text-zinc-300',
    karmaBadge: karmaCategory,
    karmaColor: karmaColor,
    inkAmount: 1
  };
}

// Custom Liquid Ink progress bar component
export function LiquidInkProgressBar({ 
  progressPercent, 
  tierRank = 0, 
  gradientString, 
  isCurrent = false 
}: { 
  progressPercent: number; 
  tierRank: number; 
  gradientString: string; 
  isCurrent: boolean;
}) {
  const bubblesCount = useMemo(() => {
    if (tierRank >= 5) return 6;
    if (tierRank >= 3) return 4;
    if (tierRank >= 1) return 2;
    return 1;
  }, [tierRank]);

  const bubbleThemeClass = useMemo(() => {
    if (tierRank >= 5) return 'bg-rose-500 shadow-[0_0_8px_#ef4444]';
    if (tierRank >= 4) return 'bg-emerald-400 shadow-[0_0_8px_#10b981]';
    if (tierRank >= 3) return 'bg-purple-500 shadow-[0_0_8px_#a855f7]';
    if (tierRank >= 2) return 'bg-amber-400 shadow-[0_0_8px_#f59e0b]';
    if (tierRank >= 1) return 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]';
    return 'bg-zinc-550';
  }, [tierRank]);

  // Adjust thickness based on user tier
  const heightClass = tierRank >= 4 ? 'h-2.5' : tierRank >= 2 ? 'h-2' : 'h-1.5';

  return (
    <div className="w-full mt-2 select-none">
      {/* SVG Container for the organic liquid paint-spreading gooey filter */}
      <svg className="absolute w-0 h-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="liquid-goo-ink">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Progress Track */}
      <div className={clsx("w-full bg-zinc-950/80 rounded-full overflow-hidden relative border border-white/5", heightClass)}>
        {/* Core Progress Bar Indicator */}
        <div 
          className={clsx("h-full transition-all duration-300 rounded-full bg-gradient-to-r", gradientString)}
          style={{ width: `${Math.max(1.5, progressPercent)}%` }}
        />
      </div>

      {/* Spreading Liquid Gland / Bubbling Splashes (only active if playing or high tier on hover) */}
      {isCurrent && (
        <div 
          className="relative w-full -mt-2 liquid-gooey-container pointer-events-none"
          style={{ filter: 'url(#liquid-goo-ink)', height: '24px' }}
        >
          {/* Fluid Wave Anchor at exact progress handle */}
          <div 
            className="absolute top-0 flex items-center justify-center"
            style={{ 
              left: `${progressPercent}%`, 
              transform: 'translateX(-50%)',
              transition: 'left 300s linear' 
            }}
          >
            {/* The main dynamic ink droplet node */}
            <div className={clsx("rounded-full transition-all shrink-0 animate-pulse", bubbleThemeClass, tierRank >= 4 ? 'w-5 h-5' : 'w-4.5 h-4.5')} />
            
            {/* Morphing micro ink splatters merging together */}
            {Array.from({ length: bubblesCount }).map((_, idx) => {
              const animDelay = `${idx * 0.4}s`;
              const animDuration = `${4 + idx * 2}s`;
              const animClass = idx % 2 === 0 ? 'animate-ink-1' : idx % 3 === 0 ? 'animate-ink-3' : 'animate-ink-2';
              return (
                <div
                  key={idx}
                  className={clsx("absolute rounded-full shrink-0 opacity-80", bubbleThemeClass, animClass)}
                  style={{
                    width: `${8 + (idx * 2)}px`,
                    height: `${8 + (idx * 2)}px`,
                    animationDelay: animDelay,
                    animationDuration: animDuration,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface InteractiveQueueCardProps {
  video: Video;
  session: SessionState;
  variant: 'host' | 'participant';
  index?: number;
  isCurrent?: boolean;
  type?: 'pending' | 'queued' | 'history';
  playVideo?: (id: string) => void;
  reject?: (id: string) => void;
  approve?: (id: string) => void;
  unwatchVideo?: (id: string) => void;
}

export default function InteractiveQueueCard({
  video,
  session,
  variant,
  index,
  isCurrent = false,
  type = 'queued',
  playVideo,
  reject,
  approve,
  unwatchVideo
}: InteractiveQueueCardProps) {

  // Retrieve submitter metadata
  const sender = useMemo(() => {
    return session.users.find(u => u.name === video.submitter || u.userId === video.submitterId);
  }, [session.users, video.submitter, video.submitterId]);

  // Retrieve Tier Details
  const tier = useMemo(() => {
    return getUserTierInfo(sender);
  }, [sender]);

  // Video Platform configuration
  const platformDetails = useMemo(() => {
    const url = video.url.toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return { label: 'YouTube', icon: Youtube, color: 'text-red-500 bg-red-500/10 border-red-500/20' };
    }
    if (url.includes('tiktok.com')) {
      return { label: 'TikTok', icon: Music, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' };
    }
    if (url.includes('instagram.com')) {
      return { label: 'Instagram', icon: Instagram, color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' };
    }
    if (url.includes('twitch.tv')) {
      return { label: 'Twitch', icon: Twitch, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' };
    }
    return { label: 'Web Video', icon: Terminal, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' };
  }, [video.url]);

  // Submission Origin details
  const sourceDetails = useMemo(() => {
    switch (video.source) {
      case 'twitch':
        return { label: 'Twitch Bot', icon: Twitch, color: 'text-[#9146FF]' };
      case 'discord':
        return { label: 'Discord Bot', icon: DiscordIcon, color: 'text-[#5865F2]' };
      case 'site':
      default:
        return { label: 'Website UI', icon: Terminal, color: 'text-[#00FF66]' };
    }
  }, [video.source]);

  // Format timestamp helper
  const formatTime = (secs?: number) => {
    if (secs === undefined || isNaN(secs) || secs === 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Safe karma extraction
  const karmaRating = useMemo(() => {
    return sender?.karmaDetails?.karma_score ?? sender?.reputation ?? 50;
  }, [sender]);

  // Build reactive progress
  const progressPercent = useMemo(() => {
    const duration = video.duration || 180;
    if (isCurrent && session.currentTime) {
      return Math.min(100, (session.currentTime / duration) * 100);
    }
    if (video.status === 'watched') return 100;
    return 0;
  }, [isCurrent, session.currentTime, video.duration, video.status]);

  const progressLabel = useMemo(() => {
    const duration = video.duration || 0;
    if (isCurrent) {
      return `${formatTime(Math.floor(session.currentTime || 0))} / ${formatTime(duration || 180)}`;
    }
    if (video.status === 'watched') return `Concluído (${formatTime(duration)})`;
    return duration > 0 ? `Duração: ${formatTime(duration)}` : 'Duração: --:--';
  }, [isCurrent, session.currentTime, video.duration, video.status]);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.97, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className={clsx(
        "group relative rounded-sm text-left transition-all duration-300 overflow-hidden",
        tier.gradientBorder,
        tier.cardClass,
        isCurrent ? "scale-[1.015] shadow-lg ring-1 ring-orange-500/20" : ""
      )}
    >
      {/* Absolute Dynamic Neon Fluid Liquid Overlay Accent for Highest Tiers */}
      {isCurrent && (
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 via-red-500 to-purple-600 animate-pulse" />
      )}

      {/* Decorative background liquid ripple that glows on hover */}
      <div className="absolute inset-0 bg-radial-gradient from-white/2 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0" />

      {/* Inner layout container relative to capture absolute overlays */}
      <div className="relative z-10 space-y-2.5">
        
        {/* Top Header Row of the Card */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Details: Queue Index + Status Label */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {index !== undefined && (
              <span className="text-orange-400 font-extrabold pr-0.5 text-xs font-mono">
                # {index}
              </span>
            )}
            
            {/* Status indicators */}
            {isCurrent ? (
              <span className="text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-sm border border-orange-500/30 text-[9px] uppercase tracking-wider font-extrabold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping"></span>
                Em Reprodução
              </span>
            ) : video.status === 'pending' ? (
              <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm border border-amber-550/20 text-[8px] uppercase tracking-wider font-extrabold">
                Pendente
              </span>
            ) : video.status === 'approved' ? (
              <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-sm border border-emerald-550/20 text-[8px] uppercase tracking-wider font-extrabold">
                Aprovado
              </span>
            ) : video.status === 'watched' ? (
              <span className="text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded-sm border border-zinc-700/50 text-[8px] uppercase tracking-wider font-bold">
                Histórico
              </span>
            ) : null}

            {/* Custom Submitter Tier Label */}
            <span className={clsx("text-[8px] px-1.5 py-0.5 rounded-sm border uppercase font-mono tracking-wider font-extrabold flex items-center gap-1", tier.badgeColor)}>
              <tier.badgeIcon className="w-2.5 h-2.5" />
              {tier.label}
            </span>
          </div>

          {/* Right Details: Submission Source + Media Platform */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Platform Badge */}
            <span className={clsx("text-[8px] px-1.5 py-0.5 rounded-sm border font-mono tracking-wider font-extrabold uppercase flex items-center gap-1", platformDetails.color)}>
              <platformDetails.icon className="w-3 h-3 shrink-0" />
              {platformDetails.label}
            </span>

            {/* Origin Badge */}
            <span 
              className="text-[8px] px-1.5 py-0.5 rounded-sm border border-zinc-800/80 bg-zinc-950/80 font-mono tracking-wider font-medium uppercase flex items-center gap-1"
              title={`Enviado via ${sourceDetails.label}`}
            >
              <sourceDetails.icon className={clsx("w-3 h-3 shrink-0", sourceDetails.color)} />
              <span className="hide-sm text-[8px]">{video.source || 'site'}</span>
            </span>
          </div>
        </div>

        {/* Video Title and Submitter Details */}
        <div className="space-y-1">
          <h4 className={clsx(
            "text-xs md:text-sm font-extrabold line-clamp-1 break-all tracking-tight font-sans transition-colors",
            isCurrent ? "text-orange-400" : "text-zinc-100 group-hover:text-orange-400"
          )}>
            {video.title || "Mídia Sincronizada"}
          </h4>
          <p className="text-[10px] text-zinc-550 truncate font-mono block hover:text-zinc-400 transition-colors" title={video.url}>
            {video.url}
          </p>
        </div>

        {/* User Stats / Karma Rating */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/40 border border-[#1f1f2e]/60 rounded-sm p-2">
          {/* Submitter Bio */}
          <div className="flex items-center gap-2 min-w-0">
            {sender?.twitchData?.avatarUrl ? (
              <img 
                src={sender.twitchData.avatarUrl} 
                alt={video.submitter} 
                className="w-5.5 h-5.5 rounded-full object-cover border border-zinc-700 bg-neutral-900 shrink-0 select-none"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div 
                className="w-5.5 h-5.5 rounded-full flex items-center justify-center font-bold text-[9px] text-white shrink-0 border border-zinc-700 select-none"
                style={{ backgroundColor: sender?.twitchData?.color || '#555555' }}
              >
                {(video.submitter || '?').substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 leading-none">
              <span 
                className="text-[11px] font-extrabold truncate block hover:underline cursor-pointer"
                style={{ color: sender?.twitchData?.color || '#a1a1aa' }}
              >
                @{video.submitter}
              </span>
              <span className={clsx("text-[8px] font-mono font-bold tracking-widest uppercase block mt-0.5", tier.karmaColor)}>
                🔮 {tier.karmaBadge}
              </span>
            </div>
          </div>

          {/* Karma Score indicators */}
          <div className="flex items-center gap-3 font-mono shrink-0">
            <div className="flex flex-col items-end leading-none">
              <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider">Karma</span>
              <span className={clsx("text-[11px] font-extrabold mt-0.5", tier.karmaColor)}>{karmaRating} pts</span>
            </div>
            
            <div className="flex flex-col items-end leading-none border-l border-zinc-800/60 pl-3">
              <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider">Envios</span>
              <span className="text-[11px] font-black text-zinc-300 mt-0.5">#{sender?.totalSubmitted || 1}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Liquid Progress Indicator */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
            <span>{progressLabel}</span>
            {isCurrent && (
              <span className="text-orange-400 font-extrabold animate-pulse">REPRODUZINDO</span>
            )}
          </div>
          <LiquidInkProgressBar 
            progressPercent={progressPercent} 
            tierRank={tier.rank} 
            gradientString={tier.liquidGradient} 
            isCurrent={isCurrent || video.status === 'watched'} 
          />
        </div>

        {/* Action Buttons Footer (Conditional by Variant) */}
        <div className="flex items-center justify-between gap-2 border-t border-[#1f1f2e] pt-2.5 mt-1.5">
          <div className="text-[9px] font-mono text-zinc-650">
            Enviado há {new Date(video.timestamp).toLocaleTimeString()}
          </div>

          <div className="flex gap-1.5 items-center">
            {variant === 'host' ? (
              <>
                {video.status === 'pending' && approve && (
                  <button 
                    onClick={() => approve(video.id)} 
                    className="h-7 px-2.5 flex items-center gap-1 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-sm text-[10px] font-mono font-bold transition-all cursor-pointer" 
                    title="Aprovar Vídeo"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>APROVAR</span>
                  </button>
                )}
                {!isCurrent && (video.status === 'approved' || video.status === 'pending') && playVideo && (
                  <button 
                    onClick={() => playVideo(video.id)} 
                    className="h-7 px-2.5 flex items-center gap-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded-sm text-[10px] font-mono font-bold transition-all cursor-pointer" 
                    title="Tocar Agora"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>TOCAR</span>
                  </button>
                )}
                {video.status === 'watched' && unwatchVideo && (
                  <button 
                    onClick={() => unwatchVideo(video.id)} 
                    className="h-7 px-2.5 flex items-center gap-1 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white border border-cyan-500/20 rounded-sm text-[10px] font-mono font-bold transition-all cursor-pointer" 
                    title="Restaurar para Fila"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>RESTAURAR</span>
                  </button>
                )}
                {reject && (
                  <button 
                    onClick={() => reject(video.id)} 
                    className="h-7 w-7 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-550/20 rounded-sm transition-all cursor-pointer" 
                    title="Excluir / Rejeitar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              // Participant interactions
              <a 
                href={video.url} 
                target="_blank" 
                rel="noreferrer" 
                className="h-7 px-2.5 flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-650 text-[10px] font-mono font-bold rounded-sm transition-all"
                title="Abrir URL do arquivo"
              >
                <span>VISUALIZAR</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
