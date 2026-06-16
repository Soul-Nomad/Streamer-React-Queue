import { useState } from "react";
import { SessionState, User } from "../types";
import {
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Award,
  Star,
  Clock,
  Trash2,
  UserMinus,
  UserCheck,
  Flame,
  HelpCircle,
  RefreshCw,
  CassetteTape,
} from "lucide-react";
import { clsx } from "clsx";
import { socket, getBackendUrl } from "../socket";

interface HostUserProfileProps {
  session: SessionState;
  currentUser: User | null;
  twitchChatters?: any[];
  onShowFeedback: (
    title: string,
    desc: string,
    type: "success" | "warning" | "error" | "info",
  ) => void;
}

export default function HostUserProfile({
  session,
  currentUser,
  twitchChatters = [],
  onShowFeedback,
}: HostUserProfileProps) {
  const [refreshingTwitch, setRefreshingTwitch] = useState(false);

  if (!currentUser) {
    return (
      <div
        className="flex flex-col items-center justify-center p-6 bg-[#111116] h-full text-zinc-500 text-center space-y-3 select-none"
        id="host_user_profile_empty"
      >
        <HelpCircle className="w-10 h-10 text-zinc-700 animate-pulse" />
        <div className="space-y-1">
          <p className="text-xs font-bold font-mono uppercase text-zinc-400">
            Nenhum Usuário Selecionado
          </p>
          <p className="text-[10px] text-zinc-600 max-w-[200px] leading-relaxed">
            Selecione um vídeo na fila ou reproduza uma mídia para inspecionar
            os detalhes do espectador.
          </p>
        </div>
      </div>
    );
  }

  const handleGiveStrike = () => {
    socket.emit("give_strike", { userId: currentUser.userId });
    onShowFeedback(
      "Strike Aplicado",
      `@${currentUser.name} recebeu +1 strike.`,
      "warning",
    );
  };

  const handleTimeout = (minutes: number) => {
    socket.emit("timeout_user", { userId: currentUser.userId, minutes });
    onShowFeedback(
      "Timeout Aplicado",
      `@${currentUser.name} silenciado por ${minutes} minutes.`,
      "warning",
    );
  };

  const handleBan = () => {
    socket.emit("ban_user", {
      userId: currentUser.userId,
      banType: "permanent",
      reason: "Banido através do painel do Host",
    });
    onShowFeedback(
      "Usuário Banido",
      `@${currentUser.name} foi permanente banido da sala.`,
      "error",
    );
  };

  const handleRefreshTwitch = async () => {
    if (refreshingTwitch) return;
    setRefreshingTwitch(true);
    try {
      const res = await fetch(
        `${getBackendUrl()}/api/sessions/${session.id}/refresh_user_twitch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: currentUser.userId }),
        },
      );
      if (res.ok) {
        onShowFeedback(
          "Métricas Atualizadas",
          `Dados da Twitch para @${currentUser.name} atualizados com sucesso do Helix API.`,
          "success",
        );
      } else {
        onShowFeedback(
          "Ops!",
          "Não foi possível atualizar as métricas no momento.",
          "warning",
        );
      }
    } catch (err) {
      onShowFeedback(
        "Erro",
        "Falha ao conectar com o serviço de métricas.",
        "error",
      );
    } finally {
      setRefreshingTwitch(false);
    }
  };

  // Safe checks & values
  const handleForgive = () => {
    socket.emit("admin_action", {
      userId: currentUser.userId,
      action: "forgive",
    });
    onShowFeedback(
      "Perdoado",
      `@${currentUser.name} teve todas as restrições removidas.`,
      "success",
    );
  };

  const strikes = currentUser.strikes || 0;
  const reputation = currentUser.reputation ?? 0;
  const isSubscriber =
    currentUser.twitchData?.isSubscriber ||
    currentUser.twitchData?.badges?.includes("subscriber");
  const followDate = currentUser.twitchData?.followedAt
    ? new Date(currentUser.twitchData.followedAt)
    : null;
  const isFollower = currentUser.twitchData?.isFollower || !!followDate;

  let followDurationDesc = "Não segue o canal";
  if (followDate) {
    const diffMs = Date.now() - followDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) followDurationDesc = "Começou a seguir hoje";
    else if (diffDays === 1) followDurationDesc = "Segue desde ontem";
    else if (diffDays < 30) followDurationDesc = `Seguidor há ${diffDays} dias`;
    else {
      const diffMonths = Math.floor(diffDays / 30);
      followDurationDesc = `Seguidor há ${diffMonths} ${diffMonths === 1 ? "mês" : "meses"}`;
    }
  }

  const isOnlineOnTwitch =
    twitchChatters?.some(
      (tc: any) =>
        tc.user_login?.toLowerCase() ===
          currentUser.twitchData?.login?.toLowerCase() ||
        tc.user_name?.toLowerCase() === currentUser.name?.toLowerCase(),
    ) ||
    (currentUser.lastPresenceAt &&
      Date.now() - currentUser.lastPresenceAt < 5 * 60 * 1000) ||
    false;

  // Calculate follow duration description
  const karmaScore =
    currentUser.karmaDetails?.karma_score ?? currentUser.reputation ?? 0;
  const pos = currentUser.karmaDetails?.positive_ratings ?? 0;
  const neg = currentUser.karmaDetails?.negative_ratings ?? 0;
  const totalRate = currentUser.karmaDetails?.total_rated_submissions ?? 0;
  const approvalRate =
    totalRate > 0 ? Math.round((pos / totalRate) * 100) : null;

  const getKarmaInfo = (score: number) => {
    if (score >= 1000)
      return {
        level: "Lenda Analógica",
        color: "text-fuchsia-400",
        bg: "bg-fuchsia-500/10",
        border: "border-fuchsia-500/30",
      };
    if (score >= 500)
      return {
        level: "Arquivista",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
      };
    if (score >= 200)
      return {
        level: "Curador",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
      };
    if (score >= 50)
      return {
        level: "Colecionador",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
      };
    return {
      level: "Fita Nova",
      color: "text-zinc-400",
      bg: "bg-zinc-500/10",
      border: "border-zinc-500/30",
    };
  };

  const karmaInfo = getKarmaInfo(karmaScore);

  return (
    <div
      className="flex flex-col h-full bg-[#111116] text-zinc-100 font-sans border-l border-[#1f1f2e] select-none"
      id="host_user_profile"
    >
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
              style={{
                backgroundColor: currentUser.twitchData?.color || "#555555",
              }}
            >
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          {isSubscriber && (
            <span
              className="absolute -bottom-1 -right-1 bg-amber-500 p-1 text-black font-extrabold text-[8px] rounded-full border border-zinc-950 shadow"
              title="Subscriber"
            >
              <Star className="w-2.5 h-2.5 fill-current" />
            </span>
          )}
        </div>

        <div className="space-y-0.5">
          <h3
            className="text-sm font-extrabold tracking-wide flex items-center justify-center gap-1"
            style={{ color: currentUser.twitchData?.color || "#FFFFFF" }}
          >
            @{currentUser.name}
          </h3>
          <p className="text-[10px] text-zinc-500 font-medium font-mono">
            {currentUser.twitchData?.login ? "Autenticado" : "Convidado Local"}
          </p>
          <div className="flex items-center gap-1.5 mt-1 justify-center bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800/50">
            <span
              className={clsx(
                "w-2 h-2 rounded-full",
                isOnlineOnTwitch ? "bg-green-500 animate-pulse" : "bg-zinc-650",
              )}
            />
            <span className="text-[9.5px] font-mono text-zinc-400">
              {isOnlineOnTwitch ? "Online no Chat" : "Offline no Chat"}
            </span>
          </div>
        </div>

        {/* Karma System Section */}
        <div className="w-full mt-3 flex flex-col">
          <div
            className={clsx(
              "flex items-center justify-between p-2 rounded-t border-t border-x",
              karmaInfo.bg,
              karmaInfo.border,
            )}
          >
            <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-200">
              <CassetteTape className={clsx("w-3 h-3", karmaInfo.color)} />
              Karma Total: {karmaScore}
            </div>
            <div
              className={clsx(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded border border-zinc-500/20 bg-zinc-950/40",
                karmaInfo.color,
              )}
            >
              {karmaInfo.level}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#1f1f2e] border border-[#1f1f2e] rounded-b bg-zinc-950/20 overflow-hidden">
            <div className="flex flex-col items-center py-1.5 px-1 group hover:bg-zinc-900/50 transition-colors">
              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">
                Aprovação
              </span>
              <span className="text-xs font-black text-amber-500">
                {typeof approvalRate === "number" ? `${approvalRate}%` : "--"}
              </span>
            </div>
            <div className="flex flex-col items-center py-1.5 px-1 group hover:bg-zinc-900/50 transition-colors">
              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">
                Upvotes
              </span>
              <span className="text-xs font-black text-emerald-500">
                ▲ {pos}
              </span>
            </div>
            <div className="flex flex-col items-center py-1.5 px-1 group hover:bg-zinc-900/50 transition-colors">
              <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono font-bold">
                Downvotes
              </span>
              <span className="text-xs font-black text-rose-500">▼ {neg}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-220px)]">
        {/* Metas & Metrics */}
        <div className="space-y-2">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono">
            Métricas da Twitch
          </h4>
          <div className="bg-zinc-950/60 p-2.5 rounded-sm border border-[#1f1f2e] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Inscrito (Sub):</span>
              <span
                className={clsx(
                  "font-bold text-[10.5px]",
                  isSubscriber ? "text-amber-400" : "text-zinc-400",
                )}
              >
                {isSubscriber ? "Sim (Tier 1)" : "Não"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Seguidor:</span>
              <span
                className={clsx(
                  "font-bold text-[10.5px]",
                  isFollower ? "text-orange-400" : "text-zinc-400",
                )}
              >
                {followDurationDesc}
              </span>
            </div>

            {/* Direct Refresh action */}
            <div className="pt-2 border-t border-zinc-900 flex justify-end">
              <button
                onClick={handleRefreshTwitch}
                disabled={refreshingTwitch}
                className="text-[10px] font-mono text-orange-400 hover:text-orange-300 disabled:text-zinc-600 flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded transition duration-200 cursor-pointer"
              >
                <RefreshCw
                  className={clsx(
                    "w-3 h-3",
                    refreshingTwitch && "animate-spin",
                  )}
                />
                {refreshingTwitch ? "Atualizando..." : "Atualizar Métricas"}
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Moderation Dashboard */}
        <div className="space-y-2.5">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono">
            Controle de Moderação
          </h4>

          {/* Strikes Counter */}
          <div className="bg-zinc-950/60 p-3 rounded-sm border border-[#1f1f2e] flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">
              Strikes Ativos:
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Flame
                  key={s}
                  className={clsx(
                    "w-4.5 h-4.5 transition-colors",
                    strikes >= s
                      ? "text-orange-500 fill-current"
                      : "text-zinc-800",
                  )}
                />
              ))}
              <span className="text-xs font-bold font-mono text-zinc-300 ml-1">
                ({strikes}/5)
              </span>
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

        {/* Auditoria de Segurança */}
        <div className="space-y-2" id="security_audit_section">
          <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-wider font-mono flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-orange-500" />
            Auditoria de Segurança
          </h4>
          <div className="bg-zinc-950/60 p-3.5 rounded-sm border border-[#1f1f2e] space-y-3">
            {/* Recent Incident Logs matching the user */}
            <div className="space-y-2">
              <span className="text-zinc-500 block font-mono uppercase text-[8.5px] tracking-widest leading-none mb-1.5">
                Logs de Ações Suspeitas
              </span>
              {(() => {
                const userSuspicious =
                  session.suspiciousAlerts?.filter(
                    (a) =>
                      a.username?.toLowerCase() ===
                        currentUser.name?.toLowerCase() ||
                      a.userId === currentUser.userId,
                  ) || [];
                const sortedAlerts = [...userSuspicious].sort(
                  (a, b) => b.timestamp - a.timestamp,
                );

                if (sortedAlerts.length > 0) {
                  return (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {sortedAlerts.map((log: any) => (
                        <div
                          key={log.id}
                          className="text-[10px] leading-tight font-mono text-zinc-300 border-l-2 border-red-500/40 pl-2.5 py-0.5 bg-zinc-900/10 rounded-r"
                        >
                          <div className="flex items-center justify-between text-[8px] text-zinc-500 mb-0.5">
                            <span>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              className={clsx(
                                "font-extrabold uppercase tracking-widest text-[7px] px-1 rounded-sm",
                                log.severity === "high"
                                  ? "text-red-400 bg-red-950/30"
                                  : log.severity === "medium"
                                    ? "text-amber-400 bg-amber-950/20"
                                    : "text-zinc-500 bg-zinc-950",
                              )}
                            >
                              {log.type || "Filtro"}
                            </span>
                          </div>
                          <p className="text-zinc-400 font-sans leading-relaxed text-[9.5px]">
                            {log.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                } else {
                  return (
                    <p className="text-[10px] italic text-zinc-650 font-mono leading-relaxed pt-1">
                      Nenhuma ação suspeita registrada para este usuário nesta
                      sessão.
                    </p>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
