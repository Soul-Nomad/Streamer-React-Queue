import { useState, useEffect, useRef, useMemo } from 'react';
import { socket, getBackendUrl } from '../socket';
import { SessionState, Video } from '../types';
import { 
  Send, LogOut, Clock, Play, Users, Copy, Check, ExternalLink, X, Shield, Crown, Radio, CheckCircle2, AlertCircle, Menu, Info, Link2, MonitorPlay, History, Smartphone, XOctagon, Loader2, PlayCircle, Eye, ThumbsUp, Activity,
  CassetteTape, BoomBox, AudioLines, Music, Award, TrendingUp, TrendingDown, Minus, Twitch, Terminal
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'motion/react';
import { supabase } from '../lib/supabase';
import logoTransparent from "@/public/CASSETE-TAPE.png";

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
  </svg>
);

// --- Helper Functions ---
const getInitials = (name: string) => name ? name.trim().substring(0, 2).toUpperCase() : '?';

const renderUserAvatarDesktop = (user: any, sizeClass = "w-8 h-8") => {
  if (user?.twitchData?.avatarUrl) {
    return (
      <img 
        src={user.twitchData.avatarUrl} 
        alt={user.name} 
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-sm object-cover border border-zinc-800 bg-[#121212] shrink-0`}
      />
    );
  }
  const color = user?.twitchData?.color || '#3f3f46';
  return (
    <div 
      className={`${sizeClass} rounded-sm flex items-center justify-center font-bold text-xs text-white shrink-0 border border-zinc-800`}
      style={{ backgroundColor: color }}
    >
      {getInitials(user?.name)}
    </div>
  );
};

const renderTwitchBadges = (user: any) => {
  const badges = user?.twitchData?.badges || [];
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {badges.map((b: string) => {
        if (b === 'broadcaster') return <span key={b} className="bg-[#FF3B30] text-white text-[9px] font-black uppercase px-1 rounded-sm border border-[#FF3B30]/30 animate-pulse">👑 STR</span>;
        if (b === 'moderator') return <span key={b} className="bg-[#4CAF50] text-white text-[9px] font-black uppercase px-1 rounded-sm border border-[#4CAF50]/30">🛡️ MOD</span>;
        if (b === 'vip') return <span key={b} className="bg-[#E25CFF] text-white text-[9px] font-black uppercase px-1 rounded-sm border border-[#E25CFF]/30">💎 VIP</span>;
        if (b === 'subscriber') return <span key={b} className="bg-[#FFD700] text-black text-[9px] font-black uppercase px-1 rounded-sm border border-[#FFB300]/30">⭐ SUB</span>;
        return null;
      })}
    </div>
  );
};

const getPlatformIcon = (url: string) => {
  if (url.includes('instagram.com')) return '📸 Instagram';
  if (url.includes('tiktok.com')) return '🎵 TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return '📺 YouTube';
  return '🔗 Link Externo';
};

const getKarmaInfo = (score: number) => {
  if (score >= 1000) return { level: 'Lenda Analógica', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30' };
  if (score >= 500) return { level: 'Arquivista', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' };
  if (score >= 200) return { level: 'Curador', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  if (score >= 50) return { level: 'Colecionador', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  return { level: 'Fita Nova', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' };
};

const StatusBadge = ({ status }: { status: Video['status'] | 'playing' }) => {
  switch (status) {
    case 'pending':
      return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1"><Clock className="w-3 h-3"/> Review</span>;
    case 'approved':
      return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1"><Check className="w-3 h-3"/> Fila</span>;
    case 'playing':
      return <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1 animate-pulse"><Radio className="w-3 h-3"/> Ao Vivo</span>;
    case 'rejected':
      return <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1"><X className="w-3 h-3"/> Recusado</span>;
    default:
      return null;
  }
};

// --- Main Component ---
export default function ParticipantView({ session }: { session: SessionState }) {
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

  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{type: 'success' | 'info' | 'error', msg: string, position?: number, estimate?: number} | null>(null);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'home' | 'queue' | 'users' | 'profile' | 'ranking'>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Captcha & Submission constraints
  const [captchaChallenge, setCaptchaChallenge] = useState({ num1: Math.floor(Math.random() * 9) + 1, num2: Math.floor(Math.random() * 9) + 1 });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [remainingCooldown, setRemainingCooldown] = useState(0);
  const [timeoutSeconds, setTimeoutSeconds] = useState(0);

  const userId = socket.getUserId();
  const me = session.users.find(u => u.userId === userId || u.id === socket.id);
  const isBanned = me?.isBanned || session.blacklistUsernames?.some(u => u.toLowerCase() === (me?.twitchData?.login || '').toLowerCase());
  
  const queueEndRef = useRef<HTMLDivElement>(null);
  const hostUser = session.users.find(u => u.isHost);
  const hostTwitchLogin = hostUser?.twitchData?.login || 'twitch';
  const parentHostname = window.location.hostname;

  // Auto-redirect if banned
  useEffect(() => {
    if (isBanned) {
      const timer = setTimeout(() => {
        localStorage.removeItem('active_room_id');
        localStorage.removeItem('active_role');
        localStorage.removeItem('active_session_payload');
        window.location.href = '/';
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isBanned]);

  // Sync cooldown tracking
  useEffect(() => {
    const timer = setInterval(() => {
      const myself = session.users.find(u => u.id === socket.id || u.userId === socket.getUserId());
      if (!myself) return;
      const lastSub = myself.lastSubmitted || 0;
      const now = Date.now();
      
      const userCooldownTrack = (session.settings?.userCooldownSeconds ?? 0) * 1000;
      const userRemaining = Math.max(0, Math.ceil((lastSub + userCooldownTrack - now) / 1000));
      
      const sessionLastGlobal = (session as any).lastGlobalSubmitted || 0;
      const globalCooldownTrack = sessionLastGlobal + (session.settings?.globalCooldownSeconds ?? 0) * 1000;
      const globalRemaining = Math.max(0, Math.ceil((globalCooldownTrack - now) / 1000));
      
      setRemainingCooldown(Math.max(userRemaining, globalRemaining));

      if (myself.timeoutUntil && myself.timeoutUntil > now) {
        setTimeoutSeconds(Math.ceil((myself.timeoutUntil - now) / 1000));
      } else {
        setTimeoutSeconds(0);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [session]);

  const submitVideo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim().startsWith('http') || isSubmitting) return;
    
    setIsSubmitting(true);
    const targetRoomId = localStorage.getItem('active_supabase_room_id');
    const localPayload = { 
      url: url.trim(),
      captchaPayload: {
        num1: captchaChallenge.num1,
        num2: captchaChallenge.num2,
        answer: captchaAnswer.trim()
      },
      userId: me?.userId || socket.getUserId()
    };

    if (targetRoomId) {
      try {
        const { data, error } = await supabase.functions.invoke('submit-video', {
          body: { room_id: targetRoomId, video_url: url.trim(), user_id: me?.userId }
        });
        if (error) console.warn('[Twitch Extension] Edge Function:', error);
      } catch (err: any) {
        console.warn('Network Fallback:', err);
      }
    }

    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/sessions/${session.id}/submit_video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: me?.userId || socket.getUserId(),
          data: localPayload
        })
      });

      if (!res.ok) {
        const errDetails = await res.json();
        setSubmitFeedback({
          type: 'error',
          msg: errDetails.error || 'Ação recusada pelo guardião da fila.'
        });
        setIsSubmitting(false);
        return;
      }

      const resData = await res.json();
      if (resData && resData.session) {
        socket.trigger('session_state', resData.session);
      }

      const isManualApprovalRequired = session.settings?.isManualApprovalRequired ?? true;
      const itemsBeforeMe = (resData?.session?.queue || []).filter((v: any) => v.status === 'approved').length;

      setSubmitFeedback({
        type: 'success',
        msg: isManualApprovalRequired ? 'Vídeo enviado para aprovação!' : 'Vídeo adicionado com sucesso!',
        position: isManualApprovalRequired ? undefined : itemsBeforeMe,
        estimate: isManualApprovalRequired ? undefined : itemsBeforeMe * 3
      });

      setUrl('');
      setCaptchaAnswer('');
      setCaptchaChallenge({ num1: Math.floor(Math.random() * 9) + 1, num2: Math.floor(Math.random() * 9) + 1 });

      setTimeout(() => {
        setSubmitFeedback(null);
        setIsSubmitting(false);
      }, 4000);

    } catch (err: any) {
      setSubmitFeedback({
        type: 'error',
        msg: 'Não foi possível conectar ao servidor.'
      });
      setIsSubmitting(false);
    }
  };

  const copyInvite = () => {
    const inviteLink = `${window.location.origin}/?room=${session.id}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentVideo = session.queue.find(v => v.id === session.currentVideoId) || session.history.find(v => v.id === session.currentVideoId);
  const myPendingVideos = session.queue.filter(v => v.submitterId === me?.userId && v.status === 'pending');
  const approvedVideos = session.queue.filter(v => v.status === 'approved');
  const historyVideos = session.history.slice(-10).reverse();

  const isCaptchaRequired = !(me?.isHost || me?.twitchData?.isSubscriber || me?.twitchData?.isModerator || me?.twitchData?.isBroadcaster);
  const isInputValid = url.trim().startsWith('http');
  const canSubmit = isInputValid && remainingCooldown === 0 && timeoutSeconds === 0 && (!isCaptchaRequired || captchaAnswer.trim() !== '');

  // Calculate user position
  const getMyPositionInfo = () => {
    const myNextApprovedIndex = approvedVideos.findIndex(v => v.submitterId === me?.userId);
    if (myNextApprovedIndex !== -1) {
      return { position: myNextApprovedIndex + 1, type: 'approved' };
    }
    if (myPendingVideos.length > 0) {
      return { count: myPendingVideos.length, type: 'pending' };
    }
    return null;
  };

  const positionInfo = getMyPositionInfo();

  if (isBanned) {
    return (
      <div className="h-screen w-full bg-[#0d0d12] flex flex-col items-center justify-center p-6 text-center">
        <XOctagon className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold font-mono tracking-tight text-white mb-2 uppercase">Acesso Bloqueado</h1>
        <p className="text-zinc-500 text-sm max-w-sm">
          Sua conta foi permanentemente banida desta sessão.
        </p>
      </div>
    );
  }

  return (
    <div className="crt-screen flex flex-col md:flex-row h-[100dvh] text-[#efefef] font-sans selection:bg-orange-500 selection:text-white w-full overflow-hidden relative antialiased" id="participant_view_redesigned">
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
      
      {/* Timeout Overlay */}
      <AnimatePresence>
        {timeoutSeconds > 0 && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-950 border border-red-500/30 p-8 rounded-sm shadow-2xl max-w-sm w-full text-center flex flex-col items-center gap-4"
            >
              <Clock className="w-10 h-10 text-red-500 animate-pulse" />
              <div>
                <h2 className="text-xl font-black text-red-500 uppercase font-mono tracking-wider">Timeout Ativo</h2>
                <p className="text-xs text-zinc-400 mt-1">Interações bloqueadas temporariamente.</p>
              </div>
              <div className="bg-[#0a0a0f] px-6 py-4 rounded border border-zinc-800 w-full">
                <span className="text-4xl font-black text-white tabular-nums font-mono">
                  {Math.floor(timeoutSeconds/60)}:{String(timeoutSeconds%60).padStart(2, '0')}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Navigation (Desktop) */}
      <nav className={clsx(
        "fixed md:relative z-50 w-[260px] md:w-[72px] lg:w-[240px] h-full bg-black/45 backdrop-blur-md border-r border-[#1f1f2e]/60 border-white/10 flex flex-col transition-transform duration-300",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-14 flex items-center justify-between lg:justify-start gap-3 px-4 border-b border-[#1f1f2e]/60 border-white/10 shrink-0 overflow-hidden relative">
           <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-orange-500 to-transparent" />
           <img src="/LOGO.jpeg" className="h-8 w-auto mix-blend-screen drop-shadow-md object-contain shrink-0" alt="Logo" />
           <div className="flex flex-col md:hidden lg:flex">
             <span className="font-extrabold font-mono text-xs uppercase tracking-wider text-orange-400 truncate max-w-[150px]">{session.id}</span>
             <span className="text-[9px] text-zinc-550 uppercase tracking-widest font-mono">Sessão Ativa</span>
           </div>
           <button className="md:hidden p-1 text-zinc-400 ml-auto" onClick={() => setMobileMenuOpen(false)}>
             <X className="w-5 h-5" />
           </button>
        </div>

        <div className="flex flex-col gap-1 p-2 pt-4 flex-1">
          <NavItem active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }} icon={<img src={logoTransparent} alt="" className="w-4 h-4 object-contain opacity-70" referrerPolicy="no-referrer" />} label="Transmissão" />
          <NavItem active={activeTab === 'queue'} onClick={() => { setActiveTab('queue'); setMobileMenuOpen(false); }} icon={<CassetteTape className="w-4 h-4"/>} label="Fila de Vídeos" badge={approvedVideos.length} />
          <NavItem active={activeTab === 'users'} onClick={() => { setActiveTab('users'); setMobileMenuOpen(false); }} icon={<Users className="w-4 h-4"/>} label="Participantes" badge={session.users.length} />
          <NavItem active={activeTab === 'ranking'} onClick={() => { setActiveTab('ranking'); setMobileMenuOpen(false); }} icon={<Award className="w-4 h-4 text-emerald-400"/>} label="Karma Global" />
          <NavItem active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }} icon={<Crown className="w-4 h-4"/>} label="Meu Perfil" />
        </div>

        <div className="p-3 border-t border-[#1f1f2e]/60 border-white/10 space-y-2 shrink-0 bg-transparent backdrop-blur-md">
          <button onClick={copyInvite} className={clsx("w-full flex items-center md:justify-center lg:justify-start gap-3 p-2 rounded-sm text-xs font-bold font-mono tracking-wider uppercase transition-all border cursor-pointer", copied ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "bg-black/30 text-zinc-300 border-white/10 hover:bg-black/55")}>
            {copied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />} <span className="md:hidden lg:inline">{copied ? 'COPIADO' : 'CONVITE'}</span>
          </button>
          <button onClick={() => { 
            localStorage.removeItem('active_room_id');
            window.location.reload(); 
          }} className="w-full flex items-center md:justify-center lg:justify-start gap-3 p-2 rounded-sm text-xs font-bold font-mono tracking-wider uppercase text-red-500 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20 cursor-pointer">
            <LogOut className="w-4 h-4 shrink-0" /> <span className="md:hidden lg:inline">SAIR</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-[100dvh] relative min-w-0 bg-transparent z-10">
        
        {/* Mobile Header */}
        <header className="md:hidden h-14 flex items-center justify-between px-3 border-b border-[#1f1f2e] bg-zinc-950 shrink-0 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-purple-500 to-emerald-400" />
          <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 text-zinc-400 hover:text-white rounded-sm border border-transparent hover:border-zinc-800">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center">
            <img src="/LOGO.jpeg" className="h-6 w-auto mix-blend-screen drop-shadow-md object-contain" alt="Logo" />
          </div>
          <button onClick={copyInvite} className="p-1.5 text-zinc-400 hover:text-white rounded-sm">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </header>

        {/* Dynamic View Logic */}
        <div className="flex-1 overflow-y-auto flex flex-col relative min-h-0">
          
          {/* TAB: HOME (Transmission & Player) */}
          {activeTab === 'home' && (
            <div className="flex-1 w-full max-w-7xl lg:max-w-[94%] mx-auto p-4 md:p-6 space-y-6">
              
              {/* Twitch Embed Area */}
              {hostUser?.twitchData?.login && (
                <div className="w-full bg-[#0d0d12] border border-[#1f1f2e] rounded-sm overflow-hidden flex flex-col lg:flex-row shadow-xl">
                  <div className="w-full lg:w-[76%] aspect-video bg-black relative">
                    <iframe
                      src={`https://player.twitch.tv/?channel=${hostTwitchLogin}&parent=${parentHostname}&autoplay=true&muted=false`}
                      height="100%"
                      width="100%"
                      allowFullScreen
                      className="absolute inset-0"
                    ></iframe>
                  </div>
                  <div className="w-full lg:w-[24%] h-[250px] lg:h-auto border-t lg:border-t-0 lg:border-l border-[#1f1f2e] bg-zinc-950 p-0 m-0">
                    <iframe
                      src={`https://www.twitch.tv/embed/${hostTwitchLogin}/chat?parent=${parentHostname}&darkpopout`}
                      height="100%"
                      width="100%"
                      className="h-full block m-0 p-0 border-0"
                    ></iframe>
                  </div>
                </div>
              )}

              {/* Current Playing Stats Bar */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-full opacity-10 pointer-events-none bg-gradient-to-l from-orange-500 to-transparent"></div>
                <div className="flex items-center justify-between mb-3 border-b border-zinc-800/50 pb-2">
                  <h3 className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-orange-500" /> Mídia Sincronizada
                  </h3>
                  {currentVideo && <StatusBadge status="playing" />}
                </div>

                {currentVideo ? (
                  <div className="flex lg:items-center gap-4 flex-col lg:flex-row justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded shrink-0 flex items-center justify-center">
                         <BoomBox className="w-5 h-5 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <a href={currentVideo.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-white hover:text-orange-400 transition-colors truncate block max-w-sm">
                          {currentVideo.url}
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Enviado por:</span>
                          <span className="text-[11px] font-bold text-zinc-300">@{currentVideo.submitter}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <img
                      src={logoTransparent}
                      alt=""
                      className="w-10 h-10 object-contain mx-auto opacity-20 mb-2 animate-pulse"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-sm font-bold text-zinc-500">Transmissão Sincronizada Inativa</span>
                    <span className="text-xs text-zinc-600 mt-1">Aguardando o streamer iniciar um vídeo da fila.</span>
                  </div>
                )}
              </div>

              {/* Status & Position Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                  <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase block mb-1">Status da Fila</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black">{approvedVideos.length}</span>
                    <span className="text-[10px] text-zinc-400 uppercase">Na Espera</span>
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                  <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase block mb-1">Sua Posição</span>
                  <div className="flex items-center gap-2">
                    {positionInfo?.type === 'approved' ? (
                       <span className="text-lg font-black text-orange-400">#{positionInfo.position}</span>
                    ) : positionInfo?.type === 'pending' ? (
                       <span className="text-sm font-bold text-yellow-500">{positionInfo.count} em Análise</span>
                    ) : (
                       <span className="text-sm font-bold text-zinc-600">Nenhum</span>
                    )}
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                  <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase block mb-1">Total Assistidos</span>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black">{session.history.length}</span>
                    <History className="w-4 h-4 text-zinc-700" />
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                  <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase block mb-1">Espectadores</span>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-emerald-400">{session.users.length}</span>
                    <Users className="w-4 h-4 text-emerald-900" />
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB: QUEUE */}
          {activeTab === 'queue' && (
            <div className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-40">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-extrabold uppercase font-mono tracking-widest text-white flex items-center gap-2">
                  <CassetteTape className="w-4 h-4 text-orange-500" /> Fila de Reprodução
                </h2>
              </div>
              
              <div className="space-y-6 relative border-l-2 border-zinc-900 pl-4 ml-2">
                
                {myPendingVideos.length > 0 && (
                  <div className="space-y-3 relative">
                    <div className="absolute -left-[23px] top-1 w-2 h-2 rounded-full bg-yellow-500 ring-4 ring-zinc-950"></div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Meus Envios Pendentes</h3>
                    </div>
                    <div className="grid gap-2">
                      <AnimatePresence initial={false}>
                        {myPendingVideos.map(v => (
                          <QueueCard key={v.id} video={v} type="pending" />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div className="space-y-3 relative">
                  <div className="absolute -left-[23px] top-1 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-zinc-950"></div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 font-mono">Próximos Vídeos</h3>
                  </div>
                  {approvedVideos.length === 0 ? (
                    <div className="bg-zinc-950 border border-zinc-800/50 border-dashed rounded-sm p-6 text-center flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center mb-2">
                        <Send className="w-4 h-4 text-zinc-600" />
                      </div>
                      <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">A Fila está vazia.</span>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <AnimatePresence initial={false}>
                        {approvedVideos.map((v, i) => (
                          <QueueCard key={v.id} video={v} type="queued" index={i + 1} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {historyVideos.length > 0 && (
                  <div className="space-y-3 relative opacity-50 mt-8">
                    <div className="absolute -left-[23px] top-1 w-2 h-2 rounded-full bg-zinc-700 ring-4 ring-zinc-950"></div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 font-mono">Últimos Reproduzidos</h3>
                    </div>
                    <div className="grid gap-2">
                      <AnimatePresence initial={false}>
                        {historyVideos.slice(0, 5).map(v => (
                          <QueueCard key={v.id} video={v} type="history" />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

              </div>
              <div ref={queueEndRef} className="h-20" />
            </div>
          )}

          {/* TAB: USERS */}
          {activeTab === 'users' && (
             <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 pb-24">
               <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                  <h2 className="text-sm font-extrabold uppercase font-mono tracking-widest text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-500" /> Espectadores Online
                  </h2>
                  <span className="text-xs font-mono bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-sm text-zinc-400">Total: {session.users.length}</span>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                 {session.users.map(u => (
                   <div key={u.id} className="bg-zinc-950 p-3 rounded-sm border border-zinc-800 flex items-center gap-3">
                     {renderUserAvatarDesktop(u)}
                     <div className="flex-1 min-w-0">
                       <span className="font-bold text-sm text-white truncate block">@{u.name}</span>
                       <div className="flex items-center gap-1.5 mt-0.5">
                         {renderTwitchBadges(u)}
                         {(!u.twitchData?.badges?.length || !u.twitchData) && <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Espectador</span>}
                       </div>
                     </div>
                     {u.id === socket.id && <div className="text-[8px] font-black px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-sm uppercase tracking-wider text-orange-400 shrink-0">Você</div>}
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* TAB: PROFILE */}
          {activeTab === 'profile' && me && (
             <div className="flex-1 w-full p-4 md:p-6 flex justify-center items-start">
                <div className="w-full max-w-md bg-zinc-950 rounded-sm border border-zinc-800 overflow-hidden relative">
                  <div className="h-24 bg-zinc-900 border-b border-zinc-800 relative">
                     <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#3f3f46 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                  </div>
                  <div className="px-6 pb-6 relative">
                    <div className="absolute -top-10 left-6 w-20 h-20 bg-zinc-950 rounded-sm border border-zinc-800 flex items-center justify-center overflow-hidden">
                      {renderUserAvatarDesktop(me, "w-full h-full rounded-none")}
                    </div>
                    
                    <div className="mt-12">
                      <h2 className="text-xl font-black text-white font-mono uppercase tracking-widest flex items-center gap-2">
                        {me.name}
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-sm border border-zinc-700">YOU</span>
                      </h2>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {renderTwitchBadges(me)}
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-zinc-800/50 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0a0a0f] p-4 rounded-sm border border-zinc-800/50">
                          <span className="text-[9px] uppercase text-zinc-500 tracking-widest font-mono block mb-1">Mídias Enviadas</span>
                          <span className="text-2xl font-black text-zinc-200">{me.totalSubmitted || 0}</span>
                        </div>
                        <div className="bg-[#0a0a0f] p-4 rounded-sm border border-zinc-800/50">
                          <span className="text-[9px] uppercase text-zinc-500 tracking-widest font-mono block mb-1">Reputação</span>
                          <span className={clsx("text-2xl font-black", me.reputation && me.reputation >= 80 ? "text-emerald-400" : "text-yellow-500")}>{me.reputation ?? 0}%</span>
                        </div>
                      </div>

                      <div className="bg-red-500/5 p-3 rounded-sm border border-red-500/10 flex justify-between items-center">
                        <span className="text-xs font-bold text-red-500 font-mono tracking-widest uppercase">Strikes de Moderação</span>
                        <span className="font-mono font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded-sm">{me.strikes || 0}/5</span>
                      </div>
                    </div>

                  </div>
                </div>
             </div>
          )}

          {/* TAB: RANKING */}
          {activeTab === 'ranking' && (
             <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 pb-24">
               <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                  <h2 className="text-sm font-extrabold uppercase font-mono tracking-widest text-white flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-400" /> Karma Global
                  </h2>
               </div>
               
               <div className="space-y-2">
                 {[...session.users]
                   .filter(u => !u.isHost && u.userId !== session.hostId && u.id !== session.hostId)
                   .sort((a, b) => (b.karmaDetails?.karma_score ?? (b.reputation ?? 50)) - (a.karmaDetails?.karma_score ?? (a.reputation ?? 50)))
                   .map((u, i) => {
                     const kScore = u.karmaDetails?.karma_score ?? (u.reputation ?? 50);
                     const kInfo = getKarmaInfo(kScore);
                     return (
                       <div key={u.id} className={clsx("p-3 rounded-sm border flex flex-col md:flex-row md:items-center gap-3 transition-colors", kInfo.bg, kInfo.border)}>
                         <div className="flex items-center gap-3 w-full md:w-auto">
                           <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", i === 0 ? "bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]" : i === 1 ? "bg-zinc-300 text-black" : i === 2 ? "bg-orange-700 text-white" : "bg-zinc-900 text-zinc-500 border border-zinc-800")}>
                             #{i + 1}
                           </div>
                           {renderUserAvatarDesktop(u)}
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2">
                               <span className="font-bold text-sm text-white truncate block">@{u.name}</span>
                               {u.id === socket.id && <span className="text-[8px] font-black px-1 py-0.5 bg-orange-500/20 text-orange-400 rounded-sm uppercase tracking-wider">Você</span>}
                             </div>
                             <div className="flex items-center gap-1.5 mt-0.5">
                               {renderTwitchBadges(u)}
                               <span className={clsx("text-[9px] uppercase tracking-widest font-mono font-bold", kInfo.color)}>{kInfo.level}</span>
                             </div>
                           </div>
                         </div>
                         <div className="ml-0 md:ml-auto flex items-center gap-4 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-800 px-1">
                           <div className="flex flex-col items-center">
                              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">Total</span>
                              <span className="text-xs font-black text-white">{kScore}</span>
                           </div>
                           <div className="flex flex-col items-center">
                              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">Positivos</span>
                              <span className="text-xs font-black text-emerald-500 flex items-center gap-0.5"><TrendingUp className="w-3 h-3"/> {u.karmaDetails?.positive_ratings ?? 0}</span>
                           </div>
                           <div className="flex flex-col items-center">
                              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">Negativos</span>
                              <span className="text-xs font-black text-rose-500 flex items-center gap-0.5"><TrendingDown className="w-3 h-3"/> {u.karmaDetails?.negative_ratings ?? 0}</span>
                           </div>
                         </div>
                       </div>
                     );
                 })}
               </div>
             </div>
          )}
        </div>

        {/* Global Submission Bar (Fixed at bottom) */}
        <div className="bg-zinc-950 border-t border-[#1f1f2e] p-3 md:p-4 z-20 shrink-0 relative">
          
          <div className="max-w-5xl mx-auto">
            {/* Feedback Toast Overlay */}
            <AnimatePresence>
              {submitFeedback && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={clsx(
                    "absolute bottom-full left-0 right-0 mx-4 mb-4 md:mx-auto md:max-w-md backdrop-blur p-3 rounded-sm shadow-2xl flex items-start gap-3 border z-50",
                    submitFeedback.type === 'error' 
                      ? "bg-red-950/90 border-red-500/40 text-red-200" 
                      : "bg-emerald-950/90 border-emerald-500/30 text-emerald-200"
                  )}
                >
                  {submitFeedback.type === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <h4 className={clsx(
                      "text-sm font-bold font-mono tracking-tight uppercase",
                      submitFeedback.type === 'error' ? "text-red-400" : "text-emerald-400"
                    )}>
                      {submitFeedback.msg}
                    </h4>
                    {submitFeedback.type !== 'error' && submitFeedback.position && (
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-emerald-200/70 font-mono">
                        <span>POSIÇÃO: <strong className="text-emerald-300">#{submitFeedback.position}</strong></span>
                        <span>ESTIMATIVA: <strong className="text-emerald-300">~{submitFeedback.estimate} min</strong></span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!me?.twitchData?.login && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm border-t border-orange-500/20">
                 <div className="flex items-center gap-4">
                    <Shield className="w-5 h-5 text-orange-500" />
                    <div>
                      <span className="text-xs font-bold text-white uppercase font-mono tracking-widest block">Requerimento de Identidade</span>
                      <span className="text-[10px] text-zinc-500">Vincule sua conta da Twitch para interagir.</span>
                    </div>
                    <button onClick={() => window.location.reload()} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded-sm font-bold text-[10px] font-mono tracking-widest uppercase ml-4">
                      Vincular Conta
                    </button>
                 </div>
              </div>
            )}

            <AnimatePresence>
              {me?.strikes && me.strikes > 0 ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-2 bg-red-500/10 border border-red-500/20 rounded-sm p-2 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-red-400 font-mono uppercase tracking-widest">Aviso: Você possui {me.strikes} strike(s) ativo(s).</span>
                </motion.div>
              ) : null}

              {(isCaptchaRequired && url.length > 5) && (
                <motion.div initial={{ height: 0, opacity: 0, y: 10 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0 }} className="mb-2 bg-zinc-900 border border-zinc-800 rounded-sm p-2 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <span className="text-zinc-400 font-mono uppercase tracking-widest flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-orange-500"/> Verificação Humana: <strong className="text-white ml-2">{captchaChallenge.num1} + {captchaChallenge.num2} = ?</strong></span>
                  <input type="number" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} placeholder="0" className="w-full md:w-20 bg-zinc-950 border border-zinc-700 p-1.5 rounded-sm text-white text-center focus:outline-none focus:border-orange-500 font-mono" />
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={submitVideo} className="flex gap-2">
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-sm focus-within:border-orange-500 transition-colors flex items-center relative h-12">
                <Link2 className="w-4 h-4 text-zinc-500 absolute left-3" />
                <input 
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="Cole o link do vídeo aqui (TikTok, YT Shorts, Insta Reels)..."
                  className="w-full h-full bg-transparent text-sm text-white pl-10 pr-3 focus:outline-none placeholder:text-zinc-600 font-mono"
                  autoComplete="off"
                />
              </div>

              <button 
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className={clsx(
                  "h-12 px-6 rounded-sm flex items-center justify-center font-bold text-xs uppercase tracking-widest font-mono transition-all disabled:opacity-50 select-none shrink-0",
                  canSubmit && !remainingCooldown ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {remainingCooldown > 0 ? (
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {remainingCooldown}s</span>
                ) : isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2"><Send className="w-4 h-4" /> <span className="hidden md:inline">Adicionar</span></span>
                )}
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button 
      onClick={onClick} 
      className={clsx(
        "flex items-center gap-3 p-2.5 rounded-sm transition-all text-[11px] font-mono tracking-widest uppercase relative group border border-transparent cursor-pointer",
        active ? "bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]" : "text-zinc-455 hover:bg-black/35 hover:text-zinc-300"
      )}
    >
      <div className={clsx("shrink-0", active ? "text-orange-450" : "")}>{icon}</div>
      <span className="md:hidden lg:inline text-left flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
         <span className={clsx("md:hidden lg:inline ml-auto px-1.5 py-0.5 text-[9px] font-black rounded-sm border", active ? "bg-[#9146FF]/20 text-orange-400 border-[#9146FF]/30" : "bg-black/40 text-zinc-455 border-white/10")}>
           {badge}
         </span>
      )}
      
      {/* Tooltip for collapsed sidebar */}
      <div className="hidden md:block lg:hidden absolute left-full ml-3 px-2 py-1 bg-black/80 text-white text-[10px] rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 z-50">
        {label} {badge !== undefined && badge > 0 ? `(${badge})` : ''}
      </div>
    </button>
  );
}

function QueueCard({ video, type, index }: { video: Video, type: 'pending' | 'queued' | 'history', index?: number }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -5, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
      whileHover={{ scale: 1.005, transition: { duration: 0.1 } }}
      className={clsx("relative overflow-hidden bg-[#0c0c0e]/95 border p-3 pl-4 rounded-sm flex items-center justify-between group transition-all duration-300", type === 'queued' ? "border-zinc-800 hover:border-orange-500/50 shadow-md hover:shadow-orange-500/5" : "border-zinc-800/50 opacity-85 hover:border-zinc-700")}
    >
      {/* Left source-colored bar like image 1 in attachments */}
      {video.source === 'twitch' && (
        <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-[#9146ff] z-10" />
      )}
      {video.source === 'discord' && (
        <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-[#5865F2] z-10" />
      )}
      {(!video.source || video.source === 'site') && (
        <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-[#00FA6D] z-10" />
      )}

      <div className="flex items-center gap-3 overflow-hidden flex-1">
        {index !== undefined && (
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
             <span className="text-[10px] font-mono font-black text-orange-400">#{index}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-300 truncate font-medium group-hover:text-white transition-colors">{video.url}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-zinc-400 font-mono tracking-widest uppercase font-bold">DE: <span className="text-zinc-200">@{video.submitter}</span></span>
            {type === 'pending' && <StatusBadge status="pending" />}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <div className="flex flex-col items-end gap-1.5">
          <div 
            className="text-[10px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded-sm border border-zinc-800 flex items-center gap-1.5"
            title={`Enviado via ${video.source === 'twitch' ? 'Twitch' : video.source === 'discord' ? 'Discord' : 'Site'}`}
          >
             {video.source === 'twitch' && <Twitch className="w-3 h-3 text-[#9146FF]" />}
             {video.source === 'discord' && <DiscordIcon className="w-3 h-3 text-[#5865F2]" />}
             {(!video.source || video.source === 'site') && <Terminal className="w-3 h-3 text-[#00FF66]" />}
             {getPlatformIcon(video.url).split(' ')[1] || 'Web'}
          </div>
        </div>
        <a href={video.url} target="_blank" rel="noreferrer" className="w-7 h-7 rounded border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-all">
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </motion.div>
  );
}

function ListIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  );
}
