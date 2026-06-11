import { useState } from 'react';
import { SessionState, User } from '../types';
import { 
  ShieldCheck, AlertTriangle, ShieldAlert, Award, Star, Clock, 
  Trash2, UserMinus, UserCheck, Flame, Plus, StickyNote, HelpCircle
} from 'lucide-react';
import clsx from 'clsx';
import { socket } from '../socket';

interface HostUserProfileProps {
  session: SessionState;
  currentUser: User | null;
  onShowFeedback: (title: string, desc: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export default function HostUserProfile({ session, currentUser, onShowFeedback }: HostUserProfileProps) {
  const [noteText, setNoteText] = useState('');

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-[#111116] h-full text-zinc-500 text-center space-y-3 select-none" id="host_user_profile_empty">
        <HelpCircle className="w-10 h-10 text-zinc-700 animate-pulse" />
        <div className="space-y-1">
          <p className="text-xs font-bold font-mono uppercase text-zinc-400">Nenhum Usuário Selecionado</p>
          <p className="text-[10px] text-zinc-600 max-w-[200px] leading-relaxed">
            Selecione um vídeo na fila ou reproduza uma mídia para inspecionar os detalhes do espectador.
          </p>
        </div>
      </div>
    );
  }

  const handleGiveStrike = () => {
    socket.emit('give_strike', { userId: currentUser.id });
    onShowFeedback('Strike Aplicado', `@${currentUser.name} recebeu +1 strike.`, 'warning');
  };

  const handleTimeout = (minutes: number) => {
    socket.emit('timeout_user', { userId: currentUser.id, minutes });
    onShowFeedback('Timeout Aplicado', `@${currentUser.name} silenciado por ${minutes} minutos.`, 'warning');
  };

  const handleBan = () => {
    socket.emit('ban_user', { userId: currentUser.id, banType: 'permanent', reason: 'Banido através do painel do Host' });
    onShowFeedback('Usuário Banido', `@${currentUser.name} foi permanente banido da sala.`, 'error');
  };

  const handleToggleVIP = () => {
    socket.emit('toggle_whitelist', currentUser.id);
    onShowFeedback('VIP Alterado', `Mudou o status de VIP para @${currentUser.name}.`, 'success');
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    // Note: server supports 'admin_action' with actions
    socket.emit('admin_action', {
      userId: currentUser.id,
      action: 'add_note',
      note: noteText.trim()
    });
    setNoteText('');
    onShowFeedback('Nota Salva', 'Nota interna do usuário adicionada com sucesso.', 'success');
  };

  // Safe checks & values
  const handleForgive = () => {
    socket.emit('admin_action', { userId: currentUser.id, action: 'forgive' });
    onShowFeedback('Perdoado', `@${currentUser.name} teve todas as restrições removidas.`, 'success');
  };

  const strikes = currentUser.strikes || 0;
  const reputation = currentUser.reputation ?? 100;
  const isSubscriber = currentUser.twitchData?.isSubscriber || currentUser.twitchData?.badges?.includes('subscriber');
  const followDate = currentUser.twitchData?.followedAt ? new Date(currentUser.twitchData.followedAt) : null;
  const isFollower = currentUser.twitchData?.isFollower || !!followDate;

  // Calculate follow duration description
  let followDurationDesc = 'Não segue o canal';
  if (followDate) {
    const diffMs = Date.now() - followDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) followDurationDesc = 'Começou a seguir hoje';
    else if (diffDays === 1) followDurationDesc = 'Segue desde ontem';
    else if (diffDays < 30) followDurationDesc = `Seguidor há ${diffDays} dias`;
    else {
      const diffMonths = Math.floor(diffDays / 30);
      followDurationDesc = `Seguidor há ${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'}`;
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#111116] text-zinc-100 font-sans border-l border-[#1f1f2e] select-none" id="host_user_profile">
      {/* Panel Header */}
      <div className="p-3 bg-zinc-950 border-b border-[#1f1f2e] flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-zinc-300">
        <ShieldCheck className="w-4 h-4 text-orange-500" />
        <span>Ficha do Espectador</span>
      </div>

      {/* User Branding Card */}
      <div className="p-4 bg-zinc-950/40 border-b border-[#1f1f2e] flex flex-col items-center text-center space-y-2">
        <div className="relative">
          {currentUser.twitchData?.avatarUrl ? (
            <img 
              src={currentUser.twitchData.avatarUrl} 
              alt={currentUser.name} 
              className="w-14 h-14 rounded-full object-cover border-2 border-orange-500/50 shadow-lg"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-white border-2 border-zinc-700"
              style={{ backgroundColor: currentUser.twitchData?.color || '#555555' }}
            >
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          {isSubscriber && (
            <span className="absolute -bottom-1 -right-1 bg-amber-500 p-1 text-black font-extrabold text-[8px] rounded-full border border-zinc-950 shadow" title="Subscriber">
              <Star className="w-2.5 h-2.5 fill-current" />
            </span>
          )}
        </div>

        <div className="space-y-0.5">
          <h3 
            className="text-sm font-extrabold tracking-wide"
            style={{ color: currentUser.twitchData?.color || '#FFFFFF' }}
          >
            @{currentUser.name}
          </h3>
          <p className="text-[10px] text-zinc-500 font-medium font-mono">
            {currentUser.twitchData?.login ? 'Autenticado' : 'Convidado Local'}
          </p>
        </div>

        {/* Reputation Badge */}
        <div className="w-full space-y-1 pt-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span>Reputação:</span>
            <span className={clsx(
              "font-bold",
              reputation >= 80 ? "text-green-400" : reputation > 50 ? "text-amber-500" : "text-red-500"
            )}>{reputation}%</span>
          </div>
          <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
            <div 
              className={clsx(
                "h-full rounded-full transition-all duration-300",
                reputation >= 80 ? "bg-green-500" : reputation > 50 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${reputation}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-220px)]">
        {/* Metas & Metrics */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono">Métricas da Twitch</h4>
          <div className="bg-zinc-950/60 p-2.5 rounded-sm border border-[#1f1f2e] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Inscrito (Sub):</span>
              <span className={clsx("font-bold text-[10.5px]", isSubscriber ? "text-amber-400" : "text-zinc-400")}>
                {isSubscriber ? "Sim (Tier 1)" : "Não"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Seguidor:</span>
              <span className={clsx("font-bold text-[10.5px]", isFollower ? "text-orange-400" : "text-zinc-400")}>
                {followDurationDesc}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Moderation Dashboard */}
        <div className="space-y-2.5">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono">Controle de Moderação</h4>
          
          {/* Strikes Counter */}
          <div className="bg-zinc-950/60 p-3 rounded-sm border border-[#1f1f2e] flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">Strikes Ativos:</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((s) => (
                <Flame 
                  key={s} 
                  className={clsx(
                    "w-4.5 h-4.5 transition-colors",
                    strikes >= s ? "text-orange-500 fill-current" : "text-zinc-800"
                  )} 
                />
              ))}
              <span className="text-xs font-bold font-mono text-zinc-300 ml-1">({strikes})</span>
            </div>
          </div>

          {/* Action Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleGiveStrike}
              className="py-2 px-2 border border-orange-500/20 bg-orange-500/10 hover:bg-orange-500 hover:text-white text-orange-400 font-bold text-[11px] rounded font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              +1 STRIKE
            </button>
            <button
              onClick={handleToggleVIP}
              className={clsx(
                "py-2 px-2 border font-bold text-[11px] rounded font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                currentUser.twitchData?.isVip || currentUser.isWhitelisted
                  ? "border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white"
                  : "border-orange-500/20 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white"
              )}
            >
              <Award className="w-3.5 h-3.5" />
              {currentUser.twitchData?.isVip || currentUser.isWhitelisted ? "REMOVER VIP" : "TORNAR VIP"}
            </button>
            <button
              onClick={() => handleTimeout(10)}
              className="py-1.5 px-2 border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500 hover:text-black text-amber-500/90 font-bold text-[10px] rounded font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Clock className="w-3 h-3" />
              TIMEOUT 10'
            </button>
            <button
              onClick={() => handleTimeout(30)}
              className="py-1.5 px-2 border border-amber-500/20 bg-amber-500/0 hover:bg-[#b05315] hover:text-white text-orange-500/90 font-bold text-[10px] rounded font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Clock className="w-3 h-3" />
              TIMEOUT 30'
            </button>
            <button
              onClick={handleForgive}
              className="py-1.5 px-2 border border-green-500/20 bg-green-500/0 hover:bg-[#1a5c1a] hover:text-white text-green-500/90 font-bold text-[10px] rounded font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <UserCheck className="w-3 h-3" />
              PERDOAR
            </button>
          </div>

          <button
            onClick={handleBan}
            className="w-full py-2 bg-red-600/10 border border-red-600/30 text-red-500 hover:bg-red-600 hover:text-white font-black text-xs rounded transition-all flex items-center justify-center gap-2 font-mono tracking-wider cursor-pointer mt-1"
          >
            <ShieldAlert className="w-4 h-4" />
            BANIR PERMANENTEMENTE
          </button>
        </div>

        {/* Admin Warning Notes Block */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono flex items-center gap-1">
            <StickyNote className="w-3 h-3" />
            Notas Internas do Host
          </h4>
          <div className="bg-zinc-950/60 p-3 rounded-sm border border-[#1f1f2e] space-y-2.5">
            {currentUser.adminNotes && currentUser.adminNotes.length > 0 ? (
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {currentUser.adminNotes.map((note: string, idx: number) => (
                  <p key={idx} className="text-[10px] leading-relaxed text-zinc-300 font-mono italic border-l-2 border-orange-500/40 pl-1.5">
                    "{note}"
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] italic text-zinc-600 font-mono">Sem anotações de aviso registradas.</p>
            )}
            
            <div className="flex gap-1.5 mt-2">
              <input
                type="text"
                placeholder="Adicionar nota de aviso..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10.5px] focus:outline-none focus:border-orange-600 placeholder-zinc-600 text-zinc-200"
              />
              <button
                onClick={handleAddNote}
                className="px-2 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold rounded flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
