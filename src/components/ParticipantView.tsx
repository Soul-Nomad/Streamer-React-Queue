import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  Send, LogOut, Clock, Play, Users, Copy, Check, ExternalLink, X, Shield, Crown, Radio, CheckCircle2, AlertCircle, Menu, Info, Link2, MonitorPlay, History, Smartphone, XOctagon
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';

// --- Helper Functions ---
const renderUserAvatar = (user: any, sizeClass = "w-8 h-8") => {
  if (user?.twitchData?.avatarUrl) {
    return (
      <img 
        src={user.twitchData.avatarUrl} 
        alt={user.name} 
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-full object-cover ring-2 ring-[#1F1F23] bg-[#18181B] flex-shrink-0`}
      />
    );
  }
  const initials = user?.name ? user.name.trim().substring(0, 2).toUpperCase() : '?';
  const color = user?.twitchData?.color || '#9146FF';
  return (
    <div 
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0 ring-2 ring-[#1F1F23]`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
};

const renderTwitchBadges = (user: any) => {
  const badges = user?.twitchData?.badges || [];
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {badges.map((b: string) => {
        if (b === 'broadcaster') return <span key={b} className="bg-[#E91E63] text-white text-[9px] font-black uppercase px-1 rounded-sm">👑 STREAMER</span>;
        if (b === 'moderator') return <span key={b} className="bg-[#00AD03] text-white text-[9px] font-black uppercase px-1 rounded-sm">🛡️ MOD</span>;
        if (b === 'vip') return <span key={b} className="bg-[#E25CFF] text-white text-[9px] font-black uppercase px-1 rounded-sm">💎 VIP</span>;
        if (b === 'subscriber') return <span key={b} className="bg-[#8205B3] text-white text-[9px] font-black uppercase px-1 rounded-sm">⭐ SUB</span>;
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

// --- Main Component ---
export default function ParticipantView({ session }: { session: SessionState }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'home' | 'users' | 'profile'>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Captcha & Submission constraints
  const [captchaChallenge, setCaptchaChallenge] = useState({ num1: Math.floor(Math.random() * 9) + 1, num2: Math.floor(Math.random() * 9) + 1 });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [remainingCooldown, setRemainingCooldown] = useState(0);
  const [timeoutSeconds, setTimeoutSeconds] = useState(0);

  const userId = socket.getUserId();
  const me = session.users.find(u => u.userId === userId || u.id === socket.id);
  const isBanned = me?.isBanned || session.blacklistUsernames?.some(u => u.toLowerCase() === (me?.twitchData?.login || '').toLowerCase());
  
  // Auto-redirect if banned
  useEffect(() => {
    if (isBanned) {
      const timer = setTimeout(() => {
        // Only redirect if still banned after the delay
        localStorage.removeItem('active_room_id');
        localStorage.removeItem('active_role');
        localStorage.removeItem('active_session_payload');
        window.location.href = '/';
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isBanned]);

  const queueEndRef = useRef<HTMLDivElement>(null);
  const hostUser = session.users.find(u => u.isHost);
  const hostTwitchLogin = hostUser?.twitchData?.login || 'twitch';
  const parentHostname = window.location.hostname;

  // Sync cooldown tracking
  useEffect(() => {
    const timer = setInterval(() => {
      const myself = session.users.find(u => u.id === socket.id || u.userId === socket.getUserId());
      if (!myself) return;
      const lastSub = myself.lastSubmitted || 0;
      const now = Date.now();
      
      const userCooldownTrack = (session.settings?.userCooldownSeconds || 60) * 1000;
      const userRemaining = Math.max(0, Math.ceil((lastSub + userCooldownTrack - now) / 1000));
      
      const sessionLastGlobal = (session as any).lastGlobalSubmitted || 0;
      const globalCooldownTrack = sessionLastGlobal + (session.settings?.globalCooldownSeconds || 5) * 1000;
      const globalRemaining = Math.max(0, Math.ceil((globalCooldownTrack - now) / 1000));
      
      setRemainingCooldown(Math.max(userRemaining, globalRemaining));

      // Timeout tracking
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

    // Instantly notify Server
    socket.emit('submit_video', localPayload);
    
    // UI Feedback
    setSubmitSuccess(true);
    setUrl('');
    setCaptchaAnswer('');
    setCaptchaChallenge({ num1: Math.floor(Math.random() * 9) + 1, num2: Math.floor(Math.random() * 9) + 1 });
    
    setTimeout(() => {
      setSubmitSuccess(false);
      setIsSubmitting(false);
      // Scroll to bottom of queue if possible
      queueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 1500);
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
  const historyVideos = session.history.slice(-10).reverse(); // Last 10 watched

  const isCaptchaRequired = !me?.isWhitelisted;
  const isInputValid = url.trim().startsWith('http');
  const canSubmit = isInputValid && remainingCooldown === 0 && timeoutSeconds === 0 && (!isCaptchaRequired || captchaAnswer.trim() !== '');

  if (isBanned) {
    return (
      <div className="h-screen w-full bg-[#0E0E10] flex flex-col items-center justify-center p-6 text-center">
        <XOctagon className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Acesso Bloqueado</h1>
        <p className="text-[#ADADB8] max-w-md">
          Você foi permanentemente banido desta sessão pelo moderador. 
          Sua conta da Twitch está na lista de restrições.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-2 bg-[#1F1F23] text-white rounded-lg hover:bg-[#26262C] transition-colors"
        >
          Voltar para o Início
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-[#0E0E10] text-[#EFEFF1] font-sans selection:bg-[#9146FF] selection:text-white w-full overflow-hidden relative">
      
      {/* Timeout Overlay for the WHOLE screen */}
      <AnimatePresence>
        {timeoutSeconds > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#18181B] border border-[#9146FF]/30 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 bg-[#9146FF]/10 rounded-full flex items-center justify-center mb-2">
                 <Clock className="w-8 h-8 text-[#9146FF] animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Sessão Suspensa</h2>
                <p className="text-sm text-[#ADADB8] mt-1">Você recebeu um timeout temporário e não pode interagir no momento.</p>
              </div>
              
              <div className="bg-[#0E0E10] px-6 py-4 rounded-xl border border-[#1F1F23] w-full">
                <span className="text-4xl font-black text-white tabular-nums">
                  {Math.floor(timeoutSeconds/60)}:{String(timeoutSeconds%60).padStart(2, '0')}
                </span>
                <span className="block text-[10px] uppercase font-bold text-[#606060] tracking-widest mt-1">Tempo Restante</span>
              </div>

              <p className="text-[10px] text-[#606060] uppercase leading-tight">
                O acesso será restaurado automaticamente assim que o cronômetro zerar.
              </p>
              
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 text-[10px] text-[#9146FF] hover:underline uppercase font-bold"
              >
                Atualizar Status
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar / Mobile Hidden Drawer */}
      <nav className={clsx(
        "fixed md:relative z-50 w-[260px] h-full bg-[#18181B] border-r border-[#1F1F23] flex flex-col transition-transform duration-300",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 flex items-center justify-between border-b border-[#1F1F23]">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#9146FF]" />
            <span className="font-bold tracking-tight">Sala {session.id}</span>
          </div>
          <button className="md:hidden p-1 text-[#ADADB8]" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <button onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors", activeTab === 'home' ? "bg-[#1F1F23] text-white" : "text-[#ADADB8] hover:bg-[#1F1F23] hover:text-white")}>
            <MonitorPlay className="w-4 h-4" /> Principal & Fila
          </button>
          <button onClick={() => { setActiveTab('users'); setMobileMenuOpen(false); }} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors", activeTab === 'users' ? "bg-[#1F1F23] text-white" : "text-[#ADADB8] hover:bg-[#1F1F23] hover:text-white")}>
            <Users className="w-4 h-4" /> Audiência ({session.users.length})
          </button>
          <button onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors", activeTab === 'profile' ? "bg-[#1F1F23] text-white" : "text-[#ADADB8] hover:bg-[#1F1F23] hover:text-white")}>
            <Crown className="w-4 h-4" /> Meu Perfil
          </button>
        </div>

        <div className="mt-auto p-4 space-y-2 border-t border-[#1F1F23]">
          <button onClick={copyInvite} className={clsx("w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border", copied ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-[#1F1F23] text-white border-[#26262C] hover:bg-[#26262C]")}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copiar Convite
          </button>
          <button onClick={() => { 
            localStorage.removeItem('active_room_id');
            localStorage.removeItem('active_role');
            localStorage.removeItem('active_session_payload');
            localStorage.removeItem('pending_room_id');
            window.location.reload(); 
          }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sair da Sala
          </button>
        </div>
      </nav>

      {/* Main App Canvas */}
      <main className="flex-1 flex flex-col h-[100dvh] relative min-w-0 bg-[#0E0E10]">
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-3 border-b border-[#1F1F23] bg-[#0E0E10] shrink-0">
          <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 text-[#ADADB8] hover:text-white rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-[#9146FF]" /> {session.id}
          </span>
          <button onClick={copyInvite} className="p-1.5 text-[#ADADB8] hover:text-white rounded-lg">
            {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </header>

        {/* Tab Mapping */}
        {activeTab === 'home' && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            
            {/* 0. Twitch Player & Chat Area */}
            {hostUser?.twitchData?.login && (
              <div className="w-full shrink-0 flex flex-col md:flex-row bg-[#000] border-b border-[#1F1F23]">
                <div className="w-full md:w-[70%] aspect-video md:h-[400px]">
                  <iframe
                    src={`https://player.twitch.tv/?channel=${hostTwitchLogin}&parent=${parentHostname}&autoplay=true&muted=false`}
                    height="100%"
                    width="100%"
                    allowFullScreen
                    className="border-r border-[#1F1F23]"
                  ></iframe>
                </div>
                <div className="w-full md:w-[30%] h-[300px] md:h-[400px]">
                  <iframe
                    src={`https://www.twitch.tv/embed/${hostTwitchLogin}/chat?parent=${parentHostname}&darkpopout`}
                    height="100%"
                    width="100%"
                  ></iframe>
                </div>
              </div>
            )}

            {/* 1. Playing Now Sticky Header */}
            {currentVideo && (
              <div className="shrink-0 bg-[#18181B] border-b border-[#1F1F23] shadow-md z-10 px-4 py-3 md:px-6 md:py-4 flex flex-col gap-2 relative overflow-hidden">
                {/* Visualizer animation overlay */}
                <div className="absolute top-0 right-0 w-32 h-full opacity-5 pointer-events-none bg-gradient-to-l from-[#9146FF] to-transparent"></div>
                
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="uppercase text-[10px] font-black tracking-widest text-[#ADADB8]">No ar agora</span>
                  </div>
                  <div className="text-[10px] font-medium bg-[#1F1F23] px-2 py-0.5 rounded-full text-[#ADADB8]">
                    {getPlatformIcon(currentVideo.url)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#1F1F23] rounded-lg">
                    <MonitorPlay className="w-6 h-6 text-[#9146FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate max-w-full block">
                      {currentVideo.url}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-[#ADADB8]">Enviado por</span>
                      <span className="text-xs font-bold text-white max-w-[100px] truncate">@{currentVideo.submitter}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!currentVideo && (
              <div className="shrink-0 bg-[#18181B] border-b border-[#1F1F23] shadow-md z-10 px-4 py-3 pb-8 md:px-6 md:py-6 flex flex-col items-center justify-center text-center">
                <Radio className="w-8 h-8 text-[#9146FF]/30 mb-2 animate-pulse" />
                <span className="text-sm font-semibold text-[#EFEFF1]">Stream Aguardando</span>
                <span className="text-xs text-[#ADADB8]">Nenhum vídeo em reprodução no momento.</span>
              </div>
            )}

            {/* 2. Scrollable Queue & History Timeline */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-40 space-y-6 transition-all duration-500 relative">
              
              {/* Info Banner for New Users (Friction reduction) */}
              {(me?.totalSubmitted === 0 && historyVideos.length === 0) && (
                <div className="bg-[#1F1F23] p-4 rounded-xl border border-[#9146FF]/30 flex gap-3 text-sm text-[#EFEFF1]">
                  <Info className="w-5 h-5 text-[#9146FF] shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">Como participar da Queue?</span>
                    Cole qualquer link (TikTok, Reels, Shorts) na barra abaixo. O moderador irá aprovar e soltar na live para todo mundo assistir junto!
                  </div>
                </div>
              )}

              {/* Moderation Pending List */}
              {myPendingVideos.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#ADADB8]">Meus Vídeos em Análise ({myPendingVideos.length})</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {myPendingVideos.map(v => (
                      <div key={v.id} className="bg-[#18181B] rounded-lg p-3 border border-[#26262C] flex items-center justify-between">
                        <span className="text-sm truncate pr-4 text-[#ADADB8]">{v.url}</span>
                        <span className="text-[10px] font-bold bg-orange-500/10 text-orange-400 px-2 py-1 rounded shrink-0 uppercase tracking-widest">Aguardando</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Up Next List */}
              {approvedVideos.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-white" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Na Fila de Espera ({approvedVideos.length})</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {approvedVideos.map((v, i) => (
                      <div key={v.id} className="bg-[#18181B] rounded-lg p-3 border border-[#26262C] flex justify-between items-center group">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#ADADB8] mb-0.5">
                            <span className="font-bold text-white w-4">#{i+1}</span>
                            <span>•</span>
                            <span className="truncate">@{v.submitter}</span>
                          </div>
                          <p className="text-sm text-[#EFEFF1] truncate">{v.url}</p>
                        </div>
                        <a href={v.url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-[#1F1F23] flex items-center justify-center text-[#ADADB8] hover:text-white transition-colors shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* History List */}
              {historyVideos.length > 0 && (
                <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#ADADB8]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#ADADB8]">Histórico Geral (Últimos 10)</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {historyVideos.map(v => (
                      <div key={v.id} className="text-xs flex items-center justify-between text-[#ADADB8] bg-transparent p-2 border-b border-[#18181B]">
                        <span className="truncate max-w-[60%] line-through">{v.url}</span>
                        <span className="shrink-0 pl-2">@{v.submitter}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div ref={queueEndRef} />
            </div>

            {/* 3. Sticky Bottom Submission Bar Component */}
            <div className="absolute bottom-0 left-0 w-full bg-[#18181B] border-t border-[#1F1F23] p-3 md:p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] safe-area-bottom z-20 transition-all duration-500">
              
              {!me?.twitchData?.login && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#18181B]/95 backdrop-blur-lg rounded-t-xl overflow-hidden border-t border-[#9146FF]/30">
                   <div className="flex flex-col items-center text-center p-4">
                      <Shield className="w-6 h-6 text-[#9146FF] mb-2" />
                      <span className="text-sm font-bold text-white mb-3">Identificação Obrigatória</span>
                      <p className="text-xs text-[#ADADB8] mb-4 max-w-[280px]">Para enviar vídeos é necessário vincular sua conta da Twitch.</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="bg-[#9146FF] hover:bg-[#A970FF] text-white px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2"
                      >
                        Vincular Twitch
                      </button>
                   </div>
                </div>
              )}

              {/* Warnings & Captcha Section (only expands if needed) */}
              <AnimatePresence>
                {me?.strikes && me.strikes > 0 ? (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-red-500 block">Aviso de Má Conduta</span>
                      <span className="text-xs text-red-400">Você possui {me.strikes} aviso(s). Mais violações podem resultar em banimento.</span>
                    </div>
                  </motion.div>
                ) : null}

                {/* Inline Captcha Challenge when typing URL */}
                {(isCaptchaRequired && url.length > 5) && (
                  <motion.div initial={{ height: 0, opacity: 0, y: 10 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0 }} className="mb-3 bg-[#1F1F23] border border-[#26262C] rounded-lg p-3 text-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#ADADB8]">
                      <Shield className="w-4 h-4 text-[#9146FF]" />
                      <span>Verificação: <strong className="text-white">Quanto é {captchaChallenge.num1} + {captchaChallenge.num2}?</strong></span>
                    </div>
                    <input 
                      type="number" 
                      value={captchaAnswer}
                      onChange={e => setCaptchaAnswer(e.target.value)}
                      placeholder="Resultado..."
                      className="w-full md:w-24 bg-[#0E0E10] border border-[#303032] py-1.5 px-3 rounded text-white text-center focus:outline-none focus:border-[#9146FF]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={submitVideo} className="flex gap-2 relative items-end">
                <div className="flex-1 bg-[#1F1F23] border border-[#303032] rounded-xl overflow-hidden focus-within:border-[#9146FF] focus-within:ring-1 focus-within:ring-[#9146FF]/50 transition-all flex flex-col">
                  {/* URL Input */}
                  <div className="flex items-center relative">
                    <div className="pl-3.5 pt-0.5 shrink-0">
                      <Link2 className="w-5 h-5 text-[#ADADB8]" />
                    </div>
                    <input 
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="Cole o link (TikTok, Youtube, Shorts, Reels)..."
                      className="w-full bg-transparent text-sm text-white py-3.5 px-3 focus:outline-none placeholder:text-[#606060]"
                      autoComplete="off"
                    />
                  </div>
                  {/* Hints */}
                  <div className="px-3 pb-2 pt-0 flex justify-between items-center text-[10px] text-[#606060] font-medium font-sans uppercase tracking-widest hidden md:flex">
                    <span>Sem restrições de plataforma</span>
                    <span>Max: {session.settings?.maxVideoDuration ? `${session.settings.maxVideoDuration}s` : 'Ilimitado'}</span>
                  </div>
                </div>

                <div className="shrink-0 h-[52px]">
                  <button 
                    type="submit"
                    disabled={!canSubmit || isSubmitting}
                    className={clsx(
                      "h-full px-5 rounded-xl flex items-center justify-center font-bold text-sm transition-all shadow-lg select-none",
                      submitSuccess ? "bg-green-500 text-white shadow-green-500/20" :
                      canSubmit && !remainingCooldown ? "bg-[#9146FF] hover:bg-[#A970FF] text-white shadow-[#9146FF]/20" : 
                      "bg-[#1F1F23] text-[#606060] cursor-not-allowed border border-[#303032] shadow-none"
                    )}
                  >
                    {submitSuccess ? (
                      <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }}><CheckCircle2 className="w-5 h-5" /></motion.div>
                    ) : remainingCooldown > 0 ? (
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {remainingCooldown}s</span>
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

        {/* Tab Mapping: Users */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#9146FF]" /> Audiência da Live
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {session.users.map(u => (
                <div key={u.id} className="bg-[#18181B] p-3 rounded-xl border border-[#26262C] flex items-center gap-3">
                  {renderUserAvatar(u)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-sm text-white truncate w-full block">@{u.name}</span>
                    </div>
                    {renderTwitchBadges(u)}
                    {(!u.twitchData?.badges?.length || !u.twitchData) && <span className="text-[10px] text-[#ADADB8]">Espectador</span>}
                  </div>
                  {u.id === socket.id && <div className="text-[10px] font-bold px-2 py-1 bg-[#1F1F23] rounded uppercase tracking-wider text-[#9146FF]">Você</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Mapping: Profile */}
        {activeTab === 'profile' && me && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 flex justify-center items-start">
            <div className="w-full max-w-md bg-[#18181B] rounded-2xl border border-[#26262C] overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-[#9146FF] to-[#3f1976]"></div>
              <div className="px-6 pb-6 relative">
                <div className="absolute -top-10 left-6 ring-4 ring-[#18181B] rounded-full overflow-hidden w-20 h-20 bg-black">
                  {renderUserAvatar(me, "w-full h-full")}
                </div>
                
                <div className="mt-12">
                  <h2 className="text-xl font-bold font-white">@{me.name}</h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {renderTwitchBadges(me)}
                    {me.isWhitelisted && <span className="bg-[#1F1F23] text-white px-2 py-0.5 rounded textxs font-bold ring-1 ring-[#303032]">Whitelist Ativa</span>}
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[#26262C] space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#1F1F23] p-3 rounded-lg">
                      <span className="text-[10px] uppercase text-[#ADADB8] tracking-widest font-bold block mb-1">Total Enviados</span>
                      <span className="text-xl font-black">{me.totalSubmitted || 0}</span>
                    </div>
                    <div className="bg-[#1F1F23] p-3 rounded-lg">
                      <span className="text-[10px] uppercase text-[#ADADB8] tracking-widest font-bold block mb-1">Confiabilidade</span>
                      <span className={clsx("text-xl font-black", me.reputation && me.reputation >= 80 ? "text-green-400" : "text-orange-400")}>{me.reputation || 100}%</span>
                    </div>
                  </div>

                  <div className="bg-red-500/5 p-3 rounded-lg border border-red-500/10 flex justify-between items-center">
                    <span className="text-sm font-semibold text-red-100">Advertências Ativas (Strikes)</span>
                    <span className="font-mono font-bold text-red-500">{me.strikes || 0}/5</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
