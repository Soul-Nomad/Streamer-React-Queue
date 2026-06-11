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
import TermosDeUso from './components/TermosDeUso';
import PoliticaDePrivacidade from './components/PoliticaDePrivacidade';
import { AlertCircle, CheckCircle2, X, WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Toast {
  message: string;
  type: 'error' | 'info' | 'success';
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modalOpen, setModalOpen] = useState<'termos' | 'privacidade' | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  
  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setToast({ message, type });
    // Auto collapse after 4 seconds
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  };

  useEffect(() => {
    const handleConnect = () => {
       const payloadStr = localStorage.getItem('active_session_payload');
       if (payloadStr) {
          try {
             const data = JSON.parse(payloadStr);
             socket.emit('join_session', data);
          } catch (e) {
             console.error('Failed to parse active session payload', e);
          }
       }
    };

    socket.on('connect', handleConnect);
    if (socket.connected) {
       handleConnect();
    }
    
    socket.on('disconnect', () => {
       setReconnecting(true);
    });

    socket.on('session_state', (state: SessionState) => {
       setSession(state);
       setReconnecting(false);
       const me = state.users.find(u => u.userId === socket.getUserId() || u.id === socket.id);
       const amIHost = me ? me.isHost : (localStorage.getItem('active_role') === 'host');
       setIsHost(amIHost);

       // Safely sync room registration to local persistence
       localStorage.setItem('active_room_id', state.id);
       localStorage.setItem('active_role', amIHost ? 'host' : 'participant');
    });
    
    socket.on('error', (msg: string) => {
       showToast(msg, 'error');
    });

    socket.on('timeout', (msg: string) => {
       showToast(msg, 'info');
    });

    socket.on('warn', (msg: string) => {
       showToast(msg, 'info');
    });

    socket.on('session_created', (roomId: string) => {
       showToast(`Sessão criada com sucesso! Código: ${roomId}`, 'success');
       localStorage.setItem('active_room_id', roomId);
       localStorage.setItem('active_role', 'host');

       const templateStr = localStorage.getItem('host_join_template');
       if (templateStr) {
          try {
             const template = JSON.parse(templateStr);
             localStorage.setItem('active_session_payload', JSON.stringify({
                ...template,
                roomId
             }));
             localStorage.removeItem('host_join_template');
          } catch (e) {
             console.error('Failed to parse host join template', e);
          }
       }
    });

    socket.on('session_ended', () => {
       setSession(null);
       setIsHost(false);
       localStorage.removeItem('active_room_id');
       localStorage.removeItem('active_role');
       localStorage.removeItem('active_session_payload');
       showToast("A sessão do host foi finalizada.", 'info');
    });
    
    return () => {
       socket.off('connect', handleConnect);
       socket.off('disconnect');
       socket.off('session_state');
       socket.off('session_ended');
       socket.off('session_created');
       socket.off('error');
       socket.off('timeout');
       socket.off('warn');
    };
  }, []);

  useEffect(() => {
    const handleOpenModal = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'termos' || customEvent.detail === 'privacidade') {
        setModalOpen(customEvent.detail);
      }
    };
    window.addEventListener('openModal', handleOpenModal as EventListener);
    return () => window.removeEventListener('openModal', handleOpenModal as EventListener);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#121212]">
      {/* Reconnection Banner Badge */}
      <AnimatePresence>
        {session && reconnecting && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 w-full z-[10000] bg-[#FF8C42] text-white px-4 py-2 flex items-center justify-center gap-2 select-none shadow-lg text-xs font-bold"
          >
            <WifiOff className="w-4 h-4 animate-pulse" />
            Conexão instável. Tentando reconectar (Tentativa 1)...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Development Status Banner - Show only on Home (Lobby) */}
      {!session && (
        <div className="select-none border-b border-white/10 bg-[#FF8C42] px-4 py-1.5 text-center">
          <p className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-wider text-white md:text-xs">
            <AlertCircle className="h-3 w-3 shrink-0 text-white md:h-4 md:w-4" />
            Este serviço está em fase de desenvolvimento e pode apresentar instabilidades.
          </p>
        </div>
      )}

      {/* Toast Overlay Portal Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#1A1A1A] border-l-4 border-l-[#FF6B35] border border-[#222222] px-4 py-3 rounded text-white shadow-2xl pointer-events-auto select-none max-w-sm w-[90%]"
          >
            {toast.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-[#F44336] shrink-0" />
            )}
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-[#4CAF50] shrink-0" />
            )}
            {toast.type === 'info' && (
              <AlertCircle className="w-5 h-5 text-[#FF8C42] shrink-0" />
            )}
            
            <p className="text-xs font-semibold text-[#FFFFFF] flex-1 text-left leading-relaxed">
              {toast.message}
            </p>

            <button 
              onClick={() => setToast(null)}
              className="p-1 hover:bg-[#222222] rounded text-[#B0B0B0] hover:text-[#FFFFFF] transition-colors cursor-pointer shrink-0"
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

      {/* Legal Modals */}
      <AnimatePresence>
        {modalOpen === 'termos' && <TermosDeUso onClose={() => setModalOpen(null)} />}
        {modalOpen === 'privacidade' && <PoliticaDePrivacidade onClose={() => setModalOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}
