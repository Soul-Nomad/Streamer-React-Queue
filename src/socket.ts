import * as Ably from 'ably';

export function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const runtimeConfig = (window as any).__RUNTIME_CONFIG__ || {};
    const backendUrl = runtimeConfig.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || window.location.origin;
    return backendUrl.replace(/\/+$/, '');
  }
  return '';
}

class AblySocketAdapter {
  private listeners: Record<string, Function[]> = {};
  private ably: Ably.Realtime | null = null;
  private channel: any = null;

  public connected = false;
  public id = '';

  constructor() {
    // Resolve or spawn lifetime user ID
    let currentId = typeof window !== 'undefined' ? localStorage.getItem('active_client_id') : null;
    if (!currentId || currentId.startsWith('usr_')) {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        currentId = window.crypto.randomUUID();
      } else {
        currentId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('active_client_id', currentId);
      }
    }
    this.id = currentId;
  }

  /**
   * Safe getter for user ID, preferring authenticated Supabase UUID when logged in, or falling back to persistent client UUID.
   */
  public getUserId(): string {
    if (typeof window !== 'undefined') {
      const activeSupabaseUserId = localStorage.getItem('active_supabase_user_id');
      if (activeSupabaseUserId) return activeSupabaseUserId;
    }
    return this.id;
  }

  /**
   * Registers a callback for real-time incidents.
   */
  public on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Auto-retrigger connect listener if we are already connected to speed up cold starts
    if (event === 'connect' && this.connected) {
      callback();
    }
  }

  /**
   * Deregisters real-time event hooks.
   */
  public off(event: string, callback?: Function) {
    if (!callback) {
      delete this.listeners[event];
    } else if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Translates legacy socket.io emissions to backend atomic REST API operations.
   */
  public async emit(event: string, ...args: any[]) {
    console.log(`[Socket Adapter Emit] Event: ${event}`, args);
    const roomId = typeof window !== 'undefined' ? (localStorage.getItem('active_room_id') || args[0]?.roomId) : args[0]?.roomId;
    
    // 1. Session establishment routines
    if (event === 'create_session' || event === 'join_session') {
      const payload = args[0] || {};
      
      try {
        const isCreate = event === 'create_session';
        const endpoint = `${getBackendUrl()}${isCreate ? '/api/sessions' : `/api/sessions/${payload.roomId}/join`}`;
        
        // Use saved supabase room id or generate short code fallback
        const savedSupabaseRoomId = typeof window !== 'undefined' ? localStorage.getItem('active_supabase_room_id') : null;
        const fallbackRoomId = 'room_' + Math.random().toString(36).substring(2, 7).toUpperCase();

        const finalRoomId = isCreate 
          ? (savedSupabaseRoomId || fallbackRoomId)
          : (payload.roomId || savedSupabaseRoomId || fallbackRoomId);

        const bodyPayload = isCreate ? {
          roomId: finalRoomId,
          hostId: payload.userId || this.getUserId(),
          twitchData: payload.twitchData
        } : {
          roomId: finalRoomId,
          userId: payload.userId || this.getUserId(),
          name: payload.name,
          twitchData: payload.twitchData
        };

        const targetRoom = finalRoomId;
        if (typeof window !== 'undefined') {
          localStorage.setItem('active_room_id', targetRoom);
          localStorage.setItem('active_username', payload.name || 'Streamer');
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (res.ok) {
          const data = await res.json();
          if (isCreate && data.success) {
            this.connectToAbly(targetRoom);
            this.trigger('session_created', targetRoom);
            this.trigger('session_state', data.session);
          } else if (!isCreate && data.success) {
            this.connectToAbly(targetRoom);
            this.trigger('session_state', data.session);
          } else {
            this.trigger('error', data.error || 'Falha ao processar sessão.');
          }
        } else {
          const errData = await res.json();
          this.trigger('error', errData.error || 'Erro na requisição da sala.');
        }
      } catch (err: any) {
        this.trigger('error', 'Não foi possível conectar ao servidor de dados.');
      }
      return;
    }

    // 2. Queue mutations and administrative workflows mapped to the REST API endpoints securely
    if (!roomId) {
      console.warn('[Socket Adapter] Action omitted due to missing Room ID context.');
      return;
    }

    try {
      const actionRoute = `${getBackendUrl()}/api/sessions/${roomId}/${event}`;
      const res = await fetch(actionRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.getUserId(),
          data: args[0]
        })
      });

      if (!res.ok) {
        const errDetails = await res.json();
        this.trigger('error', errDetails.error || 'Ação recusada pelo guardião da fila.');
      }
    } catch (err) {
      console.error('[Socket Adapter Action Error] Transaction failed:', err);
    }
  }

  /**
   * Invokes all callbacks hook to this transaction.
   */
  public trigger(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('[Socket Adapter Callback Error]', e);
        }
      });
    }
  }

  /**
   * Initializes Ably cloud mesh pub/sub channels.
   */
  public connectToAbly(roomId: string) {
    if (this.ably) return;

    const cleanBackendUrl = getBackendUrl();

    this.ably = new Ably.Realtime({
      authUrl: `${cleanBackendUrl}/api/auth/ably-token`,
      authMethod: 'POST',
      authParams: {
        userId: this.getUserId(),
        roomId
      }
    });

    this.channel = this.ably.channels.get(`session:${roomId}`);

    // Direct subscription mapping
    this.channel.subscribe('session_state', (msg) => {
      this.trigger('session_state', msg.data);
    });

    this.channel.subscribe('session_ended', () => {
      this.trigger('session_ended', null);
      this.disconnect();
    });

    this.channel.subscribe('error', (msg) => {
      this.trigger('error', msg.data);
    });

    this.ably.connection.on('connected', () => {
      this.connected = true;
      this.trigger('connect', null);
    });

    this.ably.connection.on('disconnected', () => {
      this.connected = false;
    });
  }

  /**
   * Dissolves raw connections.
   */
  public disconnect() {
    if (this.ably) {
      this.ably.close();
      this.ably = null;
      this.channel = null;
      this.connected = false;
      console.log('[Socket Adapter] Connection terminated safely.');
    }
  }
}

export const socket = new AblySocketAdapter();
