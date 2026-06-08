import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  Send, MonitorPlay, LogOut, CheckCircle, Clock, History, PlaySquare, Play, 
  Plus, Users, Copy, Check, ExternalLink, Loader2, Compass, LayoutGrid, Radio, X
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-[#8c92ac]', 
    'bg-[#b39c82]', 
    'bg-[#9c8cb3]', 
    'bg-[#8caf9b]', 
    'bg-[#b28282]', 
    'bg-[#aba682]', 
    'bg-[#8b9cb3]', 
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

const getPlatformLabel = (url: string) => {
  if (url.includes('instagram.com')) return 'Instagram Reel';
  if (url.includes('tiktok.com')) return 'TikTok Video';
  if (url.includes('youtube.com/shorts') || url.includes('youtu.be/shorts')) return 'YouTube Short';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube Video';
  return 'Vídeo Externo';
};

export default function ParticipantView({ session }: { session: SessionState }) {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'submit' | 'queue' | 'participants' | 'history' | 'profile'>('submit');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  
  const [captchaChallenge, setCaptchaChallenge] = useState({ num1: Math.floor(Math.random() * 9) + 1, num2: Math.floor(Math.random() * 9) + 1 });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [remainingCooldown, setRemainingCooldown] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const myself = session.users.find(u => u.id === socket.id);
      if (!myself) return;
      const lastSub = myself.lastSubmitted || 0;
      const now = Date.now();
      
      const userCooldownTrack = (session.settings?.userCooldownSeconds || 60) * 1000;
      const userRemaining = Math.max(0, Math.ceil((lastSub + userCooldownTrack - now) / 1000));
      
      const sessionLastGlobal = (session as any).lastGlobalSubmitted || 0;
      const globalCooldownTrack = sessionLastGlobal + (session.settings?.globalCooldownSeconds || 5) * 1000;
      const globalRemaining = Math.max(0, Math.ceil((globalCooldownTrack - now) / 1000));
      
      setRemainingCooldown(Math.max(userRemaining, globalRemaining));
    }, 500);

    return () => clearInterval(timer);
  }, [session]);

  const submitVideo = () => {
    if (!url.trim().startsWith('http')) return;
    
    socket.emit('submit_video', { 
      url: url.trim(),
      captchaPayload: {
        num1: captchaChallenge.num1,
        num2: captchaChallenge.num2,
        answer: captchaAnswer.trim()
      }
    });

    setUrl('');
    setCaptchaAnswer('');
    setCaptchaChallenge({
      num1: Math.floor(Math.random() * 9) + 1,
      num2: Math.floor(Math.random() * 9) + 1
    });
    // Automatically open the queue list to let user check their pending item
    setActiveTab('queue');
  };

  const currentVideo = session.queue.find(v => v.id === session.currentVideoId) || session.history.find(v => v.id === session.currentVideoId);
  const me = session.users.find(u => u.id === socket.id);
  const myPendingVideos = session.queue.filter(v => v.submitterId === socket.id && v.status === 'pending');
  const approvedVideos = session.queue.filter(v => v.status === 'approved');

  const copyInvite = () => {
    const inviteLink = `${window.location.origin}/?room=${session.id}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectTab = (tab: 'submit' | 'queue' | 'participants' | 'history' | 'profile') => {
    if (activeTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveTab(tab);
      setSidebarOpen(true);
    }
  };

  return (
    <div className="flex h-screen bg-[#0c0e12] text-[#e2e8f0] font-sans overflow-hidden select-none">
      
      {/* Live Equalizer Visualizer Styles */}
      <style>{`
        @keyframes eqPulse {
          0%, 100% { height: 10px; }
          50% { height: 36px; }
        }
        .eq-animated-1 { animation: eqPulse 0.8s ease-in-out infinite; }
        .eq-animated-2 { animation: eqPulse 1.2s ease-in-out infinite 0.25s; }
        .eq-animated-3 { animation: eqPulse 0.9s ease-in-out infinite 0.5s; }
        .eq-animated-4 { animation: eqPulse 1.1s ease-in-out infinite 0.1s; }
        .eq-animated-5 { animation: eqPulse 0.7s ease-in-out infinite 0.35s; }
      `}</style>
      
      {/* LEFT SIDEBAR DECK */}
      <div className="flex h-full flex-shrink-0 z-20 border-r border-[#1b1f2b] bg-[#11141c]">
        {/* Navigation Rail Button Strip - 64px width */}
        <div className="w-16 flex flex-col items-center py-4 justify-between bg-[#11141c] h-full border-r border-[#1b1f2b]/60">
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="w-10 h-10 rounded-xl bg-[#222735] border border-[#2d3345] flex items-center justify-center">
              <span className="font-extrabold text-xs text-[#9c8cb3] tracking-tighter">
                {session.id}
              </span>
            </div>

            <div className="h-px w-8 bg-[#1f2430]"></div>

            <nav className="flex flex-col items-center gap-3 w-full px-2">
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
                onClick={() => selectTab('queue')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center relative transition-all cursor-pointer group",
                  activeTab === 'queue' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Fila de Espera"
              >
                <Compass className="w-5 h-5" />
                {myPendingVideos.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#e0a670] rounded-full ring-2 ring-[#11141c]"></span>
                )}
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
                title="Histórico de Toques"
              >
                <History className="w-5 h-5" />
              </button>
              <button 
                onClick={() => selectTab('profile')}
                className={clsx(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group",
                  activeTab === 'profile' && sidebarOpen 
                    ? "bg-[#222735] text-[#f8fafc]" 
                    : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
                )}
                title="Meu Perfil"
              >
                <div className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold bg-[#9c8cb3] text-white">
                  {me ? getInitials(me.name) : 'ME'}
                </div>
              </button>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
            <button 
              onClick={copyInvite}
              className={clsx(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                copied ? "bg-[#8caf9b]/20 text-[#8caf9b]" : "text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b]"
              )}
              title="Copiar Convite"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => window.location.reload()} 
              className="w-11 h-11 rounded-xl flex items-center justify-center text-[#b28282] hover:text-[#f8fafc] hover:bg-[#b28282]/10 transition-all cursor-pointer"
              title="Sair da Sala"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sliding Panel */}
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
                  {activeTab === 'submit' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Adicionar Slide</span>}
                  {activeTab === 'queue' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Minha Fila</span>}
                  {activeTab === 'participants' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Audiência</span>}
                  {activeTab === 'history' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Histórico</span>}
                  {activeTab === 'profile' && <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] font-mono">Meu Perfil</span>}
                  
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 text-[#828ba0] hover:text-[#f8fafc] hover:bg-[#1b1f2b] rounded-lg transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  {activeTab === 'submit' && (
                    <div className="space-y-4">
                      <div className="bg-[#161a22] p-3 rounded-xl border border-[#2d3345]/30 text-left flex justify-between items-center">
                        <div>
                          <span className="text-[9px] font-bold text-[#828ba0] uppercase tracking-wider block font-mono">CÓDIGO DA SALA ATIVO</span>
                          <span className="text-sm font-extrabold tracking-widest text-[#9c8cb3] block mt-0.5 font-mono">{session.id}</span>
                        </div>
                        {me?.isWhitelisted && (
                          <span className="bg-[#8caf9b]/15 text-[#8caf9b] border border-[#8caf9b]/40 rounded-lg px-2 py-0.5 text-[8px] font-bold font-mono">
                            VERIFICADO
                          </span>
                        )}
                      </div>

                      {/* Display warning strikes if any */}
                      {me?.strikes && me.strikes > 0 ? (
                        <div className="bg-[#b28282]/10 border border-[#b28282]/30 p-3 rounded-xl text-left">
                          <span className="text-[9.5px] font-bold text-[#b28282] uppercase tracking-wider block font-mono">AVISO DE EXPULSÃO</span>
                          <div className="flex items-center gap-1 mt-1.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className="text-xs">
                                {i < (me.strikes || 0) ? '🔴' : '⚪'}
                              </span>
                            ))}
                            <span className="text-[10px] font-mono font-bold text-[#cbd5e1] ml-1">
                              ({me.strikes}/5 strikes)
                            </span>
                          </div>
                          <p className="text-[9px] text-[#828ba0] mt-1.5 leading-relaxed">
                            Envio de links suspeitos ou spam repetidos causarão suspensão permanente.
                          </p>
                        </div>
                      ) : null}

                      {/* Cooldown feedback alerts */}
                      {remainingCooldown > 0 && (
                        <div className="bg-[#e0a670]/10 border border-[#e0a670]/30 p-3 rounded-xl text-left flex items-start gap-2.5">
                          <Clock className="w-4 h-4 text-[#e0a670] flex-shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="text-[9.5px] font-bold text-[#e0a670] uppercase tracking-wider block font-mono">COOLDOWN DE SEGURANÇA</span>
                            <span className="text-[11px] text-[#cbd5e1] block mt-0.5">Aguarde <b>{remainingCooldown}s</b> antes do próximo envio.</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3.5 text-left">
                        <div>
                          <label className="text-[10px] font-bold text-[#828ba0] uppercase tracking-widest mb-1.5 block">
                            Link do Vídeo ou Reel
                          </label>
                          <input 
                            type="text" 
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="https://youtube.com/... ou Reels link"
                            className="w-full bg-[#0c0e12] border border-[#222735] rounded-xl px-3.5 py-3 text-xs text-[#cbd5e1] placeholder-[#47526d] focus:outline-none focus:border-[#7c73e6] transition-all font-medium"
                          />
                        </div>

                        {/* Renders mathematical barrier unless participant is whitelisted */}
                        {!me?.isWhitelisted && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-[#828ba0] uppercase tracking-widest block">
                              Verificação Antibot (Captcha)
                            </label>
                            <div className="bg-[#0c0e12] border border-[#222735] rounded-xl p-3.5 flex flex-col gap-2">
                              <span className="text-[11px] text-[#cbd5e1] font-medium">Resolva para provar que é humano:</span>
                              <span className="text-xs font-bold text-[#f8fafc] font-mono tracking-wider bg-[#161a22] py-1.5 rounded-lg text-center border border-[#2d3345]/50">
                                {captchaChallenge.num1} + {captchaChallenge.num2} = ?
                              </span>
                              <input 
                                type="number"
                                value={captchaAnswer}
                                onChange={e => setCaptchaAnswer(e.target.value)}
                                placeholder="Digite a resposta"
                                className="w-full bg-[#161a22] border border-[#2d3345]/60 rounded-lg px-3 py-2 text-xs text-[#cbd5e1] focus:outline-none focus:border-[#7c73e6] transition-all font-mono"
                              />
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={submitVideo}
                          disabled={
                            !url.trim().startsWith('http') || 
                            remainingCooldown > 0 || 
                            (!me?.isWhitelisted && !captchaAnswer.trim())
                          }
                          className="w-full bg-[#7c73e6] hover:bg-[#6c62da] disabled:bg-[#222735] disabled:text-[#47526d] disabled:cursor-not-allowed text-white font-bold py-3 py-3.5 px-4 rounded-xl text-xs transition-colors cursor-pointer flex justify-center items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Enviar para a Tela
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: QUEUE STATUS PANEL */}
                  {activeTab === 'queue' && (
                    <div className="space-y-4 text-left">
                      {/* User's Pending Items */}
                      {myPendingVideos.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-bold text-[#e0a670] uppercase tracking-wider">
                            Aguardando Aprovação ({myPendingVideos.length})
                          </h4>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {myPendingVideos.map(vid => (
                              <div key={vid.id} className="bg-[#161a22] border border-[#e0a670]/10 p-2 rounded-xl">
                                <p className="text-[11px] text-[#cbd5e1] truncate font-medium">{vid.url}</p>
                                <span className="text-[8px] uppercase tracking-widest text-[#e0a670] font-mono block mt-1">EM ESPERA</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Room Playlist Up Next */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">
                          Próximos na Fila ({approvedVideos.length})
                        </h4>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {approvedVideos.map(vid => (
                            <div key={vid.id} className="bg-[#161a22] border border-[#222735] p-2 rounded-xl">
                              <p className="text-[11px] text-[#cbd5e1] truncate font-medium">{vid.url}</p>
                              <span className="text-[8px] text-[#828ba0] font-mono block mt-1">Por: @{vid.submitter}</span>
                            </div>
                          ))}
                          {approvedVideos.length === 0 && (
                            <p className="text-[11px] text-[#47526d] italic">Sem vídeos programados</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PARTICIPANTS IN ROOM */}
                  {activeTab === 'participants' && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">
                        Participantes na Sala ({session.users.length})
                      </h4>
                      <div className="space-y-1.5 max-h-80 overflow-y-auto">
                        {session.users.map(u => {
                          const avatarColor = getAvatarColor(u.name);
                          const initials = getInitials(u.name);
                          return (
                            <div key={u.id} className="flex items-center gap-2 bg-[#161a22] p-2 rounded-xl border border-[#222735]/40 text-left">
                              <div className={clsx("w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[9px] text-white", avatarColor)}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[11.5px] font-semibold text-[#cbd5e1] block truncate">
                                  @{u.name} {u.id === socket.id ? '(Você)' : ''}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: HISTORY WATCHED */}
                  {activeTab === 'history' && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">
                        Vídeos já Assistidos ({session.history.length})
                      </h4>
                      <div className="space-y-1.5 max-h-80 overflow-y-auto">
                        {session.history.map(vid => (
                          <div key={vid.id} className="bg-[#161a22]/30 border border-[#222735]/30 p-2 rounded-xl">
                            <p className="text-[11px] text-[#828ba0] truncate font-medium line-through decoration-[#47526d]">{vid.url}</p>
                            <span className="text-[8px] text-[#47526d] block mt-0.5">Autor: @{vid.submitter}</span>
                          </div>
                        ))}
                        {session.history.length === 0 && (
                          <p className="text-[11px] text-[#47526d] italic">Histórico vazio</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: PROFILE DASHBOARD */}
                  {activeTab === 'profile' && me && (
                    <div className="space-y-5 text-left pb-4">
                      
                      <div className="flex flex-col items-center p-5 bg-[#161a22] mt-2 rounded-2xl border border-[#222735]/70 relative overflow-hidden">
                        <div className="absolute top-0 w-full h-1" style={{ backgroundColor: me.reputation >= 80 ? '#a3c9b8' : me.reputation >= 40 ? '#e0a670' : '#b28282' }}></div>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl text-white mb-3" style={{ backgroundColor: me.reputation >= 80 ? '#a3c9b8' : me.reputation >= 40 ? '#e0a670' : '#b28282' }}>
                          {getInitials(me.name)}
                        </div>
                        <h3 className="text-[#f8fafc] font-bold text-base">@{me.name}</h3>
                        <p className="text-[10px] text-[#828ba0] font-mono mt-0.5">{me.userId}</p>
                        
                        <div className="mt-4 py-1.5 px-4 rounded-lg flex items-center gap-2 border border-[#222735]" style={{ backgroundColor: me.reputation >= 80 ? 'rgba(163,201,184,0.1)' : me.reputation >= 40 ? 'rgba(224,166,112,0.1)' : 'rgba(178,130,130,0.1)' }}>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: me.reputation >= 80 ? '#a3c9b8' : me.reputation >= 40 ? '#e0a670' : '#b28282' }}>
                           {me.reputation >= 80 ? 'Confiável' : me.reputation >= 40 ? 'Regular' : 'Suspeito'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                         <h4 className="text-[10px] font-bold text-[#828ba0] uppercase tracking-wider">Estatísticas de Conta</h4>
                         <div className="bg-[#11141c] border border-[#222735] rounded-xl p-3 grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                               <span className="text-[9px] text-[#828ba0] uppercase tracking-wider">Enviados</span>
                               <span className="text-[#cbd5e1] font-mono font-bold text-lg">{me.totalSubmitted || 0}</span>
                            </div>
                            <div className="flex flex-col border-l border-[#222735] pl-3">
                               <span className="text-[9px] text-[#828ba0] uppercase tracking-wider">Strikes</span>
                               <span className={clsx("font-mono font-bold text-lg", me.strikes > 0 ? "text-[#e0a670]" : "text-[#cbd5e1]")}>{me.strikes || 0}/5</span>
                            </div>
                            <div className="flex flex-col border-t border-[#222735] pt-3">
                               <span className="text-[9px] text-[#a3c9b8] uppercase tracking-wider font-bold">Aprovados</span>
                               <span className="text-[#a3c9b8] font-mono font-bold text-lg">{me.approvedCount || 0}</span>
                            </div>
                            <div className="flex flex-col border-t border-l border-[#222735] pt-3 pl-3">
                               <span className="text-[9px] text-[#b28282] uppercase tracking-wider font-bold">Rejeitados</span>
                               <span className="text-[#b28282] font-mono font-bold text-lg">{me.rejectedCount || 0}</span>
                            </div>
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

      {/* CENTER WORKSPACE: Elegant mock Reel design representing host stream */}
      <main className="flex-1 relative bg-[#06070a] flex flex-col items-center justify-center overflow-hidden z-10 p-6 md:p-12">
        
        {/* Physical Smartphone shell wrapper representing stream */}
        <div className="relative w-full max-w-[280px] md:max-w-[310px] aspect-[9/16] bg-[#0c0e12] rounded-[2.5rem] border border-[#222735] flex items-center justify-center overflow-hidden shadow-none">
          
          {/* Internal Canvas representation */}
          {currentVideo ? (
            <div className="w-full h-full flex flex-col justify-between p-5 relative select-none">
              
              {/* Connected Active Label */}
              <div className="flex justify-between items-center z-15 mt-2">
                <span className="bg-[#8caf9b]/15 border border-[#8caf9b]/35 text-[#8caf9b] text-[8px] uppercase tracking-widest font-mono font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#8caf9b] animate-ping"></span>
                  Sincronizado
                </span>
                <span className="text-[8.5px] text-[#47526d] font-mono">
                  Room: {session.id}
                </span>
              </div>

              {/* Centered Graphic equalizers */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 my-auto">
                {/* Platform badge */}
                <div className="px-3 py-1 bg-[#161a22] border border-[#222735]/80 rounded-xl flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-[#7c73e6]" />
                  <span className="text-[9.5px] text-[#cbd5e1] font-bold uppercase tracking-wider font-mono">
                    {getPlatformLabel(currentVideo.url)}
                  </span>
                </div>

                {/* Animated Bars */}
                <div className="flex items-end justify-center gap-1.5 h-12 w-full">
                  <div className="w-1.5 bg-[#7c73e6]/80 rounded-full eq-animated-1"></div>
                  <div className="w-1.5 bg-[#9c8cb3]/90 rounded-full eq-animated-2"></div>
                  <div className="w-1.5 bg-[#a3c9b8]/80 rounded-full eq-animated-3"></div>
                  <div className="w-1.5 bg-[#7c73e6]/95 rounded-full eq-animated-4"></div>
                  <div className="w-1.5 bg-[#b2c8df]/85 rounded-full eq-animated-5"></div>
                </div>

                <div className="text-center max-w-[190px]">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-[#828ba0] block mb-1">
                    Transmitindo na Tela Principal
                  </span>
                  <p className="text-xs font-semibold text-[#f8fafc] truncate block">
                    {currentVideo.url}
                  </p>
                </div>
              </div>

              {/* Bottom detail card replicating Reels bottom-left */}
              <div className="mt-auto space-y-3 text-left">
                <div className="flex items-center gap-2.5">
                  <div className={clsx("w-7.5 h-7.5 rounded-full flex items-center justify-center font-bold text-[9px] text-white", getAvatarColor(currentVideo.submitter))}>
                    {getInitials(currentVideo.submitter)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-[#f8fafc] block truncate">
                      @{currentVideo.submitter}
                    </span>
                    <span className="text-[8px] text-[#828ba0] block font-mono">
                      Submeteu essa mídia
                    </span>
                  </div>
                </div>

                <a 
                  href={currentVideo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="w-full bg-[#1b1f2b] hover:bg-[#222735] text-[#cbd5e1] py-2.5 px-3 rounded-xl text-[10px] font-bold transition-colors flex items-center justify-center gap-1 border border-[#2d3345]"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir no meu dispositivo
                </a>
              </div>

            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none gap-5">
              <Compass className="w-10 h-10 text-[#47526d] animate-pulse" />
              <div>
                <span className="text-[9px] uppercase tracking-widest font-mono text-[#47526d] block mb-0.5">SESSÃO ATIVA</span>
                <span className="text-sm font-extrabold text-[#cbd5e1] block">Nenhuma mídia ativa</span>
              </div>
              <p className="text-[11px] text-[#828ba0] leading-relaxed max-w-[190px]">
                Envie um link na aba de <span className="text-[#9c8cb3] font-semibold">Adicionar</span> para reproduzir agora na tela do Host!
              </p>
            </div>
          )}

        </div>

        {/* Small descriptive caption */}
        <div className="mt-5 text-[10px] font-mono text-[#47526d] uppercase tracking-wider select-none text-center">
          visualização remota da tela principal
        </div>
      </main>

    </div>
  );
}
