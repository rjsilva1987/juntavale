# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 25/08/2026

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

### S124-A — Grupos: esqueleto
**Status:** IMPLEMENTADA em 23/08/2026 (commit 0915a2a) · índices, rules e storage deployados · functions expireGroups, onGroupMemberCreated e onGroupJoinRequestCreated criadas · SEM teste em aparelho

Salas de conversa em grupo, com prazo de encerramento. Base pra S124-B.

**Decisões de produto tomadas (Raphael, 22/08/2026):**
- QUALQUER usuário pode criar grupo — não é privilégio de admin.
- Todo grupo tem PRAZO DE ENCERRAMENTO, escolhido por quem cria, com teto
  de 1 MÊS. Grupo vencido some. Serve pra eliminar grupo morto e criar
  urgência real de participar.
- Grupo entra na fila de denúncias existente (mesma collection `reports`
  da S96/S102-C), reusando o molde de campos opcionais.

**Decisões de produto tomadas nesta sprint (automático, 23/08/2026):**
- Entrada no grupo é por PEDIDO do usuário + aprovação do criador — nunca
  lista aberta nem convite direto.
- `reportedId` de uma denúncia de grupo é o uid do CRIADOR do grupo, reusando
  a regra de `reports` como já existe (sem tornar `reportedId` opcional).
- Bloqueio 1:1 (`blocks`) não tem nenhum efeito dentro do grupo nesta
  sprint — mensagem de grupo nunca recalcula visibilidade por par bloqueado.
- Sem teto de participantes, sem remoção de membro pelo criador e sem
  exclusão antecipada do grupo pelo criador nesta sprint — grupo só termina
  por expiração (ou exclusão de conta do criador).
- Membro comum pode sair a qualquer momento; o CRIADOR não sai do próprio
  grupo (só some via expiração ou exclusão de conta).
- Se o criador apaga a conta, o grupo inteiro é apagado — mesmo padrão já
  aplicado a matches/momentos do próprio usuário.
- Sem aba nova na tab bar: entrada via item de menu na ProfileScreen, mesmo
  padrão visual de "Usuários bloqueados", dentro da guarda `!isAdmin`.
- SEM push a cada mensagem de grupo — decisão permanente (ver S124-B "NÃO
  FAZER" abaixo), já vale neste esqueleto.
- SEM reações/tique de entregue/edição/exclusão de mensagem no chat de
  grupo nesta sprint — só texto e foto, mesmo mínimo do chat 1:1.

**Recon feita (23/08/2026):**
1. Chat 1:1 guarda mensagens em `matches/{matchId}/messages` — o molde de
   campos/validação de `matches/{matchId}/messages` (`firestore.rules`) foi
   copiado pro grupo restrito ao mínimo (texto + foto); `deleteAccount`
   ganhou dois passos novos (grupos criados pelo uid via `recursiveDelete`;
   participação em grupos de outros via `collectionGroup('members'|
   'joinRequests').where('uid','==',uid)`, delete simples).
2. Expiração da S121 (`expireMomentos`) foi copiada como
   `expireGroups` — mesmo schedule horário, mesma releitura transacional por
   doc antes do `recursiveDelete`; grupo não tem foto própria, mas mensagens
   podem ter (`images/groupChats/{groupId}/`) — `expireGroups` limpa esse
   prefixo com `bucket.deleteFiles` logo após o `recursiveDelete` (correção
   pós-auditoria; a 1ª versão tinha comentário dizendo o oposto).
3. Denúncia de grupo entra no `AdminReportDetailScreen` como bloco novo
   `{!!report.groupId && (...)}`, mirror exato do bloco de `momentoId`,
   mostrando só `groupName` (sem foto — grupo não tem).

### S124-B — Grupos: camadas de engajamento
**Status:** IMPLEMENTADA em 24/08/2026 (commit 724f072) · rules deployadas ·
functions onGroupPollVoteCreated, onGroupPollChanged e
getGroupActiveNowCount criadas · SEM teste em aparelho

Três camadas por cima do grupo pronto, todas REUSANDO o que já existe:
1. Enquete dentro do grupo — reusa a S126 (já implementada).
2. Contador de gente ativa agora no grupo — reusa a presença da S79-C2.
3. Selo de fundador do grupo — reusa os selos da S127.

**NÃO FAZER nesta frente (decisão de produto, Raphael 22/08/2026):**
- Ranking de quem mais fala — vira competição de barulho e constrange
  quem não participa. Público do app são colegas identificados.
- Push a cada mensagem de grupo — leva o usuário a desativar o push do
  app inteiro, e aí perde-se também a notificação de match, que é a que
  importa.
- Sequência diária / streak — cria obrigação, e obrigação em app social
  entre colegas de trabalho vira desconforto.

**Recon feita (24/08/2026):**
1. `PollEditModal.tsx` (S126) é 100% genérico — recebe só
   `question/options/onSave/onRemove/onClose/saving`, não amarrado a
   `users/{uid}` — reusado DIRETO no `GroupDetailScreen`, sem componente
   local novo pra edição.
2. A EXIBIÇÃO da enquete, porém, não deu pra reusar direto: `ProfileScreen`
   (dono vê agregado, nunca vota) e `ProfileSections` (visitante vota, nunca
   vê agregado) têm regras de visibilidade MUTUAMENTE EXCLUSIVAS — nenhuma
   das duas cobre "qualquer membro que já votou vê o agregado", que é o
   comportamento pedido pra grupo. Bloco de exibição escrito local em
   `GroupDetailScreen.tsx`, reusando só os TOKENS de estilo dos dois (mesmo
   vocabulário visual, JSX próprio).
3. `functions/src/index.ts` é um pacote TypeScript separado (`rootDir: src`
   dentro de `functions/`, sem path alias, sem `react-native` nas deps) —
   NÃO importa nada de `src/` do app (confirmado pelo comentário já
   existente sobre `SUPPORT_CATEGORY_LABELS`). `PRESENCE_ONLINE_MS`
   (`src/hooks/usePresenceHeartbeat.ts:20`) foi replicado manualmente na
   function, com comentário apontando a fonte — mesmo padrão já
   estabelecido no arquivo pra esse tipo de constante, não dá pra "exportar
   em vez de duplicar" entre os dois pacotes.
4. `GroupDetailScreen.tsx` não usa `useFocusEffect`/`navigation.addListener
   ('focus', ...)` em nenhum ponto (ao contrário de `GroupsScreen.tsx`) —
   camada 2 (contador de ativos) recarrega no MOUNT, seguindo o fallback já
   previsto na spec pra tela sem esse padrão.

**Implementação (24/08/2026):**
- `src/services/groupService.ts` — `Group` ganha `poll?`/`pollCounts?`;
  novo tipo `GroupPoll`; `setGroupPoll`/`removeGroupPoll`/
  `getMyGroupPollVote`/`castGroupPollVote` (enquete) e
  `getGroupActiveNowCount` (callable de gente ativa agora).
- `functions/src/index.ts` — `onGroupPollVoteCreated`/`onGroupPollChanged`
  (mirror de `onPollVoteCreated`/`onPollChanged` da S126, SEM push);
  `getGroupActiveNowCount` (callable `onCall`, Admin SDK, retorna só
  `{count}`); constante local `PRESENCE_ONLINE_MS` (ver recon item 3).
- `firestore.rules` — `groups/{groupId}` allow update ganha ramo novo (OR)
  pra `poll`, restrito ao criador, mesma validação de shape de
  `isValidProfile.poll`; nova subcoleção `groups/{groupId}/pollVotes/
  {voterUid}` (create-only, mirror do poll de perfil + checagem de
  membro). `presence/{uid}` NÃO tocado (camada 2 é 100% Admin SDK via
  callable). rules-stamp atualizado (linha 1).
- `src/components/GroupFounderTag.tsx` (novo) — badge "Criador", mesmo
  vocabulário visual do `FounderBadge.tsx`, sem ligação com
  `founderNumber`/`ACHIEVEMENT_IDS`.
- `src/screens/GroupDetailScreen.tsx` — card de enquete (criar/votar/ver
  agregado, reusando `PollEditModal`), linha "Criado por X" +
  `GroupFounderTag`, contador "X ativo(s) agora" (só membro, recarrega no
  mount).
- `src/screens/GroupChatScreen.tsx` — `getGroup(groupId)` no mount pra obter
  `creatorId` (sem alterar `RootStackParamList`); `GroupFounderTag` ao lado
  do nome do remetente quando `senderId === creatorId`.

`tsc --noEmit` limpo nos dois pacotes (app e `functions/`), lint sem erro
novo (0 erros / 15 warnings, todos pré-existentes em arquivos não tocados
por esta sprint — nenhum warning novo nos 5 arquivos mexidos/criados).
Rules DEPLOYADAS em 22/08/2026, junto com as functions
onGroupPollVoteCreated, onGroupPollChanged e getGroupActiveNowCount. SEM
teste em aparelho ainda — só validado por tipo/lint/revisão manual.

### S125 — Eventos / encontros
**Status:** IMPLEMENTADA em 24/08/2026 (commit d72b3dc) · rules deployadas
junto com a S137 · SEM teste em aparelho

Alguém marca um encontro (ex.: happy hour) e quem topa entra numa lista de
participantes.

**Decisões de produto tomadas (Raphael, 22/08/2026):**
1. Só usuário VERIFICADO pode criar evento. Diferente da S124-A (grupo,
   onde qualquer um cria): grupo é conversa, evento é encontro presencial.
2. O evento é visível pra BASE INTEIRA.
3. Horário sempre. Local em TEXTO LIVRE — sem mapa, sem coordenada, sem
   endereço estruturado — e o campo do local só é visível para quem JÁ FOI
   APROVADO na lista, nunca para quem apenas vê o evento. Motivo: com o
   evento aberto à base inteira, local aberto significaria publicar a todos
   os funcionários um lugar e uma hora onde uma pessoa identificada estará.
4. Evento EXPIRA da lista de ativos quando a data passa, mas NÃO some na
   hora: fica no histórico de quem participou por ~30 dias antes de ser
   apagado. Motivo: denúncia sobre o que aconteceu num encontro precisa ter
   o evento pra referenciar, e o `deleteAccount` precisa saber o que fazer
   com evento passado. Mesmo desenho da S121: rule esconde por data,
   function agendada limpa depois.
5. Entrar na lista exige APROVAÇÃO de quem criou — mesmo molde do pedido de
   entrada dos grupos (`onGroupJoinRequestCreated`, S124-A).

**Pendência que NÃO é de código, resolver antes de ir pra produção:**
A `privacidade.html` e os termos precisam de uma linha sobre encontros
presenciais, deixando explícito que o JuntaVale não se responsabiliza pelo
que ocorre fora do aplicativo.

**Recon quando a sprint abrir:**
1. Como a S124-A modelou grupo, pedido de entrada e expiração — evento é
   quase o mesmo molde e deve reusar ao máximo.
2. Como a rule sabe se o usuário é verificado (S76-B) — é o que trava a
   criação.
3. Como esconder um campo só de parte dos leitores: S109 (visibilidade por
   campo) ou S135 (nome público x nome real) são os moldes.

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
**Status:** IMPLEMENTADA em 23/08/2026 (commit 4661a62) · client puro · SEM
teste em aparelho

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
**Status:** IMPLEMENTADA em 23/08/2026 (commit 05ef571) · rules deployadas ·
SEM teste em aparelho

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
  DEPLOYADO em 22/08/2026.

`tsc --noEmit` limpo, lint sem erro novo (0 erros / 21 warnings, baseline
mantida). SEM teste em aparelho ainda — só validado por tipo/lint.

### S135 — "Como quer ser chamado" separado do nome completo
**Status:** IMPLEMENTADA em 23/08/2026 (commit 8805fd6) · rules e 5
functions deployadas · SEM teste em aparelho

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

### S138 — Nome completo e apelido imutáveis, edição só via suporte
**Status:** IMPLEMENTADA (25/08/2026) · auditoria APROVADA na 2ª rodada ·
`firestore.rules` alteradas (EXIGE DEPLOY — nenhuma function afetada) ·
script `scripts/migrarNomeCompleto.js` corrigido (25/08/2026: critério de
origem passou a espelhar o fallback `nickname ?? name` do `getDisplayName`,
com idempotência contra `legalName` já migrado e relatório de dry-run por
conta; auditoria APROVADA) — dry-run por padrão, NÃO executado com
`--confirm` (rodar contra dados reais é decisão do Raphael) · SEM teste em
aparelho.

Fecha o desenho iniciado na S135, que separou o apelido público do nome
real mas deixou os dois editáveis pelo usuário.

**Decisões de produto tomadas (Raphael, 22/08/2026):**
1. MIGRAÇÃO: copiar, em toda a base existente, o valor de "como quer ser
   chamado" para o campo de NOME COMPLETO. É valor INICIAL, não definitivo
   — quem quiser corrigir o nome completo pede pelo suporte.
2. Os DOIS campos (nome completo e apelido) passam a ser IMUTÁVEIS pelo
   usuário no app, a qualquer momento — inclusive antes da verificação.
   Isso ESTENDE a trava da S76-B, que hoje só congela nome e idade a partir
   da verificação.
3. A ÚNICA via de alteração é o chamado de suporte: o admin edita.

**Consequências a resolver na sprint:**
- Rule nova: admin precisa poder escrever `name` e `nickname` em
  users/{uid} de terceiros. Hoje o admin responde chamado, mas não edita
  perfil de outra pessoa — é superfície de escrita nova e precisa ser
  estreita (só esses dois campos, só admin).
- Tela no admin pra fazer essa edição a partir do chamado.
- O RegisterScreen e a tela de editar perfil precisam parar de oferecer os
  dois campos como editáveis, com copy explicando que a mudança é via
  suporte.
- Script de migração no molde de `scripts/limpeza.js`: dry-run por padrão,
  `--confirm` pra valer, e trava `--project=<id>` conferida contra o
  project_id da chave de serviço.

**Recon quando a sprint abrir:**
1. Como a S135 modelou `nickname` e o nome real, e como o fallback
   `nickname ?? name` funciona hoje (client e `getUserBasicInfo` nas
   functions).
2. Como a trava da S76-B está escrita nas rules — a nova trava tem que
   conviver com ela, não duplicar.
3. Onde vive o fluxo de chamado de suporte (S84, S94) pra saber onde
   encaixar a edição pelo admin.

### S138-B — Copy do cadastro: papel dos campos nome completo/apelido
**Status:** IMPLEMENTADA (25/08/2026) · auditoria APROVADA sem ressalvas ·
client puro, sem rules/functions, sem deploy · SEM teste em aparelho.

Ajuste de copy no RegisterScreen (Step 1): os dois campos já obrigatórios
desde a S135 (nome completo e apelido) ganham um helper curto explicando
seu papel, sem mexer em obrigatoriedade, labels, placeholders nem no aviso
de imutabilidade da S138.

**Mudança:**
- Campo "Como quer ser chamado": helper "É o nome que todos veem no app."
  — `RegisterScreen.tsx:228-229`.
- Campo "Nome completo": helper "Visível só para a equipe, usado para
  verificar sua identidade." — `RegisterScreen.tsx:215-218`.
- Estilo novo `styles.fieldHint` (`theme.fontSize.xs` +
  `theme.colors.textLight`), sem cor hardcoded.
- Aviso de imutabilidade da S138 mantido intacto, mesmo texto e posição.
- Tela de editar perfil (`ProfileScreen.tsx`, campos travados): avaliado
  no portão da sprint — decisão do Raphael foi MANTER como está, sem
  duplicar a distinção público/interno no `lockedHint` de um campo que já
  está fixado.

### S139 — Bug: momento de terceiros não carrega (permission-denied)
**Status:** FECHADA em 24/08/2026 (commit d0a6b15) · rules deployadas ·
TESTADA em aparelho e aprovada em 24/08/2026

Reproduzido no Expo Go em 22/08/2026, com as rules da S121 já deployadas.
Ao abrir a aba de Momentos, nenhum momento de outra pessoa aparece e o log
mostra:

    ERROR [listenActiveMomentos] erro no listener:
    [FirebaseError: Missing or insufficient permissions.]

CRIAR o próprio momento FUNCIONA e ele aparece com o contador de 24h — ou
seja, a escrita está correta e o problema está só na LEITURA de terceiros.

**Causa raiz confirmada (comparação byte-a-byte das rules deployadas com o
arquivo local via Firebase MCP + checagem do mecanismo de validação de
query do Firestore contra a documentação oficial):** o `allow read` de
`momentos/{uid}` tinha uma condição única
(`resource.data.expiresAt > request.time`) valendo tanto pra `get()`
quanto pra `list()`. Pra uma query/listener (`listenActiveMomentos`,
`onSnapshot`), o Firestore precisa PROVAR estruturalmente que a regra vale
pro conjunto de resultados ao longo de toda a vida do listener, e uma
condição dependente de `request.time` (que muda a cada avaliação) não é
provável dessa forma — o Firestore nega o `list` INTEIRO com
`permission-denied`. `get()` (leitura por ID, `getMyMomento`) não sofre
disso, é avaliado documento a documento com o dado real, por isso só o
feed de terceiros quebrava e o próprio momento do dono sempre funcionou.
NÃO era problema de índice composto nem de incompatibilidade entre a
query do client e a rule — a query de `listenActiveMomentos`
(`where('expiresAt','>',Timestamp.now())` + `orderBy('expiresAt','desc')`)
já estava correta; é limitação estrutural do Firestore pra provar regras
com `request.time` em `list`/listener, ver bullet novo em "Padrões de
escrita no Firestore" abaixo.

**Fix aplicado:** `allow read` separado em `allow get` (mantém
`expiresAt > request.time`, protege doc "zumbi" acessível por ID direto
antes de `expireMomentos` varrer) e `allow list` (sem checagem de
`expiresAt`, mesmo padrão de `groups/{groupId}` — filtragem de expirados
no feed passa a ser responsabilidade exclusiva da query do client, que já
filtra corretamente). Único arquivo tocado: `firestore.rules`.

### S140 — Bug: conta do build 14 quebra ao salvar perfil com nome editado
**Status:** REAVALIADA (25/08/2026) — possivelmente obsoleta. A S138, no
mesmo dia, tornou `name`/`nickname` imutáveis pelo dono em QUALQUER
circunstância — o `allow update` do dono pode não precisar mais aceitar
`name` nunca, o que eliminaria a causa desta sprint por um caminho
diferente do previsto originalmente abaixo. Decisão de fechar de vez ou
manter aberta fica PENDENTE — não decidida aqui, só registrada a
reavaliação e a pergunta em aberto. Conteúdo original (causa raiz,
ressalvas, recon) mantido abaixo sem alteração.

A S137 corrigiu o `allow create` de `users/{uid}` pra aceitar `name` do
cliente antigo (build 14 Android / 1.0.5 iOS), mas NÃO tocou no
`allow update` — que segue sem `name` no `hasOnly`.

Consequência: conta criada pelo cliente antigo consegue se cadastrar, mas
o primeiro "salvar perfil" que edite o nome derruba o save INTEIRO — bio,
fotos, interesses, tudo junto, não só o nome. Foi registrado no comentário
da S137 no `firestore.rules`.

Duas ressalvas ligadas, também achadas pela auditoria da S137:
1. Conta criada pelo cliente antigo nasce com o nome real no doc PÚBLICO,
   sem o subdoc privado que a S135 criou pra proteger isso — é justamente
   a exposição que a S135 existia pra fechar.
2. O `functions/scripts/migrateNicknames.js` (S135) vai precisar rodar de
   novo depois do build 15, e o cabeçalho dele hoje assume que não existem
   contas pós-S135 sem `nickname` — premissa que a S137 invalidou.

**Recon quando a sprint abrir:**
1. O `allow update` de `users/{uid}` em `firestore.rules` — o `hasOnly` e o
   que a `isValidProfile` valida hoje.
2. Se a correção deve espelhar a da S137 (aceitar os dois formatos,
   temporariamente) ou se é melhor esperar o build 15 substituir os dois
   nas lojas e nunca tocar no update.
3. Quantas contas na base hoje têm `name` sem `nickname`.

### S141 — Visualizador de Momento: safe area e avanço automático
**Status:** IMPLEMENTADA, auditada (2 rodadas) · APROVADA · client puro
(`MomentoViewerModal.tsx`, `MomentosScreen.tsx`), sem tocar
`firestore.rules`/`momentoService.ts` · falta commit/push (Raphael) e teste
em aparelho

Testado em aparelho em 24/08/2026, com a S139 já corrigida (momento de
terceiros carrega). Dois problemas no `MomentoViewerModal`:

1. O cabeçalho (avatar, nome, tempo restante, botão X) está colado no topo
   absoluto da tela, SOBREPONDO a barra de status do sistema — na captura,
   o nome fica em cima do relógio e o X ao lado do ícone de bateria. O X
   fica praticamente inalcançável e não dá pra fechar o momento. Falta
   respeitar a safe area; mesma correção serve iOS e Android.

2. Não há avanço automático — o momento fica aberto indefinidamente.

**Decisões de produto tomadas (Raphael, 24/08/2026):**
- Duração de 5 SEGUNDOS, igual para momento de TEXTO e de FOTO.
- Ao terminar os 5s, AVANÇA pro próximo momento da fila. Só FECHA o
  visualizador quando terminar o último.
- SEGURAR o dedo na tela PAUSA a contagem; soltar retoma.

**Recon quando a sprint abrir:**
1. Como o `MomentoViewerModal.tsx` monta o cabeçalho hoje e se já usa
   `SafeAreaView`/`useSafeAreaInsets` em algum ponto — o resto do app pode
   já ter um padrão a seguir.
2. Como a lista de momentos chega ao viewer (ordem, índice atual) — o
   avanço automático precisa saber qual é o próximo e qual é o último.
3. Se existe barra de progresso no topo hoje; se não, decidir na sprint se
   entra junto (é o indicador que torna os 5s legíveis pro usuário).
4. Cuidado com timer e desmontagem: o timer precisa ser limpo ao fechar o
   modal e ao trocar de momento, senão vaza e avança sozinho depois.

**Fix aplicado:**
- Safe area: `<Modal>` monta como superfície nativa separada e o
  `SafeAreaProvider` de topo (`App.tsx`) não a mede — por isso o
  `SafeAreaView edges={['top']}` que já existia dentro do `<Modal>` não
  recebia inset nenhum. Corrigido envolvendo o conteúdo do `<Modal>` com um
  `<SafeAreaProvider>` PRÓPRIO, aninhado, mantendo o `SafeAreaView` como
  estava.
- Avanço automático: `MOMENTO_VIEW_DURATION_MS = 5000` +
  `Animated.Value`/`Animated.timing` (NUNCA `setInterval`, que não está na
  allowlist de globals do `eslint.config.js`) resetado por `momento.id`,
  com `stopAnimation()` no cleanup do `useEffect`. Nova prop
  `onAdvance: () => void` — o modal só dispara, quem decide avançar/fechar é
  `MomentosScreen`. Pause ao segurar: `Pressable` na área de conteúdo (não
  nos botões do cabeçalho) com `onPressIn`/`onPressOut` chamando
  `stopAnimation`/`Animated.timing` com a duração restante. Barra de
  progresso: `Animated.View` com `width` interpolado, track
  `rgba(255,255,255,0.3)` + fill `theme.colors.primary` (mesmo padrão do
  progress bar de upload em `ChatScreen.tsx`).
- `MomentosScreen.tsx`: estado trocou de item único (`viewerMomento`) pra
  fila + índice (`viewerQueue`/`viewerIndex`); `advanceViewer()` incrementa
  o índice e fecha o viewer quando estoura o fim da fila. `openMine` usa
  fila de 1 item só; `openFeedItem` usa `visibleFeed` (ordem já existente)
  com `findIndex` por `id`.

**Correção pós-auditoria (1ª rodada BLOQUEOU):** o timer não pausava com o
`ReportModal` (denúncia) aberto — o `Pressable` de pause só cobre a área de
CONTEÚDO (imagem/texto), e o botão de denunciar fica no cabeçalho, fora
dele. Resultado: a denúncia podia ir pro alvo ERRADO (se `onAdvance`
trocasse o `momento` durante o preenchimento) ou ser descartada em
silêncio (se fosse o último item da fila e o viewer fechasse por trás do
formulário). Fix: `pauseTimer()`/`resumeTimer()` extraídos de
`handlePressIn`/`handlePressOut` (mesmo mecanismo, sem reinventar) e
reaproveitados por um `useEffect` novo com dependência `[reportVisible]` —
pausa quando o `ReportModal` abre, retoma quando fecha (cancelar ou
enviar, os dois caminhos passam por `setReportVisible(false)`). Guard
`reportEffectMountedRef` evita o efeito rodar redundantemente na
montagem do componente (que já acontece com `momento === null`, `visible`
falso). 2ª rodada de auditoria: APROVADO.

Arquivos tocados: `MomentoViewerModal.tsx`, `MomentosScreen.tsx`. Nenhuma
leitura/escrita nova no Firestore, `firestore.rules`/`momentoService.ts`
intocados.

### S142 — Fluidez do chat, com foco no Android
**Status:** ENCERRADA (25/08/2026) — item 3 (rolagem/indicador "↓ nova
mensagem") fechado em código e auditado adversarialmente (3 rodadas,
2 correções, APROVADO na 3ª). Itens 1, 2 e 4 (envio otimista, teclado,
paginação) tiveram RECON DE DIAGNÓSTICO reconfirmada numa rodada de
continuação (ver abaixo) — nenhum bug de código encontrado nas duas
rodadas, SEM alteração de código, seguem em aberto pra decisão/sprint
futura (próximo passo é medir em aparelho Android real, não mexer às
cegas). Item 5 ("digitando…") já funciona, nada a fazer. NOVO ITEM da
continuação — opção "Copiar mensagem" no sheet de toque longo:
IMPLEMENTADA e auditada (1 rodada, APROVADO direto), client puro
(`expo-clipboard` nova dependência), arquivos `src/screens/ChatScreen.tsx`,
`package.json`, `package-lock.json`, sem `firestore.rules`/Cloud
Functions. SEM teste em aparelho (nem chat, nem "Copiar mensagem").

Relatado por Raphael em 24/08/2026, testando em aparelho: o chat "ainda tem
umas quebras" e não está tão fluido quanto o WhatsApp. E, comparando os dois
sistemas, **no iPhone a fluidez está melhor que no Android** — mesmo código,
comportamento diferente.

**Decisão de produto fechada (Raphael, 25/08/2026) — item 3 (rolagem):**
- Abrir a `ChatScreen` SEMPRE rola pro fim (mensagem mais recente).
- Com a tela em FOCO e o usuário rolado pra cima no histórico, mensagem nova
  chegando NÃO arrasta — mostra indicador "↓ Nova mensagem" (padrão
  WhatsApp, sem contador). Tocar no indicador rola até o fim e ele some.
- Escopo explícito: só a `ChatScreen` em foco — não a lista de conversas, e
  não cobre app em background/outra tela (isso é a S122, já resolvida).

**Esta sprint COMEÇOU por diagnóstico.** O sintoma estava descrito de forma
genérica e o terreno não tinha sido mapeado; os itens 1, 2, 4 e 5 abaixo
continuam sem decisão de produto até uma próxima rodada decidir o que fazer
com cada achado.

**Candidatos investigados, em ordem de impacto provável:**
1. ENVIO OTIMISTA — se a bolha só aparece depois que o Firestore confirma,
   é a maior fonte de sensação de travamento, sobretudo em rede ruim. O
   WhatsApp desenha na hora com o tique de "enviando". Encaixa nos três
   estados que a S129-B já criou.
2. TECLADO — abrir o teclado deve empurrar a lista sem pular nem cobrir a
   última mensagem. É o defeito mais comum em React Native e o que mais
   parece "quebra". Também é a área onde iOS e Android divergem mais:
   `KeyboardAvoidingView` tem comportamento diferente por plataforma, e
   `android:windowSoftInputMode` no manifesto muda tudo — forte suspeita
   pra diferença relatada entre os dois sistemas.
3. ROLAGEM ao chegar mensagem nova — não arrastar à força quem está lendo
   histórico; mostrar "↓ nova mensagem" como o WhatsApp. **IMPLEMENTADO
   nesta rodada, ver "Fix aplicado" abaixo.**
4. PAGINAÇÃO do histórico — carregar tudo de uma vez trava a abertura da
   conversa; carregar aos poucos ao rolar pra cima sem perder posição.
5. "DIGITANDO…" — a presença da S79-C2 já existe, então é barato e dá
   sensação de vida.

**Recon concluída (25/08/2026):**
1. `ChatScreen.tsx` renderiza a lista com `FlatList` **NÃO invertida**
   (mais antiga no topo, mais recente embaixo — diferente do padrão
   `inverted` do WhatsApp), `keyExtractor={(item) => item.id}`,
   `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}` (compensa
   prepend de histórico sem "pular"). Sem `onEndReached`/`onStartReached`
   por decisão de produto já registrada em comentário no código ("nada de
   auto-load ao chegar perto do topo").
2. Envio otimista: NÃO há array/estado local de eco manual — `sendMessage`
   (`firestoreService.ts`) só faz `addDoc` com `serverTimestamp()`; o
   "otimismo" percebido vem do próprio SDK do Firestore (write local
   aplicado ao cache antes do ack do servidor), mecanismo que só funciona
   porque a query usa cursor (ver "Armadilhas do chat"). Nenhum bug
   encontrado; se a sensação de travamento persistir, é candidato a medir
   em aparelho antes de mexer, não a corrigir às cegas.
3. Rolagem — ver "Fix aplicado" abaixo.
4. Paginação (S101) — `listenMessages`/`loadOlderMessages`
   (`firestoreService.ts`) usam estados separados (`messages` vs.
   `olderMessages`, mesclados só na renderização); prepend de página antiga
   nunca dispara o callback de `listenMessages`, então NÃO HÁ CONFLITO
   entre a paginação por cursor e a rolagem/indicador do item 3 — confirmado
   nesta recon.
5. "Digitando…" já existe e funciona: `useTypingIndicator.ts` (debounce
   1200ms, throttle 2000ms, TTL 5s), renderizado em `ChatScreen.tsx`. Nada
   a fazer aqui por enquanto.
6. Teclado (item 2) — `KeyboardAvoidingView` hoje usa
   `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`,
   `keyboardVerticalOffset={0}`; Android sem tratamento adicional. Não dá
   pra confirmar só lendo código se há salto/sobreposição — exige teste em
   aparelho Android real, ainda não feito. **Detalhe novo (continuação,
   25/08/2026):** `app.json:31` define `"softwareKeyboardLayoutMode":
   "resize"` (equivalente a `android:windowSoftInputMode="adjustResize"` —
   projeto managed, sem `AndroidManifest.xml` próprio no repo). A
   combinação desse `adjustResize` nativo com `behavior: 'height'` do RN é
   candidata a dupla compensação entre o resize da janela nativa e o
   padding do RN — ainda não confirmado, só uma pista mais específica pro
   teste em aparelho.

**Fix aplicado (item 3 — rolagem/indicador "nova mensagem"):**
- Novo estado `hasNewMessageBelow` (+ ref espelho `hasNewMessageBelowRef`,
  necessária porque o `useFocusEffect` de marcar como lida — pré-existente
  da S101 — precisa ler o valor sem depender de closure de state),
  resetados por geração (`chatGenerationRef`) igual aos demais estados da
  tela.
- No listener de tempo real: mensagem do outro lado + usuário não perto do
  fim → liga o indicador, não rola. Mensagem própria OU já perto do fim →
  rola pro fim, limpa o indicador (se estava ligado) e marca como lida.
- `markMatchRead` deixou de disparar incondicionalmente no refoco da tela
  (`useFocusEffect`, mecanismo da S101) quando o indicador está pendente —
  1ª correção da auditoria: navegar pra `MatchProfile`/`Verification` e
  voltar (push na mesma stack, sem desmontar `ChatScreen`) marcava como
  lida por baixo do indicador ainda visível; agora exige
  `!hasNewMessageBelowRef.current` além da checagem de geração já
  existente.
- Indicador ficava preso na tela ao enviar mensagem própria com o indicador
  já ligado por uma mensagem anterior do outro lado — 2ª correção da
  auditoria: o ramo que rola pro fim (mensagem própria ou já perto do fim)
  agora sempre limpa o indicador, não só quando é mensagem do outro lado.
- Indicador visual: pill flutuante "Nova mensagem" reaproveitando o mesmo
  molde visual do botão "carregar mensagens anteriores" já existente
  (`AnimatedPressable`/Pressable + `Ionicons` + `theme.colors.primary`),
  sem contador numérico, ancorado acima do composer.
- "Abrir a tela sempre rola pro fim": já funcionava antes desta sprint
  (default `isNearBottomRef.current = true` por geração no mount) — sem
  necessidade de código novo para esse ponto específico, só confirmado.

**Nota:** a diferença iOS x Android pode não ser só do chat — pode ser
característica geral do aparelho de teste (modelo, versão do Android) ou do
Expo Go. Segue sem confirmação; itens 1, 2 e 4 (envio otimista, teclado,
paginação) não tiveram nenhum bug de código encontrado nesta recon — se a
sensação de travamento persistir depois do build 15, o próximo passo é medir
em aparelho Android real antes de mexer em código de novo.

**Novo item — "Copiar mensagem" no sheet de toque longo (continuação,
25/08/2026):** pedido do Raphael, sem decisão de produto em aberto (client
puro, escopo já fechado no pedido). IMPLEMENTADO e auditado (1 rodada,
APROVADO direto, sem correção). Nova constante `canCopy` em
`ChatScreen.tsx` — aparece só em mensagem de texto (`!!text`), ainda não
apagada (`!deletedAt`), sem foto/localização (`!imageUrl && !location`),
sem exigir ser o dono e sem janela de tempo (diferente de `canEdit`/
`canDeleteForEveryone`). Item posicionado no sheet logo após "Responder" e
antes de "Editar". Copia `replyOptionsTarget.text` puro via
`Clipboard.setStringAsync` (nova dependência `expo-clipboard@~8.0.8`,
primeiro uso de Clipboard no app) — sem prefixo/metadado de `replyTo`, sem
`Alert.alert` de confirmação (decisão de escopo mínimo). Ressalva da
auditoria (não bloqueante): `Clipboard.setStringAsync` não tem `.catch`,
inconsistente com o padrão de log de erro dos outros handlers do mesmo
sheet — considerar reforçar numa próxima rodada, não é bug. Arquivos:
`ChatScreen.tsx`, `package.json`, `package-lock.json`.

### S143-A — Momento: navegar por toque nos lados
**Status:** IMPLEMENTADA em 25/08/2026, APROVADA na 3ª auditoria (2 rodadas
de correção). Client puro, sem função nova nem alteração de `firestore.rules`
— nenhum deploy necessário. SEM teste em aparelho. Histórico: a 1ª
implementação foi bloqueada porque `Gesture.Tap().maxDuration(250)` tem
timer nativo que falha o reconhecedor sozinho ~250ms após o toque começar
(dedo ainda na tela) e dispara `onFinalize` nesse timeout, não no release
real; corrigida trocando por
`Gesture.Simultaneous(Gesture.LongPress().minDuration(0).maxDistance(100000), Gesture.Tap())`
em `MomentoViewerModal.tsx`. A 2ª rodada foi bloqueada de novo por dois
gaps no mesmo arquivo: `GestureDetector` dentro do `<Modal>` sem
`GestureHandlerRootView` aninhado (corrigido com um `GestureHandlerRootView`
próprio dentro do `Modal`, mesmo motivo do `SafeAreaProvider` aninhado da
S141) e `pauseResumeGesture` sem `.maxDistance(...)`, herdando o default
nativo (~10dp/10pt) e cancelando sozinho por tremor de mão num toque longo.
A 3ª auditoria aprovou sem ressalva bloqueante — só uma ressalva de runtime
não verificável estaticamente, ver "Testes pendentes" abaixo · ajuste da
S121, DEPOIS da S141

Modelo dos stories do Instagram: tocar na METADE ESQUERDA da tela volta um
momento, tocar na METADE DIREITA avança um. Client puro, sem servidor.

**Decisões (Raphael, 24/08/2026):** toque à esquerda volta um, toque à
direita avança um.

**Depende da S141**, que introduziu o avanço automático de 5s e a pausa ao
segurar o dedo. O toque nos lados precisa conviver com os dois: toque curto
navega, toque longo pausa — o gesto tem que distinguir os dois casos, e o
timer dos 5s precisa reiniciar a cada navegação manual.

**Recon quando a sprint abrir:**
1. Como a S141 deixou o timer e o handler de pausa no `MomentoViewerModal`.
2. Se o gesto de segurar já usa Pressable/GestureDetector — o toque curto
   entra no mesmo lugar.
3. O que acontece ao voltar no PRIMEIRO momento e ao avançar no ÚLTIMO
   (o último já fecha, pela decisão da S141).

### S143-B — Momento: curtir e comentar
**Status:** IMPLEMENTADA em 25/08/2026, APROVADA na 2ª auditoria (1 rodada
de correção). Exige deploy de `firestore.rules` (novas subcoleções
`momentos/{uid}/likes` e `momentoRequests`, campo opcional `momentoRef` em
`matches/{matchId}/messages`) e das Cloud Functions `expireMomentos`
(alterada) e `onMomentoLikeCreated`/`onMomentoLikeDeleted`/
`onMomentoRequestCreated`/`onMomentoRequestUpdated` (novas). SEM teste em
aparelho. Decisões de produto tomadas no portão desta sprint (além das já
registradas abaixo, de 24/08): comentar sem match cria um "pedido" tipo
Instagram (fica pendente até o autor responder, ignorar ou denunciar; 1
pedido pendente por remetente por instância do momento); curtir fica
aberto à base inteira (coerente com a visibilidade pública do momento,
S121); responder ao pedido NÃO cria um match completo — só libera uma
conversa isolada (`momentoRequests/{id}/messages`), sem tocar em
`matches/`. A 1ª auditoria bloqueou por dois defeitos, ambos corrigidos e
confirmados na 2ª: variável `authorUid` indefinida nas rules de
`momentos/{uid}/likes` (quebrava a curtida por completo — o path pai
vincula `uid`, não `authorUid`) e o timer de auto-avanço do
`MomentoViewerModal` não pausava para os modais novos de comentário/lista
de curtidores, reincidindo no bug que a S141 já tinha corrigido pro
`ReportModal`. Ressalvas não bloqueantes registradas para debitar depois:
curtidas de um momento antigo podem ficar coladas quando o autor republica
ou apaga manualmente (só a expiração natural de 24h limpa a subcoleção
`likes`); o caminho "via match" do comentário não filtra `blockedBy` antes
de tentar enviar.

Curtir o momento e responder a ele, no modelo dos stories do Instagram.

**Decisões de produto tomadas (Raphael, 24/08/2026):**
1. O COMENTÁRIO VAI PRO CHAT — responder um momento abre/usa a conversa
   privada com o autor, como no Instagram. Não é comentário público no
   momento.
2. A CURTIDA NÃO É ANÔNIMA — o autor vê quem curtiu.

**A resolver na sprint (consequência da decisão 1):**
Como responde quem NÃO tem match com o autor? O momento é visível pra base
inteira (decisão da S121), mas o chat hoje exige match. Duas saídas a
avaliar na recon: reusar o molde do bilhete na curtida (S66, mensagem sem
match) ou permitir comentar só a quem já tem match. Isso é decisão de
produto e deve parar no portão.

**Outras consequências:**
- Curtida não anônima entre colegas identificados: o autor vê nome e vale
  de quem curtiu. É coerente com o resto do app, mas muda comportamento.
- Momento expira em 24h — decidir o que acontece com curtidas e com a
  referência do comentário no chat quando o momento some.
- Moderação: comentário que vira mensagem já cai na denúncia de mensagem
  (S102-C); confirmar que o caminho funciona pra esse caso.

**Recon quando a sprint abrir:**
1. Como a S123 modelou curtir foto com contador — provável molde pra
   curtida do momento.
2. Como o bilhete da S66 permite mensagem sem match, se essa for a saída.
3. Como o chat identifica a origem de uma mensagem (a S129-A fez citação
   de mensagem) — a resposta ao momento precisa mostrar a que ele se refere.

### S143-C — Momento: barra de resposta no viewer (chips + emojis + campo)
**Status:** FECHADA e TESTADA em aparelho (25/08/2026), auditoria
aprovada. `firestore.rules` (condição de `blockedUsers` + o endurecimento
defensivo, na regra `momentoRequests/{requestId}`) já deployadas —
nenhuma Cloud Function nova/alterada. Rodou no modo AUTOMATICO do
`/sprint` com o pré-requisito "SÓ COMEÇA depois da bateria de testes do
lote da S143-B" explicitamente destravado pelo Raphael no despacho, mesmo
a S143-B seguindo sem teste em aparelho.

Escopo: SÓ camada de UI por cima do encanamento da S143-B, mais a rule
nova do débito de `blockedBy` abaixo — nenhuma coleção nova, nenhuma
function nova.

**Decisões tomadas (Raphael, 25/08/2026):**
- Barra fixa no rodapé do `MomentoViewerModal` (referência: resposta de
  story do Instagram/Facebook): campo "Enviar mensagem...", 3 emojis
  rápidos fixos (👍 😂 ❤️, não sorteiam) e 3 chips de sugestão sorteados a
  cada exibição do momento, dentre um catálogo estático de 6 textos
  aprovados ("Kkkkk adorei", "Que demais!", "Conta mais sobre isso",
  "Isso aí ein 👀", "Muito bom!", "Marca aê").
- A barra convive com os gestos da S143-A/S141: campo focado pausa o
  timer de auto-avanço (`replyBarFocused` entrou no `anyOverlayVisible`,
  mesmo padrão de `reportVisible`/`likersVisible`) e não conflita com
  toque-nos-lados.
- `MomentoCommentModal` foi REMOVIDO por completo (arquivo deletado) — a
  barra substitui o modal, sem dois caminhos de envio convivendo.
- Débito de `blockedBy` quitado: checagem de `blockedUsers` client-side em
  `momentoRequestService.ts`, mais uma condição em `firestore.rules`
  (`momentoRequests/{requestId}` `allow create`).

**REVOGADO em 25/08/2026** (desenho original desta sprint, substituído pela
revisão abaixo): chip/texto/emoji roteavam por MATCH — com match, mensagem
normal em `matches/{matchId}/messages` com `momentoRef`; sem match, pedido
(`momentoRequests`). O emoji sozinho tinha um terceiro ramo (opção "c" do
portão de produto): sem match, virava CURTIDA em vez de pedido. Esse
desenho nunca chegou a passar no teste de aparelho (bugs de
permission-denied e de roteamento ficaram abertos — ver
`docs/sprints/ESTADO.md`) e foi revogado por decisão de produto antes de
ser corrigido, não por ter sido corrigido e trocado depois.

**Decisões NOVAS (revisão pós-teste de aparelho, Raphael, 25/08/2026):**
- Responder a um Momento é INDEPENDENTE de match, curtida ou qualquer
  outro estado entre as duas pessoas — nenhuma consulta de match no fluxo
  de resposta (`sendMomentoComment`, `momentoRequestService.ts`, não chama
  mais `findMatchWithUser`).
- Emoji, chip e texto livre são TODOS mensagens, pelo MESMO caminho: o
  pedido de Momento da S143-B (`momentoRequests`) — sem exceção, sem ramo
  de curtida no emoji. Curtida continua existindo só no botão de coração
  (`handleToggleLike`), sem nenhuma relação com o envio de mensagem.
- A conversa só aparece na aba Conversas quando o AUTOR do Momento
  responde ao pedido (`status` vira `'answered'`). Antes disso, o
  remetente vê "Pedido enviado" e o autor vê o pedido pendente na tela de
  pedidos (fluxo já existente da S143-B, intocado).
- Pessoas COM match que conversam via Momento têm uma conversa SEPARADA
  do chat do match — nunca escreve em `matches/{matchId}/messages`, nem
  mistura na mesma thread. A aba Conversas (`MatchesScreen.tsx`) passou a
  mesclar conversas de match + conversas de Momento respondidas
  (`useAnsweredMomentoRequests.ts`) numa lista só, ordenada pela última
  mensagem, com etiqueta visual "via Momento" nas linhas de Momento —
  pedidos `pending` NÃO aparecem nessa lista. A tela da conversa reusa a
  `MomentoRequestChatScreen` já existente (S143-B), sem tela nova.
- Limite mantido (decisão 3 da S143-B, sem mudança): 1 mensagem por
  remetente por instância do Momento enquanto o pedido está pendente — 2º
  toque (chip ou emoji) mostra "Você já enviou uma mensagem para este
  momento", nunca duplica nem dá erro cru. Depois de respondido, mensagens
  livres na conversa (thread `momentoRequests/{requestId}/messages`).
- `firestore.rules` (`momentoRequests/{requestId}`, bloco inteiro)
  endurecido defensivamente contra a classe de bug "resource == null /
  get() em doc ausente lança erro em vez de negar": `allow read` já tinha
  `resource != null` (correção anterior); ganhou também `exists()` antes
  do `get()` de `blockedUsers` no `allow create`, e a subcoleção
  `messages` ganhou `momentoRequestExists(requestId)` antes de qualquer
  `getMomentoRequest(requestId)`. Causa do permission-denied CONFIRMADA
  por log de aparelho e corrigida: `allow get` de
  `momentoRequests/{requestId}` negava doc inexistente (`resource !=
  null &&` vira `&&` inteiro false quando resource é null) — corrigido
  pro padrão `resource == null || dono`, mesmo molde do swipe da S49 (ver
  § "Padrões de escrita no Firestore"). Instrumentação TEMP-DIAG S143-C
  REMOVIDA de `momentoRequestService.ts` depois do teste passar.

**Notas:**
- Débito que FICA de fora (segue registrado): curtidas coladas quando o
  autor apaga/republica manualmente — só a expiração limpa.
- Filtro de momentos de autores bloqueados no FEED (`MomentosScreen`)
  fica de fora — débito à parte, fora do escopo desta sprint.

### S144 — Infraestrutura: reduzir custo de token por sprint
**Status:** partes A e C FECHADAS (commits 3dd5ad9 e f679098) · parte B
revertida (commit fa757f5) — a refazer · parte D é regra, não código · 4
partes independentes

Motivo (Raphael, 24/08/2026): o consumo por sprint está alto demais. As
quatro causas abaixo foram levantadas a partir do que se observou na
sessão de 22-24/08, quando ~15 sprints rodaram seguidas.

**S144-A — `ARQUITETURA.md` (maior ganho, fazer primeiro)** · IMPLEMENTADA (auditoria aprovada, aguardando commit)
Toda recon hoje remapeia o mesmo terreno estável: quais collections
existem, o que cada uma das 27 functions faz, onde ficam os moldes
reusáveis (expiração da S121, pedido de entrada da S124-A, visibilidade
por campo da S109, denúncia da S96/S102-C, contador agregado da S126).
Criar um `ARQUITETURA.md` CURTO com esse mapa e fazer o `jv-recon` lê-lo
ANTES de investigar o repo. Mantido à mão, não gerado.
⚠️ Só compensa se ficar curto e verdadeiro — documento longo e
desatualizado custa token e ainda engana.

**S144-B — Enxugar o carimbo do `firestore.rules`**
O `rules-stamp` é uma cadeia contínua de comentários da linha 1 até ~105,
com uma entrada por sprint desde a S-Matrícula. Ele entra em toda leitura
do arquivo, em toda sprint que toca rules. Manter no topo só as ~5
entradas mais recentes e mover o histórico pro FIM do arquivo (ou pro
`ARQUITETURA.md`).
⚠️ A regra da casa de atualizar o carimbo a cada sprint de rules CONTINUA
valendo — o que muda é onde o histórico antigo mora.

**S144-C — Quebrar o `functions/src/index.ts` em módulos** · FEITA (ver
tabela "Fechadas recentemente")

**S144-D — Política de sprint pequena**
Sprints grandes custam desproporcionalmente mais: S124-A saiu com 2441
linhas e 15 arquivos; S135 com 25 arquivos e 5 functions redeployadas.
Adotar como regra da casa: quando a recon indicar que a sprint passa de
~500 linhas ou ~8 arquivos, QUEBRAR em partes antes de implementar — como
já foi feito com S124-A/B e S143-A/B.

**Ordem sugerida:** A e C feitas. Falta B. A parte D é regra, não código —
entra no `CLAUDE.md` ou no arquivo do `/sprint`.

---

### S145 — Aba Explorar ganha Grupos, Eventos e Pedidos de conversa
**Status:** IMPLEMENTADA em 25/08/2026 · auditoria APROVADA · client puro,
sem rules/functions, sem deploy · SEM teste em aparelho

Escopo definido por Raphael (25/08/2026): além do feed de Momentos que já
existe, a aba "Explorar" passa a dar acesso a Grupos (S124-A), Eventos
(S125) e "Pedidos de conversa" (`MomentoRequestsScreen`, S143-B/C), hoje
só alcançáveis via item de menu na `ProfileScreen`. Motivo: teste manual
de 25/08 mostrou que sem um jeito de o autor descobrir que tem um pedido
pendente, ele nunca vê o pedido — recomendação validada é badge (dot) na
aba Explorar quando houver pedido de Momento pendente.

**Decisões tomadas nesta sprint (automático, 25/08/2026):**
- Trilha completa (mexe em navegação/múltiplos arquivos, não é troca de
  ≤15 linhas).
- Grupos e Eventos: entrada MUDA de `ProfileScreen` pra dentro da aba
  Explorar (`MomentosScreen`) — REMOVIDA de `ProfileScreen`, não
  duplicada. Os dois itens já eram exclusivos de não-admin lá, e a aba
  Explorar também só existe pra não-admin — relocação 1:1, sem perda de
  acesso.
- "Pedidos de conversa": não-admin passa a acessar pela aba Explorar
  (novo); `ProfileScreen` mantém a entrada só pro ADMIN (guarda muda de
  "sem guarda" pra `isAdmin &&`) — porque admin não vê a aba Explorar e
  hoje também usa esse recurso (decisão da S143-B: "admin também pode
  comentar momentos de outras pessoas normalmente").
- Badge da aba Explorar é DOT (`tabBarBadge: ' '`), não numérico — mesmo
  molde já usado na aba Perfil (verificação/suporte/denúncia) e
  consistente com o pontinho que já existe hoje ao lado de "Pedidos de
  conversa" na `ProfileScreen`.
- Contagem de pedidos pendentes extraída pra hook novo
  (`usePendingMomentoRequests`), reusado em 3 pontos (badge da tab,
  card em Explorar, entrada do admin na ProfileScreen) em vez de
  duplicar a mesma subscription.
- Composição visual da Explorar: SEM sub-abas internas. `MomentosScreen`
  ganha uma fileira horizontal de 3 acessos rápidos (Grupos/Eventos/
  Pedidos de conversa) no topo do feed — Momentos continua sendo o
  conteúdo principal da aba.

**Recon feita (25/08/2026):** confirmado que `firestore.rules` já permite
a query usada pela contagem de pendentes (`allow list` de
`momentoRequests` por `authorId`, sem índice composto) — sprint é client
puro, sem rules/functions novas. Único ponto de navegação pra
`MomentoRequestsScreen` hoje é `ProfileScreen.tsx:1375`; nenhum outro
deep link/notificação existente.

---

### S146 — Badges in-app (dot vermelho) de pedidos e aprovações no Explorar
**Status:** IMPLEMENTADA e AUDITADA — aprovada sem ressalvas bloqueantes
(25/08/2026) · trilha completa · mexe em `firestore.rules` (3 regras de
`allow update` — `groups/.../members`, `events/.../participants`,
`momentoRequests` — NÃO deployadas, aguardando deploy do Raphael) ·
nenhuma Cloud Function tocada (push já existia, S124-A/S125/S143-B) ·
client puro fora das rules, sem deploy adicional exigido · SEM teste em
aparelho

Escopo definido por Raphael (25/08/2026, modo automático): push já cobre as
4 direções de grupos/eventos e 2 de momentos (`functions/src/grupos.ts`/
`eventos.ts`/`momentos.ts`, intocadas nesta sprint), mas o badge IN-APP só
existia pra momentos (S145, `usePendingMomentoRequests`). Esta sprint
estende o badge "solicitação→dono" pra grupos/eventos (mirror do padrão
S145) e cria do zero o badge "aceite→solicitante" nas 3 frentes — 100%
inexistente antes.

**O que foi feito:**
- Badge "solicitação→dono" (grupos/eventos): hooks novos
  `usePendingGroupJoinRequests`/`usePendingEventJoinRequests`
  (`src/hooks/`) — um `listenJoinRequests` por grupo/evento próprio
  (`listMyGroups`/`listMyEvents` filtrado por `creatorId === uid`), soma
  agregada. `joinRequests` só existe enquanto pendente, então não precisa
  filtro de status.
- Badge "aceite→solicitante" (100% novo, 3 frentes): campo `seenAt`
  (`serverTimestamp`) em `groups/{groupId}/members/{uid}`,
  `events/{eventId}/participants/{uid}` e `momentoRequests/{requestId}`.
  `firestore.rules`: os dois primeiros saem de `allow update: if false`
  pra permitir só o próprio uid gravar só `seenAt`; `momentoRequests`
  ganha ramo OR novo (author continua o único que muda `status`, sender
  grava só `seenAt` depois que o pedido sai de pending). Funções novas
  `markGroupMembershipSeen`/`markEventParticipationSeen`/
  `markMomentoRequestSeen` (mesmo molde de `markMatchRead`,
  `firestoreService.ts`), chamadas fire-and-forget no mount de
  `GroupDetailScreen`/`EventDetailScreen`/`MomentoRequestChatScreen`.
  Hooks agregados novos `useUnseenAcceptedGroups`/`useUnseenAcceptedEvents`
  (1 `listenMyMembership`/`listenMyParticipation` — funções novas em
  `groupService.ts`/`eventService.ts` — por grupo/evento onde sou membro
  mas não dono) e `useUnseenAnsweredMomentoRequests` (reusa
  `listenSentMomentoRequests`, já existente, sem listener por doc).
- Os 5 hooks somados ao `tabBarBadge` da aba Explorar
  (`src/navigation/index.tsx`) junto do `usePendingMomentoRequests` já
  existente; nos cards Grupos/Eventos/Pedidos de `MomentosScreen.tsx`, o
  dot aparece se `pendente > 0 || não-visto > 0`.

**Decisões técnicas registradas (sem decisão de produto nova — spec já
veio fechada):** `listenMyMembership`/`listenMyParticipation` são funções
novas não nomeadas explicitamente na spec (que só previa as 3 `mark*Seen`
e os 5 hooks) — necessárias pro contrato "reativo/onSnapshot" exigido
pelos hooks `useUnseenAccepted*`; mirror do padrão já existente de
`listenGroup`/`listenEvent` (doc por ID, não uma query nova). Nenhuma
Cloud Function tocada, nenhum índice novo (nenhuma query nova usa
`collectionGroup`/filtro composto — os hooks de agregação usam N
listeners de doc único, não 1 query nova).

---

### S147 — Bug: momento PRÓPRIO renderiza como barra azul vazia no feed do Explorar
**Status:** ABERTA · sem decisões · sem recon

Reportado por Raphael em 25/08/2026 (print anexo): no feed do Explorar, o
card do momento PRÓPRIO aparece como uma barra azul vazia, sem conteúdo —
tocar nele abre o viewer normal (o conteúdo existe, só o card do feed não
renderiza). Provável bug de render no `MomentosScreen`. Client puro.

### S148 — Momento: ciclo de vida da conversa
**Status:** ABERTA

**Decisões de produto tomadas (Raphael, 25/08/2026):**
1. Conversa/pedido do Momento é APAGADA junto com a expiração do momento —
   CONFIRMADO, sem contar a partir da última mensagem. `expireMomentos`
   passa a varrer também os `momentoRequests` do autor expirado (docs e
   subcoleção `messages`).
2. Conversas de Momento SAEM da aba Conversas — revoga a mesclagem "via
   Momento" da S143-C (commit `0447db6`); código a remover.
3. O card "Pedidos" do Explorar (S145/S146) é renomeado pra "Momentos" e
   passa a concentrar pedidos pendentes E conversas já respondidas.
4. Ao abrir a conversa, exibir o momento de origem — `momentoSnapshot` já
   existe nos docs (S143-B/C); é exibição nova, não modelo novo.

**Interage com:** S143-C (mesclagem revogada), S145/S146 (card renomeado,
escopo do badge).

### S149 — Grupo: paridade do chat + prazo ilimitado
**Status:** ABERTA · 2 partes independentes

1. Chat de grupo ganha as funcionalidades do chat 1:1 — reações,
   responder/replyTo, editar, apagar, "ler mais", copiar. A recon lista o
   delta exato e propõe quebra em partes se estourar a régua da S144-D
   (~500 linhas / ~8 arquivos).
2. Criação de grupo ganha opção "sem prazo" — revoga o teto de 1 mês da
   S124-A como via única. A recon confere o efeito na `expireGroups` e nas
   rules pra grupos sem `expiresAt`.

### S150 — Explorar: notificações (push + badge)
**Status:** ABERTA — decisão fechada, sem recon

**Decisão fechada (Raphael, 25/08/2026):**
- PUSH fica SÓ no que pede ação da pessoa (pedido de entrada recebido,
  pedido aceito) — já existe 100% (S124-A/S125/S143-B), nada a criar no
  push; a decisão permanente de zero push por mensagem de grupo (S124-B)
  SEGUE VALENDO.
- BADGE dot (padrão S145/S146: aba Explorar + card) SÓ pro que envolve a
  pessoa: mensagem nova em grupo que ela participa → card Grupos;
  mensagem nova em conversa de Momento dela → card Momentos; grupo
  novo/evento novo NÃO acendem; momento novo não acende nada. Dot some ao
  abrir a tela correspondente.

### S151 — Enquete do perfil: até 5 opções
**Status:** ABERTA · pequena

Hoje aceita 2-4 opções; sobe o teto pra 5. Toca validação nas rules (poll
de `users` e o de `groups` da S124-B, manter paridade), `PollEditModal` e
constantes.

---

## Fechadas recentemente

| Sprint | O que era |
|---|---|
| S143-C | Barra de resposta no viewer do Momento (chips + emojis + campo), redesenhada pós-teste pra ser independente de match — commits `d753ef7`, `faa1e36`, `00dd061`, `0447db6`, `94df3c7`. `firestore.rules` **deployadas**. Causa do permission-denied CONFIRMADA e corrigida: `allow get` de `momentoRequests/{requestId}` negava doc inexistente em vez de permitir — padrão `resource == null \|\| dono`, mesmo molde do swipe da S49. **Fechada em código E testada em aparelho (25/08/2026).** |
| S144-C | Quebrou `functions/src/index.ts` (1929 linhas, 31 Cloud Functions) em módulos por domínio: `chat.ts`, `admin.ts`, `account.ts`, `perfil.ts`, `momentos.ts`, `grupos.ts`, `eventos.ts`, `agendadas.ts` + `shared/index.ts` (único lugar com `initializeApp()` e `defineSecret('GMAIL_APP_PASSWORD')`). `index.ts` final é só reexport nomeado. Confirmado: os 31 nomes exportados no runtime são exatamente os mesmos de antes, sem renomear/aninhar nada — nenhum deploy foi feito nesta sprint. `ARQUITETURA.md` atualizado com a estrutura nova. |
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

## 🚀 BUILD 15

**Status:** GERADO com sucesso em 25/08/2026 via
`eas build --platform android --profile production` — versionCode 15 /
version 1.0.5, commit `e92cd1d`. Conteúdo em relação ao build 14: tudo de
S101 até S146. Hoje no teste interno, aguardando promoção pra teste fechado
e a bateria de testes do lote — que passa a ser a maior já feita no
projeto (ver "Testes pendentes" abaixo, incluindo "Espera o build 15").

---

## Testes pendentes

Seção acumulativa: o que ainda falta testar, por onde dá pra testar.

**Testável no Expo Go agora:**

- S141 — abrir momento próprio e de terceiro: o X, avatar e nome do
  cabeçalho não podem mais ficar atrás da status bar (iOS notch/Dynamic
  Island e Android com status bar translúcida).
- S141 — deixar o momento parado 5s sem tocar: tem que avançar sozinho pro
  próximo item da fila (ou fechar, se for o último) e a barra de progresso
  precisa preencher visivelmente até o fim antes de avançar.
- S141 — segurar o dedo na área da imagem/texto: a barra tem que PARAR de
  encher; soltar retoma do ponto exato e completa no tempo restante (não
  reinicia do zero).
- S141 — segurar o dedo sobre os botões do cabeçalho (X, denunciar, apagar):
  eles continuam tocáveis normalmente, sem pausar nem atrapalhar o toque.
- S141 — abrir vários momentos do feed em sequência (sem fechar entre um e
  outro) pra conferir que o avanço automático não vaza pro momento errado
  depois de trocar de item várias vezes rápido.
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
- S124-A — criar grupo (`CreateGroupScreen`) com nome/descrição/prazo;
  conferir que ele aparece em "Meus grupos" e some de "Descobrir" pra quem
  criou.
- S124-A — com uma conta B: grupo do A aparece em "Descobrir"; pedir entrada
  muda o estado da tela pra "Pedido enviado" + "Cancelar pedido"; cancelar
  volta pro estado "Pedir pra entrar".
- S124-A — pedir entrada duas vezes rápido (dois toques): segundo toque não
  deve mostrar Alert de erro genérico (create-only, `permission-denied` vira
  no-op silencioso em `requestToJoinGroup`).
- S124-A — como criador: pedido pendente aparece na lista "Pedidos
  pendentes" de `GroupDetailScreen`; aprovar move a conta B pra "Meus
  grupos" dela e soma 1 em `memberCount`; rejeitar apaga o pedido sem
  virar membro.
- S124-A — membro comum (não-criador) consegue "Sair do grupo" (com
  confirmação) e `memberCount` desce 1; criador NÃO tem essa opção.
- S124-A — chat de grupo (`GroupChatScreen`): enviar texto e foto entre 2+
  contas membros; conta SEM `verified` vê o banner de bloqueio, mesmo texto
  do chat 1:1; conta que saiu do grupo enquanto a tela estava aberta vê o
  banner "Você não é mais membro deste grupo".
- S124-A — denunciar um grupo (menu do cabeçalho de `GroupDetailScreen`)
  reusando o `ReportModal`; conferir que chega na fila do admin com
  `reportedId` == uid do CRIADOR do grupo (não de quem denunciou) e que
  `AdminReportDetailScreen` mostra o bloco "Grupo denunciado" com o
  `groupName`.
- S124-A — grupo expirado (prazo no passado, testável reduzindo o prazo
  manualmente no Console pra simular) some da lista depois que a function
  `expireGroups` varrer (até 1h) — navegar direto pro `groupId` expirado
  (deep link/state stale) cai no estado "Este grupo não existe mais.", não
  em erro genérico.
- S124-A — apagar a conta do CRIADOR de um grupo apaga o grupo inteiro
  (`deleteAccount`); apagar a conta de um MEMBRO comum só remove a
  participação dele, o grupo continua existindo pros demais.
- S124-B (camada 1) — criador cria enquete de grupo (2 a 4 opções); membro
  comum (conta B) consegue votar, e o resultado agregado aparece pra
  QUALQUER membro que já votou — não só pro criador, diferença deliberada
  em relação ao poll de perfil (S126), onde só o dono vê o agregado.
- S124-B (camada 1) — trocar a pergunta (ou remover a enquete) zera
  `pollCounts`/`pollVotes/*` de verdade (`onGroupPollChanged`); votar duas
  vezes rápido (dois toques, ou dois devices/telas com a mesma conta) não
  derruba a UI com Alert de erro genérico (cai no ramo `permission-denied` =
  "já votou").
- S124-B (camada 1) — membro NÃO-criador não vê botão de criar/editar/
  remover enquete; quem não é membro do grupo não vota (rules exigem
  `exists(members/{voterUid})`).
- S124-B (camada 2) — abrir `GroupDetailScreen` como membro mostra "X
  ativo(s) agora"; abrir a mesma tela sem ainda ser membro NÃO mostra o
  número (a callable nega quem não é membro do grupo).
- S124-B (camada 3) — `GroupDetailScreen` mostra "Criado por X" + selo
  "Criador" ao lado; no chat de grupo (`GroupChatScreen`), o mesmo selo
  aparece ao lado do nome só nas mensagens do CRIADOR, nunca nas de outro
  membro.
- S143-A — abrir um momento (próprio ou de terceiro) e tocar na METADE
  ESQUERDA da área de conteúdo (texto ou foto): volta um momento na fila;
  tocar na METADE DIREITA: avança um. Conferir os dois lados com momento de
  texto e com momento de foto.
- S143-A — voltar estando no PRIMEIRO momento da fila é no-op: não fecha o
  modal, não trava, não dá erro (mesmo comportamento de
  `PhotoCarousel.goToPrevious` nas pontas).
- S143-A — avançar estando no ÚLTIMO momento continua fechando o modal
  (regra da S141, não pode ter regredido).
- S143-A — segurar o dedo (toque longo) na área de conteúdo continua só
  PAUSANDO a barra de progresso, sem navegar; soltar depois de um toque
  longo retoma a barra do ponto exato, sem pular pro item anterior/seguinte.
- S143-A — toque curto no botão do cabeçalho (X, denunciar/lixeira) continua
  funcionando normalmente e não deve disparar navegação do conteúdo por
  trás.
- S143-A — ressalva da 3ª auditoria (não bloqueou, é runtime, não decidível
  só lendo código): tocar rápido e repetido nos dois lados do conteúdo, pra
  confirmar que não há avanço/retrocesso duplo por corrida entre o
  `resumeTimer()` do toque anterior e o `useEffect([momento?.id])` disparado
  pela navegação em si.
- S145 — aba Explorar (não-admin): fileira nova de 3 cards (Grupos/Eventos/
  Pedidos) aparece ACIMA do card "Criar momento"/momento próprio; tocar em
  cada um navega pra `GroupsScreen`/`EventsScreen`/`MomentoRequestsScreen`
  normalmente (telas de destino intocadas nesta sprint).
- S145 — com um pedido de Momento pendente recebido (conta A é autora do
  momento comentado): a aba Explorar mostra o dot vermelho na PRÓPRIA aba
  (tab bar) e também ao lado do card "Pedidos"; responder/recusar o pedido
  (`MomentoRequestsScreen`) apaga os dois dots.
- S145 — conta ADMIN: "Grupos"/"Eventos" NÃO aparecem mais em `ProfileScreen`
  (relocados); "Pedidos de conversa" continua aparecendo lá (guarda virou
  `isAdmin &&`), com o mesmo pontinho de antes quando há pedido pendente.
  Admin não tem aba Explorar, então o teste do dot da tab (item acima) não
  se aplica a ele.
- S146 — **depois que Raphael fizer o deploy das rules desta sprint**: com
  a conta B pedindo pra entrar num grupo/evento da conta A (dona), o dot
  vermelho aparece na tab bar Explorar de A e no card "Grupos"/"Eventos"
  de A; aprovar o pedido apaga os dois dots de A.
- S146 — conta B tem o pedido de entrada em grupo/evento da conta A
  APROVADO enquanto B não abre `GroupDetailScreen`/`EventDetailScreen`: o
  dot aparece na tab bar de B e no card correspondente; abrir a tela do
  grupo/evento aprovado apaga os dois dots de B (mesmo com o app
  fechado/reaberto depois — `seenAt` é campo do Firestore, não
  AsyncStorage local).
- S146 — mirror do teste acima pra "Pedidos de conversa": conta B manda um
  comentário/pedido a um Momento de A; A responde (`answerMomentoRequest`)
  ou recusa (`declineMomentoRequest`); o dot aparece na tab bar de B e no
  card "Pedidos" de B até B abrir `MomentoRequestChatScreen`.
- S146 — conta A (dona do grupo/evento) NÃO deve ver o dot "aceite→
  solicitante" na própria participação (ela é `creatorId`, o hook
  `useUnseenAccepted*` já exclui os próprios); e conta B (autora do
  comentário respondido) não deve ver o dot "solicitação→dono" (esse é só
  de quem CRIOU o grupo/evento).
- S146 — regressão: o dot "solicitação→dono" de momentos (S145,
  `usePendingMomentoRequests`) continua aparecendo/sumindo igual antes,
  sem interferência dos hooks novos somados no mesmo `tabBarBadge`.
- S139 — **depois que Raphael fizer o deploy das rules corrigidas**: com a
  conta A publicando um momento ativo, abrir a aba de Momentos com a conta
  B e conferir que o momento de A aparece (sem `permission-denied` no
  log); confirmar que `getMyMomento` (o próprio momento do dono) continua
  funcionando igual antes; e que um momento expirado (aguardar os
  ~24h, ou reduzir `expiresAt` manualmente no Console pra simular) some do
  feed de B sem erro.

**S143-C — bateria de aparelho TESTADA e APROVADA em 25/08/2026** (barra de
resposta no viewer, roteamento independente de match, mesclagem "via
Momento" na aba Conversas, bloqueio ativo, teclado/timer de auto-avanço —
ver "Fechadas recentemente"). Débito de S143-B que segue pendente acima
(curtir/comentar momento, deploy de `firestore.rules`/Cloud Functions)
continua na bateria geral.

**Espera o build 15:**

- S124-A — quem cria o grupo recebe push de "Novo pedido pra entrar no
  grupo" (`onGroupJoinRequestCreated`); quem tem o pedido aprovado recebe
  push de "Pedido aprovado!" (`onGroupMemberCreated`), MAS o criador NUNCA
  recebe esse segundo push sobre si mesmo na criação do próprio grupo.
  Confirma também a decisão permanente: NENHUM push é disparado por
  mensagem enviada no chat de grupo. Expo Go não entrega push no SDK 54,
  precisa do build.
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
  (`AdminReportsScreen`/`AdminReportDetailScreen`/`MyReportsScreen`), o nome
  exibido é sempre o `nickname` ("como quer ser chamado", via
  `getDisplayName` em `src/utils/profile.ts`) — nunca o nome legal completo
  (`users/{uid}/private/legalName`, legível só pelo dono e pelo admin nas
  rules). Só `AdminVerificationsScreen`/`AdminVerificationDetailScreen`
  mostram o nome real, porque é a referência que o revisor humano confere
  contra a selfie. Qualquer tela nova que exiba nome de usuário segue essa
  mesma regra por padrão.
  **Exceção estreita (S138):** `AdminSupportDetailScreen` também mostra o
  nome legal completo, mas só dentro da ação "Editar nome/apelido" — é a
  única tela onde o admin corrige `nickname`/`legalName` a partir de um
  chamado de suporte (nome e apelido ficaram imutáveis pelo usuário nessa
  sprint), e editar às cegas sem ver o valor atual não é viável. Fora dessa
  ação, a tela segue mostrando só o `nickname`, como qualquer outra.

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
- **Query `collectionGroup()` tem DUAS exigências de infraestrutura
  separadas — descoberto na S124-A em duas rodadas (implementação, depois
  auditoria).** (1) REGRA: uma regra ANINHADA (`match
  /groups/{groupId}/members/{uid}`) só autoriza `get()`/`onSnapshot()` de um
  DOC ESPECÍFICO, com o `groupId` já conhecido — ela NÃO cobre uma query
  `collectionGroup('members')`, que varre a subcoleção através de TODOS os
  pais de uma vez sem o client saber o `groupId` de antemão. É preciso uma
  regra declarada com wildcard recursivo no nível de TOPO (`match
  /{path=**}/members/{memberUid} { allow read: if isSignedIn() &&
  resource.data.uid == request.auth.uid; }`) — sem ela a query sempre volta
  `permission-denied`. Essa foi a falta REAL que travava `listMyGroups`
  (`groupService.ts`, e por tabela a `GroupsScreen` inteira): a 1ª versão
  desta sprint só tinha a regra aninhada, e só a reauditoria pegou o buraco
  (não é intuitivo — regra aninhada "parece" bastar, mas não basta pra
  collection group query). (2) ÍNDICE: além da regra, o campo do filtro de
  igualdade (`where('uid','==',uid)`) também precisa de índice explícito em
  `firestore.indexes.json` (`fieldOverrides`, `queryScope:
  "COLLECTION_GROUP"`) — o índice single-field automático do Firestore só
  cobre `queryScope: "COLLECTION"` por padrão. Qualquer sprint futura que
  faça a primeira query `collectionGroup()` de uma subcoleção nova precisa
  lembrar dos DOIS ao mesmo tempo: a regra recursiva E o `fieldOverride` —
  faltar só um dos dois já derruba a query em runtime.
- **Contador denormalizado mantido pelo CLIENT (não por Cloud Function)
  nunca usa `FieldValue.increment()` E precisa ler o valor FRESCO de dentro
  de uma `runTransaction`, nunca de um valor já em mãos na tela.**
  Descoberto/corrigido na S124-A: a 1ª versão de `approveJoinRequest`/
  `leaveGroup` (`groupService.ts`) usava `writeBatch` recebendo
  `currentMemberCount` como parâmetro (valor que a tela já tinha carregado)
  e escrevia `currentMemberCount ± 1` — se esse valor estivesse desatualizado
  (ex.: duas aprovações em sequência antes do listener propagar a primeira),
  a rule negava o BATCH INTEIRO, inclusive as escritas que estavam corretas
  (criar `members/{uid}`, apagar `joinRequests/{uid}`). A reauditoria trocou
  as duas por `runTransaction`, que lê `groups/{groupId}` FRESCO
  (`transaction.get`) e calcula `+1`/`-1` a partir do valor lido ALI DENTRO
  — nunca de um parâmetro vindo da tela. Continua valendo o padrão de
  `superLikes/usage`/`replies/usage` quanto a NÃO usar
  `FieldValue.increment()` (as rules validam IGUALDADE exata contra
  `resource.data.count`/`memberCount`), mas "ler antes e escrever o valor
  exato" só é seguro dentro da mesma transação atômica que faz a leitura —
  não como parâmetro carregado em um momento anterior e potencialmente
  desatualizado no momento da escrita.
- **`allow read` com condição dependente de `request.time` (ou qualquer
  valor que muda a cada avaliação) nunca pode ser a ÚNICA regra de leitura
  de uma collection consultada por `list`/`onSnapshot` — só funciona pra
  `get()` de doc por ID.** Descoberto na S139: `momentos/{uid}` tinha só
  `allow read: if isSignedIn() && resource.data.expiresAt > request.time;`
  e `listenActiveMomentos` (`onSnapshot`) sempre voltava
  `permission-denied`, mesmo com a query do client já filtrando
  `where('expiresAt','>',...)` corretamente. Motivo: pra uma query/
  listener, o Firestore precisa PROVAR estruturalmente que a regra vale
  pro conjunto de resultados ao longo de toda a vida do listener — uma
  condição com `request.time` não é provável dessa forma, e o Firestore
  nega o `list` INTEIRO, não filtra doc a doc. `get()` (doc por ID) não
  sofre disso, é avaliado com o dado real, por isso `getMyMomento`
  funcionava e só o feed de terceiros quebrava. Correção: separar
  `allow get` (mantém a condição de `expiresAt`, protege doc "zumbi"
  acessível por ID direto) de `allow list` (sem condição de tempo,
  filtragem de expirados delegada inteiramente à query do client — mesmo
  padrão já usado em `groups/{groupId}`, "Leitura ampla pra qualquer
  autenticado"). Qualquer collection nova consultada por `list`/listener
  com regra de leitura que dependa de `request.time` cai na mesma
  armadilha.
  **Reincidência confirmada na S125 (fix S125-A, 25/08/2026):**
  `events/{eventId}` tinha o mesmo desenho — `allow read` único com
  `resource.data.startsAt > request.time` dentro de um OR — e
  `listDiscoverableEvents` (`collection('events').where('startsAt','>',
  now)`) sempre voltava `permission-denied`, mesmo a query já filtrando
  corretamente. Mesma correção: `allow get` mantém a condição de data;
  `allow list` vira só `isSignedIn()`. Toda collection nova com campo de
  expiração/agendamento (`expiresAt`, `startsAt`, `purgeAt`...) consultada
  por `list` precisa nascer já com get/list separados — não esperar o bug
  aparecer de novo pra lembrar da lição.

- **Hook de contagem agregada sobre N docs dinâmicos (ex.: "1 listener por
  grupo/evento próprio") precisa de um acumulador ESCOPADO ao efeito, não
  de `setState((prev) => ...)` acumulando sobre o state anterior.**
  Estabelecido na S146 (`usePendingGroupJoinRequests`/
  `usePendingEventJoinRequests`/`useUnseenAcceptedGroups`/
  `useUnseenAcceptedEvents`): quando a LISTA de ids muda (ex.: um grupo
  novo aprovado, um grupo que expirou), os listeners antigos são
  desmontados e novos são montados pro conjunto novo de ids — se o
  acumulador fosse `setCounts((prev) => ({...prev, [id]: n}))`, entradas de
  ids que SAÍRAM da lista ficariam presas no state pra sempre (nenhum
  listener novo vai reescrever/apagar aquela chave), inflando a contagem
  incorretamente. Fix: cada rodada do `useEffect([idsList])` declara um
  acumulador `local` (variável comum, não state) FECHADO sobre essa versão
  específica da lista de ids — cada callback de listener escreve nesse
  `local` e chama `setState(local)` direto (substitui o objeto inteiro, não
  funde com o state anterior). Vale pra qualquer hook novo que agregue N
  listeners de doc dinâmico (não uma única query/collectionGroup).

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
- **`SafeAreaView` dentro de `<Modal>` nativo não recebe inset do
  `SafeAreaProvider` de topo.** Descoberto na S141 no `MomentoViewerModal`:
  um `<Modal>` do React Native monta como superfície nativa separada da
  árvore do `App.tsx`, então o `SafeAreaProvider` de topo não a mede — um
  `SafeAreaView` direto dentro do `Modal` recebe insets zerados (cabeçalho
  sobrepõe a status bar). Fix: todo `SafeAreaView` usado DENTRO de um
  `<Modal>` precisa de um `<SafeAreaProvider>` PRÓPRIO, aninhado dentro do
  próprio `Modal`, envolvendo esse `SafeAreaView`. Vale para qualquer
  `Modal` novo que precise respeitar safe area, não só o de Momentos.
- **`GestureDetector` dentro de `<Modal>` nativo não herda o
  `GestureHandlerRootView` de topo — pelo MESMO motivo do bullet acima.**
  Descoberto na S143-A (rodada 2) no `MomentoViewerModal`: a raiz nativa
  do `<Modal>` (`ReactModalHostView.DialogRootViewGroup` no Android) não é
  descendente do `RNGestureHandlerRootView` de `App.tsx`, então
  `hasGestureHandlerEnabledRootView`
  (`node_modules/react-native-gesture-handler/android/.../
  RNGestureHandlerRootView.kt`) sobe a árvore de pais, encontra a raiz
  genérica do `Modal` primeiro e retorna `false` — qualquer
  `GestureDetector` dentro do `Modal` fica sem efeito. Fix: todo
  `GestureDetector` usado DENTRO de um `<Modal>` precisa de um
  `<GestureHandlerRootView style={{ flex: 1 }}>` PRÓPRIO, aninhado dentro
  do próprio `Modal` (pode envolver o `SafeAreaProvider` já exigido pelo
  bullet acima). Vale para qualquer `Modal` novo que use gestos, não só o
  de Momentos.
- **`Gesture.LongPress()` sem `.maxDistance(...)` cancela sozinho por
  tremor de mão em toques longos.** Descoberto na S143-A (rodada 2): o
  default nativo de deslocamento máximo é só ~10dp (Android,
  `DEFAULT_MAX_DIST_DP` em `LongPressGestureHandler.kt`) / ~10pt (iOS,
  `allowableMovement` em `RNLongPressHandler.m`). Num toque longo de
  vários segundos (ex.: segurar pra pausar um timer), o tremor natural da
  mão ultrapassa esse limite e cancela o reconhecedor sozinho —
  `onFinalize` dispara com o dedo ainda na tela, como se o usuário
  tivesse soltado. Se a área do `LongPress` não competir com nenhum gesto
  de arraste/scroll, usar um `.maxDistance(...)` bem generoso (ex.:
  `100000`) pra nunca cancelar por deslocamento.

## Baseline técnica

- `npx tsc --noEmit` → exit 0
- `npx eslint .` → **0 erros / 21 warnings**. Não pode piorar.

---

## Ideias sem número (não são sprint ainda)

Classificados / "OLX de funcionários" · feed "rádio corredor" · joguinho de
moedas · modelo de negócio. Todas levantadas em 17/08, nenhuma com decisão.
