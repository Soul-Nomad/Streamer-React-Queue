import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';
import { Settings, Save } from 'lucide-react';
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
             ...(settingsData.settings_json || {})
          };
          
          if (merged.maxSubmissionsPerHour === undefined) merged.maxSubmissionsPerHour = 60;
          if (merged.cooldown_seconds === 60) merged.cooldown_seconds = 30; // default preference
          
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
            globalCooldownSeconds: merged.globalCooldownSeconds ?? 5,
            userCooldownSeconds: merged.cooldown_seconds ?? 30,
            maxSubmissionsPerHour: merged.maxSubmissionsPerHour ?? 60
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
    const settingsJson: any = {};

    Object.keys(roomSettings).forEach(key => {
      if (key === 'room_id' || key === 'id' || key === 'created_at' || key === 'updated_at' || key === 'settings_json') return;
      if (validKeys.includes(key)) {
         updatePayload[key] = roomSettings[key];
      } else {
         settingsJson[key] = roomSettings[key];
      }
    });

    updatePayload.settings_json = settingsJson;

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
         globalCooldownSeconds: roomSettings.globalCooldownSeconds ?? 5,
         userCooldownSeconds: roomSettings.cooldown_seconds ?? 30,
         maxSubmissionsPerHour: roomSettings.maxSubmissionsPerHour ?? 60
       });
       alert("Configurações salvas e aplicadas com sucesso!");
    } else {
       console.error("Falha ao salvar:", error);
       alert("Erro ao salvar: " + (error.message || "Verifique o console"));
    }
    setSettingsSaving(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#121212] overflow-hidden text-[#B0B0B0] animate-in fade-in pt-4 pb-8 px-6 md:px-12">
        <div className="flex-1 flex flex-col min-h-0 text-left bg-[#1A1A1A] border border-[#222222] rounded p-6 overflow-y-auto w-full max-w-5xl mx-auto">
          <div className="mb-6 border-b border-[#222222] pb-4 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Settings className="w-6 h-6 text-[#FF6B35]" />
                Configurações & Políticas de Segurança
              </h2>
              <p className="text-sm text-[#B0B0B0] mt-1">Configure regras da sala e integrações com o canal da Twitch.</p>
            </div>
            <button 
              onClick={handleSaveSettings}
              disabled={settingsSaving || !roomSettings}
              className="bg-[#2a8738] hover:bg-[#34a345] text-white px-5 py-2 rounded font-bold uppercase tracking-wider text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {settingsSaving ? 'Salvando...' : <><Save className="w-4 h-4"/> Salvar Regras</>}
            </button>
          </div>
          
          {settingsLoading ? (
              <div className="text-center py-10 text-[#505050] font-mono animate-pulse">Carregando configurações da nuvem...</div>
          ) : !roomSettings ? (
              <div className="text-center py-10 text-[#F44336] font-mono">Falha ao localizar sala no Supabase. Certifique-se de ser o Streamer.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm w-full mx-auto">
              <div className="space-y-6">
                
                <div className="bg-[#121212] p-4 rounded border border-[#2A2A2A]">
                  <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs">Políticas de Segurança da Sala</h3>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.isManualApprovalRequired} onChange={e => setRoomSettings({...roomSettings, isManualApprovalRequired: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Exigir Aprovação Prévia (Moderação Manual)</span>
                  </label>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.blockLiveStreams} onChange={e => setRoomSettings({...roomSettings, blockLiveStreams: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Bloquear envio de Transmissões Ao Vivo (Lives)</span>
                  </label>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Limite Geral por Hora</label>
                      <input 
                        type="number" min="1" 
                        value={roomSettings.maxSubmissionsPerHour || 60} 
                        onChange={e => setRoomSettings({...roomSettings, maxSubmissionsPerHour: Math.max(1, parseInt(e.target.value) || 1)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Cooldown da Tela (segundos)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.globalCooldownSeconds ?? 5} 
                        onChange={e => setRoomSettings({...roomSettings, globalCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Cooldown Espectador (s)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.cooldown_seconds ?? 30} 
                        onChange={e => setRoomSettings({...roomSettings, cooldown_seconds: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Tamanho Máx Fila</label>
                      <input 
                        type="number" min="1" 
                        value={roomSettings.max_queue_size || 50} 
                        onChange={e => setRoomSettings({...roomSettings, max_queue_size: Math.max(1, parseInt(e.target.value) || 50)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Máx Vídeos / Espectador</label>
                      <input 
                        type="number" min="1" 
                        value={roomSettings.max_videos_per_user || 2} 
                        onChange={e => setRoomSettings({...roomSettings, max_videos_per_user: Math.max(1, parseInt(e.target.value) || 2)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-2 text-xs">Idade Conta Mín (dias)</label>
                      <input 
                        type="number" min="0" 
                        value={roomSettings.min_account_age_days || 0} 
                        onChange={e => setRoomSettings({...roomSettings, min_account_age_days: Math.max(0, parseInt(e.target.value) || 0)})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#121212] p-4 rounded border border-[#2A2A2A]">
                  <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs">Restrições Twitch & Moderação Direta</h3>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.require_follower} onChange={e => setRoomSettings({...roomSettings, require_follower: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Somente Seguidores (Followers) podem enviar links</span>
                  </label>
                  
                   {roomSettings.require_follower && (
                    <div className="mt-2 mb-4 ml-7 space-y-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-sm text-left">
                      <div>
                        <label className="block text-[#B0B0B0] mb-1.5 text-xs font-mono uppercase tracking-wider">Regra de Tempo de Follow</label>
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
                          className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none text-xs font-bold"
                        >
                          <option value="0">Já conta (Seguidor imediato conta)</option>
                          <option value="10">Seguidor há pelo menos 10 minutos</option>
                          <option value="30">Seguidor há pelo menos 30 minutos</option>
                          <option value="60">Seguidor há pelo menos 1 hora</option>
                          <option value="1440">Seguidor há pelo menos 1 dia</option>
                          <option value="10080">Seguidor há pelo menos 1 semana</option>
                          <option value="custom">Personalizado (Exige tempo exato)</option>
                        </select>
                      </div>

                      {(![0, 10, 30, 60, 1440, 10080].includes(roomSettings.min_follow_minutes !== undefined ? roomSettings.min_follow_minutes : ((roomSettings.min_follow_days || 0) * 1440))) && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.03] animate-in slide-in-from-top-1 duration-150">
                          <div>
                            <label className="block text-[#888888] mb-1 text-[10px] uppercase font-mono">Minutos Consecutivos</label>
                            <input 
                              type="number" min="0" 
                              value={roomSettings.min_follow_minutes !== undefined ? roomSettings.min_follow_minutes : ((roomSettings.min_follow_days || 0) * 1440)} 
                              onChange={e => {
                                const min = Math.max(0, parseInt(e.target.value) || 0);
                                setRoomSettings({
                                  ...roomSettings,
                                  min_follow_minutes: min,
                                  min_follow_days: Math.floor(min / 1440)
                                });
                              }}
                              className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-1.5 text-white focus:border-[#FF6B35] outline-none text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[#888888] mb-1 text-[10px] uppercase font-mono font-bold text-[#FF6B35]">Convertido (Dias)</label>
                            <div className="bg-[#1A1A1A] border border-[#333333] rounded px-3 py-1.5 text-[#AAAAAA] text-xs font-mono h-8 flex items-center">
                              {((roomSettings.min_follow_minutes !== undefined ? roomSettings.min_follow_minutes : ((roomSettings.min_follow_days || 0) * 1440)) / 1440).toFixed(2)} dia(s)
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.require_sub} onChange={e => setRoomSettings({...roomSettings, require_sub: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Somente Inscritos (Subscribers) podem enviar links</span>
                  </label>

                  <div className="h-px bg-[#262626] my-4"></div>

                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={roomSettings.auto_approve_subs !== false} onChange={e => setRoomSettings({...roomSettings, auto_approve_subs: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Pular moderação automática para Inscritos (Subs)</span>
                  </label>

                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={roomSettings.auto_approve_mods !== false} onChange={e => setRoomSettings({...roomSettings, auto_approve_mods: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Pular moderação automática para Moderadores (Mods)</span>
                  </label>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-[#121212] p-4 rounded border border-[#2A2A2A]">
                  <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs">Resgatar por Pontos de Canal (Twitch EventSub)</h3>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.require_channel_points} onChange={e => setRoomSettings({...roomSettings, require_channel_points: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Exigir Resgate de Pontos do Canal (Pula Fila)</span>
                  </label>
                  
                  {roomSettings.require_channel_points && (
                    <div className="mt-4 ml-7 space-y-2">
                      <label className="block text-[#B0B0B0] text-xs">ID da Recompensa (Channel Point Reward ID)</label>
                      <input 
                        type="text" 
                        value={roomSettings.channel_point_reward_id || ''} 
                        onChange={e => setRoomSettings({...roomSettings, channel_point_reward_id: e.target.value.trim()})}
                        placeholder="ex: a1b2c3d4-e5f6-7890-..."
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white focus:border-[#FF6B35] outline-none text-xs font-mono font-bold"
                      />
                      <span className="text-[10px] text-[#606060] block">
                        Insira o UUID exato da Recompensa Customizada criada na Twitch para que as Edge Functions possam aprovar instantaneamente.
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-[#121212] p-4 rounded border border-[#2A2A2A]">
                  <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs">Priorização & Pesos da Fila</h3>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.priority_subs} onChange={e => setRoomSettings({...roomSettings, priority_subs: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Priorizar Subscribers (Subs)</span>
                  </label>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.priority_vips} onChange={e => setRoomSettings({...roomSettings, priority_vips: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Priorizar VIPs da Twitch</span>
                  </label>
                  <label className="flex items-center space-x-3 text-[#B0B0B0] mb-3">
                    <input type="checkbox" checked={!!roomSettings.priority_mods} onChange={e => setRoomSettings({...roomSettings, priority_mods: e.target.checked})} className="rounded bg-[#222222] border-[#404040] text-[#FF6B35] focus:ring-[#FF6B35] w-4 h-4" />
                    <span>Priorizar Moderadores</span>
                  </label>

                  <div className="h-px bg-[#262626] my-4"></div>
                  <h4 className="text-white font-bold mb-3 uppercase text-[10px] tracking-wider text-[#606060]">Pesos de Score Adicionais</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[#B0B0B0] mb-1">Peso VIP</label>
                      <input 
                        type="number" 
                        value={roomSettings.weight_vip ?? 15} 
                        onChange={e => setRoomSettings({...roomSettings, weight_vip: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-1.5 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-1">Peso Mod</label>
                      <input 
                        type="number" 
                        value={roomSettings.weight_mod ?? 50} 
                        onChange={e => setRoomSettings({...roomSettings, weight_mod: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-1.5 text-white focus:border-[#FF6B35] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                    <div>
                      <label className="block text-[#B0B0B0] mb-1">Peso Sub T1</label>
                      <input 
                        type="number" 
                        value={roomSettings.weight_tier_1 ?? 10} 
                        onChange={e => setRoomSettings({...roomSettings, weight_tier_1: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#1A1A1A] border border-[#323232] rounded px-2 py-1.5 text-white focus:border-[#FF6B35] outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-1">Peso Sub T2</label>
                      <input 
                        type="number" 
                        value={roomSettings.weight_tier_2 ?? 20} 
                        onChange={e => setRoomSettings({...roomSettings, weight_tier_2: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#1A1A1A] border border-[#323232] rounded px-2 py-1.5 text-white focus:border-[#FF6B35] outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[#B0B0B0] mb-1">Peso Sub T3</label>
                      <input 
                        type="number" 
                        value={roomSettings.weight_tier_3 ?? 30} 
                        onChange={e => setRoomSettings({...roomSettings, weight_tier_3: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#1A1A1A] border border-[#323232] rounded px-2 py-1.5 text-white focus:border-[#FF6B35] outline-none text-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#121212] p-4 rounded border border-[#2A2A2A]">
                  <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs">Filtro de Domínios</h3>
                  
                  <div className="mb-4">
                    <label className="block text-[#B0B0B0] mb-2 text-xs">Modo de Domínio</label>
                    <select 
                      value={roomSettings.domain_mode || "both"} 
                      onChange={e => setRoomSettings({...roomSettings, domain_mode: e.target.value})} 
                      className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white outline-none font-mono text-xs cursor-pointer"
                    >
                      <option value="both">Híbrido (Whitelist + Blacklist)</option>
                      <option value="whitelist_only">Estrito (Apenas Whitelist)</option>
                      <option value="blacklist_only">Livre (Apenas Blacklist)</option>
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-[#B0B0B0] mb-2 text-xs">Whitelist (Domínios Permitidos)</label>
                    <input 
                      type="text" 
                      value={(roomSettings.domain_whitelist || ["youtube.com", "youtu.be", "instagram.com", "tiktok.com"]).join(", ")} 
                      onChange={e => setRoomSettings({...roomSettings, domain_whitelist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                      placeholder="youtube.com, tiktok.com" 
                      className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white outline-none font-mono text-xs" 
                    />
                    <span className="text-[10px] text-[#606060] mt-1 block">Separe por vírgulas.</span>
                  </div>
                  
                  <div>
                    <label className="block text-[#B0B0B0] mb-2 text-xs">Blacklist (Domínios Bloqueados)</label>
                    <input 
                      type="text" 
                      value={(roomSettings.domain_blacklist || []).join(", ")} 
                      onChange={e => setRoomSettings({...roomSettings, domain_blacklist: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)})} 
                      placeholder="bit.ly, dominio321.com" 
                      className="w-full bg-[#1A1A1A] border border-[#333333] rounded px-3 py-2 text-white outline-none font-mono text-xs" 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
     </div>
  );
}
