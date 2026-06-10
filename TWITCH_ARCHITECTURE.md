# Arquitetura do Sistema de Video Queue com Twitch API e Supabase

Este documento detalha a arquitetura, estrutura de dados, fluxos de segurança e integração com a Twitch para o sistema de Video Queue (React ao Vivo). 

## 1. Visão Geral da Arquitetura

A aplicação funcionará majoritariamente no cliente (React/Vite) conectada diretamente ao Supabase para estado e tempo real. No entanto, devido à complexidade das regras de negócio que envolvem a Twitch (verificar tempo de follow, inscrições, banimentos), introduziremos **Supabase Edge Functions** para agir como o backend seguro que valida regras e consome Webhooks da Twitch (EventSub).

### Tecnologias Principais:
- **Frontend**: React, Vite, Supabase JS Client.
- **Backend/Middle-layer**: Supabase Edge Functions (Deno).
- **Banco de Dados**: Supabase PostgreSQL.
- **Integração Twitch**: Twitch OAuth, Helix API, Twitch EventSub (Webhooks).

---

## 2. Estrutura de Modelagem de Dados (Supabase)

### Tabelas Principais

#### 1. `rooms` (Propriedade Intransferível)
Garante que cada sala pertence a um usuário Twitch e não pode ser transferida.
```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE, -- Relacionamento 1:1 rigoroso com a conta logada
  twitch_channel_id TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2. `room_settings` (Configurações do Streamer)
Armazena todas as regras pesadas de filtragem e prioridade.
```sql
CREATE TABLE room_settings (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  -- Restrições de Envio
  require_sub BOOLEAN DEFAULT false,
  require_follower BOOLEAN DEFAULT false,
  min_follow_days INT DEFAULT 0,
  min_account_age_days INT DEFAULT 0,
  max_videos_per_user INT DEFAULT 2,
  max_queue_size INT DEFAULT 50,
  cooldown_seconds INT DEFAULT 60,
  -- Pesos de Prioridade (Algoritmo de Fila)
  weight_tier_1 INT DEFAULT 10,
  weight_tier_2 INT DEFAULT 20,
  weight_tier_3 INT DEFAULT 30,
  weight_mod INT DEFAULT 50,
  weight_vip INT DEFAULT 15,
  -- Integrações Customizadas
  channel_point_reward_id TEXT, -- ID da recompensa "Furar Fila"
  auto_approve_subs BOOLEAN DEFAULT true,
  auto_approve_mods BOOLEAN DEFAULT true
);
```

#### 3. `videos` (A Fila)
```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id),
  twitch_user_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'playing', 'played', 'rejected', 'removed')),
  priority_score INT DEFAULT 0,
  is_channel_points_skip BOOLEAN DEFAULT false,
  inserted_at TIMESTAMPTZ DEFAULT now()
);
```

#### 4. `twitch_events_log` (Opcional - Auditoria)
Para registrar banimentos, redeems e timeouts provenientes do EventSub.

---

## 3. Segurança e Ownership (Políticas RLS)

Todas as operações devem ser protegidas a nível de linha no Supabase (Row Level Security).

```sql
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: ROOMS
-- Qualquer um pode ver uma sala (para poder entrar nela)
CREATE POLICY "Salas são públicas" ON rooms FOR SELECT USING (true);
-- Apenas o dono pode atualizar o status da sala
CREATE POLICY "Somente dono atualiza sala" ON rooms FOR UPDATE USING (auth.uid() = owner_id);
-- Insert apenas se auth.uid() bater com owner_id
CREATE POLICY "Dono cria sua sala" ON rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- POLÍTICAS: ROOM SETTINGS
CREATE POLICY "Configurações visíveis publicamente" ON room_settings FOR SELECT USING (true);
CREATE POLICY "Somente dono edita configs" ON room_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM rooms WHERE id = room_settings.room_id AND owner_id = auth.uid())
);

-- POLÍTICAS: VIDEOS
-- Qualquer um logado pode ver a fila
CREATE POLICY "Fila é pública" ON videos FOR SELECT USING (true);
-- Modificação: Streamer pode aprovar/rejeitar tudo. O usuário só pode "deletar" o próprio vídeo se estiver pending
CREATE POLICY "Dono gerencia toda a fila" ON videos FOR UPDATE USING (
  EXISTS (SELECT 1 FROM rooms WHERE id = videos.room_id AND owner_id = auth.uid())
);
CREATE POLICY "Usuário deleta próprio vídeo" ON videos FOR DELETE USING (submitted_by = auth.uid());

-- IMPORTANTE: A INSERÇÃO de vídeos NÃO deve ser feita no cliente diretamente com RLS,
-- pois o RLS não consegue acessar a API da Twitch para checar "min_follow_days" ou "is_sub".
-- A inserção ocorrerá via Supabase Edge Function (bypass_rls) após validação.
```

---

## 4. Fluxo de Autenticação OAuth

1. **Login do Usuário/Streamer**: Feito via `supabase.auth.signInWithOAuth({ provider: 'twitch', scopes: '...' })`.
2. **Escopos (Scopes)** necessários para o Streamer:
   - `moderation:read` (para checar bans/timeouts).
   - `channel:read:subscriptions` (para checar tiers de subs).
   - `channel:read:vips` (para checar VIPs).
   - `channel:manage:redemptions` (para criar/gerenciar a recompensa de Channel Points).
3. **Sessão Supabase**: O Supabase gerencia o JWT. A API Key da Twitch (Access Token) resultante do OAuth do streamer precisará ser salva no cofre do Supabase ou em uma tabela criptografada caso o backend (Edge Functions) precise consultar a Helix API recorrentemente em background.

---

## 5. Fluxos do EventSub (A Mágica do Tempo Real)

A verdadeira integração realtime funcionará assinando os Webhooks da Twitch. O Supabase atuará como receptor (Edge Function endpoint).

**Eventos Assinados (Webhook Subscriptions):**
1. `channel.ban` e `channel.timeout`:
   - *Fluxo*: EventSub -> Edge Function -> Consulta Tabela `videos` do canal -> Se encontrar vídeos do usuário banido na fila (`pending`/`approved`) -> Atualiza para `status = 'removed'`. A tela do streamer e dos viewers atualiza sozinha via Supabase Realtime.
2. `channel.channel_points_custom_reward_redemption.add`:
   - *Fluxo*: Streamer cria reward "🎥 Enviar Vídeo Furando a Fila". Viewer resgata. EventSub alerta o Supabase -> Pega a string do input do reward (a URL) -> Insere direto na tabela `videos` com `is_channel_points_skip = true` e `priority_score = 9999`.
3. `channel.subscribe` / `channel.subscription.message`:
   - *Fluxo*: Mantém caches de subs atualizados ou dá uma notificação especial na Sala de View/Lobby.

---

## 6. Fluxos de Autorização e Restrição de Fila (Edge Function: `submit_video`)

Para garantir a regra de negócios sem que um usuário mal-intencionado burle o JavaScript do front-end:

**Chamada**: Cliente envia `POST /functions/v1/submit_video` com `{ room_id, video_url }` acompanhado do JWT do Supabase Auth.
**Fluxo Interno da Function (Seguro)**:
1. Pega `user_id` e `twitch_id` do enviador pelo JWT JWT.
2. Busca `room_settings` e `twitch_channel_id` (Streamer).
3. Busca se o usuário já atingiu o `max_videos_per_user` na tabela `videos`.
4. Comunica com a **Twitch Helix API**:
   - `GET /users/follows`: Checa se segue e pega a data (`created_at`). Calcula dias de follow.
   - `GET /subscriptions/user`: Checa se o viewer é sub no canal (descobre o Tier).
   - `GET /moderation/moderators` / `vips`: Checa os cargos.
5. **Algoritmo de Prioridade (Exemplo Absoluto)**:
   - Base = 0
   - Multiplicador de Chat (se houver BD de mensagens) = +X
   - Se Mod = + `weight_mod`
   - Se VIP = + `weight_vip`
   - Se Tier 1/2/3 = + `weight_tier_X`
   - Bônus por Follow: +1 ponto a cada mês de follow.
6. Valida restrições (`min_follow_days`, `require_sub`). Se falhar, retorna `403 Forbidden` com motivo ("Precisa seguir há 10 dias").
7. Se o Streamer ativou `auto_approve_subs` e viewer é sub, status inserido = `approved`, senão `pending`.
8. Insere no DB (via Service Role para ignorar o bloqueio de insert público do RLS).

---

## 7. Roadmap de Implementação

**Fase 1: Fundação Segura**
- [ ] Atualizar Schema do Supabase (`rooms`, `room_settings`, `videos`).
- [ ] Configurar RLS (Row Level Security) focado no `owner_id`.
- [ ] Atualizar Client (React) para puxar da nova estrutura de salas e criar UI do Owner Dashboard para modificar `room_settings`.

**Fase 2: Autenticação e Edge Functions (O Coração)**
- [ ] Configurar Twitch OAuth no painel do Supabase com os Scopes atualizados de Mod/Sub.
- [ ] Construir a Supabase Edge Function `submit-video` encapsulando as verificações da Helix API (Helix Follows, Subs, VIPs).
- [ ] Mudar o botão "Enviar Vídeo" do Frontend para rodar um `supabase.functions.invoke('submit-video')` em vez de um insert de DB direto.

**Fase 3: Tempo Real (EventSub e Filas)**
- [ ] Criar Edge Function `twitch-eventsub` (Webhook handler genérico).
- [ ] Assinar Webhooks no boot do painel do streamer (`channel.ban` e `channel.channel_points_custom_reward_redemption.add`).
- [ ] Tratar a remoção automática de banidos do banco via webhook.

**Fase 4: Gamificação e Polimento (Extras)**
- [ ] Adicionar Reward Management no painel do streamer (Criar e deletar o reward "Furar fila" automaticamente através do app).
- [ ] Extensão Twitch Panel: Uma extensão que exibe a fila abaixo da live da Twitch sem o usuário sair do site.
- [ ] Adicionar Notificações em Tempo real de status da fila pro usuário (toast: "Seu vídeo começou a tocar!").
- [ ] Bot do chat para aviso: "O vídeo de @Viewer está passando agora!".

---

## 8. Melhorias Extras Arquiteturais Não-Mencionadas

1. **Deduplicação Inteligente**: Bloquear/Adicionar cooldown se a mesma URL exata foi tocada no dia (Evita spam do mesmo meme).
2. **Player via Browser Source (OBS integrado)**: Em vez do streamer ter que alternar abas, criar uma rota escondida `/obs/:room_id` com fundo transparente. Os vídeos curtos podem tocar sozinhos como Picture-in-Picture se o streamer ativar "Autoplay Moderado".
3. **Integração com Hype Train/Bits**: Dar permissão mágica temporária; se o canal está num Hype Train nível 5, a fila fica free-to-send para engajar a comunidade naquele momento exato.
4. **Resolução de YouTube/Twitch Clips na Edge Function**: Nunca confiar nos metadados enviados pelo client. A Edge function baixa a thumbnail, duração e título da URL antes de salvar na fila. Fila rejeitada automaticamente se a duração bater > 10 min (configurável pelo streamer).
