import { useState, useMemo, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  ShieldCheck, ShieldAlert, Users, Clock, ArrowLeftRight, CheckCircle, 
  XOctagon, AlertTriangle, MessageSquare, Search, Filter, ShieldOff, Check, X,
  ShieldHalf, Settings, Save, ExternalLink
} from 'lucide-react';
import clsx from 'clsx';
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
  const badges = user?.twitchData?.badges || [];
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 shrink-0 mt-0.5">
      {badges.map((b: string) => {
        if (b === 'broadcaster') {
          return (
            <span key={b} className="bg-[#FF3B30] text-zinc-100 text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#FF3B30]/30 animate-pulse" title="Broadcaster (Streamer)">
              👑 STR
            </span>
          );
        }
        if (b === 'moderator') {
          return (
            <span key={b} className="bg-[#4CAF50] text-zinc-100 text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#4CAF50]/30" title="Moderador">
              🛡️ MOD
            </span>
          );
        }
        if (b === 'vip') {
          return (
            <span key={b} className="bg-[#E25CFF] text-zinc-100 text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#E25CFF]/30" title="VIP">
              💎 VIP
            </span>
          );
        }
        if (b === 'subscriber') {
          return (
            <span key={b} className="bg-[#FFD700] text-black text-[8px] font-black uppercase tracking-tight px-1 rounded-sm border border-[#FFB300]/30" title="Inscrito">
              ⭐ SUB
            </span>
          );
        }
        return null;
      })}
    </div>
  );
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
      reputation: u.reputation ?? 100,
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
    <div className="w-full h-full flex flex-col bg-zinc-950 overflow-hidden text-zinc-400 animate-in fade-in" id="admin_dashboard">
      
      {/* Header with Terminal look */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 p-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-5 h-5 text-orange-500" />
            <h1 className="text-sm font-black text-orange-400 uppercase tracking-widest font-mono">
              Pro System Terminal v2.4
            </h1>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-tight font-mono">
            Moderação unificada, monitor de anomalias e histórico global de transmissões.
          </p>
        </div>
        
        <div className="flex bg-zinc-900/50 p-1 rounded-sm border border-zinc-800">
          <button 
            onClick={() => setActiveView('overview')}
            className={clsx("px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'overview' ? 'bg-orange-600/10 text-orange-400 border border-orange-500/20' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
          >
            OVERVIEW
          </button>
          <button 
            onClick={() => setActiveView('users')}
            className={clsx("px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'users' ? 'bg-orange-600/10 text-orange-400 border border-orange-500/20' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
          >
            USER PROFILES
          </button>
          <button 
            onClick={() => setActiveView('history')}
            className={clsx("px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'history' ? 'bg-orange-600/10 text-orange-400 border border-orange-500/20' : 'text-zinc-500 hover:text-zinc-300 border border-transparent')}
          >
            GLOBAL LOGS
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeView === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-sm p-5 flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Profiles</span>
                  </div>
                  <h3 className="text-3xl font-black text-zinc-100 font-mono tracking-tighter">{allUsers.length}</h3>
                  <div className="mt-2 w-full h-[2px] bg-zinc-800"><div className="h-full bg-emerald-500 w-full opacity-60"></div></div>
                </div>
                
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-sm p-5 flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Active Bans</span>
                  </div>
                  <h3 className="text-3xl font-black text-zinc-100 font-mono tracking-tighter">{bans.filter(b => b.active).length}</h3>
                  <div className="mt-2 w-full h-[2px] bg-zinc-800"><div className="h-full bg-red-600 w-1/4 opacity-60"></div></div>
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-sm p-5 flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Approved</span>
                  </div>
                  <h3 className="text-3xl font-black text-zinc-100 font-mono tracking-tighter">{history.filter(h => h.status === 'approved').length}</h3>
                  <div className="mt-2 w-full h-[2px] bg-zinc-800"><div className="h-full bg-blue-500 w-full opacity-60"></div></div>
                </div>
                
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-sm p-5 flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2 mb-2">
                    <XOctagon className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Rejected</span>
                  </div>
                  <h3 className="text-3xl font-black text-zinc-100 font-mono tracking-tighter">{history.filter(h => h.status === 'rejected').length}</h3>
                  <div className="mt-2 w-full h-[2px] bg-zinc-800"><div className="h-full bg-orange-600 w-1/3 opacity-60"></div></div>
                </div>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 flex flex-col h-[480px]">
                 <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
                   <h3 className="text-zinc-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 font-mono">
                     <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                     SENSITIVE SECURITY ALERTS [IDS]
                   </h3>
                   <span className="text-[9px] font-mono font-bold text-zinc-600 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">REAL-TIME MONITOR</span>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-1 p-2">
                   {alerts.length === 0 ? (
                     <div className="h-full flex items-center justify-center border border-dashed border-zinc-900/40 m-4">
                       <p className="text-zinc-700 text-[10px] uppercase font-mono tracking-widest">System secure. No anomalies detected.</p>
                     </div>
                   ) : (
                     alerts.map(a => {
                        const matchedUser = session.users?.find(u => u.name === a.username || u.userId === a.userId || u.twitchData?.login === a.username);
                        const twitch = matchedUser?.twitchData;
                        const displayName = twitch?.displayName || a.username;
                        const color = twitch?.color || '#FFFFFF';
                        return (
                          <div key={a.id} className={clsx("p-3 border-l-2 flex items-start gap-4 transition-all hover:bg-zinc-900/40", a.severity === 'high' ? 'bg-red-500/5 border-red-500/30' : a.severity === 'medium' ? 'bg-orange-500/5 border-orange-500/30' : 'bg-transparent border-zinc-800')}>
                            {matchedUser ? renderUserAvatarAdmin(matchedUser, "w-8 h-8 mt-1") : (
                              <ShieldAlert className={clsx("w-8 h-8 mt-1 p-1 bg-zinc-900 border border-zinc-800 rounded-sm", a.severity === 'high' ? 'text-red-500' : a.severity === 'medium' ? 'text-orange-500' : 'text-zinc-600')} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="font-bold text-xs font-mono" style={{ color: color }}>{displayName}</span>
                                <span className="text-[9px] font-mono text-zinc-600">{new Date(a.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors leading-relaxed">{a.message}</p>
                              <div className="flex items-center gap-2 mt-1.5 opacity-60">
                                <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1.5 rounded-sm font-mono tracking-tighter uppercase font-bold">TYPE: {a.type}</span>
                                <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1.5 rounded-sm font-mono tracking-tighter uppercase font-bold">SIG: {a.severity}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                   )}
                 </div>
               </div>
               
               <div className="bg-zinc-900/40 border border-zinc-800 flex flex-col h-[480px]">
                 <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
                   <h3 className="text-zinc-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 font-mono">
                     <ShieldOff className="w-3.5 h-3.5 text-red-500" />
                     BANNED REPOSITORIES
                   </h3>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-2 p-3">
                   {bans.filter(b => b.active).length === 0 ? (
                     <div className="h-full flex items-center justify-center border border-dashed border-zinc-900/40 bg-zinc-950/20">
                       <p className="text-zinc-700 text-[10px] uppercase font-mono tracking-widest">Clean record.</p>
                     </div>
                   ) : (
                     bans.filter(b => b.active).map(b => {
                        const matchedUser = session.users?.find(u => u.name === b.username || u.userId === b.userId || u.twitchData?.login === b.username);
                        const twitch = matchedUser?.twitchData;
                        const displayName = twitch?.displayName || b.username;
                        const color = twitch?.color || '#FFFFFF';
                        return (
                          <div key={b.id} className="p-3 bg-zinc-950/40 border border-zinc-800 flex gap-3 group transition-all hover:border-red-900/30">
                            {matchedUser && renderUserAvatarAdmin(matchedUser, "w-7 h-7 shrink-0")}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="text-[11px] font-bold font-mono truncate" style={{ color: color }}>{displayName}</span>
                                <button onClick={() => handleLiftRestrictions(b.userId)} className="text-[8px] bg-zinc-900 hover:bg-emerald-950/40 border border-zinc-800 px-1.5 py-0.5 rounded-sm transition-all text-emerald-500 font-black font-mono cursor-pointer">LIFT</button>
                              </div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[8px] text-red-500 bg-red-950/20 px-1 rounded-sm uppercase font-mono font-black border border-red-900/20">{b.banType}</span>
                              </div>
                              <p className="text-[10px] text-zinc-500 line-clamp-2 font-mono group-hover:text-zinc-400 leading-tight">{b.reason}</p>
                            </div>
                          </div>
                        );
                      })
                   )}
                 </div>
               </div>
             </div>
          </div>
        )}

        {activeView === 'users' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="relative mb-6">
               <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
               <input 
                 type="text"
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 placeholder="SCAN USER PROFILES OR HARDWARE IDs..."
                 className="w-full bg-zinc-900 border border-zinc-800 rounded-sm pl-11 pr-4 py-3 text-[11px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-orange-500 font-mono font-bold tracking-widest"
               />
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-zinc-900/30 border border-zinc-800 rounded-sm">
              <table className="w-full text-left border-collapse min-w-max font-mono text-[11px]">
                <thead className="bg-zinc-900/80 sticky top-0 z-10 border-b border-zinc-800">
                  <tr>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Entity</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Reputation</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Strikes</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-center">Traffic (A/R)</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-right">System Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {filteredUsers.map(user => {
                     const isBanned = bans.some(b => b.userId === user.userId && b.active);
                     const twitch = user.twitchData;
                     const displayName = twitch?.displayName || user.username || user.name;
                     const login = twitch?.login || (user.username !== displayName ? user.username : null);
                     const color = twitch?.color || '#FFFFFF';
                     return (
                       <tr key={user.userId} className="hover:bg-zinc-800/20 transition-colors group">
                         <td className="p-4">
                           <div className="flex items-center gap-3">
                              {renderUserAvatarAdmin(user, "w-9 h-9")}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-zinc-200 block truncate" style={{ color: color }}>{displayName}</span>
                                  {renderTwitchBadgesAdmin(user)}
                                </div>
                                
                                <div className="flex flex-col gap-0.5 mt-0.5 opacity-60">
                                  {login && (
                                    <span className="text-[10px] text-zinc-500 block font-mono">@{login}</span>
                                  )}
                                  <span className="text-[8px] text-zinc-600 block font-mono">UID: {user.userId}</span>
                                </div>
                              </div>
                           </div>
                         </td>
                         <td className="p-4">
                           <div className="flex items-center gap-3">
                              <div className="w-32 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                <div className={clsx("h-full transition-all duration-1000 ease-out", user.reputation >= 80 ? 'bg-emerald-500' : user.reputation >= 40 ? 'bg-orange-500' : 'bg-red-600')} style={{ width: user.reputation + "%" }}></div>
                              </div>
                              <span className="text-[10px] font-black text-zinc-400">{user.reputation}%</span>
                           </div>
                         </td>
                         <td className="p-4 font-black">
                           <span className={clsx(user.strikes === 0 ? 'text-zinc-600' : 'text-orange-500')}>{user.strikes}/5</span>
                         </td>
                         <td className="p-4 text-center">
                           <span className="text-zinc-200 font-bold">{user.totalSubmitted}</span>
                           <span className="text-zinc-700 font-bold mx-1">/</span>
                           <span className="text-emerald-500 font-bold">{user.approvedCount}</span>
                           <span className="text-zinc-700 font-bold mx-1">-</span>
                           <span className="text-red-600 font-bold">{user.rejectedCount}</span>
                         </td>
                         <td className="p-4">
                           <div className="flex items-center justify-end gap-2">
                             <div className="flex items-center gap-1.5 mr-3">
                               {isBanned && <span className="text-[8px] bg-red-950/40 text-red-500 px-1.5 py-0.5 rounded-sm font-black uppercase tracking-widest border border-red-900/20">BANNED</span>}
                               {user.shadowBanned && <span className="text-[8px] bg-orange-950/40 text-orange-500 px-1.5 py-0.5 rounded-sm font-black uppercase tracking-widest border border-orange-900/20">SHADOW</span>}
                             </div>
                             
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={() => handlePunish(user.userId, 'temporary')} 
                                 className="w-16 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-sm text-[8px] font-black border border-zinc-800 transition-all cursor-pointer uppercase"
                               >
                                 Timeout
                               </button>
                               <button 
                                 onClick={() => handlePunish(user.userId, 'permanent')}
                                 className="w-16 py-1 bg-zinc-900 hover:bg-red-950/40 text-red-500 rounded-sm text-[8px] font-black border border-zinc-800 hover:border-red-900/30 transition-all cursor-pointer uppercase"
                               >
                                 Ban
                               </button>
                               <button 
                                 onClick={() => handleLiftRestrictions(user.userId)}
                                 className="w-16 py-1 bg-zinc-900 hover:bg-emerald-950/40 text-emerald-500 rounded-sm text-[8px] font-black border border-zinc-800 hover:border-emerald-900/30 transition-all cursor-pointer uppercase ml-2"
                               >
                                 Forgive
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
        )}

        {activeView === 'history' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6">
               <div className="relative flex-1">
                 <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
                 <input 
                   type="text"
                   value={historySearchQuery}
                   onChange={e => setHistorySearchQuery(e.target.value)}
                   placeholder="SEARCH GLOBAL HISTORY LOGS (URL, USER, PLATFORM)..."
                   className="w-full bg-zinc-900 border border-zinc-800 rounded-sm pl-11 pr-4 py-3 text-[11px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-orange-500 font-mono font-bold tracking-widest"
                 />
               </div>
               <select 
                  value={historyFilterStatus}
                  onChange={e => setHistoryFilterStatus(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-sm px-4 py-3 text-[11px] text-zinc-400 focus:outline-none focus:border-orange-500 cursor-pointer font-mono font-bold appearance-none transition-all h-10 min-w-[160px]"
               >
                  <option value="all">STATUS: ALL EVENTS</option>
                  <option value="approved">STATUS: APPROVED ONLY</option>
                  <option value="rejected">STATUS: REJECTED ONLY</option>
                  <option value="pending">STATUS: PENDING QUEUE</option>
               </select>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-zinc-900/30 border border-zinc-800 rounded-sm">
              <table className="w-full text-left border-collapse min-w-max font-mono text-[11px]">
                <thead className="bg-zinc-900/80 sticky top-0 z-10 border-b border-zinc-800">
                  <tr>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Timestamp</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Submitter</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">Media Source</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest">State</th>
                    <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-right">Moderation Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {filteredHistory.map(log => (
                    <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="p-4 text-zinc-500 font-mono tabular-nums">
                         {format(new Date(log.timestamp), 'dd/MM HH:mm:ss')}
                      </td>
                      <td className="p-4">
                          {(() => {
                            const matchedUser = session.users?.find(u => u.name === log.submitterName || u.userId === log.submitterId || u.twitchData?.login === log.submitterName);
                            const twitch = matchedUser?.twitchData;
                            const displayName = twitch?.displayName || log.submitterName;
                            const color = twitch?.color || '#FFFFFF';
                            return (
                              <div className="flex items-center gap-2">
                                {matchedUser ? renderUserAvatarAdmin(matchedUser, "w-7 h-7") : (
                                  <div className="w-7 h-7 rounded-sm bg-zinc-950 flex items-center justify-center text-[8px] font-black border border-zinc-800 text-zinc-700">
                                    NULL
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="font-bold text-zinc-200 truncate block" style={{ color: color }}>
                                    {displayName}
                                  </span>
                                  {twitch?.login && (
                                    <span className="text-[9px] text-zinc-600 block">@{twitch.login}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                       </td>
                      <td className="p-4 max-w-sm">
                         <div className="flex flex-col gap-0.5">
                            <span className="text-zinc-300 truncate font-bold text-[10px]">{log.url}</span>
                            <span className="text-[9px] text-[#FF6B35] font-black uppercase tracking-widest">{log.platform}</span>
                         </div>
                      </td>
                      <td className="p-4">
                         {log.status === 'approved' && <span className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">Approved</span>}
                         {log.status === 'rejected' && <span className="text-[9px] text-red-600 font-black uppercase tracking-tighter">Rejected</span>}
                         {log.status === 'pending' && <span className="text-[9px] text-orange-500 font-black uppercase tracking-tighter animate-pulse">Pending</span>}
                      </td>
                      <td className="p-4 max-w-xs text-right italic font-mono text-[10px] text-zinc-600 group">
                         {log.rejectionReason || log.actionDetails || 'No additional context.'}
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                       <td colSpan={5} className="p-20 text-center text-zinc-700 text-[10px] uppercase font-mono tracking-[0.3em]">Buffer empty. No records available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
