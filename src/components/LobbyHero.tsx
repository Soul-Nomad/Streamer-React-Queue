import { Crown, Twitch, Terminal, Send } from "lucide-react";
import { motion } from "motion/react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import logoTransparent from "@/CASSETE-TAPE.png";

interface LobbyHeroProps {
  supabaseUser: SupabaseUser | null;
  submittingHost: boolean;
  isJoiningRoom: boolean;
  activeQueuesStats: {
    totalRooms: number;
    totalUsers: number;
    totalVideosInQueues: number;
  };
  handleLoginTwitch: () => void;
  setIsJoinModalOpen: (open: boolean) => void;
  setIsHostConfirmOpen: (open: boolean) => void;
}

export default function LobbyHero({
  supabaseUser,
  submittingHost,
  isJoiningRoom,
  activeQueuesStats,
  handleLoginTwitch,
  setIsJoinModalOpen,
  setIsHostConfirmOpen,
}: LobbyHeroProps) {
  // Stagger configurations for items inside the right column
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: 20 },
    show: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 100 } },
  };

  return (
    <div 
      className="relative overflow-hidden w-full bg-[#0d0e12]/60 border border-white/10 rounded-2xl p-6 sm:p-10 lg:p-12 flex flex-col lg:flex-row items-stretch justify-between gap-10 lg:gap-14 shadow-2xl backdrop-blur-md z-10 transition-all duration-300"
    >
      {/* Background scan effects */}
      <div className="absolute inset-0 bg-[#9146FF]/5 pointer-events-none mix-blend-color-dodge" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,20,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20" />
      
      {/* Ambient glowing blobs */}
      <div className="absolute -left-20 -top-20 w-80 h-80 rounded-full bg-[#9146FF]/10 blur-[80px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-[#00FF66]/5 blur-[80px] pointer-events-none" />

      {/* Lado Esquerdo (Textos e Ação Principal) */}
      <div className="flex-1 flex flex-col justify-center space-y-6 text-left z-10 w-full lg:max-w-2xl">
        {/* Dynamic Badge */}
        {activeQueuesStats && activeQueuesStats.totalRooms > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/20 self-start select-none"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] animate-pulse" />
            <span>{activeQueuesStats.totalRooms} {activeQueuesStats.totalRooms === 1 ? 'Sala Ativa' : 'Salas Ativas'} Sincronizadas</span>
          </motion.div>
        )}

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-display text-white tracking-tight leading-[1.1] uppercase">
          Assista vídeos enviados pelo seu chat da{" "}
          <span className="text-[#9146FF] text-shadow-purple drop-shadow-[0_0_20px_rgba(145,70,255,0.5)]">
            Twitch
          </span>{" "}
          em tempo real
        </h1>

        <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal opacity-90 max-w-xl">
          Centralize os reacts da sua live. Receba links de vídeos diretamente pelos comandos do chat da Twitch ou através da nossa interface web. Tudo organizado em uma fila automática para você focar apenas em reagir e interagir.
        </p>

        {/* Action button trigger designed like heavy broadcast switches - ONLY CREATE QUEUE / LOGIN BUTTON */}
        <div className="flex flex-col sm:flex-row gap-4 pt-3 w-full sm:w-auto">
          {!supabaseUser ? (
            <button
              onClick={handleLoginTwitch}
              className="px-8 py-4 bg-[#9146FF] hover:bg-[#772ce8] text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#9146FF]/30 cursor-pointer active:scale-95 transition-all duration-150 transform hover:scale-[1.02] shrink-0"
              id="lobby_hero_cta_twitch_login"
            >
              <Twitch className="w-4 h-4 fill-current animate-pulse" />
              <span>Criar minha fila</span>
            </button>
          ) : (
            <button
              onClick={() => setIsHostConfirmOpen(true)}
              disabled={submittingHost}
              className="px-8 py-4 bg-[#9146FF] hover:bg-[#772ce8] text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#9146FF]/30 cursor-pointer active:scale-95 transition-all duration-150 transform hover:scale-[1.02] shrink-0"
              id="lobby_hero_cta_create_queue"
            >
              <Crown className="w-4 h-4 text-[#FFEA00]" />
              <span>{submittingHost ? "Iniciando..." : "Criar minha fila"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Lado Direito (Listagem Dinâmica e Intuitiva) - No nested card background, seamless flow */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex-1 w-full lg:max-w-md flex flex-col justify-between gap-6 z-10"
      >
        {/* Envio de Vídeos (Chat or Site) */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2 select-none">
            <Send className="w-3.5 h-3.5 text-[#9146FF]" />
            <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Canais de Envio</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Item 1 - Pelo Chat */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-col items-start gap-2.5 group p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300"
            >
              <div className="flex-shrink-0 w-9 h-9 bg-[#9146FF]/10 text-[#9146FF] border border-[#9146FF]/20 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:bg-[#9146FF]/20 group-hover:scale-105 shadow-[0_0_15px_rgba(145,70,255,0.12)]">
                <Twitch className="w-4.5 h-4.5 fill-current" />
              </div>
              <div className="space-y-1 text-left">
                <h3 className="text-[11px] uppercase font-black tracking-wider text-[#9146FF] font-mono">Pelo Chat</h3>
                <p className="text-[11px] text-slate-300 leading-normal font-normal">
                  Envie links diretamente no chat da sua live.
                </p>
              </div>
            </motion.div>

            {/* Item 1.1 - Pelo Site */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-col items-start gap-2.5 group p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300"
            >
              <div className="flex-shrink-0 w-9 h-9 bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/20 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:bg-[#00FF66]/20 group-hover:scale-105 shadow-[0_0_15px_rgba(0,255,102,0.12)]">
                <Terminal className="w-4.5 h-4.5" />
              </div>
              <div className="space-y-1 text-left">
                <h3 className="text-[11px] uppercase font-black tracking-wider text-[#00FF66] font-mono">Pelo Site</h3>
                <p className="text-[11px] text-slate-300 leading-normal font-normal">
                  Acesse sua sala exclusiva e envie os links.
                </p>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Separated Prominent Feature: Player Integrado with spectacular premium spectrum border */}
        <motion.div 
          variants={itemVariants}
          className="relative bg-[#0d0e12]/80 border border-white/5 rounded-xl overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)] group transition-all duration-300 hover:border-white/10"
        >
          {/* Top Spectrum Palette Border (Matching the user-attached gradient image perfectly) */}
          <div className="h-[4px] w-full bg-gradient-to-r from-[#FF5E33] via-[#E23F99] via-[#9446FF] via-[#486BFF] via-[#00B4D8] via-[#00E5A3] to-[#00FA6D]" />
          
          <div className="p-5 flex gap-4">
            <div className="flex-shrink-0 w-11 h-11 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mt-0.5 shadow-md overflow-hidden p-1 bg-black/40">
              <img
                src={logoTransparent}
                alt="Streamer React"
                className="w-full h-full object-contain group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-black tracking-widest font-mono text-transparent bg-clip-text bg-gradient-to-r from-[#FF5E33] via-[#E23F99] via-[#9446FF] to-[#00FA6D]">
                  Player Integrado
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                A fila sincroniza em tempo real e os vídeos rodam direto na nossa tela. Esqueça as abas extras e foque no react!
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
