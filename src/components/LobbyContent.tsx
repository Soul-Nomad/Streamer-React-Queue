import { Radio, HelpCircle, Flame, History, Clock, ArrowRight, CornerDownRight, Check, Zap } from "lucide-react";
import { motion } from "motion/react";
import logoTransparent from "@/CASSETE-TAPE.png";

interface LobbyContentProps {
  processedOnlineStreamers: any[];
  offlineFollowedStreamers: any[];
  recentHistoryList: any[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  requestedQueues: string[];
  handleJoin: (roomId: string) => void;
  handleRequestQueue: (login: string) => void;
  discoveredRooms: any[];
  setIsHostConfirmOpen: (open: boolean) => void;
}

export default function LobbyContent({
  processedOnlineStreamers,
  offlineFollowedStreamers,
  recentHistoryList,
  selectedCategory,
  setSelectedCategory,
  requestedQueues,
  handleJoin,
  handleRequestQueue,
  discoveredRooms,
  setIsHostConfirmOpen,
}: LobbyContentProps) {
  
  // Stagger animation container configs
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } as const }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-full min-w-0 space-y-12 pb-24 font-sans z-10 relative">
      {/* 1. RETRO HARDWARE STYLE INTERACTIVE CATEGORY TABS */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5 select-none">
        <div className="flex flex-wrap items-center gap-2">
          {["all", "live-queue", "just-chatting", "gaming"].map((cat) => {
            const labels: Record<string, string> = {
              all: "Todas as salas",
              "live-queue": "Filas Ativas",
              "just-chatting": "Just Chatting",
              gaming: "Jogos",
            };

            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                  isActive
                    ? "bg-[#9146FF] text-white border-white/20 shadow-lg shadow-[#9146FF]/30"
                    : "bg-black/35 text-slate-300 hover:text-white hover:bg-black/50 border-white/10 backdrop-blur-sm"
                }`}
              >
                {cat === "live-queue" && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-ping" />
                )}
                {labels[cat]}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-400 font-mono hidden md:block">
          FILTRANDO {processedOnlineStreamers.length} STREAMERS DISPONÍVEIS
        </div>
      </div>

      {/* 2. CANAIS SEGUIDOS ONLINE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#00FF66] animate-pulse" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Canais ao Vivo
            </h3>
            <span className="text-[10px] bg-[#00FF66]/15 border border-[#00FF66]/30 text-[#00FF66] font-mono font-bold px-2 py-0.5 rounded-lg">
              {processedOnlineStreamers.filter((s) => s.roomId !== null).length} Ativos
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">446ms</span>
        </div>

        {(() => {
          const sortedAndPrioritized = [...processedOnlineStreamers].sort((a, b) => {
            if (a.roomId !== null && b.roomId === null) return -1;
            if (a.roomId === null && b.roomId !== null) return 1;
            if (a.hasOpenedQueueBefore && !b.hasOpenedQueueBefore) return -1;
            if (!a.hasOpenedQueueBefore && b.hasOpenedQueueBefore) return 1;
            return (b.viewers || 0) - (a.viewers || 0);
          });

          if (sortedAndPrioritized.length === 0) {
            return (
              <div className="bg-black/35 border border-white/10 rounded-xl p-10 text-center space-y-3 backdrop-blur-md">
                <HelpCircle className="w-8 h-8 text-slate-500 mx-auto" />
                <div className="max-w-md mx-auto space-y-1">
                  <span className="text-xs font-black text-white block uppercase">Sem canais correspondentes</span>
                  <p className="text-[10px] text-slate-300 leading-relaxed font-mono">
                    Nenhum canal corresponde aos filtros ou está transmitindo neste momento.
                  </p>
                </div>
              </div>
            );
          }

          return (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {sortedAndPrioritized.map((streamer, idx) => {
                const isLiveQueue = streamer.roomId !== null;
                const isVeteran = streamer.hasOpenedQueueBefore;

                return (
                  <motion.div
                    key={idx}
                    variants={itemVariants}
                    whileHover={{ y: -3 }}
                    className={`group bg-black/40 backdrop-blur-md border rounded-xl flex flex-col justify-between overflow-hidden transition-all duration-300 shadow-xl ${
                      isLiveQueue
                        ? "border-[#00FF66]/40 hover:border-[#00FF66] shadow-[0_4px_25px_rgba(0,255,102,0.06)] bg-black/50"
                        : isVeteran
                        ? "border-[#9146FF]/35 hover:border-[#9146FF]/70 shadow-[0_4px_25px_rgba(145,70,255,0.04)]"
                        : "border-white/10 hover:border-white/20 opacity-75 hover:opacity-100"
                    }`}
                  >
                    {/* Retro CRT monitor aesthetic screen */}
                    <div className="relative aspect-video bg-neutral-950/85 overflow-hidden border-b border-white/10">
                      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent z-10" />
                      <div className="absolute inset-0 bg-[#00FF66]/2 pointer-events-none mix-blend-color-dodge" />
                      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,20,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[size:100%_4px] pointer-events-none opacity-30" />

                      {isLiveQueue ? (
                        <div className="absolute top-3 left-3 bg-[#00FF66] text-black px-2 py-0.5 rounded-md text-[8px] font-black font-mono uppercase tracking-widest z-20 flex items-center gap-1 shadow">
                          <Check className="w-2.5 h-2.5 stroke-[3]" /> FILA ATIVA
                        </div>
                      ) : isVeteran ? (
                        <div className="absolute top-3 left-3 bg-[#9146FF] text-white border border-[#b183ff]/30 px-2 py-0.5 rounded-md text-[8px] font-black font-mono uppercase tracking-widest z-20 flex items-center gap-1 animate-pulse shadow">
                          HISTÓRICO ATIVO
                        </div>
                      ) : (
                        <div className="absolute top-3 left-3 bg-white/15 text-slate-300 border border-white/15 px-2 py-0.5 rounded-md text-[8px] font-mono uppercase z-20">
                          SEM REGISTRO
                        </div>
                      )}

                      <div className="absolute bottom-3 right-3 bg-black/85 border border-white/10 px-2 py-0.5 rounded-md text-[9px] font-mono z-20 text-[#00FF66]">
                        {streamer.viewers.toLocaleString("pt-BR")} ASSISTINDO
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <img
                          src={logoTransparent}
                          alt="Streamer React"
                          className="w-12 h-12 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>

                    <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="flex items-start gap-2.5">
                        <img
                          src={streamer.avatarUrl}
                          className="w-8 h-8 rounded-lg object-cover border border-white/15 group-hover:scale-105 transition-transform"
                          alt=""
                        />
                        <div className="min-w-0 flex-1 text-left leading-tight">
                          <span
                            className="text-xs font-black block truncate"
                            style={{ color: streamer.color }}
                          >
                            {streamer.displayName}
                          </span>
                          <p className="text-[10px] text-slate-300 font-medium block truncate mt-0.5">
                            {streamer.title || "Sem título de transmissão"}
                          </p>
                          <span className="text-[8px] text-[#9146FF] font-mono font-bold uppercase block mt-1.5">
                            {streamer.game || "Sem Categoria"}
                          </span>
                        </div>
                      </div>

                      {/* Lower card dashboard switches */}
                      <div className="border-t border-white/10 pt-3 flex items-center justify-between gap-2 mt-auto">
                        {isLiveQueue ? (
                          <>
                            <div className="text-left font-mono">
                              <span className="text-[7px] text-slate-400 uppercase block font-bold leading-none">PROCESSADOS</span>
                              <span className="text-[11px] font-black text-[#00FF66] block mt-0.5">
                                {streamer.activeQueueCount} mídias
                              </span>
                            </div>
                            <button
                              onClick={() => handleJoin(streamer.roomId)}
                              className="px-3.5 py-1.5 bg-[#00FF66] hover:bg-[#00e35a] text-black text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-md shadow-[#00FF66]/20"
                            >
                              Entrar na Fila
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="text-left font-mono">
                              <span className="text-[7px] text-slate-400 uppercase block font-bold leading-none">SALA DO STREAMER</span>
                              <span className="text-[10px] font-bold text-slate-400 block mt-0.5">DESCONECTADO</span>
                            </div>
                            <button
                              onClick={() => handleRequestQueue(streamer.login)}
                              disabled={requestedQueues.includes(streamer.login)}
                              className={`px-3.5 py-1.5 text-[9px] uppercase font-bold rounded-lg transition-all cursor-pointer border ${
                                requestedQueues.includes(streamer.login)
                                  ? "bg-[#00FF66]/15 text-[#00FF66] border-[#00FF66]/30"
                                  : isVeteran
                                  ? "bg-[#9146FF]/10 text-white border-[#9146FF]/35 hover:bg-[#9146FF]/20"
                                  : "bg-white/5 text-slate-300 hover:text-white border-white/10 hover:bg-white/15"
                              }`}
                            >
                              {requestedQueues.includes(streamer.login) ? "✓ Pedido!" : "Pedir Fila"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          );
        })()}
      </section>

      {/* 3. CONTINUE WATCHING (HISTÓRICO RECENTE) */}
      {recentHistoryList.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <History className="w-4 h-4 text-[#FF6B35]" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Continue Assistindo
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono">
            {recentHistoryList.map((hist, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -2 }}
                onClick={() => handleJoin(hist.roomId)}
                className="bg-black/35 border border-white/10 hover:border-[#FF6B35]/40 p-4 rounded-xl text-left cursor-pointer transition-all flex items-center gap-3 relative overflow-hidden group backdrop-blur-md shadow-md"
              >
                <div className="absolute top-0 right-0 h-1 bg-gradient-to-r from-transparent to-[#FF6B35]/20 w-1/3 group-hover:w-full transition-all duration-300" />
                {hist.hostAvatar ? (
                  <img
                    src={hist.hostAvatar}
                    className="w-8 h-8 rounded-lg object-cover border border-white/15"
                    alt=""
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-xs border border-white/10">
                    {hist.hostName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <span className="text-[8px] text-[#FF6B35] font-black uppercase tracking-widest block">
                    #{hist.roomId.substring(0, 6)}
                  </span>
                  <span className="text-xs font-bold text-slate-200 block truncate mt-1">
                    {hist.hostName}
                  </span>
                  <span className="text-[8px] text-slate-400 block mt-1 uppercase">
                    Acessado: {new Date(hist.visitedAt).toLocaleDateString()}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* 4. RECOMENDADOS PARA VOCÊ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#9146FF] animate-pulse" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Recomendados do Algoritmo
            </h3>
          </div>
          <span className="text-[10px] text-[#9146FF] font-mono font-bold">TAG_RECS_MATCH</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {processedOnlineStreamers.slice(0, 3).map((stream, idx) => {
            const matches = [98, 94, 89];
            return (
              <div
                key={idx}
                className="bg-black/35 border border-white/10 hover:border-[#9146FF]/25 rounded-xl p-5 text-left flex flex-col justify-between transition-all duration-200 backdrop-blur-md shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={stream.avatarUrl}
                        className="w-8 h-8 rounded-lg object-cover border border-white/15"
                        alt=""
                      />
                      <div>
                        <span className="text-xs font-black block" style={{ color: stream.color }}>
                          {stream.displayName}
                        </span>
                        <span className="text-[8px] text-[#00FF66] font-mono font-bold block">
                          {matches[idx % 3]}% SCORE MATCH
                        </span>
                      </div>
                    </div>
                    <span className="text-[7.5px] bg-[#9146FF]/20 text-[#cda8ff] border border-[#9146FF]/30 px-1.5 py-0.5 rounded-lg font-black uppercase tracking-wider font-mono">
                      RECOMENDADO
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-350 leading-relaxed font-mono">
                    Canal sintonizável sugerido pelo algoritmo sob tag principal de{" "}
                    <strong className="text-white">"{stream.game || "Just Chatting"}"</strong>.
                  </p>

                  <div className="bg-black/40 p-2 rounded-lg border border-white/5 flex items-center gap-2 font-mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00FF66] shrink-0" />
                    <span className="text-[9px] text-slate-400 truncate block">
                      "{stream.title || "Sem título"}"
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/10 mt-4 pt-3 flex items-center justify-between font-mono">
                  <span className="text-[9px] text-slate-400">
                    {stream.viewers.toLocaleString("pt-BR")} VIEWERS
                  </span>

                  {stream.roomId ? (
                    <button
                      onClick={() => handleJoin(stream.roomId)}
                      className="px-3.5 py-1 bg-[#9146FF] text-white hover:bg-[#772ce8] text-[9px] font-black uppercase rounded-lg transition-all cursor-pointer shadow-md shadow-[#9146FF]/25"
                    >
                      Sintonizar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRequestQueue(stream.login)}
                      disabled={requestedQueues.includes(stream.login)}
                      className={`px-3.5 py-1 text-[9px] uppercase font-bold rounded-lg transition-all cursor-pointer border ${
                        requestedQueues.includes(stream.login)
                          ? "bg-[#00FF66]/15 text-[#00FF66] border-[#00FF66]/30"
                          : "bg-white/5 text-slate-300 hover:text-white border-white/10 hover:bg-white/15"
                      }`}
                    >
                      {requestedQueues.includes(stream.login) ? "✔ OK" : "Pedir Fila"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. SALAS POPULARES & EVENTOS AO VIVO */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#FF6B35] animate-bounce" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Salas Populares Globais
            </h3>
          </div>
          <span className="text-[9px] bg-[#FF6B35]/15 border border-[#FF6B35]/30 text-[#FF6B35] px-2 py-0.5 rounded-lg font-mono font-bold uppercase animate-pulse">
            VIBRANTE S-SISTEMA
          </span>
        </div>

        {discoveredRooms.length === 0 ? (
          <div className="p-10 bg-black/35 border border-white/10 rounded-xl text-center space-y-4 backdrop-blur-md shadow-2xl">
            <img
              src={logoTransparent}
              alt="Streamer React"
              className="w-12 h-12 mx-auto animate-pulse object-contain opacity-50"
              referrerPolicy="no-referrer"
            />
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <span className="text-xs font-black text-white block uppercase tracking-wider">Nenhum canal correspondente sua localidade no momento.</span>
                <p className="text-[10.5px] text-slate-300 font-mono leading-relaxed mt-1">
                  Seja o primeiro a criar um host! Inicie o seu host do canal Twitch!
                </p>
              </div>
              <button
                onClick={() => setIsHostConfirmOpen(true)}
                className="px-6 py-3 bg-[#FF6B35] text-white hover:bg-[#E2531B] text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all duration-150 shadow-lg shadow-[#FF6B35]/35 active:scale-95"
              >
                Criar Meu Host
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {discoveredRooms.map((room) => (
              <div
                key={room.roomId}
                className="bg-black/35 border border-white/10 hover:border-[#FF6B35]/45 p-5 rounded-xl text-left flex flex-col justify-between transition-all duration-300 group backdrop-blur-md shadow-md animate-glow text-slate-200"
              >
                <div className="space-y-4 font-mono">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {room.hostAvatar ? (
                        <img
                          src={room.hostAvatar}
                          className="w-8 h-8 rounded-lg object-cover border border-white/10"
                          alt=""
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">
                          {room.hostName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-black text-slate-100 block group-hover:text-[#FF6B35] transition-colors leading-none">
                          {room.hostName}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5 leading-none">BROADCASTER HOST</span>
                      </div>
                    </div>
                    <div className="bg-[#FF6B35]/15 border border-[#FF6B35]/35 px-2 py-0.5 rounded-lg shrink-0">
                      <span className="text-[9px] font-bold text-[#FF6B35]">#{room.roomId.substring(0, 6)}</span>
                    </div>
                  </div>

                  {/* Telemetry statistical blocks */}
                  <div className="grid grid-cols-2 gap-2 text-left pt-1">
                    <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <span className="text-[8px] text-slate-400 uppercase block font-semibold leading-none">Conetados</span>
                      <span className="text-sm font-bold text-slate-300 block mt-1">{room.usersCount}</span>
                    </div>
                    <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <span className="text-[8px] text-slate-400 uppercase block font-semibold leading-none">Mídias Fila</span>
                      <span className="text-sm font-bold text-[#00FF66] block mt-1">{room.queueCount}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 mt-4 pt-3 flex items-center justify-between font-mono">
                  <span className="text-[9px] text-slate-400">
                    ONLINE: {Math.floor(room.uptime / 60000)}m
                  </span>
                  <button
                    onClick={() => handleJoin(room.roomId)}
                    className="px-3.5 py-1.5 bg-[#FF6B35] hover:bg-[#E2531B] text-[#fff] text-[9px] font-black uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-[#FF6B35]/15"
                  >
                    Sintonizar <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. COMUNIDADES EM CRESCIMENTO */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FF6B35] animate-pulse" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Comunidades em Altas
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">NET_SWEEP_LOAD_OK</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {processedOnlineStreamers.slice(2, 6).map((stream, idx) => {
            const activities = [
              "+94% Atividade",
              "+41% Envios",
              "+32% Chat",
              "+18% Fila",
            ];
            return (
              <div
                key={idx}
                className="bg-black/35 border border-white/10 hover:border-[#9146FF]/25 p-4 rounded-xl text-left flex items-center justify-between transition-all backdrop-blur-md shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={stream.avatarUrl}
                    className="w-7 h-7 rounded-lg object-cover border border-white/15"
                    alt=""
                  />
                  <div className="min-w-0 leading-tight">
                    <span className="text-xs font-black text-slate-200 block truncate" style={{ color: stream.color }}>
                      {stream.displayName}
                    </span>
                    <span className="text-[9px] text-[#FF6B35] font-black block font-mono mt-0.5">
                      {activities[idx % 4]}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => (stream.roomId ? handleJoin(stream.roomId) : handleRequestQueue(stream.login))}
                  className="text-[8px] font-black uppercase tracking-wider bg-white/5 hover:bg-[#9146FF]/20 text-slate-200 border border-white/10 hover:border-[#9146FF]/35 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  {stream.roomId ? "ENTRAR" : "PEDIR"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. CANAIS OFFLINE DETALHADOS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              Seguidos fora de Linha
            </h3>
          </div>
        </div>

        <div className="bg-black/35 border border-white/10 p-6 rounded-xl backdrop-blur-md shadow-md">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {offlineFollowedStreamers.sort((a,b) => (b.hasOpenedQueueBefore ? 1 : 0) - (a.hasOpenedQueueBefore ? 1 : 0)).map((stream, idx) => {
              const hasPrevHistory = stream.hasOpenedQueueBefore;
              return (
                <div
                  key={idx}
                  className={`p-4 bg-black/30 border rounded-lg text-center space-y-3 flex flex-col justify-between transition-all duration-200 ${
                    hasPrevHistory
                      ? "border-[#9146FF]/25 opacity-90 hover:border-[#9146FF]/65"
                      : "border-white/10 opacity-55 hover:opacity-100 hover:border-slate-600"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="relative inline-block mx-auto">
                      <img
                        src={stream.avatarUrl}
                        className="w-10 h-10 rounded-lg object-cover mx-auto border border-white/15"
                        alt=""
                      />
                      {hasPrevHistory && (
                        <span className="absolute -top-1.5 -right-1.5 text-[6.5px] font-black uppercase bg-[#9146FF] text-white border border-[#9146FF]/40 px-1 py-0.5 rounded-md font-mono shadow">
                          VET
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[11px] font-black text-slate-250 block truncate leading-none">
                        {stream.displayName}
                      </span>
                      <span className="text-[8px] text-slate-400 block font-mono leading-none">
                        {hasPrevHistory ? "Já abriu Fila" : "FORA DE LINHA"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRequestQueue(stream.login)}
                    disabled={requestedQueues.includes(stream.login)}
                    className={`w-full py-1 rounded-md text-[8.5px] font-black block transition-all cursor-pointer font-mono uppercase border ${
                      requestedQueues.includes(stream.login)
                        ? "bg-[#00FF66]/15 text-[#00FF66] border-[#00FF66]/30"
                        : "bg-white/5 text-slate-400 hover:text-white border-white/10 hover:bg-white/15"
                    }`}
                  >
                    {requestedQueues.includes(stream.login) ? "Ok! ✓" : "Pedir Fila"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
