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

// Get the user tier properties (retained for backward compatibility if ever needed)
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
    return 'bg-zinc-500';
  }, [tierRank]);

  const heightClass = tierRank >= 4 ? 'h-2' : 'h-1.5';

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
          style={{ filter: 'url(#liquid-goo-ink)', height: '20px' }}
        >
          {/* Fluid Wave Anchor at exact progress handle */}
          <div 
            className="absolute top-0 flex items-center justify-center animate-pulse"
            style={{ 
              left: `${progressPercent}%`, 
              transform: 'translateX(-50%)',
              transition: 'left 300s linear' 
            }}
          >
            <div className={clsx("rounded-full transition-all shrink-0", bubbleThemeClass, 'w-4 h-4')} />
            
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
                    width: `${6 + (idx * 2)}px`,
                    height: `${6 + (idx * 2)}px`,
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

  // Compute the submitter's global ranking in terms of reputation/karma sorted list
  const rankingPosition = useMemo(() => {
    if (!sender) return 0;
    const sortedRanking = [...session.users]
      .filter((u) => !u.isHost) // Exclui hosts
      .sort((a, b) => {
        const scoreA = a.karmaDetails?.karma_score ?? a.reputation ?? 0;
        const scoreB = b.karmaDetails?.karma_score ?? b.reputation ?? 0;
        return scoreB - scoreA;
      });
    const idx = sortedRanking.findIndex(u => u.name === sender.name || u.userId === sender.userId);
    return idx >= 0 ? idx + 1 : 0;
  }, [session.users, sender]);

  // Design distinct visual properties based on overall reputation/karma rank tier
  const tier = useMemo(() => {
    const isBroadcaster = sender?.twitchData?.isBroadcaster || sender?.twitchData?.badges?.includes('broadcaster') || sender?.isHost;
    
    if (isBroadcaster) {
      return {
        rankNum: 0,
        label: '👑 SUPREMO',
        positionBadge: 'HOST',
        badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20 font-black tracking-widest',
        wrapperClass: 'glass-crt border-rose-500/30 hover:border-rose-500/60 bg-zinc-950/45 shadow-[0_0_20px_rgba(244,63,94,0.1)] ring-1 ring-rose-500/20',
        textColor: 'text-rose-400',
        avatarBorder: 'border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]',
        liquidGradient: 'from-rose-500 to-red-600',
        glowShadow: 'glow-orange',
        badgeIcon: Sparkles,
        hasLiquid: true,
        containerPadding: 'p-4 border-2',
        accentColor: 'text-rose-400',
        backgroundStyle: 'rgba(239, 68, 68, 0.03)'
      };
    }

    if (rankingPosition === 1) {
      return {
        rankNum: 1,
        label: '👑 LENDÁRIO',
        positionBadge: 'TOP 1',
        badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30 font-black uppercase tracking-wider animate-pulse',
        wrapperClass: 'glass-crt border-amber-500/50 bg-zinc-950/50 shadow-[0_0_25px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30',
        textColor: 'text-amber-400',
        avatarBorder: 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]',
        liquidGradient: 'from-amber-500 via-orange-500 to-yellow-300',
        glowShadow: 'glow-orange',
        badgeIcon: Sparkles,
        hasLiquid: true,
        containerPadding: 'p-4 md:p-5 border-2',
        accentColor: 'text-amber-400',
        backgroundStyle: 'rgba(245, 158, 11, 0.04)'
      };
    }

    if (rankingPosition === 2) {
      return {
        rankNum: 2,
        label: '🔮 ÉPICO',
        positionBadge: 'TOP 2',
        badgeColor: 'text-fuchsia-400 bg-fuchsia-500/15 border-fuchsia-500/30 font-extrabold uppercase tracking-wider',
        wrapperClass: 'glass-crt border-fuchsia-500/40 bg-zinc-950/50 shadow-[0_0_22px_rgba(168,85,247,0.12)] ring-1 ring-fuchsia-500/20',
        textColor: 'text-fuchsia-400',
        avatarBorder: 'border-fuchsia-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]',
        liquidGradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
        glowShadow: 'glow-purple',
        badgeIcon: Flame,
        hasLiquid: true,
        containerPadding: 'p-4 border',
        accentColor: 'text-fuchsia-400',
        backgroundStyle: 'rgba(168, 85, 247, 0.03)'
      };
    }

    if (rankingPosition === 3) {
      return {
        rankNum: 3,
        label: '💎 RARO',
        positionBadge: 'TOP 3',
        badgeColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/35 font-extrabold uppercase tracking-wider',
        wrapperClass: 'glass-crt border-cyan-500/35 bg-zinc-950/50 shadow-[0_0_18px_rgba(6,182,212,0.1)] ring-1 ring-cyan-500/15',
        textColor: 'text-cyan-400',
        avatarBorder: 'border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]',
        liquidGradient: 'from-cyan-500 to-indigo-500',
        glowShadow: 'glow-success',
        badgeIcon: Award,
        hasLiquid: true,
        containerPadding: 'p-4 border',
        accentColor: 'text-cyan-400',
        backgroundStyle: 'rgba(6, 182, 212, 0.02)'
      };
    }

    if (rankingPosition >= 4 && rankingPosition <= 10) {
      return {
        rankNum: rankingPosition,
        label: `✨ ELITE`,
        positionBadge: `#${rankingPosition}`,
        badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-bold uppercase tracking-wider',
        wrapperClass: 'glass-crt border-emerald-500/20 hover:border-emerald-500/50 bg-zinc-950/40 shadow-sm ring-1 ring-emerald-500/10',
        textColor: 'text-emerald-400',
        avatarBorder: 'border-emerald-500/50',
        liquidGradient: 'from-emerald-500 via-teal-400 to-cyan-500',
        glowShadow: 'shadow-none',
        badgeIcon: Star,
        hasLiquid: false,
        containerPadding: 'p-3.5 border',
        accentColor: 'text-emerald-400',
        backgroundStyle: 'rgba(16, 185, 129, 0.01)'
      };
    }

    // Standard (11+)
    const posLabel = rankingPosition > 0 ? `#${rankingPosition}` : 'NEW';
    return {
      rankNum: rankingPosition,
      label: `📼 RANKED`,
      positionBadge: posLabel,
      badgeColor: 'text-zinc-400 bg-zinc-900/60 border-zinc-800/80 font-mono text-[9px]',
      wrapperClass: 'glass-crt border-[#1f1f2e] hover:border-zinc-700 bg-zinc-950/30',
      textColor: 'text-zinc-400',
      avatarBorder: 'border-zinc-800',
      liquidGradient: 'from-zinc-500 to-zinc-400',
      glowShadow: 'shadow-none',
      badgeIcon: Clock,
      hasLiquid: false,
      containerPadding: 'p-3 border',
      accentColor: 'text-zinc-300',
      backgroundStyle: 'transparent'
    };
  }, [rankingPosition, sender]);

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

  // Format timestamp helper
  const formatTime = (secs?: number) => {
    if (secs === undefined || isNaN(secs) || secs === 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
    <>
      {/* Self-contained SVG definition for chemical-organic liquid ink and border aura spreading gooey effect */}
      <svg className="absolute w-0 h-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="liquid-border-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="heavyGoo" />
            <feBlend in="SourceGraphic" in2="heavyGoo" />
          </filter>
        </defs>
      </svg>

      <motion.div
        layout="position"
        initial={{ opacity: 0, scale: 0.97, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -8 }}
        transition={{ type: "spring", stiffness: 220, damping: 25 }}
        className={clsx(
          "group relative rounded-sm text-left transition-all duration-300 overflow-hidden backdrop-blur-md",
          tier.wrapperClass,
          tier.containerPadding,
          isCurrent ? "scale-[1.015] ring-2 ring-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.1)]" : ""
        )}
        style={{ backgroundColor: tier.backgroundStyle }}
      >
        {/* Absolute Liquid Ink Spreading Border Effect Aura (Top level ranks only) */}
        {tier.hasLiquid && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 rounded-sm">
            <div 
              className="absolute -inset-[15px] flex items-center justify-center opacity-30 blur-[2px]"
              style={{ filter: 'url(#liquid-border-goo)' }}
            >
              <div className={clsx("absolute w-16 h-16 rounded-full animate-ink-1 bg-gradient-to-r", tier.liquidGradient)} style={{ left: '5%', top: '5%' }} />
              <div className={clsx("absolute w-20 h-20 rounded-full animate-ink-2 bg-gradient-to-r", tier.liquidGradient)} style={{ right: '5%', bottom: '5%' }} />
              <div className={clsx("absolute w-14 h-14 rounded-full animate-ink-3 bg-gradient-to-r", tier.liquidGradient)} style={{ left: '40%', top: '35%' }} />
            </div>
          </div>
        )}

        {/* Dynamic playing subtle indicator bar */}
        {isCurrent && (
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 via-rose-500 to-purple-600 animate-pulse z-20" />
        )}

        {/* Ambient light glow inside on hover */}
        <div className="absolute inset-0 bg-radial-gradient from-white/3 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

        {/* Main Content Layout Block */}
        <div className="relative z-10 space-y-3">
          
          {/* Header Row: Position on Ranking & Media controls status */}
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
            
            {/* Rank Position Designation Badge (Exibido de forma extremamente destacada) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={clsx(
                "font-mono font-black text-xs px-2 py-0.5 rounded-sm tracking-wider uppercase border shadow-inner shrink-0",
                tier.badgeColor
              )}>
                {tier.positionBadge}
              </span>
              
              <span className={clsx("text-[9px] uppercase font-mono tracking-widest font-black shrink-0 hidden sm:inline-block", tier.textColor)}>
                RANKING GERAL
              </span>
            </div>

            {/* Media Queue list position, index and Playing status label */}
            <div className="flex items-center gap-1.5 shrink-0">
              {index !== undefined && (
                <span className="text-orange-400/90 font-mono text-[10px] font-extrabold bg-orange-500/5 px-1.5 py-0.5 border border-orange-500/10 rounded">
                  FILA #{index}
                </span>
              )}
              
              {isCurrent ? (
                <span className="text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-sm border border-orange-500/30 text-[9px] uppercase tracking-wider font-extrabold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                  REPRODUZINDO
                </span>
              ) : video.status === 'pending' ? (
                <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm border border-amber-500/20 text-[8px] uppercase tracking-wider font-extrabold">
                  Pendente
                </span>
              ) : video.status === 'approved' ? (
                <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-sm border border-emerald-500/20 text-[8px] uppercase tracking-wider font-extrabold">
                  Aprovado
                </span>
              ) : video.status === 'watched' ? (
                <span className="text-zinc-500 bg-zinc-800/40 px-1.5 py-0.5 rounded-sm border border-zinc-750/50 text-[8px] uppercase tracking-wider font-bold">
                  Visto
                </span>
              ) : null}
            </div>
          </div>

          {/* User Bio Line: Unified clean presentation holding essential info */}
          <div className="flex items-center justify-between gap-3 p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
            
            {/* Left: Avatar & Name */}
            <div className="flex items-center gap-2 min-w-0">
              {sender?.twitchData?.avatarUrl ? (
                <img 
                  src={sender.twitchData.avatarUrl} 
                  alt={video.submitter} 
                  className={clsx(
                    "w-7 h-7 rounded-full object-cover bg-black shrink-0 transition-transform duration-200 group-hover:scale-105 border",
                    tier.avatarBorder
                  )}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div 
                  className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] text-white shrink-0 border",
                    tier.avatarBorder
                  )}
                  style={{ backgroundColor: sender?.twitchData?.color || '#33333b' }}
                >
                  {(video.submitter || '?').substring(0, 2).toUpperCase()}
                </div>
              )}
              
              <div className="min-w-0 leading-none">
                <span 
                  className="text-xs font-black truncate block hover:underline cursor-pointer tracking-tight"
                  style={{ color: sender?.twitchData?.color || '#cbcbda' }}
                >
                  @{video.submitter}
                </span>
                
                {/* Visual Tier Label Badge */}
                <span className={clsx("text-[8px] font-mono tracking-widest uppercase font-extrabold flex items-center gap-0.5 mt-0.5", tier.textColor)}>
                  <tier.badgeIcon className="w-2.5 h-2.5 inline-block shrink-0" />
                  {tier.label}
                </span>
              </div>
            </div>

            {/* Right: Submission origin provider (Unified Compact Badge to reduce clutter) */}
            <div className="flex items-center gap-1 hover:opacity-100 opacity-80 transition-opacity">
              <span className={clsx("text-[8px] px-1.5 py-0.5 rounded font-mono font-extrabold uppercase flex items-center gap-1 border", platformDetails.color)}>
                <platformDetails.icon className="w-3 h-3 shrink-0" />
                {platformDetails.label}
              </span>
            </div>
          </div>

          {/* Media Info block: High quality typography focus */}
          <div className="space-y-1 py-1 text-left">
            <h4 className={clsx(
              "text-sm font-extrabold tracking-tight font-sans line-clamp-2 leading-tight transition-colors break-words",
              isCurrent ? "text-orange-400" : "text-white group-hover:text-orange-400"
            )}>
              {video.title || "Mídia Sincronizada"}
            </h4>
            
            <a 
              href={video.url} 
              target="_blank" 
              rel="noreferrer" 
              className="text-[9px] text-zinc-500 font-mono block truncate hover:text-orange-300 transition-colors hover:underline max-w-sm"
              title={video.url}
            >
              {video.url}
            </a>
          </div>

          {/* Durational Progress tracking element */}
          <div className="space-y-0.5">
            <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
              <span className="font-semibold">{progressLabel}</span>
              {isCurrent && (
                <span className="text-orange-500 bg-orange-500/10 px-1 py-0.3 rounded text-[8px] font-black animate-pulse">REPRODUZINDO</span>
              )}
            </div>
            
            <LiquidInkProgressBar 
              progressPercent={progressPercent} 
              tierRank={tier.rankNum}
              gradientString={tier.liquidGradient} 
              isCurrent={isCurrent || video.status === 'watched'} 
            />
          </div>

          {/* Action buttons footer for Host/Participant */}
          <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2 mt-1">
            <div className="text-[8px] font-mono text-zinc-650">
              Enviado às {new Date(video.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
            </div>

            <div className="flex gap-1 items-center shrink-0">
              {variant === 'host' ? (
                <>
                  {video.status === 'pending' && approve && (
                    <button 
                      onClick={() => approve(video.id)} 
                      className="h-6.5 px-2.5 flex items-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 rounded-sm text-[9px] font-mono font-bold transition-all cursor-pointer shadow-sm hover:shadow-emerald-500/10" 
                      title="Aprovar Vídeo"
                    >
                      <Check className="w-3 h-3" />
                      <span>APROVAR</span>
                    </button>
                  )}
                  {!isCurrent && (video.status === 'approved' || video.status === 'pending') && playVideo && (
                    <button 
                      onClick={() => playVideo(video.id)} 
                      className="h-6.5 px-2.5 flex items-center gap-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded-sm text-[9px] font-mono font-bold transition-all cursor-pointer shadow-sm hover:shadow-orange-500/10" 
                      title="Tocar Agora"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>TOCAR</span>
                    </button>
                  )}
                  {video.status === 'watched' && unwatchVideo && (
                    <button 
                      onClick={() => unwatchVideo(video.id)} 
                      className="h-6.5 px-2.5 flex items-center gap-1 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white border border-cyan-500/20 rounded-sm text-[9px] font-mono font-bold transition-all cursor-pointer shadow-sm" 
                      title="Restaurar para Fila"
                    >
                      <Clock className="w-3 h-3" />
                      <span>RESTAURAR</span>
                    </button>
                  )}
                  {reject && (
                    <button 
                      onClick={() => reject(video.id)} 
                      className="h-6.5 w-6.5 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-sm transition-all cursor-pointer hover:shadow-red-500/10" 
                      title="Excluir / Rejeitar"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </>
              ) : (
                <a 
                  href={video.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="h-6.5 px-2.5 flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 text-[9px] font-mono font-bold rounded-sm transition-all shadow-sm"
                  title="Abrir URL do arquivo"
                >
                  <span>VISUALIZAR</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

        </div>
      </motion.div>
    </>
  );
}
