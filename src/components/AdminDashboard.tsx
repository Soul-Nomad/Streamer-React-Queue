import { useState, useMemo, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  ShieldCheck, ShieldAlert, Users, Clock, ArrowLeftRight, CheckCircle, 
  XOctagon, AlertTriangle, MessageSquare, Search, Filter, ShieldOff, Check, X,
  ShieldHalf, Settings, Save, ExternalLink, Fingerprint
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

const renderUserAvatarAdmin = (user: any, sizeClass = "w-8 h-8") => {
  const twitch = user?.twitchData;
  if (twitch?.avatarUrl) {
    return (
      <img
        src={twitch.avatarUrl}
        alt={twitch.displayName || user.username || user.name || '?'}
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-sm object-cover border border-[#404040] bg-[#121212] shrink-0`}
      />
    );
  }
  const name = twitch?.displayName || user.username || user.name || '?';
  const color = twitch?.color || '#505050';
  const initials = name.trim().substring(0, 2).toUpperCase();
  return (
    <div
      className={`${sizeClass} rounded-sm flex items-center justify-center font-bold text-[10px] text-zinc-100 shrink-0 border border-[#404040]`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
};

const renderTwitchBadgesAdmin = (user: any) => {
  return null;
};

export default function AdminDashboard({ session }: { session: SessionState }) {
  const [activeView, setActiveView] = useState<'overview' | 'users' | 'history'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  const allUsers = useMemo(() => {
    const list = session.allUserProfiles || [];
    if (list.length > 0) return list;
    return (session.users || []).map((u: any) => ({
      userId: u.userId || u.id,
      username: u.twitchData?.login || u.name,
      reputation: u.reputation ?? 0,
      strikes: u.strikes ?? 0,
      totalSubmitted: u.totalSubmitted ?? 0,
      approvedCount: u.approvedCount ?? 0,
      rejectedCount: u.rejectedCount ?? 0,
      shadowBanned: u.shadowBanned ?? false,
      restrictedUntil: u.restrictedUntil ?? 0,
      twitchData: u.twitchData
    }));
  }, [session.allUserProfiles, session.users]);

  const bans = session.allBans || [];
  const history = session.allHistoryLogs || [];
  const alerts = session.suspiciousAlerts || [];

  const handleForgiveByUserId = (userId: string) => {
    socket.emit('forgive_user', userId);
  };

  const handlePunish = (userId: string, banType: string) => {
    socket.emit('ban_user', { userId, reason: 'Punição via Dashboard', banType });
  };

  const handleRemoveStrikes = (userId: string) => {
    socket.emit('admin_action', { action: 'remove_strikes', userId });
  };
  
  const handleLiftRestrictions = (userId: string) => {
    socket.emit('admin_action', { action: 'lift_restrictions', userId });
  };

  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const q = historySearchQuery.toLowerCase();
      const matchSearch = !q || 
        h.submitterName.toLowerCase().includes(q) || 
        (h.rejectionReason && h.rejectionReason.toLowerCase().includes(q)) || 
        (h.actionDetails && h.actionDetails.toLowerCase().includes(q)) ||
        h.url?.toLowerCase().includes(q) ||
        h.platform?.toLowerCase().includes(q);
      const matchStatus = historyFilterStatus === 'all' || h.status === historyFilterStatus;
      return matchSearch && matchStatus;
    });
  }, [history, historySearchQuery, historyFilterStatus]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return allUsers;
    const q = searchQuery.toLowerCase();
    return allUsers.filter(u => u.username.toLowerCase().includes(q) || u.userId.includes(q));
  }, [allUsers, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden text-zinc-400 animate-in fade-in" id="admin_dashboard">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 px-6 border-b border-zinc-800 shrink-0 bg-black/80" style={{ height: '80px' }}>
        <h1 className="text-2xl font-black text-white uppercase tracking-widest font-mono">
          MODERAÇÃO
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Centralized Navigation */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-zinc-950 border border-zinc-900 p-1 rounded-sm shadow-inner shrink-0 w-full md:w-auto overflow-x-auto">
            <button 
              onClick={() => setActiveView('overview')}
              className={clsx("px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono whitespace-nowrap", activeView === 'overview' ? 'bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
            >
              PANEL OVERVIEW
            </button>
            <button 
              onClick={() => setActiveView('users')}
              className={clsx("px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono whitespace-nowrap", activeView === 'users' ? 'bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
            >
              VIEWER SECURITY PROFILES
            </button>
            <button 
              onClick={() => setActiveView('history')}
              className={clsx("px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono whitespace-nowrap", activeView === 'history' ? 'bg-[#9146FF]/15 text-orange-400 border border-[#9146FF]/25 shadow-[0_0_15px_rgba(145,70,255,0.12)]' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
            >
              GLOBAL LOGS
            </button>
          </div>
        </div>
        {activeView === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Metric Card 1 */}
                <div className="relative bg-[#0C0C0E] border border-zinc-800/80 rounded-sm flex flex-col justify-between overflow-hidden group hover:border-zinc-600 transition-all duration-300 text-left min-h-[145px]">
                  <div className="p-4 z-10 pb-8">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest font-mono">CONEXÕES ATIVAS</span>
                      </div>
                      <span className="text-[7px] text-zinc-400 font-mono bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shadow-inner font-extrabold">CH 1</span>
                    </div>
                    <div className="mt-2">
                       <h3 className="text-4xl font-black text-white font-sans tracking-tight leading-none">{allUsers.length}</h3>
                    </div>
                    <div className="mt-2 text-[8.5px] text-zinc-500 font-mono uppercase tracking-widest font-bold">REDE RESILIENTE: 100%</div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden opacity-90 border-t border-zinc-900/50">
                    <div className="h-full w-full bg-gradient-to-r from-cyan-400 via-teal-500 to-blue-600">
                      <div className="w-full h-full opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }} />
                    </div>
                  </div>
                </div>
                
                {/* Metric Card 2 */}
                <div className="relative bg-[#0C0C0E] border border-zinc-800/80 rounded-sm flex flex-col justify-between overflow-hidden group hover:border-zinc-600 transition-all duration-300 text-left min-h-[145px]">
                  <div className="p-4 z-10 pb-8">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-[8px] font-bold text-red-500 uppercase tracking-widest font-mono">RESTRITOS / BANIDOS</span>
                      </div>
                      <span className="text-[7px] text-zinc-400 font-mono bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shadow-inner font-extrabold">CH 2</span>
                    </div>
                    <div className="mt-2">
                       <h3 className="text-4xl font-black text-red-500 font-sans tracking-tight leading-none">{bans.filter(b => b.active).length}</h3>
                    </div>
                    <div className="mt-2 text-[8.5px] text-zinc-500 font-mono uppercase tracking-widest font-bold">DISCIPLINA OPERACIONAL</div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden opacity-90 border-t border-zinc-900/50">
                    <div className="h-full w-full bg-gradient-to-r from-red-500 via-orange-600 to-yellow-600">
                      <div className="w-full h-full opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }} />
                    </div>
                  </div>
                </div>

                {/* Metric Card 3 */}
                <div className="relative bg-[#0C0C0E] border border-zinc-800/80 rounded-sm flex flex-col justify-between overflow-hidden group hover:border-zinc-600 transition-all duration-300 text-left min-h-[145px]">
                  <div className="p-4 z-10 pb-8">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest font-mono">APROVADOS GERAIS</span>
                      </div>
                      <span className="text-[7px] text-zinc-400 font-mono bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shadow-inner font-extrabold">CH 3</span>
                    </div>
                    <div className="mt-2">
                       <h3 className="text-4xl font-black text-emerald-400 font-sans tracking-tight leading-none">{history.filter(h => h.status === 'approved').length}</h3>
                    </div>
                    <div className="mt-2 text-[8.5px] text-zinc-500 font-mono uppercase tracking-widest font-bold">CONFIABILIDADE DOS VIEWER</div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden opacity-90 border-t border-zinc-900/50">
                    <div className="h-full w-full bg-gradient-to-r from-emerald-400 via-green-500 to-teal-700">
                      <div className="w-full h-full opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }} />
                    </div>
                  </div>
                </div>
                
                {/* Metric Card 4 */}
                <div className="relative bg-[#0C0C0E] border border-zinc-800/80 rounded-sm flex flex-col justify-between overflow-hidden group hover:border-zinc-600 transition-all duration-300 text-left min-h-[145px]">
                  <div className="p-4 z-10 pb-8">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-1.5">
                        <XOctagon className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-[8px] font-bold text-orange-500 uppercase tracking-widest font-mono">REJEITADOS RECENTES</span>
                      </div>
                      <span className="text-[7px] text-zinc-400 font-mono bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shadow-inner font-extrabold">CH 4</span>
                    </div>
                    <div className="mt-2">
                       <h3 className="text-4xl font-black text-orange-500 font-sans tracking-tight leading-none">{history.filter(h => h.status === 'rejected').length}</h3>
                    </div>
                    <div className="mt-2 text-[8.5px] text-zinc-500 font-mono uppercase tracking-widest font-bold">POLÍTICA DE RETENÇÃO</div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden opacity-90 border-t border-zinc-900/50">
                    <div className="h-full w-full bg-gradient-to-r from-orange-400 via-amber-500 to-yellow-600">
                      <div className="w-full h-full opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }} />
                    </div>
                  </div>
                </div>
              </div>
             
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-2 bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm flex flex-col h-[480px] overflow-hidden relative shadow-2xl transition-all duration-300 group">
                 <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-[#0a0a0c] z-10 relative">
                   <div className="flex items-center gap-3">
                     <AlertTriangle className="w-4 h-4 text-orange-500" />
                     <div className="flex flex-col">
                       <span className="text-[8px] font-black font-mono text-orange-500 uppercase tracking-[0.2em] mb-0.5">IDS MONITORING</span>
                       <h3 className="text-zinc-200 font-bold text-xs uppercase tracking-widest font-sans">
                         ALERTA DE ANOMALIAS EM TEMPO REAL
                       </h3>
                     </div>
                   </div>
                   <span className="text-[8px] font-mono font-extrabold text-[#00FF66] bg-[#00FF66]/10 px-2 py-1 rounded-sm border border-[#00FF66]/30 uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(0,255,102,0.1)] flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-[#00FF66] rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,102,0.8)]"></div> DETECTOR DE SPAM
                   </span>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-1.5 p-3 bg-gradient-to-b from-[#0c0c0e] to-[#08080a] z-10">
                   {alerts.length === 0 ? (
                     <div className="h-full flex items-center justify-center border border-dashed border-zinc-800/60 m-4 rounded-sm bg-zinc-950/30">
                       <p className="text-zinc-600 text-[10px] uppercase font-mono tracking-widest flex items-center gap-2">
                         <CheckCircle className="w-3.5 h-3.5 text-zinc-700" /> Nenhuma anomalia de rede detectada.
                       </p>
                     </div>
                   ) : (
                     alerts.map(a => {
                        const matchedUser = session.users?.find(u => u.name === a.username || u.userId === a.userId || u.twitchData?.login === a.username);
                        const twitch = matchedUser?.twitchData;
                        const displayName = twitch?.displayName || a.username;
                        const color = twitch?.color || '#FFFFFF';
                        return (
                          <div key={a.id} className={clsx("p-3 border-l-[3px] flex items-start gap-4 transition-all hover:bg-zinc-900/60 rounded-sm relative overflow-hidden", a.severity === 'high' ? 'bg-red-500/10 border-red-500 shadow-[inset_15px_0_30px_rgba(239,68,68,0.05)]' : a.severity === 'medium' ? 'bg-orange-500/10 border-orange-500 shadow-[inset_15px_0_30px_rgba(249,115,22,0.05)]' : 'bg-[#121215] border-zinc-600')}>
                            {matchedUser ? renderUserAvatarAdmin(matchedUser, "w-9 h-9 mt-0.5 border border-zinc-700 shadow-lg") : (
                              <ShieldAlert className={clsx("w-9 h-9 mt-0.5 p-1.5 bg-zinc-900 border border-zinc-800 rounded-sm shadow-sm", a.severity === 'high' ? 'text-red-500' : a.severity === 'medium' ? 'text-orange-500' : 'text-zinc-500')} />
                            )}
                            <div className="flex-1 min-w-0 z-10">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-extrabold text-[12px] tracking-tight font-sans uppercase" style={{ color: color, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{displayName}</span>
                                <span className="text-[9px] font-mono text-zinc-500 font-bold tracking-[0.2em]">{new Date(a.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-[11px] text-zinc-300 group-hover:text-zinc-100 transition-colors leading-relaxed font-mono tracking-tight">{a.message}</p>
                              <div className="flex items-center gap-2 mt-2.5">
                                <span className="text-[8px] bg-zinc-950/80 text-zinc-400 px-1.5 py-0.5 rounded-sm border border-zinc-800 font-mono tracking-widest uppercase font-black shadow-inner">ID: {a.type}</span>
                                <span className={clsx("text-[8px] px-1.5 py-0.5 rounded-sm border font-mono tracking-widest uppercase font-black shadow-inner", a.severity === 'high' ? 'bg-red-950/40 text-red-400 border-red-900/50' : a.severity === 'medium' ? 'bg-orange-950/40 text-orange-400 border-orange-900/50' : 'bg-zinc-950 text-zinc-400 border-zinc-800')}>LVL: {a.severity}</span>
                              </div>
                            </div>
                            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/20 to-transparent pointer-events-none"></div>
                          </div>
                        );
                      })
                   )}
                 </div>
                 
                 {/* Decorative Bottom Bar */}
                 <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-600 via-rose-500 to-purple-600 opacity-90 z-20"></div>
                 <div className="absolute bottom-0 left-0 right-0 h-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] opacity-30 z-20 pointer-events-none mb-[-4px]"></div>
               </div>
               
               <div className="bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm flex flex-col h-[480px] overflow-hidden relative shadow-2xl transition-all duration-300 hover:border-red-500/30 group">
                 <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-[#0a0a0c] z-10 relative">
                   <div className="flex items-center gap-3">
                     <ShieldOff className="w-4 h-4 text-red-500" />
                     <div className="flex flex-col">
                       <span className="text-[8px] font-black font-mono text-red-500 uppercase tracking-[0.2em] mb-0.5">RESTRICTED</span>
                       <h3 className="text-zinc-200 font-bold text-xs uppercase tracking-widest font-sans">
                         CONDENADOS GLOBAIS
                       </h3>
                     </div>
                   </div>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-2 p-3 bg-gradient-to-b from-[#0c0c0e] to-[#08080a] z-10">
                   {bans.filter(b => b.active).length === 0 ? (
                     <div className="h-full flex items-center justify-center border border-dashed border-zinc-800/60 m-1 rounded-sm bg-zinc-950/30">
                       <p className="text-zinc-600 text-[10px] uppercase font-mono tracking-widest">Nenhum banimento ativo.</p>
                     </div>
                   ) : (
                     bans.filter(b => b.active).map(b => {
                        const matchedUser = session.users?.find(u => u.name === b.username || u.userId === b.userId || u.twitchData?.login === b.username);
                        const twitch = matchedUser?.twitchData;
                        const displayName = twitch?.displayName || b.username;
                        const color = twitch?.color || '#FFFFFF';
                        return (
                          <div key={b.id} className="p-3 bg-zinc-950/60 border border-zinc-800 flex gap-3 group/ban transition-all hover:bg-zinc-900 overflow-hidden relative rounded-sm">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 opacity-50 group-hover/ban:opacity-100 transition-opacity"></div>
                            {matchedUser && renderUserAvatarAdmin(matchedUser, "w-8 h-8 shrink-0 border border-zinc-700")}
                            <div className="flex-1 min-w-0 z-10 ml-1">
                              <div className="flex justify-between items-center mb-1.5 gap-2">
                                <span className="text-[12px] font-bold font-sans uppercase tracking-tight truncate" style={{ color: color, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{displayName}</span>
                                <button onClick={() => handleLiftRestrictions(b.userId)} className="text-[8px] bg-zinc-950 hover:bg-emerald-950/60 border border-zinc-700 hover:border-emerald-500/50 px-2 py-1 rounded-sm transition-all text-emerald-500 font-black font-mono cursor-pointer uppercase tracking-widest shadow-lg">LIFT</button>
                              </div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-[8px] text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded-sm uppercase font-mono font-black border border-red-900/30 tracking-widest">{b.banType}</span>
                              </div>
                              <p className="text-[10.5px] text-zinc-400 line-clamp-3 font-mono group-hover/ban:text-zinc-300 leading-snug">{b.reason}</p>
                            </div>
                          </div>
                        );
                      })
                   )}
                 </div>
                 
                 {/* Decorative Bottom Bar */}
                 <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 to-rose-900 opacity-80 z-20"></div>
               </div>
              </div>
          </div>
        )}

        {activeView === 'users' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="mb-6 flex flex-col md:flex-row items-stretch md:items-center gap-4">
               <div className="relative flex-1 group">
                 <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                   <Search className="w-4 h-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors" />
                 </div>
                 <input 
                   type="text"
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   placeholder="ESCANEAR PERFIS DE USUÁRIO OU HARDWARE IDs..."
                   className="w-full bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm pl-11 pr-4 py-3.5 text-xs text-zinc-200 placeholder-zinc-700/80 focus:outline-none focus:border-orange-500/80 focus:bg-[#121215] shadow-inner font-mono font-bold tracking-widest transition-all"
                 />
                 <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                   <div className="flex gap-1">
                     <kbd className="hidden sm:inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-sm px-2 text-[10px] font-mono text-zinc-500 uppercase font-black uppercase tracking-widest h-6">CTRL</kbd>
                     <kbd className="hidden sm:inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-sm px-2 text-[10px] font-mono text-zinc-500 uppercase font-black uppercase tracking-widest h-6">F</kbd>
                   </div>
                 </div>
               </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm overflow-hidden shadow-2xl relative">
              {/* Decorative top border */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-zinc-800 via-zinc-600 to-zinc-800 z-20 opacity-50"></div>
              
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead className="bg-[#0a0a0c] sticky top-0 z-10 before:content-[''] before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[1px] before:bg-zinc-800">
                    <tr>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] whitespace-nowrap">Entidade Live</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] w-48">Métricas de Reputação</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] text-center w-32">Histórico (A/R)</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] text-right w-64 pr-6">Ações Táticas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-gradient-to-b from-[#0c0c0e] to-[#08080a]">
                  {filteredUsers.map(user => {
                     const isBanned = bans.some(b => b.userId === user.userId && b.active);
                     const twitch = user.twitchData;
                     const displayName = twitch?.displayName || user.username || user.name;
                     const login = twitch?.login || (user.username !== displayName ? user.username : null);
                     const color = twitch?.color || '#FFFFFF';
                     return (
                       <tr key={user.userId} className={clsx("group transition-all hover:bg-zinc-900 border-b border-zinc-800/60", isBanned ? "bg-red-950/10" : "")}>
                         <td className="p-4">
                           <div className="flex items-center gap-4">
                              <div className="relative">
                                {renderUserAvatarAdmin(user, "w-10 h-10 border-[1.5px] border-zinc-700 shadow-lg")}
                                {isBanned && (
                                   <div className="absolute -top-1 -right-1 bg-red-600 rounded-full w-3.5 h-3.5 border-2 border-[#0c0c0e] flex items-center justify-center shadow-sm">
                                     <ShieldOff className="w-2 h-2 text-white" />
                                   </div>
                                )}
                                {user.shadowBanned && (
                                   <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-3.5 h-3.5 border-2 border-[#0c0c0e] shadow-sm"></div>
                                )}
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-bold text-sm tracking-tight text-zinc-200 truncate mix-blend-screen" style={{ color: color, textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>{displayName}</span>
                                  {renderTwitchBadgesAdmin(user)}
                                </div>
                                
                                <div className="flex items-center gap-2 mt-0.5">
                                  {login && (
                                     <span className="text-[10px] text-zinc-500 font-mono tracking-tight bg-[#0a0a0c] px-1.5 py-0.5 rounded-sm border border-zinc-800/80 shadow-inner">@{login}</span>
                                  )}
                                  <span className="text-[9px] text-zinc-600 font-mono flex items-center gap-1 group-hover:text-zinc-500 transition-colors uppercase">
                                    <Fingerprint className="w-3 h-3" />
                                    {user.userId.substring(0,8)}
                                  </span>
                                </div>
                              </div>
                           </div>
                         </td>
                         <td className="p-4">
                           <div className="flex flex-col gap-2 relative z-10 w-40 mt-1">
                             <div className="flex justify-between items-center">
                               <span className={clsx("text-[10px] font-black font-mono tracking-[0.2em] uppercase", user.reputation >= 80 ? 'text-emerald-500' : user.reputation >= 40 ? 'text-orange-500' : 'text-red-500')}>
                                 {user.reputation >= 80 ? 'HIGH TRUST' : user.reputation >= 40 ? 'SUSPICIOUS' : 'CRITICAL'}
                               </span>
                               <span className={clsx("text-[10px] font-black font-mono tracking-widest", user.reputation >= 80 ? 'text-emerald-400' : user.reputation >= 40 ? 'text-orange-400' : 'text-red-400')}>{user.reputation}%</span>
                             </div>
                              <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80 shadow-inner">
                                <div className={clsx("h-full transition-all duration-1000 ease-out shadow-[0_0_10px_currentcolor]", user.reputation >= 80 ? 'bg-emerald-500 shadow-emerald-500/50' : user.reputation >= 40 ? 'bg-orange-500 shadow-orange-500/50' : 'bg-red-600 shadow-red-600/50')} style={{ width: Math.max(0, Math.min(100, user.reputation)) + "%" }}></div>
                              </div>
                              {user.strikes > 0 ? (
                                 <div className="flex items-center gap-1 mt-0.5 opacity-90">
                                   <div className="flex items-center gap-1">
                                     {Array(5).fill(0).map((_, i) => (
                                       <div key={i} className={clsx("w-1.5 h-1.5 rounded-full border shadow-inner", i < user.strikes ? 'bg-orange-500 border-orange-600' : 'bg-zinc-800 border-zinc-900')}></div>
                                     ))}
                                   </div>
                                   <span className="text-[8.5px] font-mono text-orange-500 font-bold ml-1 uppercase tracking-widest">{user.strikes}/5 Strikes</span>
                                 </div>
                              ) : (
                                 <div className="flex items-center justify-between w-full mt-0.5">
                                   <div className="flex items-center gap-1">
                                     {Array(5).fill(0).map((_, i) => (
                                       <div key={i} className="w-1.5 h-1.5 rounded-full border bg-zinc-800 border-zinc-900 shadow-inner"></div>
                                     ))}
                                   </div>
                                   <span className="text-[8.5px] font-mono text-zinc-600 font-bold ml-1 uppercase tracking-widest">No Strikes</span>
                                 </div>
                              )}
                           </div>
                         </td>
                         <td className="p-4">
                            <div className="flex flex-col items-center justify-center gap-1 bg-[#121215] border border-zinc-800/60 rounded-sm py-1.5 px-2 font-mono tabular-nums shadow-inner relative overflow-hidden group-hover:border-zinc-700 transition-colors w-32 mx-auto">
                               <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] pointer-events-none"></div>
                               <div className="flex gap-2 items-center relative z-10 w-full justify-between px-1">
                                 <div className="text-zinc-300 font-bold text-xs flex-1 text-center" title="Total Enviadas">{user.totalSubmitted}</div>
                                 <div className="text-zinc-700 text-[10px] font-black">/</div>
                                 <div className="text-emerald-500 font-bold text-xs flex-1 text-center" title="Aprovadas" style={{textShadow: '0 0 8px rgba(16,185,129,0.3)'}}>{user.approvedCount}</div>
                                 <div className="text-zinc-700 text-[10px] font-black">-</div>
                                 <div className="text-red-500 font-bold text-xs flex-1 text-center" title="Rejeitadas" style={{textShadow: '0 0 8px rgba(239,68,68,0.3)'}}>{user.rejectedCount}</div>
                               </div>
                            </div>
                         </td>
                         <td className="p-4 pr-6">
                           <div className="flex items-center justify-end gap-3">
                             <div className="flex flex-col gap-1.5 items-end justify-center h-full mr-2 min-w-16">
                               {isBanned && <span className="text-[9px] bg-red-950/60 text-red-500 px-2 py-0.5 rounded-sm font-black uppercase tracking-widest border border-red-900/30 shadow-sm flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div> BANNED</span>}
                               {user.shadowBanned && <span className="text-[9px] bg-orange-950/60 text-orange-500 px-2 py-0.5 rounded-sm font-black uppercase tracking-widest border border-orange-900/30 shadow-sm flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div> SHADOW</span>}
                             </div>
                             
                             <div className="flex items-center justify-end gap-1.5">
                               <button 
                                 onClick={() => handlePunish(user.userId, 'temporary')} 
                                 className="h-8 px-3 bg-[#121215] hover:bg-orange-950/40 text-orange-600/80 hover:text-orange-500 rounded-sm text-[9px] font-black font-mono border border-zinc-800 hover:border-orange-500/50 transition-all cursor-pointer uppercase tracking-widest shadow-sm flex items-center justify-center disabled:opacity-50"
                               >
                                 TIMEOUT
                               </button>
                               <button 
                                 onClick={() => handlePunish(user.userId, 'permanent')}
                                 className="h-8 w-14 bg-[#121215] hover:bg-red-950/40 text-red-600/80 hover:text-red-500 rounded-sm text-[9px] font-black font-mono border border-zinc-800 hover:border-red-500/50 transition-all cursor-pointer uppercase tracking-widest shadow-sm flex items-center justify-center disabled:opacity-50"
                               >
                                 BAN
                               </button>
                               <button 
                                 onClick={() => handleLiftRestrictions(user.userId)}
                                 disabled={!isBanned && !user.shadowBanned}
                                 className={clsx(
                                   "h-8 w-14 rounded-sm text-[9px] font-black font-mono border transition-all uppercase tracking-widest shadow-sm flex items-center justify-center",
                                   isBanned || user.shadowBanned
                                     ? "bg-[#121215] hover:bg-emerald-950/40 text-emerald-600/80 border-zinc-800 hover:border-emerald-500/50 hover:text-emerald-500 cursor-pointer"
                                     : "bg-[#121215]/50 text-zinc-700 border-zinc-800/50 cursor-not-allowed opacity-50"
                                 )}
                               >
                                 LIFT
                               </button>
                             </div>
                           </div>
                         </td>
                       </tr>
                     )
                   })}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {activeView === 'history' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6 shrink-0">
               <div className="relative flex-1 group">
                 <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                   <Search className="w-4 h-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors" />
                 </div>
                 <input 
                   type="text"
                   value={historySearchQuery}
                   onChange={e => setHistorySearchQuery(e.target.value)}
                   placeholder="BUSCAR HISTÓRICO GLOBAL DE REQUISICÕES (URL, USUÁRIO, PLATAFORMA)..."
                   className="w-full bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm pl-11 pr-4 py-3.5 text-xs text-zinc-200 placeholder-zinc-700/80 focus:outline-none focus:border-orange-500/80 focus:bg-[#121215] shadow-inner font-mono font-bold tracking-widest transition-all"
                 />
               </div>
               <select 
                  value={historyFilterStatus}
                  onChange={e => setHistoryFilterStatus(e.target.value)}
                  className="bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm px-4 py-3.5 text-xs text-zinc-400 focus:outline-none focus:border-orange-500/80 cursor-pointer font-mono font-bold transition-all h-[50px] min-w-[200px] shadow-inner uppercase tracking-wider text-center"
               >
                  <option value="all">TODOS OS EVENTOS</option>
                  <option value="approved">SÓ APROVADOS</option>
                  <option value="rejected">SÓ REJEITADOS</option>
                  <option value="pending">FILA PENDENTE</option>
               </select>
            </div>
            
            <div className="flex-1 flex flex-col bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm overflow-hidden shadow-2xl relative">
              {/* Decorative top border */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#9146FF] to-orange-500 z-20 opacity-70"></div>
              
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead className="bg-[#0a0a0c] sticky top-0 z-10 before:content-[''] before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[1px] before:bg-zinc-800">
                    <tr>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] whitespace-nowrap">Data / Hora</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Remetente</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em]">Requisição / Mídia</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] text-center w-32">Estado</th>
                      <th className="p-4 font-black font-mono text-zinc-500 text-[10px] uppercase tracking-[0.2em] text-right w-64 pr-6">Contexto Operacional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-gradient-to-b from-[#0c0c0e] to-[#08080a]">
                    {filteredHistory.map(log => (
                      <tr key={log.id} className="group transition-all hover:bg-zinc-900 border-b border-zinc-800/60">
                        <td className="p-4 text-zinc-550 font-mono text-[10px] tabular-nums whitespace-nowrap">
                           {format(new Date(log.timestamp), 'dd/MM HH:mm:ss')}
                        </td>
                        <td className="p-4">
                            {(() => {
                              const matchedUser = session.users?.find(u => u.name === log.submitterName || u.userId === log.submitterId || u.twitchData?.login === log.submitterName);
                              const twitch = matchedUser?.twitchData;
                              const displayName = twitch?.displayName || log.submitterName;
                              const color = twitch?.color || '#FFFFFF';
                              return (
                                <div className="flex items-center gap-3">
                                  {matchedUser ? renderUserAvatarAdmin(matchedUser, "w-8 h-8 border border-zinc- structure text-shadow shadow-lg") : (
                                    <div className="w-8 h-8 rounded-sm bg-zinc-950 flex items-center justify-center text-[8px] font-black border border-zinc-800 text-zinc-600">
                                      NULL
                                    </div>
                                  )}
                                  <div className="min-w-0 flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs text-zinc-200 truncate block mix-blend-screen" style={{ color: color, textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                                        {displayName}
                                      </span>
                                      {matchedUser && renderTwitchBadgesAdmin(matchedUser)}
                                    </div>
                                    {twitch?.login && (
                                      <span className="text-[9px] text-zinc-550 font-mono">@{twitch.login}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                         </td>
                        <td className="p-4 max-w-sm">
                           <div className="flex flex-col gap-1 text-left">
                              <span className="text-zinc-350 truncate font-mono text-[10.5px] font-bold group-hover:text-white transition-colors">{log.url}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900 px-1 py-0.5 rounded border border-zinc-850">{log.platform || 'Youtube'}</span>
                              </div>
                           </div>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                           {log.status === 'approved' && <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-sm uppercase font-bold">Aprovado</span>}
                           {log.status === 'rejected' && <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-sm uppercase font-bold">Rejeitado</span>}
                           {log.status === 'pending' && <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-sm uppercase font-bold animate-pulse">Pendente</span>}
                        </td>
                        <td className="p-4 max-w-xs text-right italic font-mono text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors pr-6">
                           {log.rejectionReason || log.actionDetails || 'No additional context.'}
                        </td>
                      </tr>
                    ))}
                    {filteredHistory.length === 0 && (
                      <tr>
                         <td colSpan={5} className="p-20 text-center text-zinc-600 text-[10px] uppercase font-mono tracking-[0.3em]">Buffer vazio. Nenhum registro disponível.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
