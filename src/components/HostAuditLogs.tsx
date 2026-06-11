import { useState } from 'react';
import { SessionState, SecurityAuditLog } from '../types';
import { 
  Terminal, ShieldCheck, ShieldAlert, Trash2, SlidersHorizontal, RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import { socket } from '../socket';

interface HostAuditLogsProps {
  session: SessionState;
  onShowFeedback: (title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export default function HostAuditLogs({ session, onShowFeedback }: HostAuditLogsProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const handleClearLogs = () => {
    socket.emit('clear_audit_logs');
    onShowFeedback('Logs Limpos', 'O histórico do terminal de auditoria foi limpo.', 'info');
  };

  const logs = session.auditLogs || [];

  const filteredLogs = logs.filter((log: SecurityAuditLog) => {
    if (severityFilter === 'all') return true;
    return log.severity === severityFilter;
  });

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-500 border-red-500/20 bg-red-500/5';
      case 'medium': return 'text-amber-500 border-amber-500/20 bg-amber-500/5';
      case 'low':
      default: return 'text-zinc-500 border-zinc-800 bg-zinc-900/40';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111116] border-t border-[#1f1f2e] text-zinc-100 font-sans select-none" id="host_audit_logs">
      {/* Module TitleBar */}
      <div className="p-3 bg-zinc-950 border-b border-[#1f1f2e] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-zinc-300">
          <Terminal className="w-4 h-4 text-purple-500" />
          <span>Auditoria de Segurança</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Severity filter selects */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
            <SlidersHorizontal className="w-3 h-3 text-zinc-500" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="bg-transparent text-[9.5px] font-mono text-zinc-400 focus:outline-none border-0 p-0 cursor-pointer"
            >
              <option value="all" className="bg-zinc-900">Nível: Todos</option>
              <option value="high" className="bg-zinc-900 text-red-400">Nível: Alto</option>
              <option value="medium" className="bg-zinc-900 text-amber-400">Nível: Médio</option>
              <option value="low" className="bg-zinc-900 text-zinc-400">Nível: Baixo</option>
            </select>
          </div>
          <button
            onClick={handleClearLogs}
            className="p-1 hover:bg-zinc-900 text-zinc-500 hover:text-red-400 border border-transparent hover:border-zinc-800 rounded transition-all cursor-pointer"
            title="Limpar Histórico"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Feed scroll */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-[10.5px] leading-relaxed space-y-1.5 max-h-[140px] scrollbar-thin bg-black/40">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log: SecurityAuditLog) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const sStyle = getSeverityStyle(log.severity);
            
            return (
              <div 
                key={log.id} 
                className={clsx(
                  "p-1.5 border rounded-sm flex items-start gap-2 select-text",
                  sStyle
                )}
              >
                <span className="text-zinc-600 font-bold shrink-0">[{timeStr}]</span>
                <div className="flex-1">
                  <span className="font-extrabold text-zinc-300 pr-1">{log.type.toUpperCase()}:</span>
                  <span className="text-zinc-400">{log.message}</span>
                  {log.username && (
                    <span className="text-purple-400 font-extrabold pl-1">(@{log.username})</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-600 text-center space-y-1">
            <ShieldCheck className="w-5 h-5 text-zinc-800" />
            <p className="text-[10px] italic">Nenhuma anomalia de segurança registrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}
