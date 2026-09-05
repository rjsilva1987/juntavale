# ARQUITETURA.md

Mapa estável do terreno do JuntaVale. Mantido À MÃO — não é gerado. A
sprint que criar/remover collection, function ou molde reusável ATUALIZA
este arquivo como parte da própria sprint (mesma lógica do `rules-stamp`
do `firestore.rules`). O agente `jv-recon` (`.claude/agents/jv-recon.md`)
lê este arquivo como parte do primeiro passo, antes de investigar o
código — cite o que está aqui em vez de remapear o mesmo terreno.

## Estrutura de pastas

`src/` — `components/`, `screens/`, `services/`, `hooks/`, `contexts/`,
`constants/`, `utils/`, `config/`, `navigation/`, `polyfills/`,
`linking.ts`. Convenção do projeto (ROADMAP.md, "Decisões de produto que
valem para o projeto inteiro"): nenhuma TELA importa `firebase/firestore`
direto — quem acessa é `services/` ou um hook/context dedicado (ex.:
`useAchievements`, `useReplyQuota`, `AuthContext`). Duas exceções
aparentes hoje são só de tipo/utilitário, sem leitura/escrita:
`ChatScreen.tsx` importa `Timestamp`, `ProfileScreen.tsx` importa
`deleteField`.

`functions/src/` — quebrado por domínio desde S144-C. `index.ts` é só
reexport nomeado das 42 Cloud Functions do projeto (nenhuma lógica, já com
`adminDeleteContent` da S180-B). Arquivos de domínio: `chat.ts` (matches/
mensagens/bloqueios/unmatch), `admin.ts` (verificação, suporte, denúncias,
cadastro de testador, `adminDeleteContent` — admin exclui grupo/evento/
anúncio, S180-B), `account.ts` (`deleteAccount`), `perfil.ts` (fundador, enquete de perfil,
marcos/selos), `momentos.ts` (`expireMomentos`), `grupos.ts` (expiração e
fluxo de grupos), `eventos.ts` (expiração e fluxo de eventos),
`listings.ts` (`onListingSubmitted` e `onListingChatMessageCreated`, push pro
admin de anúncio na fila e push do chat interessado↔anunciante, S168-B),
`agendadas.ts` (as 3 scheduled functions de reengajamento/prompt).
`shared/index.ts` é o único lugar que chama `initializeApp()` e declara
`GMAIL_APP_PASSWORD` (`defineSecret`); concentra `db`/`bucket`/`expo`/
`REGION`/`ADMIN_UID(S)`/`isAdminUid`/`getPushToken`/`getUserBasicInfo`/
`sendExpoNotifications` — todo arquivo de domínio importa daqui, nunca
reinstancia esses singletons.

## Collections do Firestore

- `users/{uid}` — perfil público (`nickname`, `bio`, `about`/`aboutHidden`
  do S109, `poll`/`pollCounts` do S126, `matchesCount`, `founderNumber`,
  `verified`, `blockedUsers`, `lastActiveAt`). Subcoleções:
  `private/registration`, `private/legalName` (nome legal — só dono/admin
  lê, S135), `private/push` (token Expo), `private/reengagement`,
  `achievements/{id}` (selos, create-only Admin SDK), `superLikes/usage`,
  `superLikes/dailyGrant`, `replies/usage`, `pollVotes/{voterUid}` (voto
  anônimo, S126), `photoLikes/{id}`.
- `matches/{matchId}` — doc id = `[uidA,uidB].sort().join('_')`, criado no
  client. Campos: `users[]`, `createdAt`, `lastMessage`, `blockedBy[]`,
  `lastReadAt`, `deliveredAt`. Subcoleções: `messages/{messageId}`,
  `reactions/{messageId}`, `hidden/{uid}` (apagar só pra mim).
- `swipes/{fromUid_toUid}` — `from`, `to`, `direction` (like/nope/superlike),
  `note` (S67), `context`.
- `verifications/{uid}` — `status` (pending/approved/rejected), `selfieUrl`.
- `support/{ticketId}` — ticket de suporte, com subcoleção
  `messages/{messageId}`.
- `reports/{reportId}` — fila de denúncia (S96), com contextos opcionais
  mutuamente exclusivos: mensagem de chat (S102-C), momento (S121), grupo
  (S124-A), evento (S125). Subcoleção `messages/{messageId}`.
- `blocks/{blockerUid_blockedUid}` — bloqueio entre usuários.
- `momentos/{uid}` — doc id == uid, story 24h (S121). `authorId`, `type`
  (text/photo), `text`, `photoUrl`, `createdAt`, `expiresAt`.
- `groups/{groupId}` — sala de grupo (S124-A). `name`, `creatorId`,
  `expiresAt`, `pollCounts`, `poll`, `memberCount`, `status?: 'removed'` +
  `removedAt?`/`removedBy?` (S180-B, só admin grava, via ramo próprio do
  `allow update` — grupo encerrado some do Explorar, fica em "Meus grupos"
  marcado "Encerrado", chat vira só leitura). Subcoleções: `members/{uid}`,
  `joinRequests/{uid}`, `messages/{messageId}`, `pollVotes/{voterUid}`.
- `events/{eventId}` — evento presencial (S125). `title`, `creatorId`,
  `purgeAt`, `status?: 'cancelled'` + `cancelledAt?`/`cancelledBy?` — S180-A
  gravado pelo Admin SDK (`deleteAccount`, sem `cancelledBy`), S180-B
  também pelo admin via ramo próprio do `allow update` (client, com
  `cancelledBy`). Subcoleções: `participants/{uid}`, `joinRequests/{uid}`,
  `private/location`.
- `listings/{listingId}` — anúncio de classificados (S168-A). `ownerId`,
  `ownerNickname` (nickname, S135), `title`, `description`, `priceType`
  (fixed/negotiable/donation), `price?` (só quando fixed), `category`
  (catálogo fixo de 7 chaves), `uf` (sem cidade, imutável após create),
  `photos[]` (0-3), `status`
  (pending/approved/rejected/sold/removed/expired — `expired` desde S172),
  `rejectionReason?`/`reviewedAt?`/`reviewedBy?` (só admin, mesmo molde de
  verifications), `createdAt`, `expiresAt` (+30 dias, computado no client).
  Moderação por APROVAÇÃO PRÉVIA: nasce sempre `pending`; editar conteúdo
  (dono) sempre volta pra `pending`; só `approved`/`rejected` são setados
  pelo admin (`AdminListingsScreen`/`AdminListingDetailScreen`, mirror da
  fila de verificações). S172 — a expiração de verdade é a scheduled
  function `expireListings` (diária, 09:00 São Paulo, approved→expired +
  push `listing_expired` pro dono); o filtro client em
  `listApprovedListings` continua como cinto de segurança pro intervalo
  entre uma rodada e outra. Renovação em 1 toque (`renewListing`,
  expired→approved, +30 dias, SEM voltar pra fila de moderação) tem ramo
  próprio no `allow update` do dono. S170 adiciona `onListingSubmitted`
  (push pro admin ao entrar em `pending`). get/list seguem SEM
  `where('expiresAt', ...)` nas rules (armadilha S139/S125-A do ROADMAP).
  Lê: dono, admin, e qualquer verificado (só docs `approved`/`sold` —
  `expired` fica invisível pra quem não é dono/admin). Escreve: dono
  cria/edita conteúdo/renova (sempre verificado), admin revisa,
  `expireListings` expira. Apagados pelo `deleteAccount` (S173).
- `listingChats/{chatId}` — chat 1:1 SEM match entre o interessado e o dono
  de um anúncio (S168-B), `chatId = ${listingId}_${interestedId}`. `ownerId`,
  `interestedId`, `participants[]` (`[ownerId, interestedId]`, nessa ordem),
  `listingTitle` (snapshot do título), `lastMessage`/`lastMessageAt`
  (escritos pelo CLIENT, não por Cloud Function — decisão desta sprint),
  `lastReadAt` (mirror S27). Subcoleção `messages/{messageId}` (mirror de
  `groups/{groupId}/messages` sem edição, só "apagar pra todos"). Apagados
  pelo `deleteAccount` (S173).
- `presence/{uid}` — `lastSeenAt` (S82).
- `testerSignups/{signupId}` — só escrita pela landing (`site/`), fora do
  app RN.
- `config/founders` — doc único `{enabled, count}`, criado manualmente no
  console.

## Cloud Functions (`functions/src/index.ts`, região `southamerica-east1`)

Hoje são 42 functions exportadas (contagem pelos exports de
`functions/src/index.ts` em 04/09/2026, já com `adminDeleteContent` da
S180-B — o "41" anterior já estava
defasado). A tabela abaixo ainda NÃO lista 6 delas, todas triggers reais:
`onMomentoLikeCreated`, `onMomentoLikeDeleted`, `onMomentoRequestCreated`,
`onMomentoRequestUpdated`, `onMomentoRequestMessageCreated` (`momentos.ts`)
e `onGroupMessageCreated` (`grupos.ts`) — dívida de documentação anotada
no ROADMAP (S170).

| Function | Trigger | O que faz |
|---|---|---|
| `onMatchCreated` | `onDocumentCreated matches/{matchId}` | incrementa `matchesCount`/desbloqueia achievement `firstMatch`, push de novo match |
| `onSuperLikeReceived` | `onDocumentCreated swipes/{swipeId}` | push anônimo de super curtida |
| `onMessageCreated` | `onDocumentCreated matches/.../messages/{messageId}` | atualiza `lastMessage` do match, push pro destinatário |
| `onMessageDeletedForEveryone` | `onDocumentUpdated matches/.../messages/{messageId}` | sincroniza `lastMessage` quando última msg vira lápide ou é editada |
| `onBlockCreated` | `onDocumentCreated blocks/{blockId}` | arquiva matches entre os dois |
| `onBlockDeleted` | `onDocumentDeleted blocks/{blockId}` | reverte arquivamento |
| `onVerificationReviewed` | `onDocumentUpdated verifications/{uid}` | sincroniza `users/{uid}.verified`, apaga selfie, push de resultado |
| `onVerificationSubmitted` | `onDocumentWritten verifications/{uid}` | avisa admin de novo pedido |
| `onSupportMessageCreated` | `onDocumentCreated support/.../messages/{messageId}` | atualiza ticket + push |
| `onReportMessageCreated` | `onDocumentCreated reports/.../messages/{messageId}` | idem, fila de denúncias |
| `onReportCreated` | `onCreate reports/{reportId}` | push "Nova denúncia para revisar" pra todos os admins (S174); ignora denúncia feita por admin |
| `adminDeleteContent` | `onCall` | admin apaga grupo (+ subcoleções + `images/groupChats/{id}`), evento (+ subcoleções) ou anúncio (doc + fotos por URL; `listingChats`/`reports` ficam) — S180-B |
| `staleMatchReminder` | `onSchedule` diário 19h | cutuca matches de 48-72h sem mensagem |
| `reengagementPush` | `onSchedule` diário 20h | cutuca usuários inativos 3+ dias |
| `weeklyPromptPush` | `onSchedule` seg 12h | prompt semanal pra todos (exceto opt-out) |
| `assignFounderNumber` | `onDocumentCreated users/{uid}` | atribui selo fundador 1..100 via `config/founders` |
| `expireMomentos` | `onSchedule` a cada hora | apaga momentos expirados (molde de expiração) |
| `expireGroups` | `onSchedule` a cada hora | idem grupos |
| `expireEvents` | `onSchedule` diário 3h | idem eventos |
| `deleteAccount` | `onCall` | apaga em cascata todos os dados do usuário + listings do dono (+ images/listings/{uid}) + listingChats em que participa (+ messages + images/listingChats/{chatId}) (S173) + Auth (S180-A) grupos criados: transfere pro membro mais antigo (creatorId + role) ou apaga se vazio; sai dos grupos de outros com memberCount coerente e apaga grupo que ficou com 0 membros; evento futuro criado → status 'cancelled', passado fica; sai das participações em eventos de outros com participantCount coerente |
| `unmatch` | `onCall` | apaga um match a pedido de um participante |
| `onTesterSignupCreated` | `onDocumentCreated testerSignups/{id}` | email via Gmail pro contato |
| `onPollVoteCreated` | `onDocumentCreated users/.../pollVotes/{voterUid}` | incrementa `pollCounts` + push (molde de contador agregado via `increment`) |
| `onPollChanged` | `onDocumentUpdated users/{uid}` | reseta enquete de perfil ao editar |
| `onUserProfileUpdated` | `onDocumentUpdated users/{uid}` | desbloqueia achievement `profileComplete` |
| `tenDaysInAppCheck` | `onSchedule` diário 21h | desbloqueia achievement `tenDaysInApp` |
| `onGroupJoinRequestCreated` | `onDocumentCreated groups/.../joinRequests/{uid}` | push pro criador (molde de pedido de entrada) |
| `onGroupMemberCreated` | `onDocumentCreated groups/.../members/{uid}` | push pro aprovado |
| `onEventJoinRequestCreated` | `onDocumentCreated events/.../joinRequests/{uid}` | mirror de `onGroupJoinRequestCreated` |
| `onEventParticipantCreated` | `onDocumentCreated events/.../participants/{uid}` | mirror de `onGroupMemberCreated` |
| `onGroupPollVoteCreated` | `onDocumentCreated groups/.../pollVotes/{voterUid}` | mirror de `onPollVoteCreated`, sem push |
| `onGroupPollChanged` | `onDocumentUpdated groups/{groupId}` | mirror de `onPollChanged` |
| `getGroupActiveNowCount` | `onCall` | conta membros online agora, sob demanda |
| `onListingSubmitted` | `onDocumentWritten listings/{listingId}` | avisa admin de anúncio novo/re-submetido na fila de moderação (S170) |
| `onListingChatMessageCreated` | `onDocumentCreated listingChats/.../messages/{messageId}` | push pro outro participante do chat interessado↔anunciante (S168-B) |
| `expireListings` | `onSchedule` diário 09h | expira anúncios approved vencidos (approved→expired) + push de renovação pro dono (S172) |

## Moldes reusáveis

1. **Expiração (S121)** — `onSchedule` + query por campo de expiração
   (`expiresAt`/`purgeAt`) + releitura em `runTransaction` por doc antes de
   apagar (evita apagar doc sobrescrito entre query e commit) +
   delete/`recursiveDelete` + limpeza de Storage em try/catch. Usado por
   `expireMomentos`, `expireGroups`, `expireEvents`.
2. **Pedido de entrada (S124-A)** — doc em `{parent}/joinRequests/{uid}`
   dispara push pro dono; aprovação vira doc em
   `{parent}/members|participants/{uid}` (guarda pra não notificar o
   próprio criador). Usado por grupos e replicado em eventos (S125).
3. **Visibilidade por campo (S109)** — SEM Cloud Function dedicada, é
   client puro (filtro no lado do leitor): campo `aboutHidden?: AboutFieldId[]`
   em `users/{uid}`, editado via modal próprio, filtro aplicado no LADO DO
   LEITOR (`.filter(...)`), não na escrita. HÁ, porém, validação em
   `firestore.rules`: tamanho máximo de `aboutHidden` (`size() <= 30`) e
   presença no `hasOnly` de campos permitidos no update de perfil.
4. **Nome público vs. nome legal (S135)** — regra do projeto inteiro (ver
   ROADMAP.md seção "Decisões de produto que valem para o projeto
   inteiro"): nome exibido em qualquer lugar público é sempre o
   `nickname`, nunca `users/{uid}/private/legalName`; só a fila de
   verificação do admin mostra o nome real.
5. **Denúncia/report (S96/S102-C)** — criação em `reports/{reportId}` com
   contextos opcionais mutuamente exclusivos (mensagem/momento/grupo/
   evento); gestão via fila do admin; mesmo esqueleto de thread que o
   suporte (`support/`).
6. **Contador agregado (S126)** — CUIDADO, dois desenhos DIFERENTES no
   projeto, não confundir: (a) `pollCounts` de enquete (perfil e grupo)
   usa `FieldValue.increment()` direto no servidor (seguro sem transação)
   + reset via function companheira que detecta mudança na pergunta e
   apaga a subcoleção de votos; (b) `groups/{groupId}.memberCount` é
   mantido pelo CLIENT via `runTransaction` SEM `FieldValue.increment()`,
   lendo o valor fresco de dentro da transação — `firestore.rules` EXIGE
   essa transação: a rule bloqueia qualquer update de `memberCount` que
   não seja exatamente `+1` ou `-1` sobre o valor atual, com
   `affectedKeys().hasOnly(['memberCount'])`; quem copiar este molde
   precisa repetir essa restrição na rule.
7. **Navegação por toque nos lados (S123/S143-A)** — metade esquerda da
   área tocável volta um item, metade direita avança um, no modelo dos
   stories do Instagram. Molde já usado em `PhotoCarousel.tsx`
   (`goToPrevious`/`goToNext`, no-op nas pontas, não fecha nem erra) e em
   `MatchProfileScreen.tsx`/`SwipeScreen.tsx` via
   `react-native-gesture-handler`: `Gesture.Tap().maxDuration(250).maxDistance(10)`,
   comparando `x` (do evento) contra a metade da largura medida via
   `onLayout`. A S143-A estendeu esse molde pro `MomentoViewerModal.tsx`,
   onde o tap curto precisa conviver com pausa por toque longo do timer de
   5s. AQUI NÃO dá pra usar um único `Gesture.Tap` com `onTouchesDown`/
   `onEnd`/`onFinalize` fazendo pausa+navegação ao mesmo tempo (tentativa
   original da S143-A, corrigida em auditoria): `maxDuration(250)` do
   `Gesture.Tap` é um timer NATIVO que falha (`FAILED`) o reconhecedor
   sozinho ~250ms após o toque começar, mesmo com o dedo ainda na tela, e
   essa transição pra `FAILED` já dispara `onFinalize(event, false)`
   sozinha, na hora do timeout — não na hora do dedo soltar de verdade
   (`node_modules/react-native-gesture-handler/src/handlers/gestures/
   eventReceiver.ts`). Num toque longo isso resumia o timer aos ~250ms com
   o dedo ainda pressionado. A correção usa DOIS reconhecedores compostos
   via `Gesture.Simultaneous` (mesmo padrão de composição de
   `SwipeScreen.tsx`/`MatchProfileScreen.tsx`, mas aqui sem `PagerView`
   concorrente — não é por causa dele): `Gesture.LongPress().minDuration(0)`
   pausa no `onStart` (ativa na hora, sem timer, porque `minDurationMs == 0`
   pula o `postDelayed`) e retoma no `onFinalize`, que só dispara no
   `ACTION_UP` real (`.../LongPressGestureHandler.kt`); um
   `Gesture.Tap().maxDuration(250).maxDistance(10)` separado só decide a
   navegação no `onEnd`, igual ao molde original.
   **Rodada 2 de correção (mesma sprint) bloqueou por mais dois gaps, os
   dois só em `MomentoViewerModal.tsx`:** (a) `GestureDetector` dentro de
   `<Modal>` precisa de um `GestureHandlerRootView` PRÓPRIO aninhado
   dentro do `Modal` — pelo MESMO motivo do `SafeAreaProvider` aninhado
   (ver "Padrões de UI que valem para o projeto inteiro" no
   `ROADMAP.md`): a raiz nativa do `Modal` não é descendente do
   `RNGestureHandlerRootView` de `App.tsx`, então
   `hasGestureHandlerEnabledRootView` (`.../RNGestureHandlerRootView.kt`)
   sobe a árvore, acha a raiz genérica do `Modal` primeiro e retorna
   `false`; (b) `Gesture.LongPress()` sem `.maxDistance(...)` herda o
   default nativo (~10dp/10pt) e cancela sozinho por tremor de mão num
   toque longo de vários segundos — corrigido com
   `.maxDistance(100000)` em `pauseResumeGesture`, já que esta área não
   compete com nenhum gesto de arraste/scroll.
