import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { getSupabaseAdmin } from './src/lib/supabase.js';
import { ablyRest } from './src/lib/ably.js';
import { sanitizeAndValidateUrl, extractCanonicalVideoId, verifyVideoContent } from './server.js';
import crypto from 'crypto';

const processedDiscordMessages = new Set<string>();
const idempotencyCache = new Map<string, number>();
const discordChannelMapCache = new Map<string, { roomId: string | null, cachedAt: number }>();
const recentlyProcessedDiscordVideos = new Set<string>();

// Interval to clean up spam cache
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idempotencyCache.entries()) {
    if (now - v > 5000) {
      idempotencyCache.delete(k);
    }
  }
  for (const [k, v] of discordChannelMapCache.entries()) {
    if (now - v.cachedAt > 60000) {
      discordChannelMapCache.delete(k);
    }
  }
}, 5000);

export class DiscordBotService {
  private client: Client | null = null;
  private isInitializing = false;

  constructor() {
    // Initialized as a singleton service
  }

  public getClient(): Client | null {
    return this.client;
  }

  public getBotToken(): string | null {
    return process.env.DISCORD_BOT_TOKEN || null;
  }

  public decodeClientId(customToken?: string): string | null {
    const token = customToken || process.env.DISCORD_BOT_TOKEN;
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length > 0) {
      try {
        const clientId = Buffer.from(parts[0], 'base64').toString('utf-8');
        if (/^\d+$/.test(clientId)) {
          return clientId;
        }
      } catch (e) {
        // Ignore
      }
    }
    return null;
  }

  public async getGuilds(): Promise<{ id: string; name: string }[]> {
    if (!this.client || !this.client.isReady()) {
      console.warn('[Discord Bot] Client not ready when listing guilds.');
      return [];
    }
    try {
      const guilds = await this.client.guilds.fetch();
      return Array.from(guilds.values()).map((g: any) => ({
        id: g.id,
        name: g.name
      }));
    } catch (err: any) {
      console.error('[Discord Bot] Error listing guilds:', err.message);
      return [];
    }
  }

  public async getGuildChannels(guildId: string): Promise<{ id: string; name: string }[]> {
    if (!this.client) {
      console.warn('[Discord Bot] Client not initialized when fetching channels for guild ID:', guildId);
      return [];
    }
    try {
      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        console.warn(`[Discord Bot] Guild ${guildId} not found.`);
        return [];
      }
      const channels = await guild.channels.fetch();
      return Array.from(channels.values())
        .filter((c: any) => c && (c.type === 0 || (typeof c.isTextBased === 'function' ? c.isTextBased() : false)))
        .map((c: any) => ({
          id: c.id,
          name: c.name
        }));
    } catch (err: any) {
      console.error(`[Discord Bot] Error fetching channels for guild ${guildId}:`, err.message);
      return [];
    }
  }

  public async getGuildName(guildId: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const guild = await this.client.guilds.fetch(guildId);
      return guild ? guild.name : null;
    } catch (err: any) {
      console.error(`[Discord Bot] Error fetching name for guild ${guildId}:`, err.message);
      return null;
    }
  }

  private currentToken: string | null = null;
  private initPromise: Promise<void> | null = null;

  public async start(customToken?: string): Promise<void> {
    const token = customToken || process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      console.warn('[Discord Bot] DISCORD_BOT_TOKEN is missing. Booting in standby mode.');
      return;
    }

    // Do not restart if the token is exactly the same and we are already connected/connecting
    if (this.client?.isReady() && this.currentToken === token) {
       console.log('[Discord Bot] Already running with the same token, skipping start.');
       return;
    }

    // If another start() is currently in progress, wait for it to finish first
    if (this.initPromise) {
      console.log('[Discord Bot] Waiting for existing initialization to complete...');
      await this.initPromise;
      // After waiting, check if we still need to initialize (token could have changed)
      if (this.currentToken === token && this.client?.isReady()) {
         return;
      }
    }

    // Wrap initialization in a promise to prevent concurrent executions
    this.initPromise = (async () => {
      if (this.client || this.isInitializing) {
        this.shutdown();
      }

      this.isInitializing = true;
      this.currentToken = token;
      console.log('[Discord Bot] Initializing client...');

      try {
        this.client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
          ]
        });

        this.setupHandlers();
        await this.client.login(token);
      } catch (err: any) {
        console.error('[Discord Bot] Login failed:', err.message);
        this.client = null;
        this.currentToken = null;
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private setupHandlers(): void {
    if (!this.client) return;

    this.client.on('ready', () => {
      console.log(`[Discord Bot] Online and listening! Authenticated as @${this.client?.user?.tag}`);
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore self-messages and other bots to avoid loop recursion
      if (message.author.bot) return;

      const channelId = message.channel.id;
      const content = message.content || '';
      
      // Look for links in message content
      const urls = content.match(/https?:\/\/[^\s]+/g) || [];
      const attachments = Array.from(message.attachments.values());

      // If no URLs and no attachments, ignore message immediately
      if (urls.length === 0 && attachments.length === 0) {
        return;
      }

      // Deduplicate by message ID to prevent processing the same event twice
      if (processedDiscordMessages.has(message.id)) return;
      processedDiscordMessages.add(message.id);
      setTimeout(() => processedDiscordMessages.delete(message.id), 15000);

      // Fast-path idempotency cache for URLs to prevent duplicate feedback loops within 5 seconds
      const spamUserId = message.author.id;
      const uniqueUrls: string[] = [];
      for (const url of urls) {
        const urlHash = crypto.createHash('md5').update(url).digest('hex');
        const idempotencyKey = `idemp_${spamUserId}_${urlHash}`;
        const now = Date.now();
        const lastSeen = idempotencyCache.get(idempotencyKey) || 0;
        if (now - lastSeen < 5000) { continue; } // Ignore duplicate exact URL within 5s
        idempotencyCache.set(idempotencyKey, now);
        uniqueUrls.push(url);
      }
      
      const uniqueAttachments = [];
      for (const att of attachments) {
        const attHash = crypto.createHash('md5').update(`${att.name}_${att.size}`).digest('hex');
        const idempotencyKey = `idemp_${spamUserId}_${attHash}`;
        const now = Date.now();
        const lastSeen = idempotencyCache.get(idempotencyKey) || 0;
        if (now - lastSeen < 5000) { continue; }
        idempotencyCache.set(idempotencyKey, now);
        uniqueAttachments.push(att);
      }
      
      // If none of the links or attachments are new unique requests, drop to prevent duplicates
      if (uniqueUrls.length === 0 && uniqueAttachments.length === 0) return;

      try {
        const supabaseAdmin = getSupabaseAdmin();
        
        // Anti-Race Jitter: Desyncs simultaneous container replicas from fetching identical stale states
        const multiInstanceJitter = Math.floor(Math.random() * 800) + 10;
        await new Promise(res => setTimeout(res, multiInstanceJitter));

        const nowMs = Date.now();
        
        // 1. Map the sender channel to its streamer room using local fast cache
        let roomId: string | null = null;
        let matchedRoomState: any = null;
        
        const cachedMapping = discordChannelMapCache.get(channelId);
        
        if (cachedMapping && nowMs - cachedMapping.cachedAt < 60000) {
          roomId = cachedMapping.roomId;
          if (!roomId) return; // Cached that this channel does not belong to any active session
          
          const { data, error } = await supabaseAdmin
             .from('room_settings')
             .select('settings_json, rooms!inner(is_active)')
             .eq('room_id', roomId)
             .eq('rooms.is_active', true)
             .maybeSingle();
             
          if (error || !data) {
             discordChannelMapCache.delete(channelId);
             return;
          }
          matchedRoomState = data.settings_json || {};
          
          // Verify that Discord settings were not disabled recently
          const s = matchedRoomState.settings || {};
          if (s.discordEnabled !== true || s.discordChannelId !== channelId) {
             discordChannelMapCache.set(channelId, { roomId: null, cachedAt: nowMs });
             return;
          }
        } else {
          // Cache miss: find which active room is bound to this channel
          const { data: matchedRooms, error } = await supabaseAdmin
            .from('room_settings')
            .select('room_id, settings_json, rooms!inner(is_active)')
            .eq('rooms.is_active', true)
            .contains('settings_json', { settings: { discordEnabled: true, discordChannelId: channelId } })
            .limit(1);

          if (error || !matchedRooms || matchedRooms.length === 0) {
            discordChannelMapCache.set(channelId, { roomId: null, cachedAt: nowMs });
            return; // No active sessions on the server bound to this channel
          }
          
          roomId = matchedRooms[0].room_id;
          matchedRoomState = matchedRooms[0].settings_json || {};
          discordChannelMapCache.set(channelId, { roomId, cachedAt: nowMs });
        }

        if (!roomId || !matchedRoomState) return;

        const state = matchedRoomState;

        // DB-level Processed Message Lock Check (catches Multi-Instance duplicates!)
        if (!state.discord_processed_messages) {
          state.discord_processed_messages = [];
        }
        if (state.discord_processed_messages.includes(message.id)) {
           // Another instance already successfully completed processing this exact message id and saved it
           return;
        }

        const settings = state.settings || {};

        console.log(`[Discord Bot] Processing submission on registered channel #${channelId} for Room ID "${roomId}"`);

        // Resolve or default active lists
        if (!state.users) state.users = [];
        if (!state.queue) state.queue = [];

        // 2. Map Discord identity to persistent user state block
        const userId = `discord_${message.author.id}`;
        let userIndex = state.users.findIndex((u: any) => u.userId === userId);
        let userRecord = userIndex !== -1 ? state.users[userIndex] : null;

        // Security check: If blacklisted in the room
        if (state.blacklistUsernames?.includes(message.author.username.toLowerCase())) {
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('❌ Acesso Negado')
                .setDescription('Seu usuário está banido das submissões nesta sala.')
                .setColor('#EF4444')
            ]
          });
          return;
        }

        // Security check: If timed out
        if (userRecord && userRecord.timeoutUntil && Date.now() < userRecord.timeoutUntil) {
          const remaining = Math.ceil((userRecord.timeoutUntil - Date.now()) / 1000);
          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('⏳ Em Timeout')
                .setDescription(`Você está em timeout nesta sala. Aguarde mais ${remaining} segundos.`)
                .setColor('#F59E0B')
            ]
          });
          return;
        }

        // 3. User Cooldown Checks
        if (settings.userCooldownSeconds > 0 && userRecord?.lastSubmittedAt) {
          const elapsed = (Date.now() - userRecord.lastSubmittedAt) / 1000;
          if (elapsed < settings.userCooldownSeconds) {
            const remaining = Math.ceil(settings.userCooldownSeconds - elapsed);
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('⏳ Cooldown Individual')
                  .setDescription(`Por favor, aguarde mais ${remaining} segundo(s) antes de enviar outro link.`)
                  .setColor('#F59E0B')
              ]
            });
            return;
          }
        }

        // 4. Global Cooldown Checks
        if (settings.globalCooldownSeconds > 0) {
          let lastGlobalTime = state.lastGlobalSubmissionAt || 0;
          (state.queue || []).forEach((v: any) => {
            if (v.timestamp && v.timestamp > lastGlobalTime) {
              lastGlobalTime = v.timestamp;
            }
          });
          const elapsed = (Date.now() - lastGlobalTime) / 1000;
          if (elapsed < settings.globalCooldownSeconds) {
            const remaining = Math.ceil(settings.globalCooldownSeconds - elapsed);
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('⏳ Cooldown Geral')
                  .setDescription(`As submissões estão sob cooldown coletivo. Aguarde mais ${remaining} segundo(s).`)
                  .setColor('#F59E0B')
              ]
            });
            return;
          }
        }

        // 5. Build list of media links or file attachments to process
        const itemsToProcess: { url: string; platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'other'; title?: string }[] = [];

        // Parse explicit links
        for (const url of uniqueUrls) {
          const validation = sanitizeAndValidateUrl(url, settings);
          if (!validation.valid || !validation.normalizedUrl) {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('❌ Link Recusado')
                  .setDescription(`O link \`${url}\` foi invalidado pelas políticas de origens autorizadas:\n**${validation.error || 'Não suportado'}**`)
                  .setColor('#EF4444')
              ]
            });
            continue;
          }
          itemsToProcess.push({
            url: validation.normalizedUrl,
            platform: validation.platform || 'other'
          });
        }

        // Parse direct attachments (uploaded video files)
        for (const attachment of uniqueAttachments) {
          const isVideoFile = attachment.contentType?.startsWith('video/') || attachment.name.match(/\.(mp4|webm|mov|ogg)$/i);
          if (isVideoFile) {
            itemsToProcess.push({
              url: attachment.url,
              platform: 'other',
              title: attachment.name
            });
          } else {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('❌ Arquivo Inválido')
                  .setDescription(`O arquivo \`${attachment.name}\` não possui um formato de mídia suportado (use MP4, WebM ou MOV).`)
                  .setColor('#EF4444')
              ]
            });
          }
        }

        // Stop if nothing was accumulated to submit
        if (itemsToProcess.length === 0) return;

        // Process each item in turn
        for (const item of itemsToProcess) {
          // Check limits
          const maxVideosPerUser = settings.maxVideosPerUser || 0;
          const userActiveVideos = (state.queue || []).filter((v: any) => v.submitterId === userId).length;
          if (maxVideosPerUser > 0 && userActiveVideos >= maxVideosPerUser) {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('❌ Limite Atingido')
                  .setDescription(`Você atingiu o limite de ${maxVideosPerUser} mídias ativas simultaneamente na fila. Próximos envios pausados.`)
                  .setColor('#F59E0B')
              ]
            });
            break;
          }

          const maxQueueSize = settings.maxQueueSize || 0;
          if (maxQueueSize > 0 && (state.queue || []).length >= maxQueueSize) {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('❌ Canal de Fila Cheia')
                  .setDescription(`A fila está cheia com o limite de de mídias total da sala (${maxQueueSize}). Tente novamente mais tarde.`)
                  .setColor('#EF4444')
              ]
            });
            break;
          }

          // Extract unique canonical ID
          const canonicalId = item.platform === 'other'
            ? crypto.createHash('md5').update(item.url).digest('hex').substring(0, 10)
            : extractCanonicalVideoId(item.url, item.platform);

          const uniqKey = `${roomId}:${canonicalId}`;
          if (recentlyProcessedDiscordVideos.has(uniqKey)) {
             continue; // Silently drop concurrent duplicate processing attempting the exact same media
          }

          // Check duplicate content
          const duplicateVideo = (state.queue || []).some((v: any) => {
            const vCanon = v.platform === 'other'
              ? crypto.createHash('md5').update(v.url).digest('hex').substring(0, 10)
              : extractCanonicalVideoId(v.url, v.platform);
            return vCanon === canonicalId || v.url === item.url;
          });

          if (duplicateVideo) {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('⚠️ Duplicado Detectado')
                  .setDescription(`Esta mídia já foi enviada e está na fila.`)
                  .setColor('#F59E0B')
              ]
            });
            continue;
          }

          // Apply short lived lock
          recentlyProcessedDiscordVideos.add(uniqKey);
          setTimeout(() => { recentlyProcessedDiscordVideos.delete(uniqKey); }, 15000);

          // 6. Availability and oEmbed Check
          const verification = await verifyVideoContent(item.url, item.platform, settings.blockLiveStreams ?? true);
          if (!verification.valid) {
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle('❌ Indisponibilidade')
                  .setDescription(`Falha ao conectar ou carregar a mídia:\n**${verification.error || 'Mídia privada ou indisponível'}**`)
                  .setColor('#EF4444')
              ]
            });
            continue;
          }

          const resolvedTitle = verification.title || item.title || 'Vídeo do Discord';

          // 7. Save candidate parameters
          const discordData = {
            avatarUrl: message.author.displayAvatarURL() || `https://api.dicebear.com/7.x/identicon/svg?seed=${message.author.username}`,
            login: message.author.username,
            displayName: message.author.globalName || message.author.username,
            color: '#5865F2'
          };

          const formattedUser = {
            id: userId,
            userId,
            name: message.author.globalName || message.author.username,
            isHost: false,
            strikes: userRecord ? userRecord.strikes || 0 : 0,
            isBanned: false,
            lastSubmittedAt: Date.now(),
            discordData
          };

          // Append or merge user record
          if (userIndex !== -1) {
            state.users[userIndex] = {
              ...state.users[userIndex],
              ...formattedUser
            };
          } else {
            state.users.push(formattedUser);
          }

          const newVideo = {
            id: `vid_discord_${canonicalId}_${Date.now()}`,
            submitter: message.author.globalName || message.author.username,
            submitterId: userId,
            url: item.url,
            platform: item.platform,
            source: 'discord',
            title: resolvedTitle,
            status: settings.isManualApprovalRequired ? 'pending' : 'approved',
            timestamp: Date.now()
          };

          state.queue = [...(state.queue || []), newVideo];
          state.lastGlobalSubmissionAt = Date.now();

          // Append to lock array so external concurrent replicas will yield early (Jitter lock technique)
          if (!state.discord_processed_messages) state.discord_processed_messages = [];
          if (!state.discord_processed_messages.includes(message.id)) {
            state.discord_processed_messages.push(message.id);
            if (state.discord_processed_messages.length > 30) {
              state.discord_processed_messages.shift();
            }
          }

          // Write updated persistent state JSON
          const { error: updateError } = await supabaseAdmin
            .from('room_settings')
            .update({ settings_json: state })
            .eq('room_id', roomId);

          if (updateError) {
            console.error('[Discord Bot] Failed to update session settings in database:', updateError);
            throw updateError;
          }

          // Relational direct syncer
          try {
            await supabaseAdmin
              .from('videos')
              .insert({
                room_id: roomId,
                twitch_user_id: userId,
                video_url: item.url,
                status: newVideo.status,
                priority_score: 0
              });
          } catch (syncErr) {
            // Relational constraints are optionally bypassed
          }

          // Real-time updates pushed symmetrically to Ably channel
          if (ablyRest) {
            const ablyChannel = ablyRest.channels.get(`session:${roomId}`);
            await ablyChannel.publish('session_state', state);
          }

          // Response rich Embed
          const feedbackEmbed = new EmbedBuilder();
          if (newVideo.status === 'pending') {
            feedbackEmbed
              .setTitle('📝 Fila de Moderação')
              .setDescription(`O vídeo **"${resolvedTitle}"** foi enviado com sucesso e está pendente na aprovação expressa do Streamer!`)
              .addFields(
                { name: 'Canal', value: item.platform.toUpperCase(), inline: true },
                { name: 'Remetente', value: message.author.toString(), inline: true }
              )
              .setColor('#F59E0B')
              .setThumbnail(discordData.avatarUrl)
              .setFooter({ text: 'Acesse streamer-react-queue' });
          } else {
            const approvedCount = state.queue.filter((v: any) => v.status === 'approved').length;
            feedbackEmbed
              .setTitle('✅ Mídia Adicionada à Fila!')
              .setDescription(`O vídeo **"${resolvedTitle}"** foi validado e adicionado com sucesso.`)
              .addFields(
                { name: 'Posição da Fila', value: `#${approvedCount}`, inline: true },
                { name: 'Canal', value: item.platform.toUpperCase(), inline: true },
                { name: 'Remetente', value: message.author.toString(), inline: true }
              )
              .setColor('#10B981')
              .setThumbnail(discordData.avatarUrl)
              .setFooter({ text: 'Divirta-se na transmissão!' });
          }

          await message.reply({ embeds: [feedbackEmbed] });
          console.log(`[Discord Bot] Content successfully registered and broadcasted: "${resolvedTitle}" in room ${roomId}`);
        }

      } catch (err: any) {
        console.error('[Discord Bot] Interaction crash during message parsing:', err.message);
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Erro no Processamento')
              .setDescription('Desculpe, ocorreu uma instabilidade temporária ao registrar o seu vídeo. Tente novamente.')
              .setColor('#EF4444')
          ]
        });
      }
    });
  }

  public shutdown(): void {
    if (this.client) {
      console.log('[Discord Bot] Shutting down Discord bot client gracefully.');
      this.client.destroy();
      this.client = null;
    }
  }
}

export const discordBot = new DiscordBotService();
