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

## Histórico do rules-stamp

Histórico movido de `firestore.rules` na sprint S144-B (redução de custo
de leitura do carimbo), cobrindo as entradas de S135 até S-Matrícula. O
carimbo em `firestore.rules` mantém só as 5 entradas mais recentes; o
restante vive aqui, verbatim.

+ S135 (23/08/2026 — nome real vira PRIVADO de verdade
(rules-level, não só escondido da UI): users/{uid} perde o campo `name`
[público, causava truncamento em card/cabeçalho — S134] e ganha
`nickname` [público, "como quer ser chamado", SEM trava de imutabilidade
— editável sempre, mesmo depois de verificado]; nome real migra pro novo
subdocumento users/{uid}/private/legalName [allow read: isOwner||isAdmin,
mesmo molde de private/registration], carregando a trava de imutabilidade
pós-verificação que antes vivia em `name` (S76-B1, removida daqui — ver
comentário no lugar de onde saiu). isValidProfile: `name` deixa de ser
exigido incondicionalmente, `nickname` entra como opcional [molde
gender/uf/vale] — só obrigatório no allow create [molde lookingFor/uf/
vale], nunca em isValidProfile, porque essa função roda no update também
e uma conta legada sem nickname ainda [janela até o script de migração
manual, functions/scripts/migrateNicknames.js, rodar] ficaria impedida
de salvar qualquer edição de perfil se nickname virasse obrigatório ali)
+ S129-B (23/08/2026 — terceiro tique estilo WhatsApp
("entregue"): novo campo deliveredAt em matches/{matchId}, mesmo padrão
de lastReadAt (S27/S86) — mapa por uid, cada participante só escreve a
própria chave, valor tem que ser timestamp) + S127 (23/08/2026 — Marcos e selos: nova collection
users/{uid}/achievements/{achievementId} [id firstMatch|profileComplete|
tenDaysInApp, doc {unlockedAt}], create-only e write EXCLUSIVO de Cloud
Function via Admin SDK — allow read restrito ao dono, allow write: if
false pra todo mundo, inclusive o próprio dono; matchesCount [novo campo
em users/{uid}] de propósito NÃO entra em hasOnly nenhum de create/update,
mesmo tratamento já dado a founderNumber/pollCounts, só Admin SDK escreve)
+ S128 (22/08/2026 — Super Curtida diária: novo doc
users/{uid}/superLikes/dailyGrant [irmão do superLikes/usage, campos
{year,month,day} UTC, sem contador — create/update só grava a data de
hoje, e só quando o valor anterior do doc, se existir, é de outro dia];
swipes/{swipeId} allow create, ramo direction=='superlike', passa a ser
um OR de dois ramos [verified continua a PRIMEIRA condição, FORA do OR]:
Ramo A consome o dailyGrant do dia via getAfter/exists/get [mesmo padrão
do usage], Ramo B é a validação mensal já existente, cópia idêntica, sem
nenhuma mudança de lógica) + S128-fix (22/08/2026 — correção pós-auditoria:
Ramo A ganhou existsAfter(dailyGrant) como PRIMEIRA condição, curto-
circuito antes de qualquer getAfter(dailyGrant).data.*, porque getAfter()
de doc inexistente lança erro e negava a allow create INTEIRA [não só o
ramo] pra client pré-S128 que nunca escreve dailyGrant no batch) + S123 (22/08/2026 — nova collection users/{ownerUid}/photoLikes/
{likeId}, curtir foto pós-match [MatchProfileScreen, !isPreview]: likeId
determinístico `${likerUid}_${encodeURIComponent(photoUrl)}`, toggle via
create/delete diretos (nunca update — allow update: if false). allow read
aberto a isSignedIn(), igual match /users/{userId} — curtida de foto não é
anônima (revela quem curtiu, mas sem lista de curtidores nesta sprint, só
contador no client). create exige likerUid == request.auth.uid, likerUid
!= ownerUid, hasOnly(['photoUrl','likerUid','createdAt']), createdAt ==
request.time, e valida photoUrl contra o array `photos` do dono via
get() — só é possível curtir uma foto que de fato está no perfil.
delete exige resource.data.likerUid == request.auth.uid.) + S121 (22/08/2026 — nova collection raiz momentos/{uid} [doc ID
== uid do autor, story de 24h, audiência é a base inteira]: allow read exige
expiresAt > request.time [doc expirado fica ilegível antes mesmo da function
de limpeza rodar]; create/update exige dono, type in ['text','photo'],
createdAt == request.time, expiresAt numa janela de 23h-25h a partir de
request.time, texto OU foto mutuamente exclusivos; allow delete só do dono.
reports/{reportId} ganha 3 campos opcionais novos — momentoId, momentoText
[<=400] e momentoPhotoUrl — no create, mesmo molde de matchId/messageId/
messageText/messageImageUrl da S102-C, liberando denúncia de um momento
específico reusando a mesma coleção/fila) + S102-C (21/08/2026 — reports/{reportId} ganha campos
opcionais matchId, messageId, messageText [snapshot truncado, <=400] e
messageImageUrl no create, liberando denúncia de mensagem específica do
chat, reusa a mesma coleção/fila da S96) + S126 (21/08/2026 — Enquete no perfil: users/{userId} ganha
campo `poll`, mapa {question, options} opcional, validado em
isValidProfile e liberado só no hasOnly do UPDATE — cadastro nunca nasce
com enquete; `pollCounts` de propósito NÃO entra em hasOnly nenhum, só
Admin SDK escreve; nova collection users/{ownerUid}/pollVotes/{voterUid},
create-only, allow read restrito ao próprio votante — dono nunca lê quem
votou o quê) + S120 (isValidProfile: teto de data.photos passa de <=6 pra
<=4, alinhando com MAX_PROFILE_PHOTOS do client em firestoreService.ts —
só o número mudou, hasOnly de create/update de users/{userId} continuam
intactos, `photos` já estava nas duas listas antes desta sprint) + S116
(nova collection testerSignups — captação de testadores
pela landing: allow create público (sem auth) restrito a exatamente 3
campos via hasOnly+hasAll — email (string, 5<len<=200, regex simples),
createdAt (== request.time) e source (== 'site'); allow read/update/delete
bloqueado pra todo mundo, leitura é só via Console/Admin SDK, que ignora
rules; cada `match` é isolado — testerSignups não herda nada do
catch-all {document=**}=>false no fim do arquivo, só cobre esse; nenhuma
regra existente foi tocada) + S115 (segundo uid admin — isAdmin() passa a aceitar 2 uids via
`in [...]`, mesma sintaxe já usada em `status in [...]` mais abaixo; regra
de create de matches/{matchId} ganha 2ª cláusula !('uid2' in ...users)
cobrindo o admin novo, ao lado da já existente do admin original) + S113
(reports/{reportId}/messages e support/{ticketId}/messages
ganham campo imageUrl opcional, mesmo molde de matches/{matchId}/messages:
string quando presente, entra no hasOnly do create; text deixa de exigir
tamanho mínimo — vazio só é aceito quando há imageUrl, guarda de "texto OU
foto" via `text.size() > 0 || 'imageUrl' in request.resource.data`; guarda
de abuso .matches('.*\\S.*') contra string só-espaço passa a só se aplicar
quando text não está vazio) + S109 (users/{userId} ganha campo aboutHidden, array de
AboutFieldId opcional — visibilidade por campo do `about`: isValidProfile
exige só data.aboutHidden is list && data.aboutHidden.size() <= 30, molde
exato da cláusula de `about` logo abaixo, inserida ao lado dela; entra no
hasOnly do UPDATE apenas, fora do create — conta nova nasce sem nada
escondido, ou seja, tudo visível por default) + S104 (users/{userId} ganha campo about, mapa livre — piloto
do perfil estruturado: isValidProfile exige só data.about is map &&
data.about.keys().size() <= 30, as chaves de DENTRO do mapa não são
validadas — deliberado, pra que um campo novo no catálogo do client
(src/constants/profileAbout.ts) não exija mexer nas rules nem fazer
deploy; entra no hasOnly do UPDATE apenas, fora do create — conta nova
nasce sem o campo; molde exato da cláusula de filters logo acima, só
com teto de chaves a mais) + S97 (users/{userId} update ganha campo paused, bool opcional
— "pausar perfil"/modo invisível: entra no diff().affectedKeys().hasOnly()
ao lado de reengagementOptOut; isValidProfile valida SÓ quando presente
(data.paused is bool); NÃO entra no hasOnly do create — conta nova nasce
sem o campo, ou seja, despausada por default; é filtro de VISIBILIDADE no
client (getDiscoverProfiles/useLikers/useMyLikes), não fronteira de
leitura — rules não ganham guarda nova, o doc continua lido por qualquer
isSignedIn() como hoje, senão quebraria matches/conversas existentes) +
S96-A (reports/{reportId} deixa de ser só de ida: allow read
isAdmin()||reporterId==auth.uid (denunciado nunca lê); create aceita
status ausente — compat com build antigo do reportUser em campo, que
ainda não manda o campo — ou 'open', nunca já 'resolved'; allow update
restrito a isAdmin(), só trocando status entre 'open'/'resolved' via
diff().affectedKeys().hasOnly(['status']); nova subcoleção
reports/{reportId}/messages espelhando support/{ticketId}/messages, com
reporterId no lugar do uid do ticket) + S92+S76-B2 (users/{userId} update: birthDate vira IMUTÁVEL a
partir da aprovação da verificação, mesmo gatilho get('verified', false)
!= true do nome — 3 ramos: não verificado livre, verificado sem
birthDate libera a 1ª gravação, verificado com birthDate exige valor
idêntico; `age` NÃO trava, continua livre pra reconciliar via
getDisplayAge no save do client) + S76-B1 (users/{userId} update: nome vira IMUTÁVEL a partir da
aprovação da verificação — resource.data.get('verified', false) != true ||
request.resource.data.name == resource.data.name, inserido logo após a
guarda write-once do vale) + S92 (matches/{matchId}/messages/{messageId} ganha segundo ramo de
update pra editar texto — mesma janela de 1h de createdAt, sem lapide,
sem foto/localizacao, text editável com truncamento, editedAt obrigatório
com serverTimestamp) + S85-B (matches/{matchId}/messages/{messageId} ganha update:
"apagar pros dois" vira lápide, nunca deleta o doc — só o próprio
senderId, só dentro de 1h de createdAt (duration.value), só uma vez
(!('deletedAt' in resource.data)), hasOnly(['senderId','createdAt',
'deletedAt']) derruba text/imageUrl/location/replyTo por construção,
senderId e createdAt preservados, deletedAt == request.time; allow delete
continua false, separado) + S85-A (matches/{matchId}/hidden/{uid} nova: "apagar pra mim",
doc por usuário com messageIds (list) das mensagens escondidas na própria
tela — client-side only, não afeta o doc da mensagem nem o outro
participante; create/update restrito ao dono, hasOnly(['messageIds']);
delete negado por quebrar hasOnly sobre request.resource nulo; messages/
{messageId} intocado, allow update, delete: if false segue igual) + S83-A (users/{userId} ganha campo vale, enum ['BB', 'CAIXA',
'BRB']: obrigatório no create, dentro do enum; no update, gravável UMA VEZ
só — campo ausente nos dois é ok, campo já existente não pode mudar de
valor, campo ausente antes e presente agora precisa estar no enum; entra
no hasOnly de create e update) + S76-A (birthDate opcional em users/{userId}: entra no hasOnly
de create e update; isValidProfile valida SÓ quando presente — is
timestamp e idade aproximada entre 18 e 101 anos via duration.value(),
checagem exata mora no client; age continua obrigatório e sem trava,
segue derivado de birthDate no cadastro; nenhum campo removido) + S80-A
(matches/{matchId}/reactions/{messageId} nova: reação de
emoji por mensagem, chave = uid de quem reagiu, valor = emoji — mesmo
padrão de guarda por diff de 3 ramos do typing (S79-C1): chave do próprio
uid inalterada, ausente no resultado (remoção via deleteField, usada pelo
S80-B) ou presente com valor na lista fixa de 6 emoji; create+update
juntos pois o doc pode não existir na 1ª reação, mesmo padrão do presence
(S79-C2-A); delete negado; lista de emoji precisa ficar em sincronia com
REACTION_EMOJIS em src/services/firestoreService.ts) + S79-C2-A (presence/{userId} nova, raiz: heartbeat de última vez visto — create/update só do dono com lastSeenAt == request.time (só serverTimestamp) e hasOnly(['lastSeenAt']); read do dono OU de quem tem match com ele, checando as duas ordens de matchId com exists(); delete negado) + S79-C1 (matches/{matchId} update: guarda de tipo pro carimbo de typing — quando a chave typing.{uid} do próprio usuário permanece no resultado, exige timestamp E igual a request.time, mesmo padrão de lastReadAt; remoção da chave (deleteField, ao parar de digitar) continua liberada, sem essa exigência) + S79 (matches/{matchId}/messages ganha replyTo opcional — citacao de mensagem, so texto v1: map com messageId/senderId/text, text.size()<=400 = 4x o limite do client de 100 code points, mesma logica do S77; cap de 2000 do text da mensagem em si, verified e blockedBy continuam intocados) + S77 (contagem de texto: client passa a contar CODE POINTS (Array.from), rules deixam de ser regua de UX e viram guarda de abuso — todo teto de campo de texto livre subiu pra 4x o limite do client: note 150->600, prompt/weeklyPromptAnswer answer 150->600, places 40->160, events 60->240, details da denuncia 500->2000, suporte (ticket+thread) 1000->4000, bio 500->2000, nome 60->240; chat ficou como estava, ja tinha folga) + S75 (users/{uid}/private/registration deixa de ser imutavel: dono pode corrigir o chaveF quando verifications/{uid}.status=='rejected', createdAt preservado, get() cruzado com verifications) + S74 (contador proprio de resposta, users/{uid}/replies/usage, espelhando superLikes/usage; S74-A criou/gravou o contador, S74-B passou a EXIGIR a quota dentro do bloco do note, ramo direction=='like', com o mesmo getAfter/exists/get do superlike) + S73 (bilhete tambem em direction=='like', verified checado dentro do proprio bloco do note so pro caminho like — superlike continua pegando o gate do ramo de baixo) + S70 (super curtida restrita a perfil verificado; verified sai do bloco note e vira 1a condicao do ramo direction=='superlike') + S68 (cap por string em places/events, details da denuncia sem so-espaco) + S67 (bilhete opcional na super curtida, swipes.note) + S59 (prompt da semana em campo proprio weeklyPromptAnswer, fora de prompts[]) + S58 (motivo de rejeicao da verificacao) + S50 (prompt da semana, cap 3→4) + S49 (swipe read null-guard) + S48 (places/events) + S45 (swipe context) + S44 (uf) + S-Matricula (troca "Chave F" pra "Matrícula", regex ^F\d{7}$ pra ^[A-Z]?\d{1,7}$ — F+7 continua casando, sem migração) — 2026-08-03
