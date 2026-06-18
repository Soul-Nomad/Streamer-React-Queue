import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { Settings, Save, ShieldCheck, Layers, Award, Compass, History, Link, RefreshCw, Trash2, CheckCircle, MessageSquare, X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsView({ session }: { session: SessionState }) {
  const [roomSettings, setRoomSettings] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [discordChannels, setDiscordChannels] = useState<{ id: string; name: string }[]>([]);
  const [discordGuildName, setDiscordGuildName] = useState<string>('');
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);

  // Modal State for channel selection popup
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [modalSelectedChannelId, setModalSelectedChannelId] = useState('');

  const fetchDiscordChannels = async (guildId: string) => {
    if (!guildId || !roomSettings?.room_id) return;
    setIsLoadingChannels(true);
    try {
      const response = await fetch(`/api/sessions/${roomSettings.room_id}/discord_channels`);
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
    if (!roomSettings?.room_id || !guildId || !channelId) return;
    
    // Explicitly update settings_json dynamically containing custom keys
    const currentSettingsJson = roomSettings.settings_json || {};
    const updatedSettingsJson = {
      ...currentSettingsJson,
      settings: {
        ...(currentSettingsJson.settings || {}),
        discordEnabled: true,
        discordGuildId: guildId,
        discordChannelId: channelId,
        discordBotToken: roomSettings.discordBotToken ?? '',
        discordClientId: roomSettings.discordClientId ?? ''
      },
      discordEnabled: true,
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordBotToken: roomSettings.discordBotToken ?? '',
      discordClientId: roomSettings.discordClientId ?? ''
    };

    const { error } = await supabase
      .from('room_settings')
      .update({
        settings_json: updatedSettingsJson
      })
      .eq('room_id', roomSettings.room_id);

    if (!error) {
       socket.emit('update_settings', {
         domainMode: roomSettings.domain_mode,
         domainWhitelist: roomSettings.domain_whitelist || [],
         domainBlacklist: roomSettings.domain_blacklist || [],
         requireFollower: roomSettings.require_follower,
         requireSub: roomSettings.require_sub,
         minFollowMinutes: roomSettings.min_follow_minutes || ((roomSettings.min_follow_days || 0) * 1440),
         isManualApprovalRequired: roomSettings.isManualApprovalRequired,
         blockLiveStreams: roomSettings.blockLiveStreams,
         videoRetentionHours: roomSettings.video_retention_hours ?? 48,
         globalCooldownSeconds: roomSettings.globalCooldownSeconds ?? 0,
         userCooldownSeconds: roomSettings.cooldown_seconds ?? 0,
         maxSubmissionsPerHour: roomSettings.maxSubmissionsPerHour ?? 0,
         maxVideosPerUser: roomSettings.max_videos_per_user ?? 0,
         maxQueueSize: roomSettings.max_queue_size ?? 0,
         discordEnabled: true,
         discordChannelId: channelId,
         discordGuildId: guildId
       });

       try {
         await fetch('/api/auth/discord/config', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             botToken: roomSettings.discordBotToken || '',
             clientId: roomSettings.discordClientId || '',
             roomId: roomSettings.room_id
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
    if (roomSettings?.discordGuildId) {
      fetchDiscordChannels(roomSettings.discordGuildId);
    } else {
      setDiscordChannels([]);
      setDiscordGuildName('');
    }
  }, [roomSettings?.discordGuildId, roomSettings?.room_id]);

  // Check for redirect-based incoming Discord auth
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }
      
      if (event.data?.type === 'DISCORD_AUTH_SUCCESS') {
        const { guildId, channelId } = event.data;
        setRoomSettings(prev => {
          if (!prev) return null;
          return {
            ...prev,
            discordEnabled: true,
            discordGuildId: guildId,
            discordChannelId: channelId || prev.discordChannelId || ''
          };
        });
        
        setModalSelectedChannelId(channelId || '');
        fetchDiscordChannels(guildId);
        setShowChannelModal(true);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [roomSettings?.room_id]);

  const handleConnectDiscord = async () => {
    if (!roomSettings?.room_id) {
      alert("Aguarde o carregamento das configurações.");
      return;
    }
    
    try {
      const response = await fetch(`/api/auth/discord/url?roomId=${roomSettings.room_id}`);
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
        window.open(targetUrl, '_blank');
      }
    } catch (err: any) {
      alert(`⚠️ Erro de Configuração:\n\n${err.message}`);
    }
  };

  const handleDisconnectDiscord = () => {
    if (confirm("Deseja realmente remover a integração com o Discord?")) {
      setRoomSettings(prev => {
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
    }
  };

  useEffect(() => {
    if (session?.id) {
      fetchRoomSettings();
    }
  }, [session?.id]);

  const fetchRoomSettings = async () => {
    setSettingsLoading(true);
    let targetRoomId = localStorage.getItem('active_supabase_room_id');
    
    const { data: userData } = await supabase.auth.getUser();
    
    if (userData?.user) {
      if (!targetRoomId) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('id')
          .eq('owner_id', userData.user.id)
          .single();
        if (roomData?.id) {
          targetRoomId = roomData.id;
          localStorage.setItem('active_supabase_room_id', roomData.id);
        }
      }

      if (targetRoomId) {
        localStorage.setItem('active_room_id', targetRoomId);
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
          
          if (merged.maxSubmissionsPerHour === undefined) merged.maxSubmissionsPerHour = 0;
          if (merged.cooldown_seconds === undefined) merged.cooldown_seconds = 0;
          
          setRoomSettings(merged);
          
          socket.emit('update_settings', {
            domainMode: merged.domain_mode,
            domainWhitelist: merged.domain_whitelist || [],
            domainBlacklist: merged.domain_blacklist || [],
            requireFollower: merged.require_follower,
            requireSub: merged.require_sub,
            minFollowMinutes: merged.min_follow_minutes || ((merged.min_follow_days || 0) * 1440),
            isManualApprovalRequired: merged.isManualApprovalRequired,
            blockLiveStreams: merged.blockLiveStreams,
            globalCooldownSeconds: merged.globalCooldownSeconds ?? 0,
            userCooldownSeconds: merged.cooldown_seconds ?? 0,
            maxSubmissionsPerHour: merged.maxSubmissionsPerHour ?? 0
          });
        }
      }
    }
    setSettingsLoading(false);
  };

  const handleSaveSettings = async () => {
    if (!roomSettings?.room_id) return;
    setSettingsSaving(true);
    
    // Explicit keys for mapped DB columns
    const validKeys = [
      'require_sub', 'require_follower', 'min_follow_days', 'min_account_age_days',
      'max_videos_per_user', 'max_queue_size', 'cooldown_seconds', 'weight_tier_1',
      'weight_tier_2', 'weight_tier_3', 'weight_mod', 'weight_vip', 
      'channel_point_reward_id', 'auto_approve_subs', 'auto_approve_mods',
      'domain_mode', 'domain_whitelist', 'domain_blacklist'
    ];

    const updatePayload: any = {};

    Object.keys(roomSettings).forEach(key => {
      if (key === 'room_id' || key === 'id' || key === 'created_at' || key === 'updated_at' || key === 'settings_json') return;
      if (validKeys.includes(key)) {
         updatePayload[key] = roomSettings[key];
      }
    });

    // Populate and persist settings_json dynamically containing any custom keys
    const currentSettingsJson = roomSettings.settings_json || {};
    const updatedSettingsJson = {
      ...currentSettingsJson,
      settings: {
        ...(currentSettingsJson.settings || {}),
        isManualApprovalRequired: roomSettings.isManualApprovalRequired,
        blockLiveStreams: roomSettings.blockLiveStreams,
        globalCooldownSeconds: roomSettings.globalCooldownSeconds ?? 0,
        videoRetentionHours: roomSettings.video_retention_hours ?? 48,
        maxSubmissionsPerHour: roomSettings.maxSubmissionsPerHour ?? 0,
        discordEnabled: roomSettings.discordEnabled ?? false,
        discordGuildId: roomSettings.discordGuildId ?? '',
        discordChannelId: roomSettings.discordChannelId ?? '',
        discordBotToken: roomSettings.discordBotToken ?? '',
        discordClientId: roomSettings.discordClientId ?? ''
      },
      isManualApprovalRequired: roomSettings.isManualApprovalRequired,
      blockLiveStreams: roomSettings.blockLiveStreams,
      globalCooldownSeconds: roomSettings.globalCooldownSeconds ?? 0,
      videoRetentionHours: roomSettings.video_retention_hours ?? 48,
      maxSubmissionsPerHour: roomSettings.maxSubmissionsPerHour ?? 0,
      discordEnabled: roomSettings.discordEnabled ?? false,
      discordGuildId: roomSettings.discordGuildId ?? '',
      discordChannelId: roomSettings.discordChannelId ?? '',
      discordBotToken: roomSettings.discordBotToken ?? '',
      discordClientId: roomSettings.discordClientId ?? ''
    };

    updatePayload.settings_json = updatedSettingsJson;

    const { error } = await supabase
      .from('room_settings')
      .update(updatePayload)
      .eq('room_id', roomSettings.room_id);
    
    if (!error) {
       socket.emit('update_settings', {
         domainMode: roomSettings.domain_mode,
         domainWhitelist: roomSettings.domain_whitelist || [],
         domainBlacklist: roomSettings.domain_blacklist || [],
         requireFollower: roomSettings.require_follower,
         requireSub: roomSettings.require_sub,
         minFollowMinutes: roomSettings.min_follow_minutes || ((roomSettings.min_follow_days || 0) * 1440),
         isManualApprovalRequired: roomSettings.isManualApprovalRequired,
         blockLiveStreams: roomSettings.blockLiveStreams,
         videoRetentionHours: roomSettings.video_retention_hours ?? 48,
         globalCooldownSeconds: roomSettings.globalCooldownSeconds ?? 0,
         userCooldownSeconds: roomSettings.cooldown_seconds ?? 0,
         maxSubmissionsPerHour: roomSettings.maxSubmissionsPerHour ?? 0, // 0 = unlimited
         maxVideosPerUser: roomSettings.max_videos_per_user ?? 0,
         maxQueueSize: roomSettings.max_queue_size ?? 0,
         discordEnabled: roomSettings.discordEnabled ?? false,
         discordChannelId: roomSettings.discordChannelId ?? "",
         discordGuildId: roomSettings.discordGuildId ?? ""
       });

       // Trigger dynamic server-side discord hot-reload if credentials exist
       try {
         await fetch('/api/auth/discord/config', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             botToken: roomSettings.discordBotToken || '',
             clientId: roomSettings.discordClientId || '',
             roomId: roomSettings.room_id
           })
         });
       } catch (err) {
         console.error('Falha ao sincronizar serviço de bot do Discord em background:', err);
       }

       alert("Configurações salvas e aplicadas com sucesso!");
    } else {
       console.error("Falha ao salvar:", error);
       alert("Erro ao salvar: " + (error.message || "Verifique o console"));
    }
    setSettingsSaving(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden text-zinc-400 animate-in fade-in" id="settings_view">
        <div className="flex-1 flex flex-col min-h-0 text-left p-6 overflow-y-auto w-full">
          <div className="mb-8 border-b border-zinc-800 pb-5 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-black text-orange-400 uppercase tracking-widest font-mono">
                  Configurações do Workspace
                </h2>
              </div>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight">Configure políticas de segurança, restrições e integrações de API.</p>
            </div>
            <button 
              onClick={handleSaveSettings}
              disabled={settingsSaving || !roomSettings}
              className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-[10px] flex items-center gap-2 transition-all disabled:opacity-30 cursor-pointer font-mono"
            >
              {settingsSaving ? 'SINCRONIZANDO...' : <><Save className="w-3.5 h-3.5"/> SALVAR POLÍTICAS</>}
            </button>
          </div>
          
          {settingsLoading ? (
              <div className="text-center py-20 text-zinc-600 font-mono text-xs animate-pulse uppercase tracking-widest">Acessando banco de dados remoto...</div>
          ) : !roomSettings ? (
              <div className="text-center py-20 text-red-500 font-mono text-xs uppercase border border-red-500/20 bg-red-500/5 rounded">Erro: Falha de autenticação ou sala não localizada.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-xs w-full">
              {/* Left Column: Security & Basics */}
              <div className="space-y-8">
                
                <section className="space-y-5">
                  <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Protocolos de Segurança</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 text-zinc-300 group cursor-pointer">
                      <input type="checkbox" checked={!!roomSettings.isManualApprovalRequired} onChange={e => setRoomSettings({...roomSettings, isManualApprovalRequired: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500 w-4 h-4" />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors">Moderação Manual Obrigatória</span>
                        <span className="text-[10px] text-zinc-500 leading-relaxed font-mono">Todos os envios ficarão pendentes até sua aprovação expressa.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 text-zinc-300 group cursor-pointer">
                      <input type="checkbox" checked={!!roomSettings.blockLiveStreams} onChange={e => setRoomSettings({...roomSettings, blockLiveStreams: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500 w-4 h-4" />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors">Bloquear Transmissões Ao Vivo</span>
                        <span className="text-[10px] text-zinc-500 leading-relaxed font-mono">Impede o envio de links de lives (YouTube Live/Twitch).</span>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Retenção de Fila (Hrs)</label>
                      <input 
                        type="number" min="1" max="48"
                        value={roomSettings.video_retention_hours ?? 48} 
                        onChange={e => setRoomSettings({...roomSettings, video_retention_hours: Math.min(48, Math.max(1, parseInt(e.target.value) || 48))})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Limite Global / Hora</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.maxSubmissionsPerHour ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, maxSubmissionsPerHour: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Cooldown Workspace (s)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.globalCooldownSeconds ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, globalCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Cooldown Usuário (s)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.cooldown_seconds ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, cooldown_seconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Tamanho Máx. da Fila</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.max_queue_size ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, max_queue_size: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Máx Mídias / User</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.max_videos_per_user ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, max_videos_per_user: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                   <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <History className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Filtro de Origem (Links)</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Modo de Validação</label>
                      <select 
                        value={roomSettings.domain_mode || "both"} 
                        onChange={e => setRoomSettings({...roomSettings, domain_mode: e.target.value})} 
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-100 outline-none font-mono text-xs cursor-pointer focus:border-orange-500 h-10"
                      >
                        <option value="both">Híbrido (Whitelist + Blacklist)</option>
                        <option value="whitelist_only">Estrito (Apenas Whitelist)</option>
                        <option value="blacklist_only">Livre (Apenas Blacklist)</option>
                      </select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Whitelist (Permitidos)</label>
                      <input 
                        type="text" 
                        value={(roomSettings.domain_whitelist || ["youtube.com", "youtu.be", "twitch.tv", "clips.twitch.tv", "tiktok.com", "vm.tiktok.com", "instagram.com", "x.com", "twitter.com", "reddit.com"]).join(", ")} 
                        onChange={e => setRoomSettings({...roomSettings, domain_whitelist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                        placeholder="youtube.com, tiktok.com" 
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-100 outline-none font-mono text-xs focus:border-orange-500" 
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-wider">Blacklist (Bloqueados)</label>
                      <input 
                        type="text" 
                        value={(roomSettings.domain_blacklist || []).join(", ")} 
                        onChange={e => setRoomSettings({...roomSettings, domain_blacklist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                        placeholder="bit.ly, link-fraudulento.com" 
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-100 outline-none font-mono text-xs focus:border-orange-500" 
                      />
                    </div>
                  </div>
                </section>

              </div>
              
              {/* Right Column: Twitch Integrations */}
              <div className="space-y-8">
                
                <section className="space-y-5">
                  <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Restrições Twitch Chat</h3>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer">
                      <input type="checkbox" checked={!!roomSettings.require_follower} onChange={e => setRoomSettings({...roomSettings, require_follower: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500 w-4 h-4" />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors">Somente Seguidores</span>
                        <span className="text-[10px] text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">Obrigatório seguir seu canal para interagir.</span>
                      </div>
                    </label>
                    
                    {roomSettings.require_follower && (
                        <div className="ml-8 space-y-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-sm">
                          <div className="space-y-2">
                            <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest leading-none">Tempo Mínimo de Follow</label>
                            <select 
                              value={(() => {
                                const min = roomSettings.min_follow_minutes !== undefined ? roomSettings.min_follow_minutes : ((roomSettings.min_follow_days || 0) * 1440);
                                if (min === 0) return "0";
                                if (min === 10) return "10";
                                if (min === 30) return "30";
                                if (min === 60) return "60";
                                if (min === 1440) return "1440";
                                if (min === 10080) return "10080";
                                return "custom";
                              })()}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === "custom") {
                                  const currentVal = roomSettings.min_follow_minutes !== undefined ? roomSettings.min_follow_minutes : ((roomSettings.min_follow_days || 0) * 1440);
                                  const targetVal = currentVal === 0 ? 1440 : currentVal;
                                  setRoomSettings({
                                    ...roomSettings,
                                    min_follow_minutes: targetVal,
                                    min_follow_days: Math.floor(targetVal / 1440)
                                  });
                                } else {
                                  const min = parseInt(val);
                                  setRoomSettings({
                                    ...roomSettings,
                                    min_follow_minutes: min,
                                    min_follow_days: Math.floor(min / 1440)
                                  });
                                }
                              }}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2.5 text-zinc-100 focus:border-orange-500 outline-none text-xs font-bold font-mono"
                            >
                              <option value="0">SEGUIDOR IMEDIATO</option>
                              <option value="10">MÍNIMO 10 MINUTOS</option>
                              <option value="30">MÍNIMO 30 MINUTOS</option>
                              <option value="60">MÍNIMO 1 HORA</option>
                              <option value="1440">MÍNIMO 1 DIA</option>
                              <option value="10080">MÍNIMO 1 SEMANA</option>
                              <option value="custom">CUSTOMIZADO</option>
                            </select>
                          </div>
                        </div>
                    )}

                    <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer pt-2">
                      <input type="checkbox" checked={!!roomSettings.require_sub} onChange={e => setRoomSettings({...roomSettings, require_sub: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500 w-4 h-4" />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors">Somente Inscritos (Subs)</span>
                        <span className="text-[10px] text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">Cria uma fila exclusiva para quem possui sub ativo.</span>
                      </div>
                    </label>

                    <div className="h-px bg-zinc-800/60 my-6"></div>

                    <label className="flex items-start gap-4 text-zinc-400 group cursor-pointer italic">
                      <input type="checkbox" checked={roomSettings.auto_approve_subs !== false} onChange={e => setRoomSettings({...roomSettings, auto_approve_subs: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-800 text-emerald-500 focus:ring-emerald-500 w-4 h-4 opacity-50" />
                      <div className="flex flex-col">
                        <span className="text-xs transition-colors">Whitelist Automática: Inscritos (Subs)</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-4 text-zinc-400 group cursor-pointer italic">
                      <input type="checkbox" checked={roomSettings.auto_approve_mods !== false} onChange={e => setRoomSettings({...roomSettings, auto_approve_mods: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-800 text-emerald-500 focus:ring-emerald-500 w-4 h-4 opacity-50" />
                      <div className="flex flex-col">
                        <span className="text-xs transition-colors">Whitelist Automática: Moderadores (Mods)</span>
                      </div>
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                   <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <Award className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Pontos de Canal (Edge System)</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer">
                      <input type="checkbox" checked={!!roomSettings.require_channel_points} onChange={e => setRoomSettings({...roomSettings, require_channel_points: e.target.checked})} className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500 w-4 h-4" />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors">Vincular Recompensa Customizada</span>
                        <span className="text-[10px] text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">O vídeo só entra na fila se houver resgate de pontos.</span>
                      </div>
                    </label>
                    
                    {roomSettings.require_channel_points && (
                        <div className="ml-8 space-y-2 p-4 bg-zinc-900 border border-zinc-800 rounded-sm">
                          <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Twitch Reward UUID</label>
                          <input 
                            type="text" 
                            value={roomSettings.channel_point_reward_id || ''} 
                            onChange={e => setRoomSettings({...roomSettings, channel_point_reward_id: e.target.value.trim()})}
                            placeholder="ex: a1b2c3d4-..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-orange-500 outline-none text-xs font-mono font-bold"
                          />
                        </div>
                    )}
                  </div>
                </section>

                <section className="space-y-5">
                   <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <Layers className="w-3.5 h-3.5 text-[#5865F2]" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Integração com o Discord</h3>
                  </div>
                  
                  <div className="space-y-4 border border-zinc-800/80 bg-zinc-950/40 p-4 rounded-md">
                    {!roomSettings.discordGuildId ? (
                      <div className="space-y-4">
                        <p className="text-[10px] text-zinc-400 leading-relaxed font-mono uppercase tracking-tight">
                          Integre seu servidor do Discord com 1 clique para capturar links de vídeos enviados no chat de texto.
                        </p>
                        
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={() => handleConnectDiscord()}
                            className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-3 py-2.5 rounded font-bold uppercase tracking-wider text-[9px] flex items-center justify-center gap-1.5 transition-all cursor-pointer font-mono h-10 w-full"
                          >
                            <Link className="w-3.5 h-3.5" /> Conectar Bot via OAuth2
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 bg-[#5865F2]/10 border border-[#5865F2]/20 p-3 rounded text-[#a5b4fc]">
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-xs uppercase font-mono">Servidor Integrado</p>
                            <p className="text-[10px] text-[#818cf8] truncate font-mono">{discordGuildName || `Servidor {ID: ${roomSettings.discordGuildId}}`}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDisconnectDiscord}
                            title="Desconectar Servidor"
                            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer pt-1">
                          <input 
                            type="checkbox" 
                            checked={!!roomSettings.discordEnabled} 
                            onChange={e => setRoomSettings({...roomSettings, discordEnabled: e.target.checked})} 
                            className="mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-[#5865F2] focus:ring-[#5865F2] w-4 h-4 cursor-pointer" 
                          />
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-zinc-200 group-hover:text-[#5865F2] transition-colors">Ativar Captura do Discord</span>
                            <span className="text-[10px] text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">O robô processará links enviados no canal selecionado abaixo.</span>
                          </div>
                        </label>
                        
                        {roomSettings.discordEnabled && (
                          <div className="space-y-3 pt-2">
                            {isLoadingChannels ? (
                              <div className="flex items-center gap-2 text-zinc-500 font-mono text-[9px] uppercase tracking-wider py-1">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5865F2]" />
                                Carregando canais de texto...
                              </div>
                            ) : discordChannels.length > 0 ? (
                              <div className="space-y-1.5">
                                <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Canal de Chat do Discord</label>
                                <div className="flex gap-2">
                                  <select
                                    value={roomSettings.discordChannelId || ''}
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      setRoomSettings({...roomSettings, discordChannelId: val});
                                      await saveDiscordSettingsDirect(roomSettings.discordGuildId, val);
                                    }}
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-2 text-zinc-100 focus:border-[#5865F2] outline-none text-xs font-mono font-bold"
                                  >
                                    <option value="">-- Selecione o canal de recebimento --</option>
                                    {discordChannels.map(ch => (
                                      <option key={ch.id} value={ch.id}>
                                        #{ch.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => fetchDiscordChannels(roomSettings.discordGuildId)}
                                    title="Sincronizar Canais"
                                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 p-2 rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2 p-3 bg-zinc-900/60 border border-zinc-800 rounded">
                                <p className="text-[10px] text-amber-500 font-bold font-mono uppercase">⚠️ Nenhum canal encontrado</p>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase leading-normal">O robô não tem permissão para visualizar canais ou não está no servidor correto.</p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => fetchDiscordChannels(roomSettings.discordGuildId)}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 text-[9px] uppercase font-mono rounded cursor-pointer"
                                  >
                                    Tentar Sincronizar Canais
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConnectDiscord()}
                                    className="bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-[#818cf8] px-3 py-1.5 text-[9px] uppercase font-mono rounded cursor-pointer"
                                  >
                                    Reautorizar Bot
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-5">
                   <div className="flex items-center gap-2 border-b border-zinc-800/50 pb-2 mb-4">
                    <Compass className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Pesos de Priorização (Score)</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                       <label className="flex items-center gap-2 text-xs text-zinc-400">
                          <input type="checkbox" checked={!!roomSettings.priority_subs} onChange={e => setRoomSettings({...roomSettings, priority_subs: e.target.checked})} className="rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 w-3.5 h-3.5" />
                          <span>Priorizar Subs</span>
                       </label>
                       <label className="flex items-center gap-2 text-xs text-zinc-400">
                          <input type="checkbox" checked={!!roomSettings.priority_vips} onChange={e => setRoomSettings({...roomSettings, priority_vips: e.target.checked})} className="rounded-sm bg-zinc-900 border-zinc-700 text-orange-500 w-3.5 h-3.5" />
                          <span>Priorizar VIPs</span>
                       </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center justify-between border border-zinc-800 bg-zinc-900/40 px-3 py-2 rounded-sm">
                        <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase">PESO MOD</span>
                        <input type="number" value={roomSettings.weight_mod ?? 50} onChange={e => setRoomSettings({...roomSettings, weight_mod: parseInt(e.target.value) || 0})} className="w-10 bg-transparent text-right font-bold text-orange-400 outline-none text-xs" />
                      </div>
                      <div className="flex items-center justify-between border border-zinc-800 bg-zinc-900/40 px-3 py-2 rounded-sm">
                        <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase">PESO VIP</span>
                        <input type="number" value={roomSettings.weight_vip ?? 15} onChange={e => setRoomSettings({...roomSettings, weight_vip: parseInt(e.target.value) || 0})} className="w-10 bg-transparent text-right font-bold text-orange-400 outline-none text-xs" />
                      </div>
                    </div>
                  </div>
                </section>

              </div>
            </div>
          )}
        </div>

        {/* Discord Channel Selector Modal Popup */}
        {showChannelModal && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c0a09] border border-zinc-800 rounded p-6 max-w-md w-[90%] shadow-2xl relative space-y-6 text-left">
              
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#5865F2]/10 rounded border border-[#5865F2]/20 text-[#5865F2]">
                    <Layers className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-xs font-mono">
                      Vincular Canal de Chat
                    </h3>
                    <p className="text-[9px] text-[#818cf8] font-mono uppercase tracking-tight mt-0.5">
                      Defina o canal de escuta do robô
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowChannelModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-sm hover:bg-zinc-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[11px] text-zinc-400 leading-relaxed uppercase font-mono">
                  Seu servidor do Discord foi conectado com sucesso de forma automatizada!
                </p>
                <p className="text-[10px] text-zinc-500 leading-normal font-mono">
                  Escolha o canal de texto onde os espectadores vão postar os links dos vídeos. O bot processará os envios em tempo real.
                </p>

                {isLoadingChannels ? (
                  <div className="flex items-center justify-center gap-2 text-zinc-500 font-mono text-[9px] uppercase py-8 bg-zinc-900/40 border border-zinc-900 rounded">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#5865F2]" />
                    Carregando canais de texto...
                  </div>
                ) : discordChannels.length > 0 ? (
                  <div className="space-y-2">
                    <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">
                      CANAIS DE TEXTO DISPONÍVEIS
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={modalSelectedChannelId}
                        onChange={e => setModalSelectedChannelId(e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:border-[#5865F2] outline-none text-xs font-mono font-bold h-10 cursor-pointer"
                      >
                        <option value="">-- Escolha um Canal --</option>
                        {discordChannels.map(ch => (
                          <option key={ch.id} value={ch.id}>
                            #{ch.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => fetchDiscordChannels(roomSettings?.discordGuildId)}
                        title="Sincronizar Canais"
                        className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 p-2 rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-10 flex items-center justify-center"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded text-center space-y-3">
                    <p className="text-[10px] text-red-400 font-mono uppercase font-bold">⚠️ Nenhum canal acessível encontrado</p>
                    <p className="text-[9px] text-zinc-500 leading-normal font-mono uppercase">
                      O robô precisa de permissões para ler e ver canais de texto.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleConnectDiscord()}
                      className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-3 py-1.5 text-[9px] uppercase font-mono rounded font-bold cursor-pointer transition-colors"
                    >
                      Reautorizar Bot
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isLoadingChannels || !modalSelectedChannelId}
                  onClick={async () => {
                    if (!modalSelectedChannelId) return;
                    setRoomSettings(prev => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        discordChannelId: modalSelectedChannelId,
                        discordEnabled: true
                      };
                    });
                    await saveDiscordSettingsDirect(roomSettings?.discordGuildId, modalSelectedChannelId);
                    setShowChannelModal(false);
                    alert("🎉 Integração Discord ativada com sucesso!");
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-[10px] font-mono font-black uppercase tracking-wider rounded-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Vincular Canal
                </button>
              </div>

            </div>
          </div>
        )}
     </div>
  );
}
