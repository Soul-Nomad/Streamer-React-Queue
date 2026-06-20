import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { Layers, Link, RefreshCw, Trash2, CheckCircle, X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function DiscordView({ session }: { session: SessionState }) {
  const [roomSettings, setRoomSettings] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [discordChannels, setDiscordChannels] = useState<{ id: string; name: string }[]>([]);
  const [discordGuildName, setDiscordGuildName] = useState<string>('');
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);

  // Modal State for channel selection popup
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [modalSelectedChannelId, setModalSelectedChannelId] = useState('');

  const fetchRoomSettings = async () => {
    setSettingsLoading(true);
    let targetRoomId = session?.id || localStorage.getItem('active_supabase_room_id');
    
    if (targetRoomId) {
      let { data: settingsData, error: settingsError } = await supabase
        .from('room_settings')
        .select('*')
        .eq('room_id', targetRoomId)
        .single();

      if (settingsError && settingsError.code === 'PGRST116') {
         const { data: newSettings } = await supabase
           .from('room_settings')
           .insert({ room_id: targetRoomId })
           .select()
           .single();
         settingsData = newSettings;
      }

      if (settingsData) {
        const merged = {
           ...settingsData,
           ...(settingsData.settings_json?.settings || {}),
           ...(settingsData.settings_json || {})
        };
        setRoomSettings(merged);
        if (merged.discordGuildId) {
          fetchDiscordChannels(merged.discordGuildId);
        }
      }
    }
    setSettingsLoading(false);
  };

  const fetchDiscordChannels = async (guildId: string) => {
    if (!guildId || !session?.id) return;
    setIsLoadingChannels(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}/discord_channels?guildId=${guildId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDiscordChannels(data.channels || []);
          if (data.guildName) {
            setDiscordGuildName(data.guildName);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar canais do Discord:', error);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const saveDiscordSettingsDirect = async (guildId: string, channelId: string) => {
    if (!session?.id || !guildId || !channelId) return;
    
    const currentSettingsJson = roomSettings?.settings_json || {};
    const updatedSettingsJson = {
      ...currentSettingsJson,
      settings: {
        ...(currentSettingsJson.settings || {}),
        discordEnabled: true,
        discordGuildId: guildId,
        discordChannelId: channelId,
        discordBotToken: roomSettings?.discordBotToken ?? '',
        discordClientId: roomSettings?.discordClientId ?? ''
      },
      discordEnabled: true,
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordBotToken: roomSettings?.discordBotToken ?? '',
      discordClientId: roomSettings?.discordClientId ?? ''
    };

    const { error } = await supabase
      .from('room_settings')
      .update({
        settings_json: updatedSettingsJson
      })
      .eq('room_id', session.id);

    if (!error) {
       // Notify state changes through WS
       socket.emit('update_settings', {
         domainMode: roomSettings?.domain_mode,
         domainWhitelist: roomSettings?.domain_whitelist || [],
         domainBlacklist: roomSettings?.domain_blacklist || [],
         requireFollower: roomSettings?.require_follower,
         requireSub: roomSettings?.require_sub,
         minFollowMinutes: roomSettings?.min_follow_minutes || ((roomSettings?.min_follow_days || 0) * 1440),
         isManualApprovalRequired: roomSettings?.isManualApprovalRequired,
         blockLiveStreams: roomSettings?.blockLiveStreams,
         videoRetentionHours: roomSettings?.video_retention_hours ?? 48,
         globalCooldownSeconds: roomSettings?.globalCooldownSeconds ?? 0,
         userCooldownSeconds: roomSettings?.cooldown_seconds ?? 0,
         maxSubmissionsPerHour: roomSettings?.maxSubmissionsPerHour ?? 0,
         maxVideosPerUser: roomSettings?.max_videos_per_user ?? 0,
         maxQueueSize: roomSettings?.max_queue_size ?? 0,
         discordEnabled: true,
         discordChannelId: channelId,
         discordGuildId: guildId
       });

       try {
         await fetch('/api/auth/discord/config', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             botToken: roomSettings?.discordBotToken || '',
             clientId: roomSettings?.discordClientId || '',
             roomId: session.id
           })
         });
       } catch (err) {
         console.error('Falha ao sincronizar serviço de bot do Discord em background:', err);
       }
    } else {
       console.error("Falha ao salvar config do Discord no BD:", error);
       alert("Erro ao sincronizar com o banco de dados: " + error.message);
    }
  };

  useEffect(() => {
    fetchRoomSettings();
  }, [session?.id, JSON.stringify(session?.settings || {})]);

  // Check for redirect-based incoming Discord auth pending in storage or URL
  useEffect(() => {
    const checkPendingDiscord = async () => {
      const pending = localStorage.getItem('discord_channel_select_pending');
      if (pending === 'true' && roomSettings?.discordGuildId) {
        localStorage.removeItem('discord_channel_select_pending');
        await fetchDiscordChannels(roomSettings.discordGuildId);
        setModalSelectedChannelId(roomSettings.discordChannelId || '');
        setShowChannelModal(true);
      }
    };
    checkPendingDiscord();
  }, [roomSettings?.discordGuildId]);

  // Listen to postMessage event for successful popup-based authentication
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Relax restrictive origin checks for non-sensitive local oauth redirects
      if (event.data?.type === 'DISCORD_AUTH_SUCCESS') {
        const { guildId, roomId } = event.data;
        if (roomId && roomId !== session.id) return; // Ignore messages from other sessions

        // Trigger direct linking of the discord guild for this session
        try {
          const res = await fetch(`/api/sessions/${session.id}/link_discord`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId })
          });
          const data = await res.json();
          if (data.success) {
            setRoomSettings((prev: any) => {
              if (!prev) return null;
              return {
                ...prev,
                discordEnabled: true,
                discordGuildId: guildId,
                discordChannelId: prev.discordChannelId || ''
              };
            });
            await fetchDiscordChannels(guildId);
            setModalSelectedChannelId('');
            setShowChannelModal(true);
          } else {
            console.error('Falha ao fazer link do discord:', data.error);
          }
        } catch (err) {
          console.error('Erro de API no link_discord:', err);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [session?.id, roomSettings?.room_id]);

  const handleConnectDiscord = async () => {
    if (!session?.id) {
      alert("Aguarde o carregamento das configurações.");
      return;
    }
    
    try {
      const response = await fetch(`/api/auth/discord/url?roomId=${session.id}`);
      if (!response.ok) {
        let errMsg = 'Falha ao obter URL de integração';
        try {
          const errData = await response.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      
      if (!data.success && data.errorType === 'MISSING_CONFIG') {
        alert("⚠️ Discord Bot não configurado no servidor!");
        return;
      }

      const targetUrl = data.url;

      if (targetUrl) {
        // Open with specified popup size to trigger standard popup window bounds
        const popup = window.open(targetUrl, 'discord_auth_popup', 'width=650,height=800,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes');
        
        if (popup) {
          let checkCount = 0;
          const timer = setInterval(async () => {
            checkCount++;
            
            let isClosed = false;
            try {
              isClosed = popup.closed;
            } catch (e) {
              // cross-origin DOM properties security block check, swallow safely
            }

            if (isClosed || checkCount > 150) {
              clearInterval(timer);
            }

            // Direct Supabase refresh checking while the popup is open/closed
            try {
              let targetRoomId = session.id;
              let { data: settingsData } = await supabase
                .from('room_settings')
                .select('*')
                .eq('room_id', targetRoomId)
                .single();

              if (settingsData) {
                const merged = {
                   ...settingsData,
                   ...(settingsData.settings_json?.settings || {}),
                   ...(settingsData.settings_json || {})
                };
                
                // If it successfully linked and shifted state
                if (merged.discordGuildId && merged.discordGuildId !== roomSettings?.discordGuildId) {
                  clearInterval(timer);
                  setRoomSettings(merged);
                  await fetchDiscordChannels(merged.discordGuildId);
                  setModalSelectedChannelId(merged.discordChannelId || '');
                  setShowChannelModal(true);
                }
              }
            } catch (dbErr) {
              console.error("Erro ao sincronizar após fechar popup:", dbErr);
            }
          }, 2000);
        }
      }
    } catch (err: any) {
      alert(`⚠️ Erro de Configuração:\n\n${err.message}`);
    }
  };

  const handleDisconnectDiscord = async () => {
    if (confirm("Deseja realmente remover a integração com o Discord?")) {
      const currentSettingsJson = roomSettings?.settings_json || {};
      const updatedSettingsJson = {
        ...currentSettingsJson,
        settings: {
          ...(currentSettingsJson.settings || {}),
          discordEnabled: false,
          discordGuildId: '',
          discordChannelId: ''
        },
        discordEnabled: false,
        discordGuildId: '',
        discordChannelId: ''
      };

      const { error } = await supabase
        .from('room_settings')
        .update({
          settings_json: updatedSettingsJson
        })
        .eq('room_id', session.id);

      if (!error) {
        setRoomSettings((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            discordEnabled: false,
            discordGuildId: '',
            discordChannelId: ''
          };
        });
        setDiscordChannels([]);
        setDiscordGuildName('');
        
        socket.emit('update_settings', {
          domainMode: roomSettings?.domain_mode,
          domainWhitelist: roomSettings?.domain_whitelist || [],
          domainBlacklist: roomSettings?.domain_blacklist || [],
          requireFollower: roomSettings?.require_follower,
          requireSub: roomSettings?.require_sub,
          minFollowMinutes: roomSettings?.min_follow_minutes || ((roomSettings?.min_follow_days || 0) * 1440),
          isManualApprovalRequired: roomSettings?.isManualApprovalRequired,
          blockLiveStreams: roomSettings?.blockLiveStreams,
          videoRetentionHours: roomSettings?.video_retention_hours ?? 48,
          globalCooldownSeconds: roomSettings?.globalCooldownSeconds ?? 0,
          userCooldownSeconds: roomSettings?.cooldown_seconds ?? 0,
          maxSubmissionsPerHour: roomSettings?.maxSubmissionsPerHour ?? 0,
          maxVideosPerUser: roomSettings?.max_videos_per_user ?? 0,
          maxQueueSize: roomSettings?.max_queue_size ?? 0,
          discordEnabled: false,
          discordChannelId: '',
          discordGuildId: ''
        });

        alert("Integração com o Discord removida.");
      }
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-550 font-mono text-xs uppercase tracking-wider h-64">
        <RefreshCw className="w-5 h-5 animate-spin text-orange-500 mb-3" />
        Sincronizando Módulos Discord...
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden text-zinc-400 animate-in fade-in" id="discord_view">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 border-b border-zinc-800 shrink-0 bg-black/80">
        <h1 className="text-2xl font-black text-white uppercase tracking-widest font-mono">
          DISCORD
        </h1>
        <div className="text-[9px] font-mono font-bold text-zinc-600 bg-[#5865F2]/5 px-3 py-1 rounded border border-[#5865F2]/20 uppercase tracking-widest self-start md:self-auto">
          MÁQUINA DO CHAT ATIVA
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 md:p-8 text-left">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Main card */}
      <div className="relative bg-[#0c0c0e] border-[1.5px] border-zinc-800 rounded-sm p-6 space-y-6 overflow-hidden shadow-2xl transition-all duration-300 hover:border-[#5865F2]/60 group">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
        <div className="absolute top-0 left-0 right-0 h-[1.8px] bg-gradient-to-r from-[#5865F2] to-[#5865F2]/20" />
        
        <div className="relative z-10 w-full">
        {!roomSettings?.discordGuildId ? (
          <div className="space-y-6 text-center py-10">
            <div className="w-16 h-16 rounded-full bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center mx-auto text-[#5865F2]">
              <Layers className="w-6 h-6" />
            </div>
            
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-zinc-100 font-extrabold uppercase text-xs font-mono tracking-wider">PASSO 1: VINCULAR DISCORD BOT</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">
                Conecte o bot oficial ao seu servidor em um clique. O bot passa a ouvir os canais de texto selecionados para extrair envios de YouTube/Twitch e consolidar no Host.
              </p>
            </div>

            <button
              type="button"
              onClick={handleConnectDiscord}
              className="bg-[#5865F2] hover:bg-[#4752C4] hover:shadow-[0_0_20px_rgba(88,101,242,0.35)] text-white px-8 py-3.5 rounded-sm font-extrabold uppercase tracking-widest text-[11px] flex items-center gap-2.5 transition-all cursor-pointer font-mono mx-auto h-12 border border-[#7289da]/30"
            >
              <Link className="w-4 h-4" /> VINCULAR BOT VIA OAUTH2
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Connected Confirmation Header box */}
            <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 text-left">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                  <CheckCircle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <p className="font-mono text-zinc-500 text-[9px] font-bold tracking-widest">SERVIDOR CONECTADO E TIRO ATIVO</p>
                  <p className="font-mono font-black text-sm text-zinc-200 mt-0.5 truncate uppercase">
                    {discordGuildName || `ID: ${roomSettings?.discordGuildId}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnectDiscord}
                className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-[9px] font-mono font-extrabold uppercase rounded-sm cursor-pointer flex items-center justify-center gap-1.5 self-start sm:self-auto uppercase tracking-wider"
              >
                <Trash2 className="w-3.5 h-3.5" /> REMOVER CONEXÃO
              </button>
            </div>

            {/* Target Channel Controls */}
            <div className="space-y-5 pt-3">
              <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer text-left">
                <input 
                  type="checkbox" 
                  checked={!!roomSettings?.discordEnabled} 
                  onChange={async (e) => {
                    const checkState = e.target.checked;
                    setRoomSettings((prev: any) => prev ? { ...prev, discordEnabled: checkState } : null);
                    
                    const currentSettingsJson = roomSettings?.settings_json || {};
                    const { error } = await supabase
                      .from('room_settings')
                      .update({
                        settings_json: {
                          ...currentSettingsJson,
                          settings: {
                            ...(currentSettingsJson.settings || {}),
                            discordEnabled: checkState
                          },
                          discordEnabled: checkState
                        }
                      })
                      .eq('room_id', session.id);
                    if (error) {
                      console.error('Falha ao alternar habilitação do Discord:', error);
                    }
                  }} 
                  className="mt-1 rounded bg-zinc-950 border-zinc-805 text-[#5865F2] focus:ring-[#5865F2]/20 w-4 h-4 cursor-pointer accent-[#5865F2]" 
                />
                <div className="flex flex-col">
                  <span className="font-bold text-zinc-200 group-hover:text-[#5865F2] transition-colors uppercase text-xs font-mono tracking-tight">Ativar Scanner do Bot no Servidor</span>
                  <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight mt-0.5">O robô passará a varrer mensagens recebidas no canal selecionado abaixo.</span>
                </div>
              </label>

              {roomSettings?.discordEnabled && (
                <div className="space-y-4 p-5 bg-[#09090a]/50 border border-zinc-820 rounded-sm text-left animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">
                      SELECIONE O CANAL DE CHAT DA ESCUTA
                    </label>

                    {isLoadingChannels ? (
                      <div className="flex items-center gap-2 text-zinc-500 font-mono text-[9px] uppercase py-3 bg-zinc-950 p-4 border border-zinc-900 rounded-sm">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5865F2]" />
                        Mapeando canais de texto...
                      </div>
                    ) : discordChannels.length > 0 ? (
                      <div className="flex gap-3">
                        <select
                          value={roomSettings?.discordChannelId || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setRoomSettings((prev: any) => prev ? { ...prev, discordChannelId: val } : null);
                            await saveDiscordSettingsDirect(roomSettings.discordGuildId, val);
                          }}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-2.5 text-zinc-200 focus:border-[#5865F2] outline-none text-xs font-mono font-bold h-11 cursor-pointer appearance-none transition-all relative z-20"
                        >
                          <option value="">-- SELECIONE O CANAL ALVO --</option>
                          {discordChannels.map(ch => (
                            <option key={ch.id} value={ch.id} className="bg-zinc-950 text-zinc-200">
                              #{ch.name.toUpperCase()}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => fetchDiscordChannels(roomSettings.discordGuildId)}
                          title="Sincronizar Canais"
                          className="bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 px-3.5 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-11 flex items-center justify-center h-11 relative z-20"
                        >
                          <RefreshCw className="w-4 h-4 hover:scale-105" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3.5 p-4.5 bg-red-500/5 border border-red-500/20 rounded-sm relative z-20">
                        <p className="text-[10px] text-amber-500 font-extrabold font-mono uppercase">⚠️ NENHUM CANAL ACESSÍVEL MAQUEADO</p>
                        <p className="text-[10px] text-zinc-550 font-mono uppercase leading-normal">O robô não tem privilégios de leitura (READ_MESSAGES) ou não há canais de chat válidos no servidor.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fetchDiscordChannels(roomSettings.discordGuildId)}
                            className="bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-300 px-3.5 py-2 text-[9px] uppercase font-mono rounded font-black cursor-pointer transition-colors"
                          >
                            RECARREGAR CANAIS
                          </button>
                          <button
                            type="button"
                            onClick={handleConnectDiscord}
                            className="bg-[#5865F2]/15 hover:bg-[#5865F2]/25 text-[#9fa8f5] px-3.5 py-2 text-[9px] uppercase font-mono rounded font-black cursor-pointer transition-colors"
                          >
                            REBOTAR INTEGRACAO
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}
        </div>

        {/* Discord color skewed bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-10 flex -skew-x-[20deg] scale-125 mb-[-4px] ml-[-10px] opacity-90 pointer-events-none z-0">
          <div className="flex-1 bg-[#1a1e4a]"></div>
          <div className="flex-1 bg-[#282f75]"></div>
          <div className="flex-1 bg-[#3741a3]"></div>
          <div className="flex-1 bg-[#4752c4]"></div>
          <div className="flex-1 bg-[#5865f2]"></div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] opacity-40 z-10 pointer-events-none mb-[-4px]"></div>
      </div>

      {/* Discord Channel Selector Modal Popup */}
      {showChannelModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0a0a0c] border border-zinc-800 rounded-sm p-6 max-w-md w-[90%] shadow-2xl relative space-y-6 text-left">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#5865F2]/60" />
            
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#5865F2]/10 rounded border border-[#5865F2]/25 text-[#5865F2]">
                  <Layers className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-zinc-150 font-black uppercase tracking-wider text-xs font-mono">
                    VINCULAR CANAL ALVO
                  </h3>
                  <p className="text-[9px] text-[#818cf8] font-mono uppercase tracking-tight mt-0.5">
                    DEFINA A RECEPTORIA OPERACIONAL DO ROBÔ
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowChannelModal(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase font-black rounded-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                SUCESSO: CONEXÃO COM O BOT DETECTADA!
              </div>

              <p className="text-[10px] text-zinc-500 leading-normal font-mono uppercase">
                Escolha abaixo o canal onde os espectadores vão enviar os links de vídeo. O bot lerá esse canal em tempo real.
              </p>

              {isLoadingChannels ? (
                <div className="flex items-center justify-center gap-2 text-zinc-500 font-mono text-[9px] uppercase py-8 bg-zinc-950 border border-zinc-900 rounded-sm">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5865F2]" />
                  MAPEANDO AUDIO CANAIS...
                </div>
              ) : discordChannels.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-zinc-550 font-mono uppercase text-[9px] font-bold tracking-widest">
                    CANAIS DISPONÍVEIS
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={modalSelectedChannelId}
                      onChange={e => setModalSelectedChannelId(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-sm px-3.5 py-2 text-zinc-250 focus:border-[#5865F2] outline-none text-xs font-mono font-bold h-11 cursor-pointer"
                    >
                      <option value="">-- ESCOLHA UM CANAL --</option>
                      {discordChannels.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          #{ch.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => fetchDiscordChannels(roomSettings?.discordGuildId)}
                      title="Sincronizar Canais"
                      className="bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 p-2 rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-11 flex items-center justify-center"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded text-center space-y-3">
                  <p className="text-[10px] text-red-400 font-mono uppercase font-bold">⚠️ NENHUM CANAL ACESSÍVEL MAQUEADO</p>
                  <p className="text-[9px] text-zinc-500 leading-normal font-mono uppercase">
                    O robô precisa de permissões para ver canais e ler mensagens do servidor selecionado.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectDiscord}
                    className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-3.5 py-1.5 text-[9px] uppercase font-mono rounded font-black cursor-pointer transition-colors"
                  >
                    Reautorizar Bot
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-900/80">
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-750 text-zinc-500 hover:text-zinc-300 text-[10px] font-mono font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                disabled={isLoadingChannels || !modalSelectedChannelId}
                onClick={async () => {
                  if (!modalSelectedChannelId) return;
                  setRoomSettings((prev: any) => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      discordChannelId: modalSelectedChannelId,
                      discordEnabled: true
                    };
                  });
                  await saveDiscordSettingsDirect(roomSettings?.discordGuildId, modalSelectedChannelId);
                  setShowChannelModal(false);
                  alert("🎉 Integração Discord com o canal #" + (discordChannels.find(c => c.id === modalSelectedChannelId)?.name || 'selecionado') + " ativada com sucesso!");
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-[10px] font-mono font-black uppercase tracking-wider rounded-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" /> VINCULAR CANAL
              </button>
            </div>

          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
