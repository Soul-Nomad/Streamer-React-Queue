# 🚀 Análise de UX, Feedback Visual e Arquitetura de Interação

**Documento de Diagnóstico e Plano de Ação**
**Foco:** Redução de atrito, feedback de latência e resiliência de conexões para Streamers de alta performance.

---

## 📍 Etapa 1: Mapeamento da Jornada do Streamer (Fluxos Críticos)

### 1. Criar Sessão
*   **Ações:** Inserir nome/opções -> Clicar em "Criar Sessão".
*   **Atrasos Potenciais:** Cold start do backend (ex: Edge Functions do Supabase), comunicação com provedor de WebSocket (Ably), gravação no banco de dados.
*   **Riscos de Confusão:** Se o botão não apresentar estado de *disabled/loading*, o streamer clica várias vezes, gerando race conditions e sessões fantasma.

### 2. Entrar na Sessão / Conectar
*   **Ações:** Validar credenciais -> Handshake WebSocket -> Receber estado inicial (fila atual, configurações).
*   **Atrasos Potenciais:** Handshake e emissão de eventos TLS demorando mais em caso de rotas de rede prejudicadas.
*   **Riscos de Confusão:** Ver uma "tela em branco" ou fila vazia temporariamente antes do estado ser populado, parecendo que a fila sumiu.

### 3. Receber / Navegar em Vídeos (Aprovar/Rejeitar/Próximo)
*   **Ações:** Clicar em "Próximo". Emitir evento para o servidor -> Servidor processa -> Servidor faz broadcast do novo vídeo ativo -> Clientes atualizam.
*   **Atrasos Potenciais:** Viagem completa até o servidor web, latência na busca de metadados de plataformas de terceiros (Cobalt/TikTok/YouTube), buffering do player de vídeo.
*   **Riscos de Confusão:** O vídeo anterior continua tocando enquanto o próximo é carregado, causando uma desconexão cognitiva. O streamer não sabe se a requisição "passou".

### 4. Reconexão
*   **Ações:** Perda de pacotes ou troca de rede -> WebSocket cai -> Tentativa de reconexão automática.
*   **Riscos de Confusão:** O streamer tenta interagir com os botões (como pular vídeo), os cliques são absorvidos no vazio (ou enfileirados de forma não transparente) e nada acontece na tela.

---

## 🚥 Etapa 2: Definição de Estados da Interface

Para garantir previsibilidade total, cada componente que depende de rede **SÓ PODE ESTAR** em um dos seguintes estados explícitos:

1.  **Idle (Ocioso):** Botão/Ação totalmente habilitado. Cores nítidas e convite à ação (CTA) claro. Sem animações complexas.
2.  **Loading (Carregando):** 
    *   Botão primário desabilitado (cliques bloqueados).
    *   Spinner ou componente pulsante (Skeleton).
    *   Mouse cursor muda para `wait` ou `not-allowed`.
3.  **Success (Sucesso):** 
    *   Botão/tela muda brevemente (ex: flash verde, ícone de *check* ✓).
    *   Notificação efêmera (Toast) que não requer clique para fechar.
4.  **Error (Erro):** 
    *   Interface volta ao estado Idle para permitir tentativa.
    *   Feedback agressivo (ex: cor vermelha, vibração no botão, Toast de erro persistente detalhando).
    *   Botão "Tentar novamente".
5.  **Reconnecting (Reconectando):**
    *   Ações com mutação de estado (Próximo, Rejeitar) ficam cinzas/desabilitadas.
    *   Banner de status no nível superior da tela avisando o estado de conectividade.

---

## 🎨 Etapa 3: Melhorias de UX Específicas

### Troca de Vídeos (O problema do "vazio")
*   **Optimistic UI (UI Otimista):** Assim que o usuário clicar em "Próximo", o frontend DEVE assumir o sucesso da ação. O vídeo atual é removido do DOM imediatamente.
*   **Skeleton Loading sobre o Player:** Em vez de uma tela preta ou o vídeo antigo travado, exiba um banner de "Sintonizando..." ou um bloco com esqueleto pulsante.
*   **Pre-fetching:** Assim que um vídeo começa a tocar, o metadado (e se possível um pequeno buffer local) do *próximo* vídeo da fila já deve ser baixado em background.

### Criação de Sessão
*   **Modal de Progresso por Passos (Stepper):** O usuário tolera demoras *se souber o que está acontecendo*. 
    1. ⏳ Solicitando acesso...
    2. ⏳ Alocando sala...
    3. ⏳ Conectando tempo real...
*   **Desabilitar Imediato:** `onClick => setIsSubmitting(true)`. Bloqueie o botão nos primeiros 50 milissegundos.

### Reconexão
*   **Badge Persistente de Tráfego:** No canto superior direito, um indicador "bolinha" constante (Verde = Sincronizado, Laranja/Pulsante = Negociando conexão, Vermelho = Desconectado).

---

## ✍️ Etapa 4: UX Writing (Microcopies)

Devemos usar linguagem técnica, porém acolhedora, focada em manter a calma.

**Loading (Sessão & Sala):**
*   *Criando:* "Preparando sua sala de transmissão..."
*   *Autenticando:* "Negociando credenciais (isso pode levar alguns segundos)..."
*   *Conectando:* "Sincronizando fila em tempo real..."

**Loading (Vídeos):**
*   *Próximo Vídeo:* "Puxando próximo conteúdo..." ou "Afinando os transmissores..."
*   *Validando Link:* "Processando metadados do link..."

**Error:**
*   *Falha Sessão:* "Não conseguimos abrir a sala agora. Tentar novamente."
*   *Timeout Geral:* "A conexão demorou a responder. Mas não se preocupe, estamos refazendo a requisição."
*   *Falha Vídeo:* "Este vídeo está demorando muito para carregar ou foi removido."

**Reconnecting:**
*   *Header Banner:* "Conexão instável. Tentando reconectar (Tentativa 1 de 5)..."
*   *Quando volta:* "Conexão restabelecida. Você está online."

---

## 🔧 Etapa 5: Tratamento de Erros e Logs Críticos

### `Ably: Auth.requestToken(): Token request callback timed out after 10 seconds`
*   **A Causa:** O seu backend via Supabase Functions (Edge Functions) está sofrendo de **Cold Start**. Se a função não for chamada por um tempo, ela vai "dormir". Quando acorda, pode levar até 5-8 segundos. O callback de auth do Ably tem um limite rigoroso.
*   **Impacto no Streamer:** Cliques no vazio. A UI tenta conectar, barra silenciosamente em 10s e o usuário fica esperando perpetuamente.
*   **Solução UI:** Identificar se a requisição de Token demora mais de 3s e mostrar: *"Servidores "acordando". A primeira inicialização leva uns segundinhos a mais..."*. Aumentar o timeout do callback no provider do Ably para 15s.

### `Request aborted due to request timeout expiring`
*   **A Causa:** Falhas em requests HTTP comuns (ex: APIs de terceiros para baixar dados do vídeo do TikTok). Pode acontecer pela API alvo impor rate-limits ou lentidão no proxy (`/supabase/functions/submit-video`).
*   **Solução UI:** Exibir Toast formatado no canto: "Tempo esgotado ao buscar o link. Pule para o próximo." 

### `[Socket Adapter Emit] Event: join_session`
*   **A Causa:** Esse evento de WebSocket está demorando de retornar um "ACK (Acknowledgement)". WebSockets são fire-and-forget a menos que implementemos ACKs.
*   **Solução UI:** Ao emitir um `join_session`, iniciar um `setTimeout(..., 5000)`. Se após 5s o ack não voltar, expor um banner "Atraso na recepção da sala detectado. Verifique sua rede."

---

## 🔔 Etapa 6: Sistema de Feedback em Tempo Real

1.  **Status Badge (Canto Superior Direito):**
    *   🟢 *Conectado e Sincronizado* (Aparece fixo, discreto).
    *   🟡 *Carregando / Sincronizando* (Pulsante sempre que houver I/O acontecendo na rede).
    *   🔴 *Offline* (Estático vermelho + desabilita controles críticos).
2.  **Toasts Modais (Canto Inferior Direito):**
    *   Somente para ações periféricas (*"Fulano enviou um vídeo"*, *"Link rejeitado com sucesso"*). Desaparecem em 3.5s.
3.  **Skeleton no Player & Células da Fila:**
    *   Substitui spinners circulares. Skeleton do tamanho/shape exato do que vai carregar. Minimiza sobressaltos e "pulos" de layout (Cumulative Layout Shift - CLS).
4.  **Botões Interativos:**
    *   Comportamento imediato: Clique -> Cor Cinza Fechada + Texto "Aguarde..." -> Retorno ao Estado.

---

## 📋 Etapa 7: Matriz de Priorização

### 🔴 Alta Prioridade (Critico Mínimo para Confiança)
*   **Desabilitar multi-clique** em formulários e aprovação de vídeo.
*   Implementar o **Status Badge** do Socket/Ably (Saber rapidamente se caiu a conexão).
*   **Toasts de Timeout:** Interceptar o timeout da API para avisar o streamer *"Conexão lenta"*, impedindo a falsa sensação de que a engine travou.
*   **Optimistic UI Simples no Player:** Tapar o player imediatamente ao dar `Próximo`.

### 🟡 Média Prioridade (Gargalos de Qualidade de Vida)
*   **Pre-fetching:** Fazer download dos metadados do próximo item da fila antes do streamer clicar nele.
*   **Progresso de Passos para Criação de Sessão:** Melhorar a fase de boot / lidar visualmente com the cold-start do Supabase.

### 🟢 Baixa Prioridade (Superfície / Polimento Mestre)
*   Transições cross-fade suaves entre montagem e desmontagem do player.
*   Mensagens divertidas no loader (*"Afinando os instrumentos"*).
*   Logs internos do cliente acessíveis via interface local para debug avançado.

---

## 🚀 Etapa 8: Recomendações Técnicas para Implementação

**Frontend (React/Vite):**
1.  **State Management:** Extraia as chamadas `Ably` ou WebSockets para um Hook customizado global (ex: `useLiveSession()`) para que todos os componentes conheçam o status do socket (ligado/caindo/tentando).
2.  **Optimistic Updates no React:** Utilize Bibliotecas como `SWR` ou `Tanstack React Query` se estiver buscando estado HTTP RESTful adicional. Se usar Websocket puramente, mantenha uma variável de `pendingMutations` no state.

**Backend (Supabase/DB):**
1.  **Arquitetura Anti HTTP/Timeout:** Para Edge Functions (`submit-video`), se a extração de dados do Cobalt/TikTok for pesada, retorne Status Inicial (202 Accepted) logo de cara e processe os dados do vídeo assincronamente (Webhook). Não deixe o cliente pendurado os 10 segundos esperando a API terminar a conversão do link.
2.  **Manter Função Quente:** Avaliar um cronjob (Supabase pg_cron) para dar "ping" de 5 em 5 minutos nas *Edge Functions* de auth, evitando que entrem em *Cold Start* profundo durante a live.

**Métricas Prometidas (Para medir se as melhorias funcionaram):**
*   *Time-to-Interactive (TTI) em Troca de Vídeos:* Medir localmente os milissegundos entre o clique de "Próximo" até a primeira picture do vídeo ser desenhada (`loadeddata` event do `<video>`).
*   *Drop Rate:* Quantidade de vezes em que streamers recarregam ativamente a página inteira (F5) para resolver problemas "de vista". Deve cair vertiginosamente.

---
*Análise arquitetada por seu Engenheiro de Soluções com carinho para as próximas atualizações de código na base.*
