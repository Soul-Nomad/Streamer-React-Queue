import { Radio, Users, Cpu, Wifi, HelpCircle, FolderHeart } from "lucide-react";
import { motion } from "motion/react";
import { User as SupabaseUser } from "@supabase/supabase-js";

interface LobbySidebarProps {
  supabaseUser: SupabaseUser | null;
  loadingTwitchData: boolean;
  processedOnlineStreamers: any[];
  offlineFollowedStreamers: any[];
  activeQueuesStats: {
    totalRooms: number;
    totalUsers: number;
    totalVideosInQueues: number;
  };
  requestedQueues: string[];
  handleLoginTwitch: () => void;
  handleJoin: (roomId: string) => void;
  handleRequestQueue: (login: string) => void;
}

export default function LobbySidebar({
  supabaseUser,
  loadingTwitchData,
  processedOnlineStreamers,
  offlineFollowedStreamers,
  activeQueuesStats,
  requestedQueues,
  handleLoginTwitch,
  handleJoin,
  handleRequestQueue,
}: LobbySidebarProps) {
  const activeFollowedQueues = processedOnlineStreamers.filter((s) => s.roomId !== null);

  return (
    <aside className="w-72 bg-black/45 backdrop-blur-md border-r border-white/10 p-5 hidden lg:flex flex-col gap-6 shrink-0 select-none font-sans z-10 transition-all duration-300">
      {/* SECTION 1: LIVE FOLLOWING CHANNELS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <Radio className="w-3.5 h-3.5 text-[#00FF66] animate-pulse" />
            FILA DOS SEGUIDOS
          </span>
          <span className="text-[10px] bg-[#9146FF]/20 text-[#a855f7] border border-[#9146FF]/40 px-1.5 py-0.5 rounded-lg font-bold font-mono">
            {activeFollowedQueues.length}
          </span>
        </div>

        {!supabaseUser ? (
          <div className="p-4 bg-black/40 border border-white/10 hover:border-white/20 rounded-xl text-center space-y-3 backdrop-blur-md transition-all duration-300 shadow-md">
            <p className="text-[10px] text-slate-200 leading-relaxed font-mono">
              Vincule sua conta da Twitch para sintonizar a fila dos canais que você segue.
            </p>
            <button
              onClick={handleLoginTwitch}
              className="w-full py-2 bg-[#9146FF] hover:bg-[#772ce8] text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-md shadow-[#9146FF]/35"
            >
              CONECTAR TWITCH
            </button>
          </div>
        ) : loadingTwitchData ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-1">
                  <div className="h-2.5 bg-white/5 rounded-md w-2/3" />
                  <div className="h-2 bg-white/5 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : activeFollowedQueues.length === 0 ? (
          <div className="p-4 bg-black/20 border border-dashed border-white/10 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
              Nenhum canal que você segue tem fila ativa agora.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {activeFollowedQueues.map((streamer, idx) => (
              <motion.div
                key={idx}
                whileHover={{ x: 3, y: -1 }}
                onClick={() => streamer.roomId && handleJoin(streamer.roomId)}
                className="flex items-center justify-between p-2 rounded-xl border border-[#00FF66]/20 bg-[#00FF66]/5 hover:bg-[#00FF66]/10 hover:border-[#00FF66]/50 cursor-pointer transition-all duration-200 shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative">
                    <img
                      src={streamer.avatarUrl}
                      className="w-7 h-7 rounded-lg object-cover border border-white/10"
                      alt=""
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#00FF66] ring-1 ring-black" />
                  </div>
                  <div className="text-left min-w-0">
                    <span
                      className="text-[11px] font-black block truncate"
                      style={{ color: streamer.color || "#fff" }}
                    >
                      {streamer.displayName}
                    </span>
                    <span className="text-[9px] text-slate-400 block truncate font-mono">
                      {streamer.game || "Sem Categoria"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <span className="text-[8px] text-[#00FF66] block uppercase tracking-wider font-extrabold">
                    FILA ATIVA
                  </span>
                  <span className="text-[9px] text-slate-350 block font-bold">
                    {streamer.activeQueueCount} mídias
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: OFFLINE FOLLOWED CHANNELS */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <FolderHeart className="w-3.5 h-3.5 text-slate-400" />
            CANAIS DESCONECTADOS
          </span>
          <span className="text-[9px] bg-black/30 border border-white/10 text-slate-400 px-1.5 py-0.5 font-mono rounded-lg">
            {offlineFollowedStreamers.length}
          </span>
        </div>

        {offlineFollowedStreamers.length === 0 ? (
          <div className="p-4 bg-transparent text-center border border-dashed border-white/5 rounded-lg">
            <p className="text-[9px] text-slate-500 font-mono">Sem canais offline seguidos.</p>
          </div>
        ) : (
          <div className="space-y-1.5 overflow-y-auto max-h-56 pr-1">
            {offlineFollowedStreamers.slice(0, 4).map((streamer, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-1 px-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 duration-200"
               >
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={streamer.avatarUrl}
                    className="w-5 h-5 rounded-lg object-cover border border-white/5 opacity-55"
                    alt=""
                  />
                  <span className="text-[11px] text-slate-400 truncate font-black block leading-none">
                    {streamer.displayName}
                  </span>
                </div>
                <button
                  onClick={() => handleRequestQueue(streamer.login)}
                  disabled={requestedQueues.includes(streamer.login)}
                  className={`text-[8px] px-2 py-0.5 rounded-lg font-black uppercase transition-all cursor-pointer border ${
                    requestedQueues.includes(streamer.login)
                      ? "bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/20"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10 border-white/5"
                  }`}
                >
                  {requestedQueues.includes(streamer.login) ? "Ok!" : "Pedir Fila"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
