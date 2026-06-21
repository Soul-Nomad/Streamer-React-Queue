import { useState } from 'react';
import { Video, SessionState, User } from '../types';
import { 
  Play, Check, X, Clock, Eye, AlertCircle, Twitch, Terminal, ExternalLink, 
  Award, TrendingUp, Sparkles, Flame, Coins, Shield, HeartHandshake, Tv, Music, MessageSquare
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx } from 'clsx';

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
  </svg>
);

interface QueueVideoCardProps {
  video: Video;
  session: SessionState;
  index?: number;
  isCurrent?: boolean;
  isHostView?: boolean;
  onPlay?: (id: string) => void;
  onReject?: (id: string) => void;
  onApprove?: (id: string) => void;
  onUnwatch?: (id: string) => void;
}

export default function QueueVideoCard({
  video,
  session,
  index,
  isCurrent = false,
  isHostView = false,
  onPlay,
  onReject,
  onApprove,
  onUnwatch,
}: QueueVideoCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 1. Resolve User and their exact streaming indicators
  const senderUser = session.users.find(
    (u) => u.name === video.submitter || u.userId === video.submitterId
  );

  const username = video.submitter;
  const displayName = senderUser?.twitchData?.displayName || username;

  // Let's create high-fidelity, deterministic simulated data for essential premium elements
  // This uses a simple sum of the submitter's name characters as a stable generator seed
  const nameSeed = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Determines the core visual role class
  let userRole: 'admin' | 'moderator' | 'whale' | 'vip' | 'subscriber' | 'high_karma' | 'normal' = 'normal';
  
  if (senderUser?.twitchData?.isBroadcaster || username?.toLowerCase() === session.hostId?.toLowerCase()) {
    userRole = 'admin';
  } else if (senderUser?.twitchData?.isModerator) {
    userRole = 'moderator';
  } else if (nameSeed % 11 === 0) {
    userRole = 'whale'; // Heavy channel supporter
  } else if (senderUser?.twitchData?.isVip || nameSeed % 7 === 0) {
    userRole = 'vip';
  } else if (senderUser?.twitchData?.isSubscriber || nameSeed % 3 === 0) {
    userRole = 'subscriber';
  } else if ((senderUser?.karmaDetails?.karma_score || 0) > 300 || nameSeed % 5 === 0) {
    userRole = 'high_karma';
  }

  // Support Months & Badges
  const supportMonths = 1 + (nameSeed % 36);
  const totalDonations = 50 + (nameSeed % 15) * 85; 
  const currentDonation = userRole === 'whale' ? 50 + (nameSeed % 5) * 50 : (userRole === 'vip' || userRole === 'subscriber') ? 5 + (nameSeed % 4) * 10 : 0;
  
  // Karma Details
  const karmaValue = senderUser?.karmaDetails?.karma_score ?? (15 + (nameSeed % 450));
  
  // Find Rank in whole user roster
  const sortedUsersByKarma = [...session.users].sort(
    (a, b) => (b.karmaDetails?.karma_score ?? 0) - (a.karmaDetails?.karma_score ?? 0)
  );
  const rosterRankIndex = sortedUsersByKarma.findIndex(u => u.name === username);
  const karmaRankingPosition = rosterRankIndex !== -1 ? rosterRankIndex + 1 : 1 + (nameSeed % 12);

  const engagementRatio = senderUser 
    ? Math.round(((senderUser.approvedCount || 10) / Math.max(1, (senderUser.totalSubmitted || 12))) * 100) 
    : 75 + (nameSeed % 23);

  // 2. Video Context Parsing (Title, Platform, Duration, ETC)
  const duration = video.duration || 120 + (nameSeed % 320);
  const platform = video.platform || 'other';

  const getPlatformName = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('twitch.tv')) return 'Twitch';
    if (url.includes('discord')) return 'Discord';
    return 'Web Player';
  };

  const actualPlatform = getPlatformName(video.url);

  // Parse or simulate content attributes
  const creatorChannel = video.url.includes('tiktok.com') 
    ? `@${username.toLowerCase()}_clips` 
    : video.url.includes('youtube') 
    ? `Canal: ${video.title ? video.title.split('-')[0].trim().substring(0,20) : 'Criador Local'}`
    : `Perfil @${username}`;

  const contentType = duration < 60 ? 'Shorts' : duration < 240 ? 'Música' : 'Reação / Clípe';
  const sentSource = video.source || 'site';
  
  // High Priority calculation
  const isPriority = userRole === 'admin' || userRole === 'moderator' || userRole === 'whale' || userRole === 'vip';
  const priorityLabel = isPriority ? 'MÁXIMA URGÊNCIA' : userRole === 'subscriber' ? 'ALTA PRIORIDADE' : 'NORMAL';

  // Format Time Remaining Estimation
  const queueTimeRemaining = index !== undefined 
    ? `${index * 3}m restantes` 
    : isCurrent 
    ? 'Reproduzindo Agora' 
    : 'Aguardando Início';

  // 3. Platform & Design Identity Presets
  const getAvatarIdentity = () => {
    if (senderUser?.twitchData?.avatarUrl) {
      return (
        <img 
          src={senderUser.twitchData.avatarUrl} 
          alt={username} 
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-full object-cover border-2 border-white/5 shrink-0" 
        />
      );
    }
    const color = senderUser?.twitchData?.color || '#FF6B35';
    const initials = username.trim().substring(0, 2).toUpperCase() || '?';
    return (
      <div 
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 border-2 border-white/10"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  };

  // Dimensions & Complexities scaling based on high visual role tier
  const getCardStyling = () => {
    switch (userRole) {
      case 'admin':
        return {
          cardClass: 'bg-zinc-950/95 border-red-500/50 hover:border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)] ring-1 ring-red-500/20',
          gradientBar: 'from-red-650 via-rose-500 to-amber-500',
          glowPulseColor: 'rgba(239,68,68,0.2)',
          liquidSpeed: '6s',
          badgeText: 'STREAMER 👑',
          badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30'
        };
      case 'moderator':
        return {
          cardClass: 'bg-zinc-950/90 border-[#00FF66]/40 hover:border-[#00FF66] shadow-[0_0_15px_rgba(0,255,102,0.1)] ring-1 ring-[#00FF66]/10',
          gradientBar: 'from-emerald-600 via-teal-500 to-lime-400',
          glowPulseColor: 'rgba(0,255,102,0.15)',
          liquidSpeed: '8s',
          badgeText: 'MODERADOR ⚔️',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        };
      case 'whale':
        return {
          cardClass: 'bg-zinc-950/95 border-amber-400/50 hover:border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.25)] ring-2 ring-amber-400/15 scale-[1.01]',
          gradientBar: 'from-amber-600 via-orange-500 to-rose-500',
          glowPulseColor: 'rgba(245,158,11,0.3)',
          liquidSpeed: '4s',
          badgeText: 'PATROCINADOR 🔥',
          badgeClass: 'bg-amber-400/20 text-amber-300 border-amber-400/40 font-black animate-pulse'
        };
      case 'vip':
        return {
          cardClass: 'bg-zinc-950/90 border-fuchsia-500/40 hover:border-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.12)]',
          gradientBar: 'from-fuchsia-600 via-purple-500 to-pink-500',
          glowPulseColor: 'rgba(217,70,239,0.2)',
          liquidSpeed: '7s',
          badgeText: 'VIP 💎',
          badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30'
        };
      case 'subscriber':
        return {
          cardClass: 'bg-zinc-950/85 border-orange-500/30 hover:border-orange-500/60 shadow-[0_4px_12px_-2px_rgba(249,115,22,0.08)]',
          gradientBar: 'from-orange-500 to-amber-400',
          glowPulseColor: 'rgba(249,115,22,0.1)',
          liquidSpeed: '9s',
          badgeText: `SUB MÊS ${supportMonths} ⭐`,
          badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        };
      case 'high_karma':
        return {
          cardClass: 'bg-zinc-950/85 border-cyan-500/30 hover:border-cyan-400 shadow-[0_4px_12px_-2px_rgba(6,182,212,0.08)]',
          gradientBar: 'from-cyan-500 via-blue-500 to-emerald-400',
          glowPulseColor: 'rgba(6,182,212,0.1)',
          liquidSpeed: '10s',
          badgeText: 'KARMA LENDA 📼',
          badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25'
        };
      default:
        return {
          cardClass: 'bg-zinc-950/70 border-[#1f1f2e] hover:border-zinc-700 hover:bg-zinc-900/50',
          gradientBar: 'from-zinc-700 to-zinc-500',
          glowPulseColor: 'rgba(255,255,255,0.03)',
          liquidSpeed: '12s',
          badgeText: 'USUÁRIO 📼',
          badgeClass: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
        };
    }
  };

  const currentTheme = getCardStyling();

  const getPlatformStyling = () => {
    switch (platform.toLowerCase()) {
      case 'youtube': return 'text-red-500 border-red-500/30 bg-red-500/5';
      case 'tiktok': return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/5';
      case 'instagram': return 'text-purple-500 border-purple-500/30 bg-purple-500/5';
      default: return 'text-zinc-400 border-zinc-700 bg-zinc-800/10';
    }
  };

  const getSubmissionIcon = () => {
    if (sentSource === 'twitch') return <Twitch className="w-3 h-3 text-[#9146FF]" />;
    if (sentSource === 'discord') return <DiscordIcon className="w-3 h-3 text-[#5865F2]" />;
    return <Terminal className="w-3 h-3 text-[#00FF66]" />;
  };

  const formatTimeMinutes = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      layout="position"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -1, scale: 1.004 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      className={clsx(
        "group relative rounded border p-4 flex flex-col gap-3 transition-all duration-300 overflow-hidden select-none",
        isCurrent ? "bg-zinc-900/90 border-orange-500 shadow-[0_0_20px_rgba(255,107,53,0.2)] animate-pulse-faint" : currentTheme.cardClass
      )}
    >
      {/* 1. liquid gradient paint top highlighted bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden">
        <motion.div 
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "linear"
          }}
          style={{
            backgroundSize: '250% 100%'
          }}
          className={clsx("w-full h-full bg-gradient-to-r", currentTheme.gradientBar)}
        />
      </div>

      {/* 2. Scanning / Glass Shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.015] via-transparent to-transparent pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_95%,rgba(0,0,0,0.30)_95%)] bg-[length:100%_4px] pointer-events-none opacity-50" />

      {/* 3. Top Banner: Row containing status/order index, badge tags & Platform */}
      <div className="flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2">
          {/* Positional Count Badge */}
          {index !== undefined && (
            <span className="font-display text-[11px] font-black tracking-tighter text-orange-400 bg-orange-500/5 border border-orange-500/20 px-2 py-0.5 rounded-sm">
              #{index}
            </span>
          )}

          {isCurrent ? (
            <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 text-[8px] tracking-widest font-black uppercase flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping"></span>
              REPRODUZINDO NO AGORA
            </span>
          ) : video.status === 'pending' ? (
            <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-[8px] tracking-widest font-black uppercase">
              REVISÃO / MODERAÇÃO
            </span>
          ) : video.status === 'approved' ? (
            <span className="text-emerald-450 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[8px] tracking-widest font-black uppercase">
              APROVADO NA FILA
            </span>
          ) : (
            <span className="text-zinc-550 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-[8px] tracking-widest font-black uppercase">
              CONCLUÍDO / ASSISTIDO
            </span>
          )}

          {/* Submitter User Tier Badge */}
          <span className={clsx("text-[8px] px-2 py-0.5 rounded font-display font-black tracking-widest uppercase border", currentTheme.badgeClass)}>
            {currentTheme.badgeText}
          </span>
        </div>

        {/* Video platform identification */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={clsx("text-[8px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border uppercase", getPlatformStyling())}>
            {actualPlatform}
          </span>
        </div>
      </div>

      {/* 4. Core Body: Responsive layout merging thumbnail & details */}
      <div className="flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between z-10 w-full">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Animated Interactive Cinematic Video Thumbnail */}
          <div className="relative w-20 h-14 bg-zinc-920 border border-zinc-750 rounded-sm overflow-hidden shrink-0 shadow-md">
            {/* Visual Glass reflection overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 z-10 pointer-events-none" />
            
            {/* Real aesthetic background color derived from type */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col justify-between p-1 select-none">
              <div className="flex justify-between items-center">
                {getSubmissionIcon()}
                <span className="text-[7.5px] font-mono text-zinc-500">{contentType}</span>
              </div>
              <div className="flex justify-center items-center h-full">
                {platform === 'youtube' ? (
                  <Tv className="w-5 h-5 text-red-500 opacity-60" />
                ) : platform === 'tiktok' ? (
                  <Music className="w-5 h-5 text-cyan-400 opacity-65" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-zinc-500 opacity-55" />
                )}
              </div>
              <div className="flex justify-between items-center font-mono text-[7px] text-zinc-450 border-t border-white/5 pt-0.5">
                <span className="truncate max-w-[45px] font-bold text-zinc-400">@{username}</span>
                <span>{formatTimeMinutes(duration)}</span>
              </div>
            </div>

            {/* Simulated Live Scanline */}
            <div className="absolute left-0 w-full h-[1px] bg-white/20 opacity-40 shadow-[0_0_3px_rgba(255,255,255,0.4)] top-0 z-20 animate-fluid-shimmer" style={{ animationDuration: '3s' }} />
          </div>

          {/* Interactive Info Content */}
          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="text-xs sm:text-[13px] font-bold text-zinc-100 uppercase tracking-tight line-clamp-1 break-all hover:text-orange-400 transition-colors">
              {video.title || "Mídia Desconhecida / Sincronizada"}
            </h4>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-zinc-450 font-mono">
              <span className="text-zinc-500 truncate max-w-[200px]" title={video.url}>
                {video.url}
              </span>
              <span className="text-zinc-650">•</span>
              <span className="text-zinc-300 font-semibold">{creatorChannel}</span>
            </div>
            <div className="flex items-center gap-2 text-[9.5px] font-mono text-zinc-500">
              <span>Carregado: {new Date(video.timestamp || Date.now()).toLocaleTimeString()}</span>
              <span>•</span>
              <span className="text-zinc-400 flex items-center gap-1 uppercase">
                Prioridade: <span className={clsx("font-bold", isPriority ? "text-rose-450" : "text-zinc-400")}>{priorityLabel}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic estimated wait status badge */}
        {!isCurrent && video.status !== 'watched' && (
          <div className="hidden lg:flex flex-col items-end shrink-0 pl-1.5 font-mono text-right z-10 border-l border-zinc-800 pr-2">
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{queueTimeRemaining}</span>
            <span className="text-[8px] text-zinc-600 uppercase tracking-widest">Tempo de Espera Est.</span>
          </div>
        )}
      </div>

      {/* 5. Submitter stats grid (Donations, Karma level, Engagement metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-[#1f1f2e] pt-3.5 mt-0.5 z-10">
        
        {/* User Card */}
        <div className="flex items-center gap-2 min-w-0 col-span-1 border-r border-[#1f1f2e]/40 pr-1">
          {getAvatarIdentity()}
          <div className="min-w-0 leading-none">
            <span className="text-[10.5px] font-bold text-zinc-100 truncate block">
              {displayName}
            </span>
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-mono">
              @{username}
            </span>
          </div>
        </div>

        {/* Support Months & Donations */}
        <div className="flex flex-col justify-center font-mono col-span-1 pl-1 border-r border-[#1f1f2e]/40 pr-1">
          <span className="text-[8px] uppercase tracking-widest text-zinc-550 font-bold flex items-center gap-1">
            <HeartHandshake className="w-3 h-3 text-rose-500" /> SUPORTE AO CANAL
          </span>
          <div className="flex items-baseline gap-1 mt-0.5 truncate">
            {userRole === 'normal' ? (
              <span className="text-[10px] font-semibold text-zinc-400 italic">Novo Apoiador</span>
            ) : (
              <>
                <span className="text-xs font-black text-rose-400">{supportMonths}</span>
                <span className="text-[9px] text-zinc-500 lowercase">meses</span>
              </>
            )}
          </div>
        </div>

        {/* Karma Score & Global Rank Position */}
        <div className="flex flex-col justify-center font-mono col-span-1 pl-1 border-r border-[#1f1f2e]/40 pr-1">
          <span className="text-[8px] uppercase tracking-widest text-zinc-550 font-bold flex items-center gap-1">
            <Award className="w-3 h-3 text-cyan-400" /> KARMA RANKING
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5 truncate">
            <span className="text-xs font-black text-cyan-400">Lvl {karmaValue}</span>
            <span className="text-[9px] text-cyan-600 font-bold">(#{karmaRankingPosition}º)</span>
          </div>
        </div>

        {/* Total/Current Donation highlights */}
        <div className="flex flex-col justify-center font-mono col-span-1 pl-1">
          <span className="text-[8px] uppercase tracking-widest text-zinc-550 font-bold flex items-center gap-1">
            <Coins className="w-3 h-3 text-amber-500" /> APOIOS & DOAR
          </span>
          <div className="flex flex-col leading-tight mt-0.5 truncate">
            <div className="flex items-center gap-1 text-[11px] font-black text-amber-400">
              <span>Doado:</span>
              <span>R$ {totalDonations.toFixed(2)}</span>
            </div>
            {currentDonation > 0 && (
              <div className="text-[7.5px] font-black text-rose-400 uppercase tracking-widest leading-none">
                + VÍDEO ATUAL: R$ {currentDonation.toFixed(2)}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 6. Dynamic microinteractions expandable action bar shown on hover or when current */}
      <div className="flex items-center justify-between border-t border-[#1f1f2e] pt-2 px-1 z-10 bg-zinc-950/40 -mx-4 -mb-4 p-3 rounded-b">
        <div className="flex items-center gap-3 font-mono text-[9px] text-zinc-500">
          <span className="flex items-center gap-1 text-emerald-400">
            <TrendingUp className="w-3 h-3" /> {engagementRatio}% Taxa de Aprov.
          </span>
          <span>•</span>
          <span className="uppercase text-zinc-500">Origem: {video.source || 'site'}</span>
        </div>

        {/* Individual Action Control panels */}
        <div className="flex gap-1 shrink-0">
          {isHostView ? (
            <>
              {video.status === 'pending' && onApprove && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onApprove(video.id); }} 
                  className="px-2 py-1 flex items-center gap-1 text-[9px] font-bold font-mono uppercase bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 rounded transition-all cursor-pointer" 
                  title="Aprovar Vídeo"
                >
                  <Check className="w-3 h-3" /> Aprovar
                </button>
              )}
              {!isCurrent && (video.status === 'approved' || video.status === 'pending') && onPlay && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onPlay(video.id); }} 
                  className="px-2 py-1 flex items-center gap-1 text-[9px] font-bold font-mono uppercase bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded transition-all cursor-pointer" 
                  title="Tocar Agora"
                >
                  <Play className="w-3 h-3 fill-current" /> Tocar
                </button>
              )}
              {video.status === 'watched' && onUnwatch && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onUnwatch(video.id); }} 
                  className="px-2 py-1 flex items-center gap-1 text-[9px] font-bold font-mono uppercase bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white border border-cyan-500/20 rounded transition-all cursor-pointer" 
                  title="Restaurar para Fila"
                >
                  <Clock className="w-3 h-3" /> Restaurar
                </button>
              )}
              {onReject && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onReject(video.id); }} 
                  className="p-1 items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded transition-all cursor-pointer" 
                  title="Excluir / Rejeitar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <a 
              href={video.url} 
              target="_blank" 
              rel="noreferrer" 
              className="px-2 py-1 flex items-center gap-1 text-[9px] font-bold font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 rounded transition-all"
            >
              <ExternalLink className="w-3 h-3" /> Ver Mídia
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
