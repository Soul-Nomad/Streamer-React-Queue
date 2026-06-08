import { useState } from 'react';
import { socket } from '../socket';
import { MonitorPlay, LogIn, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Lobby() {
  const [name, setName] = useState(localStorage.getItem('queue_username') || '');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'select' | 'join' | 'create'>('select');

  const handleCreate = () => {
    if (name) localStorage.setItem('queue_username', name);
    socket.emit('create_session', { name: name.trim() || 'Host' });
  };

  const handleJoin = () => {
    if (name) localStorage.setItem('queue_username', name);
    if (roomId.trim()) {
      socket.emit('join_session', { roomId: roomId.trim().toUpperCase(), name: name.trim() || 'Participant' });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0c0e12] text-[#e2e8f0] px-4 py-12 relative overflow-hidden selection:bg-[#3b4252] selection:text-[#f8fafc]">
      {/* Background visual geometry - very subtle, flat, no glowing gradient halo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1f2430]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#2d3341]/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm bg-[#161920] border border-[#222735] rounded-2xl p-8 relative z-10"
      >
        {/* Brand / Logo */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 bg-[#222735] rounded-xl flex items-center justify-center mb-4 border border-[#2d3345]">
            <MonitorPlay className="w-6 h-6 text-[#9a94b8]" />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-[0.2em] text-[#f8fafc] font-sans">MultiPlay</h1>
          <p className="text-xs text-[#828ba0] mt-1 font-medium font-sans">Sincronização de telas e filas em tempo real</p>
        </div>

        <div className="space-y-6">
          {/* Your Name Input - ALWAYS visible to encourage setting it first */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#828ba0] uppercase tracking-[0.15em] block">
              Seu nome de usuário
            </label>
            <input 
              type="text" 
              value={name}
              maxLength={20}
              onChange={e => setName(e.target.value)}
              placeholder="Digite seu nome (ex: Gabriel)"
              className="w-full bg-[#0c0e12] border border-[#222735] rounded-xl px-4 py-3 text-sm text-[#f8fafc] placeholder-[#47526d] focus:outline-none focus:border-[#7c73e6] transition-all font-medium"
            />
          </div>

          <AnimatePresence mode="wait">
            {mode === 'select' && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3 pt-2"
              >
                <button 
                  onClick={() => setMode('create')}
                  className="w-full flex items-center justify-between bg-[#222735] hover:bg-[#2c3245] border border-[#2d3345] rounded-xl p-4 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#2c3245] flex items-center justify-center border border-[#383f56]">
                      <MonitorPlay className="w-4.5 h-4.5 text-[#a3c9b8]" />
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-sm block text-[#f8fafc]">Criar Sala</span>
                      <span className="text-[10px] text-[#828ba0]">Você será o host da tela</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#47526d] group-hover:text-[#f8fafc] transition-colors" />
                </button>

                <button 
                  onClick={() => setMode('join')}
                  className="w-full flex items-center justify-between bg-[#222735] hover:bg-[#2c3245] border border-[#2d3345] rounded-xl p-4 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#2c3245] flex items-center justify-center border border-[#383f56]">
                      <LogIn className="w-4.5 h-4.5 text-[#b2c8df]" />
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-sm block text-[#f8fafc]">Entrar em Sala</span>
                      <span className="text-[10px] text-[#828ba0]">Envie seus vídeos para a tela</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#47526d] group-hover:text-[#f8fafc] transition-colors" />
                </button>
              </motion.div>
            )}

            {mode === 'create' && (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 pt-2"
              >
                <button 
                  onClick={handleCreate}
                  className="w-full bg-[#7c73e6] hover:bg-[#6c62da] text-white font-bold py-4.5 px-4 rounded-xl transition-all shadow-none flex justify-center items-center gap-2 text-sm select-none cursor-pointer"
                >
                  <MonitorPlay className="w-4 h-4" /> Iniciar Sessão como Host
                </button>
                
                <button 
                  onClick={() => setMode('select')}
                  className="w-full py-2.5 text-center text-xs font-bold text-[#828ba0] uppercase tracking-wider hover:text-[#f8fafc] transition-colors cursor-pointer flex justify-center items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                </button>
              </motion.div>
            )}

            {mode === 'join' && (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#828ba0] uppercase tracking-[0.15em] block">
                    Código da Sala
                  </label>
                  <input 
                    type="text" 
                    value={roomId}
                    maxLength={4}
                    onChange={e => setRoomId(e.target.value.toUpperCase())}
                    placeholder="EX: A1B2"
                    className="w-full bg-[#0c0e12] border border-[#222735] rounded-xl px-4 py-3 text-sm text-[#f8fafc] placeholder-[#47526d] tracking-widest font-mono text-center focus:outline-none focus:border-[#7c73e6] transition-all uppercase font-bold"
                  />
                </div>

                <button 
                  onClick={handleJoin}
                  disabled={roomId.length < 4}
                  className="w-full bg-[#7c73e6] hover:bg-[#6c62da] disabled:bg-[#222735] disabled:text-[#47526d] disabled:cursor-not-allowed text-white font-bold py-4.5 px-4 rounded-xl transition-all shadow-none flex justify-center items-center gap-2 text-sm cursor-pointer"
                >
                  <LogIn className="w-4 h-4" /> Conectar à Sala
                </button>

                <button 
                  onClick={() => setMode('select')}
                  className="w-full py-2.5 text-center text-xs font-bold text-[#828ba0] uppercase tracking-wider hover:text-[#f8fafc] transition-colors cursor-pointer flex justify-center items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Humble aesthetic credits */}
      <div className="mt-12 text-[10px] font-mono text-[#47526d] tracking-wider select-none text-center">
        MULTIPLAY APP • REAL-TIME WATCH PARTY
      </div>
    </div>
  );
}
