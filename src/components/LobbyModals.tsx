import { Crown, LogIn, AlertTriangle, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import React from "react";

interface LobbyModalsProps {
  isJoinModalOpen: boolean;
  setIsJoinModalOpen: (open: boolean) => void;
  roomIdInput: string;
  setRoomIdInput: (val: string) => void;
  handleManualCodeJoinSubmit: (e: React.FormEvent) => void;
  isHostConfirmOpen: boolean;
  setIsHostConfirmOpen: (open: boolean) => void;
  twitchUsername: string;
  handleCreate: () => void;
  submittingHost: boolean;
}

export default function LobbyModals({
  isJoinModalOpen,
  setIsJoinModalOpen,
  roomIdInput,
  setRoomIdInput,
  handleManualCodeJoinSubmit,
  isHostConfirmOpen,
  setIsHostConfirmOpen,
  twitchUsername,
  handleCreate,
  submittingHost,
}: LobbyModalsProps) {
  return (
    <>
      {/* MODAL 1: JOIN WITH 4-LETTER CODE */}
      <AnimatePresence>
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsJoinModalOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-sm bg-[#0e1117] border border-white/10 p-6 rounded-[5px] shadow-2xl text-left space-y-4 font-sans/95 overflow-hidden"
            >
              {/* Corner accent retro details */}
              <div className="absolute top-0 left-0 w-3 h-px bg-[#FF8C42]" />
              <div className="absolute top-0 left-0 w-px h-3 bg-[#FF8C42]" />
              <div className="absolute bottom-0 right-0 w-3 h-px bg-[#FF8C42]" />
              <div className="absolute bottom-0 right-0 w-px h-3 bg-[#FF8C42]" />

              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[10px] font-black uppercase text-slate-500 font-mono tracking-widest flex items-center gap-1">
                  <LogIn className="w-3.5 h-3.5 text-accent" /> CONEXÃO DO ESPECTADOR
                </span>
                <button
                  onClick={() => setIsJoinModalOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer text-xs font-mono uppercase font-bold"
                >
                  [FECHAR]
                </button>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-black uppercase text-slate-100 font-display">
                  Sintonizar Canal Fila
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Insira o código de 4 dígitos gerado no painel de administração do streamer.
                </p>
              </div>

              <form onSubmit={handleManualCodeJoinSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={roomIdInput}
                    maxLength={4}
                    onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                    placeholder="ABCD"
                    className="w-full bg-[#07090d] border border-white/10 focus:border-accent text-2xl font-black font-mono tracking-widest text-accent rounded-[5px] py-3 text-center uppercase focus:outline-none focus:ring-1 focus:ring-accent/40"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-900 border border-white/5 hover:bg-slate-800 text-xs text-slate-300 font-bold rounded-[5px] transition-colors cursor-pointer uppercase font-mono"
                  >
                    VOLTAR
                  </button>
                  <button
                    type="submit"
                    disabled={roomIdInput.length < 4}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-slate-950 disabled:text-slate-600 disabled:border-transparent text-xs text-white font-extrabold uppercase tracking-wider rounded-[5px] transition-all cursor-pointer font-mono border border-accent/25"
                  >
                    SINTONIZAR
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: HOST STREAMER CONFIRM */}
      <AnimatePresence>
        {isHostConfirmOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHostConfirmOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-sm bg-[#0e1117] border border-white/10 p-6 rounded-[5px] shadow-2xl text-left space-y-4 font-sans/95 overflow-hidden"
            >
              {/* Corner accent retro details */}
              <div className="absolute top-0 left-0 w-3 h-px bg-primary" />
              <div className="absolute top-0 left-0 w-px h-3 bg-primary" />
              <div className="absolute bottom-0 right-0 w-3 h-px bg-primary" />
              <div className="absolute bottom-0 right-0 w-px h-3 bg-primary" />

              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[10px] font-black uppercase text-slate-500 font-mono tracking-widest flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> PAINEL DO STREAMER
                </span>
                <button
                  onClick={() => setIsHostConfirmOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer text-xs font-mono uppercase font-bold"
                >
                  [VOLTAR]
                </button>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-black uppercase text-slate-100 font-display">
                  ATIVAR MINHA FILA
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  Isso abrirá uma nova sala sob seu login Twitch. Sendo o administrador, você poderá moderar, organizar e reproduzir os vídeos submetidos.
                </p>
              </div>

              <div className="p-3 bg-[#07090d] border border-white/5 rounded-[5px] flex items-center gap-3">
                <Crown className="w-7 h-7 text-accent" />
                <div className="text-left font-mono">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Canal Sincronizado</span>
                  <span className="text-xs font-black block text-primary">
                    @{twitchUsername.toLowerCase()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsHostConfirmOpen(false)}
                  className="flex-1 py-2.5 bg-slate-900 border border-white/5 hover:bg-slate-800 text-xs text-slate-300 font-bold rounded-[5px] cursor-pointer font-mono uppercase"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCreate();
                    setIsHostConfirmOpen(false);
                  }}
                  disabled={submittingHost}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-xs text-white font-black uppercase rounded-[5px] cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-primary/20 transition-all font-mono border border-primary/20"
                >
                  {submittingHost ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Crown className="w-3.5 h-3.5" /> ABRIR FILA
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
