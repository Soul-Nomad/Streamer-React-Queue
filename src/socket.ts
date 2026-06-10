/// <reference types="vite/client" />
import { io } from 'socket.io-client';

// Se usarmos a mesma hospedagem, deixamos vazio (''). 
// Como está no Vercel (frontend) e backend possivelmente em outro lugar, use env var.
const runtimeConfig = (window as any).__RUNTIME_CONFIG__ || {};
const backendUrl = runtimeConfig.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL;

export const socket = io(backendUrl || undefined, {
  transports: ['websocket', 'polling'], // Força WebSocket primeiro se possível
});
