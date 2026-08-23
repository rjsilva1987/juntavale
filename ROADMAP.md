# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 23/08/2026

---

## Como ler

- **ABERTA** — na fila, ainda não implementada
- **FECHADA** — implementada, auditada e commitada
- **DESCARTADA** — decidida como "não vamos fazer"

Sprint sem "Decisões" listadas ainda não teve decisão de produto tomada. Nesse
caso o agente **para e pergunta** em vez de escolher.

---

## Fila aberta

### S102-A — Chat, mensagem de áudio
**Status:** ABERTA · sem decisões · sem recon

Gravar e enviar mensagem de áudio — a mais cara de todas: gravação,
upload, storage e moderação de conteúdo que não dá pra buscar por texto.

### S121 — Momento de 24h
**Status:** IMPLEMENTADA em 22/08/2026 (commit 746f163) · rules do Firestore e do Storage deployadas · function expireMomentos criada · SEM teste em aparelho

Story que expira: publica texto ou foto e some em 24h.

**Decisões:** audiência é a base inteira, não só matches.

### S123 — Curtir foto
**Status:** IMPLEMENTADA em 22/08/2026 (commit 78f6fb4) · escopo pós-match, sem function e sem push · rules deployadas · SEM teste em aparelho

Curtir a **foto**, não a pessoa, com contador na foto e notificação por
curtida (modelo Instagram). Em aberto se entra comentário junto.

Interage com S122: notificação por curtida é candidata a virar spam.

### S124 — Grupos / salas
**Status:** ABERTA · sem decisões · sem recon

Sala de conversa por tema (corrida, viagem, concurso) ou por instituição, pra
dar motivo de voltar ao app mesmo sem match.

**Custo alto:** modelo de dados novo + superfície de moderação nova.

### S125 — Eventos / encontros
**Status:** ABERTA · sem decisões · sem recon

Alguém marca um encontro (ex.: happy hour) e quem topa entra numa lista de
participantes. Mesmo custo de moderação da S124.

### S127 — Marcos e selos
**Status:** IMPLEMENTADA em 22/08/2026 (commit ccf8926) · rules deployadas · functions onUserProfileUpdated e tenDaysInAppCheck criadas · SEM teste em aparelho

Conquistas: "primeiro match", "perfil completo", "10 dias no app".

**Restrição obrigatória:** determinístico, **sem sorte**. Recompensa aleatória
obriga a refazer as respostas de jogos de azar dadas à Apple e pode empurrar a
classificação etária pra cima.

### S128 — Super Curtida diária
**Status:** IMPLEMENTADA em 22/08/2026 (commit ed0513a) · correção pós-auditoria rodada 1 APLICADA (existsAfter nas rules, reavaliação periódica no hook) · rules deployadas · SEM teste em aparelho

1 Super Curtida grátis por dia pra quem abriu o app. Recompensa por retorno,
não por sorte. Pressupõe que a Super Curtida seja escassa hoje — a recon
começa por confirmar isso.

**Correção pós-auditoria (rodada 1, 22/08/2026)** — 2 falhas da implementação
já feita, sem reabrir nenhuma decisão de produto:
1. `firestore.rules`, Ramo A do `allow create` de `swipes/{swipeId}`: faltava
   `existsAfter(dailyGrant)` como guarda antes de `getAfter(dailyGrant).data.*`
   — `getAfter()` de doc inexistente lança erro e negava a `allow create`
   INTEIRA (não só o Ramo A) pra client pré-S128, que nunca escreve
   `dailyGrant` no batch. Corrigido com `existsAfter()` como primeira
   condição do Ramo A (curto-circuito).
2. `src/hooks/useSuperLikeQuota.ts`: `dailyGrantAvailable` não reavaliava na
   virada do dia UTC (só mudava quando o doc `dailyGrant` mudava, e ele só
   muda quando o grant É USADO) — corrigido com reavaliação periódica
   (setTimeout recursivo, 1x/min, mesmo padrão de `usePresenceHeartbeat.ts`).
   Também havia race condition entre os dois listeners (`usage` e
   `dailyGrant`) no carregamento inicial — corrigido tipando
   `dailyGrantAvailable` como `boolean | null` (`null` = ainda carregando,
   nunca tratado como "esgotado").

### S133 — Bug do Descobrir: próximo perfil visível durante o arraste
**Status:** EM CORREÇÃO (implementada, aguardando auditoria) · decisões tomadas

Ao arrastar o card atual, o card de trás fica legível — nome, vale,
intenção ("Só amizade") e UF aparecem por completo — e o perfil seguinte
é revelado antes da decisão sobre o atual. Reproduzido em aparelho
(22/08/2026).

**Decisões:** esconder o card de trás por **opacidade** — ele só ganha
visibilidade conforme o card da frente sai. NÃO usar `expo-blur`: custa
caro durante o gesto e ainda deixa nome e cidade parcialmente legíveis
(Raphael, 22/08/2026).

**Recon feita:** o offset/escala do card de trás (`styles.cardBehind`:
`transform: [{ scale: 0.95 }], top: 8`) é o efeito de baralho intencional,
fora de escopo — só a opacidade estava faltando. `translateX`/`translateY`
já dirigem `cardStyle` do card da frente via `useAnimatedStyle`;
`interpolate`/`Extrapolation` do `react-native-reanimated` e
`SWIPE_THRESHOLD` já existiam no escopo do arquivo (usados por
`cardStyle`/`likeStampStyle`/`nopeStampStyle`), reaproveitados sem import
novo.

**Implementação (23/08/2026):** `src/screens/SwipeScreen.tsx` — card de
trás trocado de `View` para `Animated.View`, com novo estilo animado
`nextCardStyle` (opacidade de 0 a 1 interpolando
`Math.max(|translateX|, |translateY|)` de 0 até `SWIPE_THRESHOLD`).
`tsc --noEmit` limpo, lint sem erro novo (0 erros / 21 warnings, baseline
mantida). SEM teste em aparelho ainda — só validado por tipo/lint.

### S129-B — Tiques estilo WhatsApp (entregue)
**Status:** EM CORREÇÃO (implementada, aguardando auditoria) · decisões tomadas

Tiques estilo WhatsApp: enviado / entregue / lido.

⚠️ **Reabre** a decisão do S86, que entregou só dois estados (um tique =
enviado, dois verdes = lido) e deixou o "entregue" de fora de propósito,
porque exigiria recibo por dispositivo.

**Decisões:** "entregue" definido como **sincronização do app do outro lado
em foreground via listener global** (`useUnreadCount`, que já roda o tempo
todo enquanto o usuário está logado) — NÃO é confirmação real de entrega por
dispositivo/push. Recibo real via `getReceiptsAsync` do Expo continua fora
de escopo (mesma decisão do S86/comentário em `functions/src/index.ts`
linhas 73-76, inalterado).

**Recon feita:** modelo espelha byte a byte o já existente `lastReadAt`
(S27/S86) — mesmo padrão de campo (`Record<string, Timestamp>` no doc do
match, escrito só pelo próprio uid), mesmo padrão de rules (guard de
`hasOnly` + tipo timestamp) e mesmo padrão de fire-and-forget
(`.catch(() => {})`, já usado em `markMatchRead` dentro de `ChatScreen.tsx`
linhas 667 e 705). Único listener novo de fato: nenhum — `useUnreadCount`
já mantém um `onSnapshot` global em `matches` rodando o tempo todo (usado
pro badge de não lidas), reaproveitado pra também gravar `deliveredAt` em
fire-and-forget, sem listener adicional.

**Implementação (23/08/2026):**
- `src/services/firestoreService.ts` — `Match.deliveredAt?: Record<string,
  Timestamp>`; nova função `markMatchDelivered(matchId, uid)` espelhando
  `markMatchRead`; `listenMatchBlockStatus` estendido pra devolver
  `deliveredAt` como terceiro parâmetro do callback (único chamador
  encontrado: `ChatScreen.tsx`).
- `src/utils/matches.ts` — novo helper `shouldMarkDelivered(match, uid)`,
  mesma forma de `isMatchUnread`.
- `src/hooks/useUnreadCount.ts` — dentro do mesmo `onSnapshot` que já
  calcula o badge de não lidas, novo `forEach` (mesmo critério de
  visibilidade do `filter` de unread — match bloqueado por qualquer lado
  não marca entrega) chamando `markMatchDelivered` em fire-and-forget
  quando `shouldMarkDelivered` for true.
- `src/screens/ChatScreen.tsx` — estado `otherDeliveredAt`; prop
  `otherDeliveredAt` no `MessageBubble`; `isDelivered` ao lado de `isRead`;
  ícone com 3 estados (precedência lido > entregue > enviado — entregue usa
  `checkmark-done` na mesma cor neutra de "enviado", só lido usa
  `theme.colors.success`).
- `firestore.rules` — `matches/{matchId}` update: `hasOnly` ganha
  `'deliveredAt'`; guard duplicado do padrão já usado em `lastReadAt`
  (cada uid só altera a própria chave, valor tem que ser timestamp).
  **NÃO deployado.**

`tsc --noEmit` limpo, lint sem erro novo (0 erros / 21 warnings, baseline
mantida). SEM teste em aparelho ainda — só validado por tipo/lint.

### S135 — "Como quer ser chamado" separado do nome completo
**Status:** IMPLEMENTADA em código (rules, client e Cloud Functions) —
falta (a) Raphael rodar `functions/scripts/migrateNicknames.js` DEPOIS do
deploy de `firestore.rules`, e (b) teste em aparelho. Ainda não fechada —
só migra pra "Fechadas recentemente" depois da auditoria aprovar.

Hoje o cadastro tem um só campo de nome, preenchido com nome completo, e ele
é o que aparece em todo lugar do app — o que causa truncamento em card e
cabeçalho (foi a origem visível da S134).

**Decisão de produto já tomada (Raphael, 22/08/2026): DOIS CAMPOS.**
- Nome real / completo: continua existindo, mas fica PRIVADO — visível só
  pro admin, e é o que a verificação de identidade confere.
- "Como quer ser chamado": campo público, é o que aparece no Descobrir, no
  perfil, nas Curtidas e nas Conversas.

**Recon quando a sprint abrir:**
1. Onde vive o campo de nome hoje (`users/{uid}`), quantas telas o exibem, e
   se `firestore.rules` já restringe leitura de algum campo por papel — a
   S109 fez visibilidade por campo no mapa `about`, pode ser o molde.
2. Como isso interage com a TRAVA DE IDENTIDADE da S76-B, que congela nome e
   idade a partir da verificação: decidir na sprint qual dos dois campos
   fica travado. Provável: nome real travado, apelido editável.
3. O que fazer com as contas EXISTENTES, que só têm o campo antigo
   preenchido — precisa de retrocompatibilidade na leitura (apelido cai pro
   nome antigo quando ainda não existir), e a decisão de migrar ou não fica
   pro portão.
4. Onde a AdminVerificationsScreen mostra o nome — ela precisa passar a
   mostrar o nome REAL, senão o admin perde a referência pra conferir.

---

## Fechadas recentemente

| Sprint | O que era |
|---|---|
| S134 | Bug: idade some quando o nome é longo — nome e idade viravam UMA string dentro de `Text numberOfLines={1}`; nome comprido truncava a string inteira e cortava a idade junto. Corrigido nos 5 arquivos onde isso ocorria (`MatchProfileScreen.tsx`, `SwipeScreen.tsx`/`ProfileCard`, `ProfileSheet.tsx`, `LikesScreen.tsx`, `AdminVerificationsScreen.tsx`): nome e idade agora são DOIS `Text` dentro de um `View` (`nameAgeGroup`/`likerNameAgeGroup`) — só o `Text` do nome tem `numberOfLines`+`flexShrink`, o `Text` da idade (`nameAge`/`likerNameAge`) nunca encolhe e só renderiza com guard `displayAge != null`. De caminho, corrigido bug lateral em `SwipeScreen.tsx` e `LikesScreen.tsx`: antes exibiam literalmente `"Nome, null"` quando `displayAge` era `null` (concatenação direta sem guard); agora não renderizam o trecho da idade nesse caso. Client puro, sem rules/functions. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S132 | Enquete visível e votável fora do Descobrir — agora aparece também no perfil do match (MatchProfileScreen), não só no card do Descobrir (ProfileSheet) — commit `a326077`. Client puro. **Fechada em código, ainda SEM teste em aparelho.** |
| S102-B | Desfazer match de dentro da conversa — commit `5b6c49f`. Function `unmatch` (onCall, southamerica-east1) **já deployada em 21/08**. **Fechada em código, ainda SEM teste.** |
| S102-C | Denunciar mensagem específica do chat, reusando a fila de denúncias do admin (S96) — commit `825b56b`, 6 arquivos. `firestore.rules` **já deployadas em 21/08** (saída do deploy trouxe "uploading rules" e "released rules"). NENHUMA Cloud Function envolvida. **Fechada em código, SEM teste.** |
| S126 | Enquete no perfil — commit `d35b935`. `firestore.rules` e as duas functions novas (`onPollVoteCreated`, `onPollChanged`) **já deployadas em 21/08**. **Fechada em código, ainda SEM teste** (exceto push, que espera o build 15). |
| S101 | Paginação do chat — commits `91c734b` + `0710830` (fix: não marcar como lido quando a leitura da âncora falha). Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S122 | Push não chega mais com o app em primeiro plano — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S130 | Colar texto longo no chat (maxLength 2000 + "ler mais") — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S131 | X em "Suas curtidas" desfaz a curtida — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S129-A | Tocar na mensagem citada (`replyTo`) leva até a mensagem original — commit `7439afc`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S120 | Foto obrigatória no cadastro |
| S103 | Painel de números do admin |
| S100 | Estado do Descobrir vazio |
| S98 | Bloqueio preventivo |
| S97 | Pausar perfil / modo invisível |
| S96 | Fila de denúncias no admin |

**S99 — DESCARTADA.** Era filtro de distância social (não mostrar quem é da
mesma agência/cidade). Decidido que não vamos fazer. Não repropor.

---

## Testes pendentes

Seção acumulativa: o que ainda falta testar, por onde dá pra testar.

**Testável no Expo Go agora:**

- S102-B — desfazer match de dentro da conversa; conferir o que acontece na
  tela do **outro** usuário que está com a conversa aberta na hora (risco de
  cair em `permission-denied` em vez de sair da tela); conferir se as
  imagens do chat sumiram do Storage.
- S102-C — denunciar uma mensagem específica do chat (long-press → Denunciar
  mensagem); conferir que a opção só aparece na mensagem do outro usuário e
  some em mensagem apagada.
- S102-C — denunciar uma mensagem de TEXTO: o registro chega na fila do
  admin com o trecho da mensagem, o motivo e o `details`.
- S102-C — denunciar uma mensagem com FOTO: a imagem aparece no detalhe do
  admin.
- S102-C — denunciar mensagem com mais de 400 caracteres: o client tem que
  truncar ANTES de enviar; se não truncar, as rules rejeitam e a denúncia
  falha em silêncio. É o ponto mais provável de quebra.
- S102-C — denúncia de PERFIL continua funcionando (S96 intacta): os 4
  campos novos são opcionais, o caminho antigo não pode ter regredido.
- S102-C — o admin consegue resolver a denúncia normalmente.
- S102-C — copy: o trecho da mensagem tem que aparecer como INFORMADO PELO
  DENUNCIANTE, nunca como transcrição verificada.
- S126 — criar enquete no ProfileScreen (2 a 4 opções), editar e remover;
  conferir que remover/editar zera `pollCounts` e apaga `pollVotes/*` de
  verdade (`onPollChanged`).
- S126 — votar a partir do Descobrir (ProfileSheet) com uma conta B, sem ter
  dado like antes; conferir que a contagem agregada sobe, sem nenhum jeito
  de descobrir quem votou (nem no Console, sem usar Admin SDK).
- S126 — votar duas vezes rápido (dois toques, ou dois devices/telas com a
  mesma conta) — conferir que o segundo toque não derruba a UI com Alert de
  erro (deve cair no ramo `permission-denied` = "já votou", ver
  `handleVotePoll`).
- S126 — perfil sem enquete: card "Enquete" no Descobrir simplesmente não
  aparece; ProfileScreen mostra só o botão "Criar enquete".
- S132 — abrir o perfil de um match com enquete ativa pelo MatchProfileScreen
  (fora do Descobrir); conferir que a enquete aparece e dá pra votar.
- S132 — no ProfileScreen (perfil do dono), conferir que a seção da enquete
  aparece ACIMA do slot "Prompt da semana".
- S132 — regressão: votar pela ProfileSheet/Descobrir (fluxo original da
  S126) continua funcionando.
- **Pré-condição pra qualquer teste de voto acima (S126 e S132):** perfil já
  curtido some do Descobrir, então com duas contas que já se curtiram não há
  de onde votar — precisa de uma terceira conta comum que nunca tenha
  swipado o dono da enquete. A conta admin não serve, a S95 tirou o
  Descobrir dela.
- S135 — cadastrar conta NOVA: os dois campos aparecem no Step 1
  (`RegisterScreen`), os dois são obrigatórios pra avançar, e a conta nasce
  com `nickname` no doc público e `legalName` (nome real) no subdocumento
  privado.
- S135 — editar perfil: "Como quer ser chamado" (cap 30) segue editável
  mesmo depois de verificado; "Nome completo" (cap 60) trava depois de
  verificado, com o mesmo aviso de sempre; antes de verificado, o hint novo
  ("Visível só pra você e pro time de verificação.") aparece embaixo do
  campo.
- S135 — conferir que o nickname (nunca o nome real) aparece em Descobrir,
  ProfileSheet, MatchProfileScreen, Curtidas, Conversas (lista e header do
  Chat) e no modal de match.
- S135 — fila de verificação do admin (`AdminVerificationsScreen`/
  `AdminVerificationDetailScreen`) mostra o NOME REAL, não o nickname —
  conferir com uma conta que tenha os dois valores diferentes.
- S135 — telas de denúncia/suporte do admin (`AdminReportsScreen`,
  `AdminReportDetailScreen`, `MyReportsScreen`, `AdminSupportDetailScreen`)
  continuam mostrando só o nickname, nunca o nome real.
- S135 — conta LEGADA (criada antes desta sprint, ainda sem rodar
  `migrateNicknames.js`): perfil e telas públicas caem no fallback pro
  `name` antigo (`getDisplayName`); editar e salvar o perfil dessa conta
  cria os campos novos (`nickname` + `legalName`) sem erro de permissão.

**Espera o build 15:**

- S101, S122, S129-A, S129-B, S130, S131, S133, S134 (bateria a definir).
- S133 — arrastar o card atual no Descobrir e conferir que o card de trás
  fica invisível parado (translateX/Y = 0) e vai ganhando nitidez só
  conforme o dedo se aproxima do limiar de swipe (`SWIPE_THRESHOLD`),
  tanto arrastando na horizontal quanto na vertical.
- S129-B — com duas contas em dois aparelhos (ou emuladores), conferir os 3
  estados do tique na conversa de quem MANDOU a mensagem: 1 tique cinza
  (enviado) assim que o outro lado ainda não abriu o app/tela de
  Conversas; 2 tiques cinza (entregue) assim que o app do outro lado
  sincronizar em foreground (não precisa abrir o chat, só estar logado —
  `useUnreadCount` roda em qualquer tela); 2 tiques verdes (lido) só
  depois que o outro lado abrir a conversa de fato. Conferir que match
  bloqueado (por qualquer lado) NUNCA marca entregue.
- S134 — conferir em aparelho de verdade, com nome real comprido (não só
  simulador), que a idade aparece por completo ao lado do nome truncado nos
  5 pontos: card do Descobrir (frente e trás), MatchProfileScreen,
  ProfileSheet, Curtidas e fila de verificação do admin.
- S126 — dono recebe o push anônimo quando alguém vota na enquete; Expo Go
  não entrega push no SDK 54, precisa do build.
- S135 — título/corpo do push de match e de mensagem mostram o NICKNAME
  (nunca o nome real); Expo Go não entrega push no SDK 54, precisa do
  build.

---

## Dívidas técnicas (não bloqueiam, sem sprint própria por enquanto)

- **S102-C** — `messageImageUrl` aceita qualquer string; a tela do admin
  renderiza como imagem, então o aparelho dele busca URL arbitrária
  fornecida por usuário. Fecha com
  `matches('https://firebasestorage\\.googleapis\\.com/.*')`.
- **S102-C** — `matchId` e `messageId` não têm limite de tamanho (`details`
  tem 2000, `messageText` tem 400, esses dois não têm nada).
- **S102-C** — `matchId`/`messageId` são texto livre sem vínculo com o
  denunciante: dá pra mandar `matchId` de conversa alheia ou inventado.
  Risco de moderação, não de segurança.
- **S132** — a enquete ficou acima do "Prompt da semana" (S50) na ordem do
  ProfileScreen; o push semanal de segunda 12h do S50 convida a responder o
  prompt, e esse convite deixou de ser o primeiro chamado à ação do perfil.
  Risco aceito ao fechar a sprint; revisitar se virar problema real.

---

## Decisões de produto que valem para o projeto inteiro

- Desfazer curtida ou super curtida **nunca devolve cota**.
- Ação destrutiva pede **confirmação** antes.
- Salvaguarda de segurança **falha fechada**: se a verificação não puder ser
  concluída, a ação arriscada não acontece.
- Nenhuma **tela** importa de `firebase/firestore` — quem traduz é o serviço.
- Erro não é engolido em silêncio; falha que o usuário causou, o usuário vê.
- A ficha das duas lojas promete "sem 'assine para ver quem curtiu você'" —
  nenhum modelo de monetização pode contradizer isso.
- **S135 — nome real do usuário nunca aparece fora da tela de verificação do
  admin.** Em TODO canto público (Descobrir, perfil, Curtidas, Conversas,
  pushes) e em toda tela de admin que NÃO seja a fila de verificação
  (`AdminReportsScreen`/`AdminReportDetailScreen`/`MyReportsScreen`/
  `AdminSupportDetailScreen`), o nome exibido é sempre o `nickname` ("como
  quer ser chamado", via `getDisplayName` em `src/utils/profile.ts`) — nunca
  o nome legal completo (`users/{uid}/private/legalName`, legível só pelo
  dono e pelo admin nas rules). Só `AdminVerificationsScreen`/
  `AdminVerificationDetailScreen` mostram o nome real, porque é a referência
  que o revisor humano confere contra a selfie. Qualquer tela nova que
  exiba nome de usuário segue essa mesma regra por padrão.

## Armadilhas do chat (valem pra qualquer sprint que mexa em ChatScreen/listenMessages)

- O corte da janela do listener tem que ser por **cursor** (`startAt` com
  `QueryDocumentSnapshot`), **nunca** por `where('createdAt','>=',Timestamp)`.
  Motivo: um `where` exige mesmo typeOrder, e mensagem recém-enviada tem
  `serverTimestamp` **pendente** (typeOrder 4) ≠ `Timestamp` concreto
  (typeOrder 3) — o eco otimista do próprio envio some da tela. Cursor usa
  outro caminho de comparação e inclui o pendente.
- `limitToLast` **exige** `orderBy` explícito no mesmo query, senão lança em
  runtime. O `tsc` não pega isso.
- A tela é reusada em deep link/notificação **sem desmontar** — toda função
  assíncrona precisa de guarda de cancelamento por `matchId`.
- O chat acumulou muita coisa que depende do histórico: reações (S80), tique
  de leitura (S86), `replyTo`, editar (S92), apagar (S85) e o "ler mais"
  (S130). Qualquer mudança na janela mexe com todas.
- Apagar o doc `matches/{matchId}` devolve `permission-denied` pro listener
  do **outro** usuário, não "documento inexistente" — toda tela que ouve um
  match tem que tratar `permission-denied` como "match desfeito" e sair,
  nunca como erro genérico.

## Padrões de escrita no Firestore (valem para o projeto inteiro)

- **Escrita create-only** (rule com `allow update: if false`, sem contar
  `deleteField()`/reset explícito de outra fonte) que falha com
  `permission-denied` numa corrida (dois toques, dois devices/telas
  simultâneos) **não é erro** — é sinal de que o estado já existe (swipe já
  registrado, voto já dado). O client trata como sucesso silencioso
  (estado otimista já está certo), **nunca** Alert genérico de erro. Padrão
  usado em `getSwipe`/`recordSwipe` (S49, MatchProfileScreen), `unmatch`
  (S102-B, apagar match) e `castPollVote` (S126, `pollVotes/{voterUid}`) —
  qualquer collection nova com o mesmo desenho (1 doc por par de uids,
  create-only) deve seguir o mesmo tratamento no catch.
- **Trava de imutabilidade cujo campo travado NÃO mora no mesmo doc que a
  condição que a liga/desliga precisa de `get()` cruzado, não do "mesmo
  doc" (`resource.data`/`request.resource.data`) que basta quando os dois
  vivem juntos.** Descoberto na S135: a trava de nome pós-verificação
  (S76-B1) migrou de `users/{uid}.name` pra `users/{uid}/private/legalName`,
  mas o campo `verified` continua só em `users/{uid}` (doc PAI) — a regra de
  `update` do subdocumento precisa de
  `get(/databases/$(database)/documents/users/$(userId)).data.get('verified', false)`,
  mesmo molde já usado em `pollVotes`/`photoLikes` pra ler um doc diferente
  do que está sendo escrito.

## Padrões de UI que valem para o projeto inteiro

- **Campo obrigatório nunca entra na mesma string que um campo truncável.**
  Descoberto na S134: nome + idade concatenados numa string única dentro de
  `Text numberOfLines={1}` faz o RN truncar a STRING INTEIRA quando o nome
  sozinho já preenche a largura — a idade (que vem depois na string) some
  junto, mesmo sendo obrigatória. Correção: `View` wrapper
  (`flexDirection: 'row', alignItems: 'center', flexShrink: 1`) com DOIS
  `Text` — o campo que pode truncar leva `numberOfLines`+`flexShrink`, o
  campo obrigatório não leva nenhum dos dois (nunca encolhe/corta). Vale
  para qualquer par nome+atributo obrigatório renderizado em linha única,
  não só nome+idade.
- **Nunca concatenar valor opcional direto na string do `Text`.** Escrever
  `` `${nome}, ${idade}` `` sem guard produz literalmente `"Nome, null"` na
  tela quando o valor é `null`/`undefined` (visto em `SwipeScreen.tsx` e
  `LikesScreen.tsx` antes da S134). Renderizar condicionalmente:
  `{valor != null && <Text>, {valor}</Text>}`.

## Baseline técnica

- `npx tsc --noEmit` → exit 0
- `npx eslint .` → **0 erros / 21 warnings**. Não pode piorar.

---

## Ideias sem número (não são sprint ainda)

Classificados / "OLX de funcionários" · feed "rádio corredor" · joguinho de
moedas · modelo de negócio. Todas levantadas em 17/08, nenhuma com decisão.
