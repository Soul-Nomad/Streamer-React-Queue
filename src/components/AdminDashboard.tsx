import { useState, useMemo, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  ShieldCheck, ShieldAlert, Users, Clock, ArrowLeftRight, CheckCircle, 
  XOctagon, AlertTriangle, MessageSquare, Search, Filter, ShieldOff, Check, X,
  ShieldHalf, Settings, Save
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

export default function AdminDashboard({ session }: { session: SessionState }) {
  const [activeView, setActiveView] = useState<'overview' | 'users' | 'history'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  const allUsers = session.allUserProfiles || [];
  const bans = session.allBans || [];
  const history = session.allHistoryLogs || [];
  const alerts = session.suspiciousAlerts || [];

  const handleUnban = (userId: string) => {
    socket.emit('unban_user', userId);
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
    <div className="w-full h-full flex flex-col bg-[#121212] overflow-hidden text-[#B0B0B0] animate-in fade-in pt-4 pb-8 px-6 md:px-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-[#FF6B35]" />
            PRO SYSTEM TERMINAL
          </h1>
          <p className="text-[#B0B0B0] text-sm mt-1 font-mono">
            Moderação unificada de espectadores, monitor de anomalias e histórico de transmissões.
          </p>
        </div>
        
        <div className="flex bg-[#1A1A1A] p-1 rounded border border-[#222222]">
          <button 
            onClick={() => setActiveView('overview')}
            className={clsx("px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'overview' ? 'bg-[#FF6B35] text-white' : 'text-[#B0B0B0] hover:text-white')}
          >
            Visão Geral
          </button>
          <button 
            onClick={() => setActiveView('users')}
            className={clsx("px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'users' ? 'bg-[#FF6B35] text-white' : 'text-[#B0B0B0] hover:text-white')}
          >
            Usuários & Perfis
          </button>
          <button 
            onClick={() => setActiveView('history')}
            className={clsx("px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer font-mono", activeView === 'history' ? 'bg-[#FF6B35] text-white' : 'text-[#B0B0B0] hover:text-white')}
          >
            Histórico Global
          </button>
        </div>
      </div>

      {activeView === 'overview' && (
        <div className="flex-1 overflow-y-auto space-y-6 pb-6">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#1A1A1A] border border-[#222222] rounded p-5 relative overflow-hidden text-left">
                <Users className="w-5 h-5 text-[#FF8C42] mb-3" />
                <h3 className="text-3xl font-black text-white">{allUsers.length}</h3>
                <p className="text-xs text-[#B0B0B0] uppercase tracking-wider font-mono mt-1">Perfis Registrados</p>
              </div>
              
              <div className="bg-[#1A1A1A] border border-[#222222] rounded p-5 relative overflow-hidden text-left">
                <ShieldAlert className="w-5 h-5 text-[#F44336] mb-3" />
                <h3 className="text-3xl font-black text-white">{bans.filter(b => b.active).length}</h3>
                <p className="text-xs text-[#B0B0B0] uppercase tracking-wider font-mono mt-1">Banimentos Ativos</p>
              </div>

              <div className="bg-[#1A1A1A] border border-[#222222] rounded p-5 relative overflow-hidden text-left">
                <CheckCircle className="w-5 h-5 text-[#4CAF50] mb-3" />
                <h3 className="text-3xl font-black text-white">{history.filter(h => h.status === 'approved').length}</h3>
                <p className="text-xs text-[#B0B0B0] uppercase tracking-wider font-mono mt-1">Vídeos Aprovados</p>
              </div>
              
              <div className="bg-[#1A1A1A] border border-[#222222] rounded p-5 relative overflow-hidden text-left">
                <XOctagon className="w-5 h-5 text-[#F44336] mb-3" />
                <h3 className="text-3xl font-black text-white">{history.filter(h => h.status === 'rejected').length}</h3>
                <p className="text-xs text-[#B0B0B0] uppercase tracking-wider font-mono mt-1">Vídeos Rejeitados</p>
              </div>
           </div>
           
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 bg-[#1A1A1A] border border-[#222222] rounded p-6 text-left flex flex-col h-[450px]">
               <h3 className="text-white font-black text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-[#FF8C42]" />
                 Alertas de Inteligência Sensível & Fraude
               </h3>
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                 {alerts.length === 0 ? (
                   <div className="h-full flex items-center justify-center border border-dashed border-[#222222] p-4">
                     <p className="text-[#505050] text-sm italic font-mono">Nenhum evento anômalo detectado.</p>
                   </div>
                 ) : (
                   alerts.map(a => (
                     <div key={a.id} className={clsx("p-4 rounded border flex items-start gap-4", a.severity === 'high' ? 'bg-[#F44336]/5 border-[#F44336]/20' : a.severity === 'medium' ? 'bg-[#FF8C42]/5 border-[#FF8C42]/20' : 'bg-[#222222]/40 border-[#222222]')}>
                       <ShieldAlert className={clsx("w-5 h-5 mt-0.5", a.severity === 'high' ? 'text-[#F44336]' : a.severity === 'medium' ? 'text-[#FF8C42]' : 'text-[#B0B0B0]')} />
                       <div className="flex-1">
                         <div className="flex justify-between items-start">
                           <span className="font-bold text-sm text-white font-mono">@{a.username}</span>
                           <span className="text-[10px] font-mono text-[#505050]">{new Date(a.timestamp).toLocaleTimeString()}</span>
                         </div>
                         <p className="text-xs text-[#B0B0B0] mt-1">{a.message}</p>
                         <p className="text-[9px] text-[#505050] mt-1.5 font-mono uppercase">Tipo: {a.type}</p>
                       </div>
                     </div>
                   ))
                 )}
               </div>
             </div>
             
             <div className="bg-[#1A1A1A] border border-[#222222] rounded p-6 text-left flex flex-col h-[450px]">
               <h3 className="text-white font-black text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                 <ShieldOff className="w-5 h-5 text-[#F44336]" />
                 Histórico de Banimentos Ativos
               </h3>
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                 {bans.filter(b => b.active).length === 0 ? (
                   <div className="h-full flex items-center justify-center border border-dashed border-[#222222] p-4">
                     <p className="text-[#505050] text-sm italic font-mono">Nenhum banimento ativo na sala.</p>
                   </div>
                 ) : (
                   bans.filter(b => b.active).map(b => (
                     <div key={b.id} className="p-3 bg-[#121212] rounded border border-[#222222]">
                       <div className="flex justify-between items-center mb-1">
                         <span className="text-xs font-bold text-white font-mono">@{b.username}</span>
                         <button onClick={() => handleUnban(b.userId)} className="text-[10px] bg-[#222222] hover:bg-[#333333] border border-[#404040] px-2 py-1 rounded cursor-pointer transition-colors text-[#4CAF50] font-bold font-mono">Desbanir</button>
                       </div>
                       <span className="text-[9px] bg-[#F44336]/20 text-[#F44336] px-1.5 py-0.5 rounded uppercase font-mono font-bold tracking-widest leading-none border border-[#F44336]/10">{b.banType}</span>
                       <p className="text-[11px] text-[#B0B0B0] mt-1.5 line-clamp-2 font-mono">{b.reason}</p>
                     </div>
                   ))
                 )}
               </div>
             </div>
           </div>
         </div>
       )}

       {activeView === 'users' && (
         <div className="flex-1 flex flex-col min-h-0 text-left">
           <div className="relative mb-6">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[#505050]" />
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por nome de usuário ou ID do perfil..."
                className="w-full bg-[#1A1A1A] border border-[#222222] rounded pl-12 pr-4 py-3 text-sm text-white placeholder-[#505050] focus:outline-none focus:border-[#FF6B35]"
              />
           </div>
           
           <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#1A1A1A] border border-[#222222] rounded">
             <table className="w-full text-left border-collapse min-w-max font-mono">
               <thead className="bg-[#222222] sticky top-0 z-10 border-b border-[#222222]">
                 <tr>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Usuário</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Reputação</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Strikes</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Envios (Apr/Rej)</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest text-right">Ações de Moderação</th>
                 </tr>
               </thead>
               <tbody>
                 {filteredUsers.map(user => {
                   const isBanned = bans.some(b => b.userId === user.userId && b.active);
                   return (
                     <tr key={user.userId} className="border-b border-[#222222] hover:bg-[#222222]/40 transition-colors">
                       <td className="p-4">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-[#222222] flex justify-center items-center font-bold text-xs text-white border border-[#404040]">
                              {user.username.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-sm text-white block">@{user.username}</span>
                              <span className="text-[9px] text-[#505050] block">{user.userId}</span>
                            </div>
                         </div>
                       </td>
                       <td className="p-4">
                         <div className="flex items-center gap-2">
                            <div className="w-full max-w-[100px] h-2 bg-[#222222] rounded-sm overflow-hidden border border-[#404040]">
                              <div className={clsx("h-full", user.reputation >= 80 ? 'bg-[#4CAF50]' : user.reputation >= 40 ? 'bg-[#FF8C42]' : 'bg-[#F44336]')} style={{ width: `${user.reputation}%` }}></div>
                            </div>
                            <span className="text-xs font-bold text-[#B0B0B0]">{user.reputation}%</span>
                         </div>
                       </td>
                       <td className="p-4 font-bold text-sm">
                         <span className={clsx(user.strikes > 0 ? 'text-[#FF8C42]' : 'text-[#B0B0B0]')}>{user.strikes}/5</span>
                       </td>
                       <td className="p-4 text-xs text-[#B0B0B0]">
                         {user.totalSubmitted} <span className="text-[#505050]">({user.approvedCount} / {user.rejectedCount})</span>
                       </td>
                       <td className="p-4">
                         <div className="flex items-center justify-end gap-2">
                           <div className="flex items-center gap-1.5 mr-2">
                             {isBanned && <span className="text-[9px] bg-[#F44336]/20 text-[#F44336] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none border border-[#F44336]/10">BANIDO</span>}
                             {user.shadowBanned && <span className="text-[9px] bg-[#FF8C42]/20 text-[#FF8C42] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none border border-[#FF8C42]/10">SHADOW</span>}
                             {user.restrictedUntil && user.restrictedUntil > Date.now() && <span className="text-[9px] bg-[#FF8C42]/20 text-[#FF8C42] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none border border-[#FF8C42]/15">RESTRICT</span>}
                           </div>
                           
                           <div className="flex bg-[#222222] rounded p-0.5 border border-[#404040]">
                             <button onClick={() => handlePunish(user.userId, 'temporary')} className="px-2 py-1 hover:bg-[#333333] rounded text-[10px] text-white cursor-pointer transition-colors font-bold font-mono" title="Timeout">TIMEOUT</button>
                             <button onClick={() => handlePunish(user.userId, 'permanent')} className="px-2 py-1 hover:bg-[#F44336]/20 rounded text-[10px] text-[#F44336] cursor-pointer transition-colors font-bold font-mono" title="Ban Permanente">BANIR</button>
                             <button onClick={() => handlePunish(user.userId, 'shadow')} className="px-2 py-1 hover:bg-[#FF8C42]/20 rounded text-[10px] text-[#FF8C42] cursor-pointer transition-colors font-bold font-mono" title="Shadow Ban">SHADOW</button>
                             <button onClick={() => handleLiftRestrictions(user.userId)} className="px-2 py-1 hover:bg-[#4CAF50]/15 rounded text-[10px] text-[#4CAF50] cursor-pointer transition-colors border-l border-[#404040] ml-1 pl-3 font-bold font-mono" title="Remover Restrições">PERDOAR</button>
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
         <div className="flex-1 flex flex-col min-h-0 text-left">
           <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[#505050]" />
                <input 
                  type="text"
                  value={historySearchQuery}
                  onChange={e => setHistorySearchQuery(e.target.value)}
                  placeholder="Pesquisar por usuário, palavra-chave, plataforma, ou link..."
                  className="w-full bg-[#1A1A1A] border border-[#222222] rounded pl-12 pr-4 py-3 text-sm text-white placeholder-[#505050] focus:outline-none focus:border-[#FF6B35] font-mono"
                />
              </div>
              <select 
                 value={historyFilterStatus}
                 onChange={e => setHistoryFilterStatus(e.target.value)}
                 className="bg-[#1A1A1A] border border-[#222222] rounded px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF6B35] cursor-pointer font-mono"
              >
                 <option value="all">Status: Todos</option>
                 <option value="approved">Status: Aprovados</option>
                 <option value="rejected">Status: Rejeitados</option>
                 <option value="pending">Status: Pendentes</option>
              </select>
           </div>
           
           <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#1A1A1A] border border-[#222222] rounded relative">
             <table className="w-full text-left border-collapse min-w-max font-mono">
               <thead className="bg-[#222222] sticky top-0 z-10 border-b border-[#222222]">
                 <tr>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Data</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Usuário</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">URL Enviada</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Status</th>
                   <th className="p-4 text-[10px] font-black text-[#B0B0B0] uppercase tracking-widest">Detalhes / Motivo</th>
                 </tr>
               </thead>
               <tbody>
                 {filteredHistory.map(log => (
                   <tr key={log.id} className="border-b border-[#222222] hover:bg-[#222222]/40 transition-colors">
                     <td className="p-4 text-xs text-[#B0B0B0]">
                        {format(new Date(log.timestamp), 'dd/MM HH:mm')}
                     </td>
                     <td className="p-4 font-bold text-sm text-white">
                        @{log.submitterName}
                     </td>
                     <td className="p-4 max-w-sm">
                        <p className="text-xs text-white truncate font-medium">{log.url}</p>
                        <span className="text-[9px] text-[#505050] font-mono">{log.platform}</span>
                     </td>
                     <td className="p-4">
                        {log.status === 'approved' && <span className="text-[10px] text-[#4CAF50] bg-[#4CAF50]/10 border border-[#4CAF50]/15 px-2.5 py-1 rounded font-mono font-black uppercase tracking-wider animate-pulse">Aprovado</span>}
                        {log.status === 'rejected' && <span className="text-[10px] text-[#F44336] bg-[#F44336]/10 border border-[#F44336]/15 px-2.5 py-1 rounded font-mono font-black uppercase tracking-wider">Rejeitado</span>}
                        {log.status === 'pending' && <span className="text-[10px] text-[#FF8C42] bg-[#FF8C42]/10 border border-[#FF8C42]/15 px-2.5 py-1 rounded font-mono font-black uppercase tracking-wider animate-pulse">Pendente</span>}
                     </td>
                     <td className="p-4 max-w-xs text-xs text-[#B0B0B0]">
                        {log.rejectionReason || log.actionDetails || '-'}
                     </td>
                   </tr>
                 ))}
                 {filteredHistory.length === 0 && (
                   <tr>
                      <td colSpan={5} className="p-6 text-center text-[#505050] text-sm italic">Nenhum evento registrado.</td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
         </div>
       )}

    </div>
  );
}
