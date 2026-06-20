import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { Settings, Save, ShieldCheck, Layers, Award, Compass, History, Link, RefreshCw, Trash2, CheckCircle, MessageSquare, X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsView({ session }: { session: SessionState }) {
  const [roomSettings, setRoomSettings] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

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
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 border-b border-zinc-800 shrink-0 bg-black/80">
        <h1 className="text-2xl font-black text-white uppercase tracking-widest font-mono">
          CONFIGURAÇÃO
        </h1>
        <button 
          onClick={handleSaveSettings}
          disabled={settingsSaving || !roomSettings}
          className="bg-orange-600 hover:bg-orange-500 hover:shadow-[0_0_15px_rgba(234,88,12,0.25)] text-white px-5 py-2.5 rounded-sm font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-2 transition-all disabled:opacity-30 cursor-pointer font-mono"
        >
          {settingsSaving ? 'SINCRONIZANDO...' : <><Save className="w-3.5 h-3.5"/> SALVAR MODIFICAÇÕES</>}
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 text-left p-6 md:p-8 overflow-y-auto w-full">
          
          {settingsLoading ? (
              <div className="text-center py-20 text-zinc-650 font-mono text-xs animate-pulse uppercase tracking-widest">Acessando banco de dados remoto...</div>
          ) : !roomSettings ? (
              <div className="text-center py-20 text-red-500 font-mono text-xs uppercase border border-red-500/20 bg-red-500/5 rounded">Erro: Falha de autenticação ou sala não localizada.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs w-full max-w-7xl mx-auto pb-16">
              
              {/* Left Column: Security Protocols & Filter of Links */}
              <div className="space-y-8">
                
                {/* CARD 1: Protocolos de Segurança */}
                <div className="relative bg-[#0d0d0e] border border-zinc-800 rounded-sm p-6 shadow-xl space-y-5 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 to-orange-500" />
                  
                  <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4">
                    <ShieldCheck className="w-4 h-4 text-red-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Protocolos de Segurança</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 text-zinc-300 group cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!roomSettings.isManualApprovalRequired} 
                        onChange={e => setRoomSettings({...roomSettings, isManualApprovalRequired: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer" 
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors uppercase text-[11px] font-mono">Moderação Manual Obrigatória</span>
                        <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight">Todos os mídias enviadas ficarão suspensas pendentes de aprovação sênior.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 text-zinc-300 group cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!roomSettings.blockLiveStreams} 
                        onChange={e => setRoomSettings({...roomSettings, blockLiveStreams: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer" 
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors uppercase text-[11px] font-mono">Bloquear Transmissões Ao Vivo</span>
                        <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight">Impede automaticamente submissões de links redirecionando para lives do YouTube ou Twitch.</span>
                      </div>
                    </label>
                  </div>

                  <div className="border-t border-zinc-900/60 pt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Retenção de Fila (Hrs)</label>
                      <input 
                        type="number" min="1" max="48"
                        value={roomSettings.video_retention_hours ?? 48} 
                        onChange={e => setRoomSettings({...roomSettings, video_retention_hours: Math.min(48, Math.max(1, parseInt(e.target.value) || 48))})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Limite Global / Hora</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.maxSubmissionsPerHour ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, maxSubmissionsPerHour: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Cooldown Sandbox (s)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.globalCooldownSeconds ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, globalCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Cooldown Usuário (s)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.cooldown_seconds ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, cooldown_seconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Tamanho Máx. Fila</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.max_queue_size ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, max_queue_size: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Máx Mídias / User</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.max_videos_per_user ?? 0} 
                        onChange={e => setRoomSettings({...roomSettings, max_videos_per_user: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 2: Filtro de Origem */}
                <div className="relative bg-[#0d0d0e] border border-zinc-800 rounded-sm p-6 shadow-xl space-y-5 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 to-yellow-500" />
                  
                  <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4">
                    <History className="w-4 h-4 text-orange-500" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Filtro de Origens de Links</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Modo de Validação</label>
                      <select 
                        value={roomSettings.domain_mode || "both"} 
                        onChange={e => setRoomSettings({...roomSettings, domain_mode: e.target.value})} 
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2.5 text-zinc-200 outline-none font-mono text-xs cursor-pointer focus:border-orange-500 h-10"
                      >
                        <option value="both">HÍBRIDO (WHITELIST + BLACKLIST)</option>
                        <option value="whitelist_only">ESTRITO (APENAS WHITELIST)</option>
                        <option value="blacklist_only">LIVRE (APENAS BLACKLIST)</option>
                      </select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Whitelist (Domínios Permitidos)</label>
                      <input 
                        type="text" 
                        value={(roomSettings.domain_whitelist || ["youtube.com", "youtu.be", "twitch.tv", "clips.twitch.tv", "tiktok.com", "vm.tiktok.com", "instagram.com", "x.com", "twitter.com", "reddit.com"]).join(", ")} 
                        onChange={e => setRoomSettings({...roomSettings, domain_whitelist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                        placeholder="youtube.com, tiktok.com" 
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2.5 text-zinc-200 outline-none font-mono text-xs focus:border-orange-500" 
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest">Blacklist (Domínios Revogados)</label>
                      <input 
                        type="text" 
                        value={(roomSettings.domain_blacklist || []).join(", ")} 
                        onChange={e => setRoomSettings({...roomSettings, domain_blacklist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                        placeholder="ex: bit.ly, link-ruim.com" 
                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2.5 text-zinc-200 outline-none font-mono text-xs focus:border-orange-500" 
                      />
                    </div>
                  </div>
                </div>

              </div>
              
              {/* Right Column: Restrições Twitch & Scores */}
              <div className="space-y-8">
                
                {/* CARD 3: Restrições do Chat da Twitch */}
                <div className="relative bg-[#0d0d0e] border border-zinc-800 rounded-sm p-6 shadow-xl space-y-5 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-fuchsia-500" />
                  
                  <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Restrições Twitch Chat</h3>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!roomSettings.require_follower} 
                        onChange={e => setRoomSettings({...roomSettings, require_follower: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer" 
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors uppercase text-[11px] font-mono">Apenas Seguidores</span>
                        <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight">Obriga o cliente a seguir seu canal de transmissão antes de enviar mídias.</span>
                      </div>
                    </label>
                    
                    {roomSettings.require_follower && (
                        <div className="ml-8 space-y-3 p-4 bg-zinc-950 border border-zinc-900 rounded-sm">
                          <div className="space-y-2 text-left">
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
                              className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-2.5 text-zinc-200 focus:border-orange-500 outline-none text-xs font-bold font-mono"
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
                      <input 
                        type="checkbox" 
                        checked={!!roomSettings.require_sub} 
                        onChange={e => setRoomSettings({...roomSettings, require_sub: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer" 
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors uppercase text-[11px] font-mono">Inscritos Ativos (Subs)</span>
                        <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight">Cria uma barreira estrita liberando o envio apenas para apoiadores.</span>
                      </div>
                    </label>

                    <div className="h-px bg-zinc-900 my-4"></div>

                    <label className="flex items-start gap-4 text-zinc-500 group cursor-pointer italic">
                      <input 
                        type="checkbox" 
                        checked={roomSettings.auto_approve_subs !== false} 
                        onChange={e => setRoomSettings({...roomSettings, auto_approve_subs: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-900 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer" 
                      />
                      <div className="flex flex-col text-left">
                        <span className="text-[10.5px] uppercase font-mono tracking-wider font-bold text-zinc-400">Whitelist Automática: Inscritos (Subs)</span>
                        <span className="text-[9px] text-zinc-600 font-mono uppercase mt-0.5">Subs ignoram aprovação manual e entram direto no status Watch.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-4 text-zinc-500 group cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={roomSettings.auto_approve_mods !== false} 
                        onChange={e => setRoomSettings({...roomSettings, auto_approve_mods: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-900 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer" 
                      />
                      <div className="flex flex-col text-left">
                        <span className="text-[10.5px] uppercase font-mono tracking-wider font-bold text-zinc-400">Whitelist Automática: Moderadores (Mods)</span>
                        <span className="text-[9px] text-zinc-600 font-mono uppercase mt-0.5">Moderadores do chat são pré-aprovados para inclusão de fitas sem supervisão.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* CARD 4: Pontos de Canal */}
                <div className="relative bg-[#0d0d0e] border border-zinc-800 rounded-sm p-6 shadow-xl space-y-5 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500" />
                  
                  <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4">
                    <Award className="w-4 h-4 text-blue-400" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Pontos de Canal (Edge Link)</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="flex items-start gap-4 text-zinc-300 group cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!roomSettings.require_channel_points} 
                        onChange={e => setRoomSettings({...roomSettings, require_channel_points: e.target.checked})} 
                        className="mt-0.5 rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer" 
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-200 group-hover:text-orange-400 transition-colors uppercase text-[11px] font-mono">Recompensa Customizada de Pontos</span>
                        <span className="text-[10px] text-zinc-550 leading-relaxed font-mono uppercase tracking-tight">O vídeo submetido exige o resgate concomitante de pontos de canal na Twitch.</span>
                      </div>
                    </label>
                    
                    {roomSettings.require_channel_points && (
                        <div className="ml-8 space-y-2 p-4 bg-zinc-950 border border-zinc-900 rounded-sm">
                          <label className="block text-zinc-500 font-mono uppercase text-[9px] font-bold tracking-widest text-left">Twitch Reward UUID</label>
                          <input 
                            type="text" 
                            value={roomSettings.channel_point_reward_id || ''} 
                            onChange={e => setRoomSettings({...roomSettings, channel_point_reward_id: e.target.value.trim()})}
                            placeholder="ex: a1b2c3d4-..."
                            className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-2 text-zinc-200 focus:border-orange-500 outline-none text-xs font-mono font-bold"
                          />
                        </div>
                    )}
                  </div>
                </div>

                {/* CARD 5: Pesos de Priorização */}
                <div className="relative bg-[#0d0d0e] border border-zinc-800 rounded-sm p-6 shadow-xl space-y-5 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
                  
                  <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-zinc-100 font-black uppercase tracking-wider text-[11px] font-mono">Pesos de Priorização (Score Matrix)</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 items-center">
                    <div className="space-y-4 text-left">
                       <label className="flex items-center gap-2 text-xs text-zinc-450 font-mono uppercase font-black cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={!!roomSettings.priority_subs} 
                            onChange={e => setRoomSettings({...roomSettings, priority_subs: e.target.checked})} 
                            className="rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 w-3.5 h-3.5 cursor-pointer" 
                          />
                          <span className="group-hover:text-zinc-200 transition-colors">Priorizar Subs</span>
                       </label>
                       <label className="flex items-center gap-2 text-xs text-zinc-450 font-mono uppercase font-black cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={!!roomSettings.priority_vips} 
                            onChange={e => setRoomSettings({...roomSettings, priority_vips: e.target.checked})} 
                            className="rounded-sm bg-zinc-950 border-zinc-800 text-orange-500 w-3.5 h-3.5 cursor-pointer" 
                          />
                          <span className="group-hover:text-zinc-200 transition-colors">Priorizar VIPs</span>
                       </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center justify-between border border-zinc-900 bg-zinc-950 px-3.5 py-2.5 rounded-sm">
                        <span className="text-[9px] font-mono text-zinc-550 font-bold uppercase">PESO MODERADOR</span>
                        <input type="number" value={roomSettings.weight_mod ?? 50} onChange={e => setRoomSettings({...roomSettings, weight_mod: parseInt(e.target.value) || 0})} className="w-10 bg-transparent text-right font-bold text-orange-400 outline-none text-xs font-mono" />
                      </div>
                      <div className="flex items-center justify-between border border-zinc-900 bg-zinc-950 px-3.5 py-2.5 rounded-sm">
                        <span className="text-[9px] font-mono text-zinc-550 font-bold uppercase">PESO VIP CHAT</span>
                        <input type="number" value={roomSettings.weight_vip ?? 15} onChange={e => setRoomSettings({...roomSettings, weight_vip: parseInt(e.target.value) || 0})} className="w-10 bg-transparent text-right font-bold text-orange-400 outline-none text-xs font-mono" />
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
    </div>
  );
}
