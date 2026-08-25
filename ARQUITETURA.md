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
reexport nomeado das 31 Cloud Functions do projeto (nenhuma lógica).
Arquivos de domínio: `chat.ts` (matches/mensagens/bloqueios/unmatch),
`admin.ts` (verificação, suporte, denúncias, cadastro de testador),
`account.ts` (`deleteAccount`), `perfil.ts` (fundador, enquete de perfil,
marcos/selos), `momentos.ts` (`expireMomentos`), `grupos.ts` (expiração e
fluxo de grupos), `eventos.ts` (expiração e fluxo de eventos),
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
  `expiresAt`, `pollCounts`, `poll`, `memberCount`. Subcoleções:
  `members/{uid}`, `joinRequests/{uid}`, `messages/{messageId}`,
  `pollVotes/{voterUid}`.
- `events/{eventId}` — evento presencial (S125). `title`, `creatorId`,
  `purgeAt`. Subcoleções: `participants/{uid}`, `joinRequests/{uid}`,
  `private/location`.
- `presence/{uid}` — `lastSeenAt` (S82).
- `testerSignups/{signupId}` — só escrita pela landing (`site/`), fora do
  app RN.
- `config/founders` — doc único `{enabled, count}`, criado manualmente no
  console.

## Cloud Functions (`functions/src/index.ts`, região `southamerica-east1`)

Hoje são 31 functions exportadas (não 27 — número desatualizado que
circulava no ROADMAP.md).

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
| `staleMatchReminder` | `onSchedule` diário 19h | cutuca matches de 48-72h sem mensagem |
| `reengagementPush` | `onSchedule` diário 20h | cutuca usuários inativos 3+ dias |
| `weeklyPromptPush` | `onSchedule` seg 12h | prompt semanal pra todos (exceto opt-out) |
| `assignFounderNumber` | `onDocumentCreated users/{uid}` | atribui selo fundador 1..100 via `config/founders` |
| `expireMomentos` | `onSchedule` a cada hora | apaga momentos expirados (molde de expiração) |
| `expireGroups` | `onSchedule` a cada hora | idem grupos |
| `expireEvents` | `onSchedule` diário 3h | idem eventos |
| `deleteAccount` | `onCall` | apaga em cascata todos os dados do usuário + Auth |
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
