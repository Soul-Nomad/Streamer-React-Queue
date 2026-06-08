/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { socket } from './socket';
import { SessionState } from './types';
import Lobby from './components/Lobby';
import HostView from './components/HostView';
import ParticipantView from './components/ParticipantView';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Toast {
  message: string;
  type: 'error' | 'info' | 'success';
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  
  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setToast({ message, type });
    // Auto collapse after 4 seconds
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  };

  useEffect(() => {
    socket.on('session_state', (state: SessionState) => {
       setSession(state);
       const me = state.users.find(u => u.id === socket.id);
       setIsHost(me?.isHost || false);
    });
    
    socket.on('error', (msg: string) => {
       showToast(msg, 'error');
    });

    socket.on('session_created', (roomId: string) => {
       showToast(`Sessão criada com sucesso! Código: ${roomId}`, 'success');
    });

    socket.on('session_ended', () => {
       setSession(null);
       setIsHost(false);
       showToast("A sessão do host foi finalizada.", 'info');
    });
    
    return () => {
       socket.off('session_state');
       socket.off('session_ended');
       socket.off('session_created');
       socket.off('error');
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0c0e12]">
      {/* Toast Overlay Portal Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-3 bg-[#11141c]/95 border border-[#222735] px-4.5 py-3 rounded-xl shadow-2xl pointer-events-auto select-none max-w-sm w-[90%]"
          >
            {toast.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-[#b28282] shrink-0" />
            )}
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-[#8caf9b] shrink-0" />
            )}
            {toast.type === 'info' && (
              <AlertCircle className="w-5 h-5 text-[#9c8cb3] shrink-0" />
            )}
            
            <p className="text-xs font-semibold text-[#cbd5e1] flex-1 text-left leading-relaxed">
              {toast.message}
            </p>

            <button 
              onClick={() => setToast(null)}
              className="p-1 hover:bg-[#1b1f2b] rounded-lg text-[#828ba0] hover:text-[#f8fafc] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Role router */}
      {(() => {
        if (!session) return <Lobby />;
        if (isHost) return <HostView session={session} />;
        return <ParticipantView session={session} />;
      })()}
    </div>
  );
}
