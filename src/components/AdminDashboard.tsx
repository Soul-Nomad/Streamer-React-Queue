import { useState, useMemo } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { 
  ShieldCheck, ShieldAlert, Users, Clock, ArrowLeftRight, CheckCircle, 
  XOctagon, AlertTriangle, MessageSquare, Search, Filter, ShieldOff, Check, X,
  ShieldHalf
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

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
    <div className="w-full h-full flex flex-col bg-[#06070a] overflow-hidden text-[#e2e8f0] animate-in fade-in pt-4 pb-8 px-6 md:px-12">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#f8fafc] flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-[#977af3]" />
            Dashboard Administrativo
          </h1>
          <p className="text-[#828ba0] text-sm mt-1">
            Gestão inteligente de usuários, moderação automática e métricas avançadas da plataforma.
          </p>
        </div>
        
        <div className="flex bg-[#11141c] p-1.5 rounded-xl border border-[#222735]">
          <button 
            onClick={() => setActiveView('overview')}
            className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-all transition-colors cursor-pointer", activeView === 'overview' ? 'bg-[#222735] text-[#f8fafc]' : 'text-[#828ba0] hover:text-[#cbd5e1]')}
          >
            Visão Geral
          </button>
          <button 
            onClick={() => setActiveView('users')}
            className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer", activeView === 'users' ? 'bg-[#222735] text-[#f8fafc]' : 'text-[#828ba0] hover:text-[#cbd5e1]')}
          >
            Usuários & Perfis
          </button>
          <button 
            onClick={() => setActiveView('history')}
            className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer", activeView === 'history' ? 'bg-[#222735] text-[#f8fafc]' : 'text-[#828ba0] hover:text-[#cbd5e1]')}
          >
            Histórico Global
          </button>
        </div>
      </div>

      {activeView === 'overview' && (
        <div className="flex-1 overflow-y-auto space-y-6 pb-6">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-[#11141c] border border-[#222735] rounded-2xl p-5 relative overflow-hidden text-left">
               <Users className="w-5 h-5 text-[#8b9cb3] mb-3" />
               <h3 className="text-3xl font-black text-[#f8fafc]">{allUsers.length}</h3>
               <p className="text-xs text-[#828ba0] uppercase tracking-wider font-mono mt-1">Perfis Registrados</p>
             </div>
             
             <div className="bg-[#11141c] border border-[#222735] rounded-2xl p-5 relative overflow-hidden text-left">
               <ShieldAlert className="w-5 h-5 text-[#e0a670] mb-3" />
               <h3 className="text-3xl font-black text-[#f8fafc]">{bans.filter(b => b.active).length}</h3>
               <p className="text-xs text-[#828ba0] uppercase tracking-wider font-mono mt-1">Banimentos Ativos</p>
             </div>

             <div className="bg-[#11141c] border border-[#222735] rounded-2xl p-5 relative overflow-hidden text-left">
               <CheckCircle className="w-5 h-5 text-[#a3c9b8] mb-3" />
               <h3 className="text-3xl font-black text-[#f8fafc]">{history.filter(h => h.status === 'approved').length}</h3>
               <p className="text-xs text-[#828ba0] uppercase tracking-wider font-mono mt-1">Vídeos Aprovados</p>
             </div>
             
             <div className="bg-[#11141c] border border-[#222735] rounded-2xl p-5 relative overflow-hidden text-left">
               <XOctagon className="w-5 h-5 text-[#b28282] mb-3" />
               <h3 className="text-3xl font-black text-[#f8fafc]">{history.filter(h => h.status === 'rejected').length}</h3>
               <p className="text-xs text-[#828ba0] uppercase tracking-wider font-mono mt-1">Vídeos Rejeitados</p>
             </div>
           </div>
           
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 bg-[#11141c] border border-[#222735] rounded-2xl p-6 text-left flex flex-col h-[500px]">
               <h3 className="text-[#cbd5e1] font-bold text-lg mb-4 flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-[#e0a670]" />
                 Alertas de Inteligência Sensível
               </h3>
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                 {alerts.length === 0 ? (
                   <p className="text-[#828ba0] text-sm italic">Nenhum evento anômalo detectado.</p>
                 ) : (
                   alerts.map(a => (
                     <div key={a.id} className={clsx("p-4 rounded-xl border flex items-start gap-4", a.severity === 'high' ? 'bg-[#b28282]/5 border-[#b28282]/20' : a.severity === 'medium' ? 'bg-[#e0a670]/5 border-[#e0a670]/20' : 'bg-[#222735]/40 border-[#222735]')}>
                       <ShieldAlert className={clsx("w-5 h-5 mt-0.5", a.severity === 'high' ? 'text-[#b28282]' : a.severity === 'medium' ? 'text-[#e0a670]' : 'text-[#828ba0]')} />
                       <div className="flex-1">
                         <div className="flex justify-between items-start">
                           <span className="font-bold text-sm text-[#cbd5e1]">@{a.username}</span>
                           <span className="text-[10px] font-mono text-[#47526d]">{new Date(a.timestamp).toLocaleTimeString()}</span>
                         </div>
                         <p className="text-xs text-[#828ba0] mt-1">{a.message}</p>
                         <p className="text-[9px] text-[#47526d] mt-1.5 font-mono uppercase">Tipo: {a.type} | IP: {a.ip}</p>
                       </div>
                     </div>
                   ))
                 )}
               </div>
             </div>
             
             <div className="bg-[#11141c] border border-[#222735] rounded-2xl p-6 text-left flex flex-col h-[500px]">
               <h3 className="text-[#cbd5e1] font-bold text-lg mb-4 flex items-center gap-2">
                 <ShieldOff className="w-5 h-5 text-[#b28282]" />
                 Histórico de Banimentos Ativos
               </h3>
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                 {bans.filter(b => b.active).length === 0 ? (
                   <p className="text-[#828ba0] text-sm italic">Nenhum banimento ativo.</p>
                 ) : (
                   bans.filter(b => b.active).map(b => (
                     <div key={b.id} className="p-3 bg-[#0c0e12] rounded-xl border border-[#222735]">
                       <div className="flex justify-between items-center mb-1">
                         <span className="text-sm font-semibold text-[#f8fafc]">@{b.username}</span>
                         <button onClick={() => handleUnban(b.userId)} className="text-[10px] bg-[#222735] hover:bg-[#2c3245] px-2 py-1 rounded cursor-pointer transition-colors text-[#a3c9b8] font-bold">Desbanir</button>
                       </div>
                       <span className="text-[9px] bg-[#b28282]/20 text-[#b28282] px-1.5 py-0.5 rounded uppercase font-mono font-bold tracking-widest">{b.banType}</span>
                       <p className="text-[11px] text-[#828ba0] mt-1.5 line-clamp-2">{b.reason}</p>
                     </div>
                   ))
                 )}
               </div>
             </div>
           </div>
        </div>
      )}

      {activeView === 'users' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative mb-6">
             <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[#47526d]" />
             <input 
               type="text"
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               placeholder="Pesquisar por nome de usuário ou ID do perfil..."
               className="w-full bg-[#11141c] border border-[#222735] rounded-xl pl-12 pr-4 py-3 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#7c73e6]"
             />
          </div>
          
          <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#11141c] border border-[#222735] rounded-2xl">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#161a22] sticky top-0 z-10 border-b border-[#222735]">
                <tr>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Usuário</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Reputação</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Strikes</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Envios (Apr/Rej)</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Status & Ações Rápidas</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const isBanned = bans.some(b => b.userId === user.userId && b.active);
                  return (
                    <tr key={user.userId} className="border-b border-[#1b1f2b] hover:bg-[#161a22] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-[#222735] flex justify-center items-center font-bold text-xs text-[#cbd5e1]">
                             {user.username.substring(0,2).toUpperCase()}
                           </div>
                           <div>
                             <span className="font-semibold text-sm text-[#cbd5e1] block">@{user.username}</span>
                             <span className="text-[9px] text-[#47526d] font-mono leading-none">{user.userId}</span>
                           </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                           <div className="w-full max-w-[100px] h-2 bg-[#222735] rounded-full overflow-hidden">
                             <div className={clsx("h-full", user.reputation >= 80 ? 'bg-[#a3c9b8]' : user.reputation >= 40 ? 'bg-[#e0a670]' : 'bg-[#b28282]')} style={{ width: `${user.reputation}%` }}></div>
                           </div>
                           <span className="text-xs font-bold font-mono text-[#cbd5e1]">{user.reputation}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm">
                        <span className={clsx("font-bold", user.strikes > 0 ? 'text-[#e0a670]' : 'text-[#828ba0]')}>{user.strikes}/5</span>
                      </td>
                      <td className="p-4 text-xs font-mono text-[#cbd5e1]">
                        {user.totalSubmitted} <span className="text-[#828ba0]">({user.approvedCount} / {user.rejectedCount})</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {isBanned && <span className="text-[9px] bg-[#b28282]/20 text-[#b28282] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none">Banido</span>}
                          {user.shadowBanned && <span className="text-[9px] bg-[#9c8cb3]/20 text-[#9c8cb3] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none">Shadow</span>}
                          {user.restrictedUntil && user.restrictedUntil > Date.now() && <span className="text-[9px] bg-[#e0a670]/20 text-[#e0a670] px-2 py-1 rounded font-bold uppercase tracking-widest leading-none">Restrito</span>}
                          
                          <div className="flex bg-[#222735] rounded-lg p-0.5 ml-auto border border-[#2d3345]">
                            <button onClick={() => handlePunish(user.userId, 'temporary')} className="px-2 py-1 hover:bg-[#343b52] rounded text-[10px] text-[#cbd5e1] cursor-pointer transition-colors" title="Timeout">TIMEOUT</button>
                            <button onClick={() => handlePunish(user.userId, 'permanent')} className="px-2 py-1 hover:bg-[#b28282]/20 rounded text-[10px] text-[#b28282] cursor-pointer transition-colors" title="Ban Permanente">BANIR</button>
                            <button onClick={() => handlePunish(user.userId, 'shadow')} className="px-2 py-1 hover:bg-[#9c8cb3]/20 rounded text-[10px] text-[#9c8cb3] cursor-pointer transition-colors" title="Shadow Ban">SHADOW</button>
                            <button onClick={() => handleLiftRestrictions(user.userId)} className="px-2 py-1 hover:bg-[#8caf9b]/20 rounded text-[10px] text-[#8caf9b] cursor-pointer transition-colors border-l border-[#2d3345] ml-1 pl-3" title="Remover Restrições">PERDOAR</button>
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
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-4 mb-6">
             <div className="relative flex-1">
               <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[#47526d]" />
               <input 
                 type="text"
                 value={historySearchQuery}
                 onChange={e => setHistorySearchQuery(e.target.value)}
                 placeholder="Pesquisar por usuário, palavra-chave, plataforma, ou link..."
                 className="w-full bg-[#11141c] border border-[#222735] rounded-xl pl-12 pr-4 py-3 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#7c73e6]"
               />
             </div>
             <select 
                value={historyFilterStatus}
                onChange={e => setHistoryFilterStatus(e.target.value)}
                className="bg-[#11141c] border border-[#222735] rounded-xl px-4 py-3 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#7c73e6] cursor-pointer"
             >
                <option value="all">Status: Todos</option>
                <option value="approved">Status: Aprovados</option>
                <option value="rejected">Status: Rejeitados</option>
                <option value="pending">Status: Pendentes</option>
             </select>
          </div>
          
          <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#11141c] border border-[#222735] rounded-2xl relative">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#161a22] sticky top-0 z-10 border-b border-[#222735]">
                <tr>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Data</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Usuário</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">URL Enviada</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Status</th>
                  <th className="p-4 text-[10px] font-bold text-[#828ba0] uppercase tracking-widest font-mono">Detalhes / Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(log => (
                  <tr key={log.id} className="border-b border-[#1b1f2b] hover:bg-[#161a22] transition-colors">
                    <td className="p-4 text-xs font-mono text-[#828ba0]">
                       {format(new Date(log.timestamp), 'dd/MM HH:mm')}
                    </td>
                    <td className="p-4 font-semibold text-sm text-[#cbd5e1]">
                       @{log.submitterName}
                    </td>
                    <td className="p-4 max-w-sm">
                       <p className="text-xs text-[#cbd5e1] truncate font-medium">{log.url}</p>
                       <span className="text-[9px] text-[#47526d] font-mono">{log.platform}</span>
                    </td>
                    <td className="p-4">
                       {log.status === 'approved' && <span className="text-[10px] text-[#a3c9b8] bg-[#a3c9b8]/10 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">Aprovado</span>}
                       {log.status === 'rejected' && <span className="text-[10px] text-[#b28282] bg-[#b28282]/10 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">Rejeitado</span>}
                       {log.status === 'pending' && <span className="text-[10px] text-[#e0a670] bg-[#e0a670]/10 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">Pendente</span>}
                    </td>
                    <td className="p-4 max-w-xs text-xs text-[#828ba0]">
                       {log.rejectionReason || log.actionDetails || '-'}
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr>
                     <td colSpan={5} className="p-6 text-center text-[#828ba0] text-sm italic">Nenhum evento registrado.</td>
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
