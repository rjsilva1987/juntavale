# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 04/09/2026

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

### S136 — JuntaVale como REDE SOCIAL para funcionários
**Status:** ABERTA · BLOQUEADA até o fim do teste fechado de 14 dias
(destrava ~30/08/2026) · sem recon

Decisão de direção de produto (Raphael, 22/08/2026): o JuntaVale deixa de
ser só app de relacionamento e passa a ser uma rede social para
funcionários de instituições financeiras. Amarra com a visão declarada em
17-18/08 ("unir o vício do Facebook com o do Instagram e o do Twitter") e
com a camada social já construída — Momento (S121/S141/S143), grupos
(S124), eventos (S125), enquetes (S126/S132), selos (S127).

⚠️ A DECISÃO QUE DEFINE TODAS AS OUTRAS: qual tela vira a inicial. Hoje o
app abre no Descobrir (swipe); rede social abriria num FEED. Isso muda a
tab bar, a primeira impressão do app, a ficha das duas lojas e
possivelmente a categoria na App Store — e colide com a defesa do nicho
enviada à Apple no 4.3(b), que descreve o app pela comunidade credenciada.
Nada de recon ou implementação antes dessa decisão.

### S178-B — Fixar conversas: grupos e classificados
**Status:** ABERTA · sem decisões · sem recon

Extensão da S178 (fixar até 3 conversas no topo, só matches 1:1 na aba
Conversas). Cobriria a aba Grupos (GroupsScreen) e a lista de chats de
classificado (ListingChatsScreen). Decisões em aberto: limite compartilhado
ou por lista; campo próprio (`pinnedGroupIds`/`pinnedListingChatIds`) ou
um só; se o card "Classificados" da aba Conversas conta como conversa.

---

### S178 — Fixar conversas no topo (matches 1:1, aba Conversas)
**Status:** IMPLEMENTADA em 04/09/2026 (lote 3 de 04/09, modo AUTOMATICO +
GIT AUTOMATICO, trilha completa), auditoria APROVADA na 2ª rodada (1ª
BLOQUEOU: a poda de pins usava a lista já filtrada por bloqueio e apagaria
o pin de um match apenas bloqueado; corrigido). EXIGE deploy de
`firestore:rules` (stamp S178 — `pinnedMatchIds` no `hasOnly` do update do
dono + validação `is list && size() <= 3` em `isValidProfile`); sem
function, sem índice. Lado client entra no build 26 (testável em Expo Go
depois do deploy das rules). SEM teste em aparelho.

Persistência em `users/{uid}.pinnedMatchIds` (campo privado do dono, máx.
3 ids de `matches/*`), nunca no doc do match. MatchesScreen: `rows`
ordena em memória fixadas primeiro e, dentro de cada grupo, por
`lastMessage.createdAt` desc (sem orderBy, sem índice); ícone Ionicons
`pin` 14px `textSecondary` na coluna de meta do card; toque longo no card
abre o sheet (molde MyListingsScreen S176) com título = nickname, uma
opção "Fixar conversa"/"Desafixar conversa" e "Cancelar"; ao tentar a 4ª:
Alert "Limite atingido — Você pode fixar até 3 conversas."; erro de
escrita vira Alert com o code (S164). Poda de órfãos: `useActiveMatches`
passa a expor `matchIds` (ids BRUTOS do snapshot de `getMatches`, antes do
filtro de bloqueio); o effect só roda com `loading:false`, uid e lista não
vazia, e grava `kept` uma única vez se algum id fixado não existir mais
(unmatch apaga o doc); bloqueio mantém o doc → o pin fica, invisível
enquanto bloqueado e volta ao desbloquear. Deps por conteúdo
(`matchIds.join`, `pinnedIds.join`, uid, loading), sem `eslint-disable`.
Fora: carrossel "Novos matches", grupos e classificados (→ S178-B).

Ressalvas (não bloqueantes): usuário que fica com ZERO matches mantém o id
órfão até ganhar um match novo (invisível); janela de corrida estreita
entre `togglePin` e a poda, autocorrigida no snapshot seguinte; título do
sheet usa `nickname` cru (conta legada sem nickname vê "Conversa").

Teste (Expo Go, depois do deploy das rules): toque longo num card da lista
"Mensagens" → sheet → "Fixar conversa" → card sobe pro topo com alfinete;
fixar 3 e tentar a 4ª → Alert do limite; "Desafixar" volta pra ordem por
última mensagem; mandar mensagem numa não fixada não passa por cima das
fixadas; desfazer match fixado → o id some de `pinnedMatchIds` no console;
bloquear o outro lado de uma fixada → o id CONTINUA no array e a conversa
volta fixada ao desbloquear. Antes do deploy das rules, fixar dá Alert
"erro: permission-denied" (esperado).

Decisões tomadas no automático: trilha completa; fixar só na lista
principal de conversas (não no carrossel "Novos matches"); ícone Ionicons
`pin`; rules no menor ramo (hasOnly + isValidProfile); bloqueio não poda.

---

### S179 — Chat de classificado: Alert "Conversa indisponível" indevido na 1ª mensagem
**Status:** IMPLEMENTADA em 04/09/2026 (lote 3 de 04/09, modo AUTOMATICO +
GIT AUTOMATICO, trilha completa), auditoria APROVADA na 1ª rodada (sem
falhas; 2 ressalvas: `handleSend`/`handleSendImage` mantêm o objeto `chat`
nas deps do useCallback e agora são recriados 2x por escrita no doc pai —
churn de referência, sem trabalho caro; o comentário de
`handleListenerError` não cita o caso "usuário perdeu a verificação"/deep
link do push, que também cai em permission-denied). Client puro — NÃO
exige deploy; entra no build 26 (testável em Expo Go com 2 contas
verificadas). SEM teste em aparelho.

Premissa do pedido CONTRADITA pela recon: a rule de `get` de
`listingChats/{chatId}` já tolera doc inexistente (`resource == null ||`)
desde a S168-B, e as rules ATIVAS no projeto foram lidas em 04/09/2026 e
são idênticas ao repo (stamp S172-A, diff vazio). Causa real: corrida na
1ª mensagem — `ensureListingChat` faz `setDoc` do doc pai, o `onSnapshot`
do pai dispara o snapshot LOCAL imediato (`hasPendingWrites: true`), a
tela via `chatExists` assinava `messages` na hora, e a rule de `messages`
(`get()` do pai no servidor) negava porque o create ainda não tinha sido
commitado → Alert + goBack, com a conversa existindo e funcionando ao
reabrir. O relato "ao tocar Tenho interesse" não é reproduzível pelo
código: na abertura sem doc o listener de mensagens nem assina.

Correção: `listenListingChat` passa `snap.metadata.hasPendingWrites` como
2º argumento do callback (mirror de `listenListingChatMessages`) e assina
com `includeMetadataChanges: true` (snapshot da confirmação garantido por
contrato); a tela ganha o state `chatConfirmed` com latch (vira true no 1º
snapshot com `hasPendingWrites: false`, só volta a false se o doc sumir —
update pendente de `lastMessageAt`/`lastReadAt` a cada envio não derruba o
listener) e o listener de `messages` só assina com `chatConfirmed`; os
demais usos de `chatExists` (Leitura (a), composer, handleSend,
handleSendImage) ficam iguais. `handleListenerError` mantém Alert + goBack
pra `permission-denied` (caso legítimo S173) com o code no texto (regra
S164): "Não foi possível abrir esta conversa (erro: permission-denied)."
NÃO se criou o doc no "Tenho interesse" (desenho S168-B preservado).

Teste (build 26 ou Expo Go, 2 contas verificadas): interessado toca
"Tenho interesse" → tela vazia sem Alert → manda a 1ª mensagem (texto e,
em outra conta/anúncio, foto como 1ª mensagem) → NENHUM Alert, a
mensagem aparece e a conversa segue; conta apagada (S173) → o outro lado
ainda vê "Conversa indisponível" com "(erro: permission-denied)".

Decisões tomadas no automático: trilha completa; correção pelo lado do
client (gate por confirmação do servidor) em vez de rules ou de criar o
doc na abertura; Alert com code mantido pra erro real, sem banner novo.

### S177 — Chat de classificados: badge na aba Conversas + push só com app fechado
**Status:** IMPLEMENTADA em 04/09/2026 (sprint avulsa, modo AUTOMATICO +
GIT MANUAL, trilha completa), auditoria APROVADA na 1ª rodada (sem falhas;
1 ressalva herdada da S168-B: `useUnreadListingChats` devolve 0 pra usuário
não-verificado). Parte A client puro — NÃO exige deploy; entra no build 26
(testável em Expo Go). Parte B ENCERRADA SEM ALTERAÇÃO de código — nada a
deployar. SEM teste em aparelho.

Parte A: `useUnreadListingChats()` sai de MatchesScreen e passa a ser
chamado UMA vez em `MainTabs()` (navigation/index.tsx); `conversasBadge =
unreadCount + listingChatsUnread` alimenta o `tabBarBadge` da aba Conversas
(some quando as duas contagens zeram; sem `tabBarBadgeStyle`, igual ao
badge de matches) e o valor desce por prop obrigatória `listingChatsUnread`
pra MatchesScreen, que mantém o dot do card "Classificados" — mesma fonte,
um listener só (diferente do precedente momento/grupo, que re-chama o hook
dentro da tela). Zeragem continua a de ListingChatScreen (`lastReadAt.{uid}`
no mount e a cada mensagem nova), sem mudança.

Parte B (diagnóstico com dados vivos do Firebase, 04/09/2026): (1)
`onListingChatMessageCreated` ESTÁ deployada em southamerica-east1 (lista
de functions; CreateFunction às 12:23 UTC de 04/09, depois do último commit
que tocou `functions/src/listings.ts`, cc60168) e disparou 7 vezes em 04/09
entre 21:37 e 21:46 UTC, uma por mensagem, sem WARNING/ERROR — a function
não loga sucesso (igual a `onMessageCreated`), então o log não prova envio
do ticket; (2) a guarda de foreground da S122 (`handleNotification` em
`src/services/notifications.ts`) é type-agnostic: lê só
`AppState.currentState`, suprime TODO tipo em primeiro plano e exibe em
background/fechado — `listing_message` já está coberto; (3)
`useNotifications` já roteia `listing_message` → `ListingChat` com
`{listingId, ownerId, interestedId, listingTitle}`, iguais aos params da
tela. Causa real do "push não chega" no teste: a conta destinatária (dono
do anúncio, criada 03/09) NÃO tem `users/{uid}/private/push` → a function
retorna em `!token` (listings.ts ~100). Coerente com Expo Go (`isExpoGo`
impede o registro) ou permissão negada em build (o app não re-pede nem
manda pra Configurações; logout apaga o doc). A outra conta do teste tinha
token atualizado às 21:17 UTC do mesmo dia — o registro em build funciona.
Teste da Parte B no build 26: as DUAS contas em build com permissão
concedida (conferir `private/push` no console), app do destinatário em
background/fechado → push chega com nickname + preview e o toque abre a
conversa; em primeiro plano nada aparece (S122).

Decisões tomadas no automático: trilha completa (recon tocou function/
logs); Parte B sem código e sem log novo na function (mantém simetria com
`onMessageCreated`, não cria deploy pendente); Parte A por lift do hook +
prop, não pelo precedente de listener duplicado; badge sem estilo novo.
Pendência de produto aberta (fora da sprint, vale pra todo push):
permissão negada uma vez não é re-solicitada nem há atalho pra
Configurações; logout remove o token.

### S176 — Classificados: marcar como vendido e excluir anúncio (lado do dono)
**Status:** IMPLEMENTADA em 04/09/2026 (sprint avulsa, modo AUTOMATICO +
GIT AUTOMATICO, trilha completa), auditoria APROVADA na 1ª rodada (sem
falhas; 2 ressalvas cosméticas: estilo `actionBtnTextDestructive` ficou
órfão em MyListingsScreen; `removeBtn` usa marginTop `sm` quando "Excluir
anúncio" é o único botão do detalhe). Client puro — NÃO exige deploy: os
ramos sold/removed das rules (S168-A) e o delete do dono em
`storage.rules` (S168-B2) já existem. Só entra em build novo. SEM teste em
aparelho.

A recon mostrou que `markListingSold`/`removeListing` e os botões inline
de Meus anúncios já existiam desde a S168-A — a sprint virou redesenho +
limpeza de Storage + detalhe do dono. MyListingsScreen: botões inline
"Marcar vendido"/"Excluir" saem da `actionsRow`; entra botão ⋯ e toque
longo no card, os dois abrindo um sheet (molde S167, `Modal` + backdrop +
opções) com "Marcar como vendido" (só approved) e "Excluir anúncio"
(qualquer status, inclusive expired/sold); "Renovar" (S172) continua
inline; "Editar" só aparece se `canEditListing(status)` (novo helper no
service, espelha o ramo de edição das rules: pending/approved/rejected/
expired). ListingDetailScreen do dono: "Editar anúncio" some pra sold/
removed; ganha "Marcar como vendido" (approved) e "Excluir anúncio"
(qualquer status), inline no fim do ScrollView (sem rodapé fixo/insets);
sucesso → `goBack()` (Meus anúncios recarrega no foco). Confirmações
iguais nas duas telas: vendido avisa que sai do feed e não volta; excluir
avisa que fotos e anúncio somem e que as conversas continuam legíveis com
"Anúncio encerrado" (S168-B já cobre sold e removed). `removeListing(id,
photos)`: `updateDoc` só com `status: 'removed'` e DEPOIS
`deleteListingPhotosBestEffort` — `deleteObject(ref(storage, url))
.catch(() => {})` por foto (molde momentoService), nunca por prefixo: o
path `images/listings/{uid}/` é plano, sem listingId, e apagar por
prefixo (molde S173, Admin SDK) levaria fotos de outros anúncios do
mesmo dono. Erros do Firestore viram `Alert('Erro', …)`; selo "Vendido"
já existia (`STATUS_LABEL`/`badgeNeutral`). Rules, indexes, functions,
listingChats e feed intocados.

Decisões tomadas no automático (Portão 1, nenhuma abre frente nova):
seguir a spec e migrar pro menu ⋯/toque longo mesmo com botões inline já
funcionais; menu só com os dois itens da spec (Editar e Renovar ficam
inline); botões do detalhe inline no ScrollView, não rodapé fixo;
esconder "Editar" pra sold/removed (rules já negam); excluir pending/
rejected com denúncia associada segue permitido (soft delete, denúncias
ficam); selo "Vendido" mantém o badge neutro; limpeza de Storage por URL
e não por prefixo; sucesso no detalhe faz `goBack()` em vez de estado
local.

---

### S174 — Push pros admins quando entra uma denúncia nova
**Status:** IMPLEMENTADA em 04/09/2026 (lote S175/S172-A/S174, modo
AUTOMATICO + GIT AUTOMATICO), auditoria APROVADA na 1ª rodada (sem
falhas). EXIGE deploy de `functions:onReportCreated` (nova). Lado client
(tipo `report_new` na union + roteamento pra aba Denúncias) só entra em
build novo. SEM teste em aparelho.

Fecha a pergunta de produto deixada pela S168-B2. Function
`onReportCreated` em `functions/src/admin.ts` (mesmo domínio de
`onReportMessageCreated`, trigger distinto: `onDocumentCreated
reports/{reportId}`), molde de `onListingSubmitted`: ignora denúncia
feita por admin (`isAdminUid(reporterId)` → ninguém é notificado, mesma
guarda "admin modera o próprio"), `getAdminPushTokens()` → 1 push por
admin, título "Nova denúncia para revisar", corpo fixo sem nenhum dado
da denúncia, `data: { type: 'report_new', reportId }`. Sem risco de push
duplicado: denúncia comum é `addDoc`; a de classificado (S168-B2) tem id
determinístico e a 2ª vira update negado, nunca create. Client:
`'report_new'` na union e `navigate('Main', { screen: 'Denuncias' })`
fora do bloco `isAdmin` de ignorados; ramo `report` (ReportThread do
denunciante) intocado. Rules de `reports` e fluxo de resolver intocados.
ARQUITETURA.md: 41 functions.

---

### S175 — docs de loja versionados + página de exclusão atualizada
**Status:** IMPLEMENTADA em 04/09/2026 (lote S175/S172-A/S174, modo
AUTOMATICO + GIT AUTOMATICO, trilha P sem recon), auditoria APROVADA na
1ª rodada (ressalva: `!docs/loja/` libera o diretório inteiro, não só um
arquivo — escopo pedido). EXIGE deploy de Hosting
(`site/excluir-conta.html`). SEM teste.

`.gitignore` ganha `!docs/loja/` (bloco "relatorios de sprint") e
`docs/loja/data-safety-classificados.md` (S168-C) passa a ser versionado.
`site/excluir-conta.html`: painel "Apagado de forma permanente" ganha
momentos + grupos/eventos criados, anúncios nos Classificados (com fotos)
e conversas nos Classificados (mensagens e imagens); "Mantido por
segurança" passa a "denúncias sobre outras pessoas, anúncios ou
conversas"; nota final avisa que as conversas somem também pra quem
conversou nos Classificados. Tudo fiel ao `deleteAccount` (S173), mesmo
texto da seção 5 de `site/privacidade.html`.

---

### S173 — deleteAccount apaga os dados de Classificados
**Status:** IMPLEMENTADA em 04/09/2026 (lote, modo AUTOMATICO + GIT
AUTOMATICO), auditoria APROVADA na 1ª rodada (sem falhas; ressalvas só de
escala já pré-existentes no desenho do `deleteAccount`). EXIGE deploy de
`functions:deleteAccount`. Sem rules/índices/client. SEM teste em aparelho.

Sprint aberta no meio do lote por decisão do Raphael (04/09/2026, portão
de produto da S168-C): a recon achou que `deleteAccount` não apagava
anúncios, fotos em `images/listings/{uid}` nem `listingChats`, e a
política de privacidade não podia afirmar exclusão completa. Dois blocos
novos em `functions/src/account.ts`, entre "participações em eventos" e
`avatars/{uid}`, cada um em try/catch próprio: (1) `listings` do dono →
`deleteDocsInBatches` (sem subcoleção) + `bucket.deleteFiles` de
`images/listings/{uid}/` (path é por uid do dono, 1 chamada — molde de
avatars); (2) `listingChats` em que o uid participa (dono OU
interessado, `participants array-contains`) → `recursiveDelete`
(subcoleção `messages`) + `deleteFiles` de `images/listingChats/{chatId}/`
(molde exato do bloco de matches). Nenhum índice novo (queries sem
orderBy). `reports` continua intacto — denúncias de anúncio/chat ficam
com `listingId`/`listingChatId` como referência solta. O outro
participante recebe `permission-denied` no listener e
`ListingChatScreen` já trata como "conversa indisponível".

---

### S172 — Expiração de anúncio com renovação em 1 toque
**Status:** IMPLEMENTADA em 04/09/2026 (lote, modo AUTOMATICO + GIT
AUTOMATICO), auditoria APROVADA na 1ª rodada (12 cenários de rules
simulados, nenhuma falha; ressalva residual: duplo toque no mesmo tick em
"Renovar" — `disabled` só vale no próximo render). EXIGE deploy de
`firestore.rules` (stamp S172) + `firestore.indexes.json` (índice novo
`listings (status ASC, expiresAt ASC)`) + `functions:expireListings`
(nova, scheduled). Lado client (`'expired'`, botão Renovar, roteamento de
`listing_expired`) só entra em build novo. SEM teste em aparelho.
S172-A IMPLEMENTADA em 04/09/2026 (lote S175/S172-A/S174, modo AUTOMATICO
+ GIT AUTOMATICO), auditoria APROVADA na 1ª rodada (9 cenários de rules
simulados). Bug: anúncio `expired` editado pelo dono voltava pra
`pending` com `expiresAt` vencido e, aprovado, expirava de novo na rodada
seguinte. Correção: `reviewListing` escreve `expiresAt = agora +
LISTING_TTL_MS` em TODA aprovação (recusa não toca), e o ramo ADMIN das
rules ganha `'expiresAt'` no `hasOnly` + cláusula `status == 'approved'
? (expiresAt no futuro e ≤ +31d) : !hasAny(['expiresAt'])`. Ramo do dono
e `expireListings` intocados. Ressalva pré-existente ampliada: o ramo
admin não checa o status de origem, então um admin poderia "aprovar" um
`approved`/`sold` e estender o prazo por via lateral — só a fila
`pending` chega à tela hoje; fica como risco anotado. EXIGE deploy de
`firestore.rules` (stamp S172-A). Lado client só em build novo. SEM
teste em aparelho.

Reverte a decisão "sem Cloud Function de expiração" da S168-A: scheduled
function `expireListings` (`functions/src/listings.ts`, `0 9 * * *`
America/Sao_Paulo, molde de `staleMatchReminder` + releitura em
`runTransaction` por doc como `expireMomentos`) faz `approved → expired`
(update, nunca delete) em anúncio com `expiresAt` vencido e manda 1 push
ao dono (tipo `listing_expired`, "Um anúncio seu expirou. Toque para
renovar.", sem título, abre `MyListingsScreen`). `ListingStatus` ganha
`'expired'`; `LISTING_TTL_MS` (30 dias) substitui o literal do create;
`renewListing` escreve só `{status:'approved', expiresAt: agora+30d}`.
Rules: ramo novo do dono `expired → approved` só com `status+expiresAt`,
`expiresAt` no futuro e ≤ +31d, sem limite de vezes; ramo `pending`
aceita origem `expired` (edição volta pra fila) e nega tocar `expiresAt`;
`get`/`list` seguem sem `request.time` e sem `'expired'` pra terceiros
(interessado vê o banner "Anúncio encerrado" via `getListing → null`). O
filtro client de `listApprovedListings` continua como cinto de segurança
entre rodadas. Fila do admin e telas de detalhe/chat intocadas (já cobrem
`status !== 'approved'`).

---

### S171 — Classificados abrem sem filtro de estado ("Todos os estados")
**Status:** IMPLEMENTADA em 04/09/2026 (lote S171/S168-B2/S172/S168-C, modo
AUTOMATICO + GIT AUTOMATICO), auditoria APROVADA na 1ª rodada (sem falhas;
2 ressalvas não bloqueantes: acoplamento com o ramo `sigla === 'all'` do
`UfPicker`, e o filtro volta a "Todos os estados" a cada abertura da tela —
comportamento pedido). Client puro, NÃO exige deploy. SEM teste em aparelho.

Só `src/screens/ListingsScreen.tsx`: o state `uf` nasce em `ALL_UF` ('all')
em vez de `profile?.uf`, e o chip binário "Todo o Brasil"/"Só {UF}" virou o
`UfPicker` com `includeAll` (placeholder "Todos os estados", molde do
`FilterModal` do Descobrir), dentro de `styles.filters` abaixo das
categorias. Escolha só em memória (useState), sem persistir. A recon
corrigiu a premissa do pedido: a query `listApprovedListings` NUNCA teve
`where('uf')` — o corte por UF sempre foi em memória (`filtered`), então o
índice `(status, createdAt)` já cobre e nada muda em rules/índices/service/
telas de admin/gate de verificado.

---

### S170 — Push pro admin quando um classificado entra na fila
**Status:** IMPLEMENTADA em 03/09/2026, auditoria APROVADA (1ª rodada, sem
falhas). EXIGE deploy de functions: `onListingSubmitted` (nova, domínio
novo `functions/src/listings.ts`) — `firebase deploy --only
functions:onListingSubmitted`, fica com o Raphael. Lado client (tipo
`listing_new` na union + roteamento pra aba Classificados) só entra em
build novo (Expo Go não entrega push no SDK 54). SEM teste em aparelho.

Function `onListingSubmitted`: `onDocumentWritten listings/{listingId}`,
molde exato de `onVerificationSubmitted` (S94). Dispara 1 push pro
`ADMIN_UID` quando o doc ENTRA em `pending` — create (`createListing`),
`approved→pending` e `rejected→pending` (`updateListingContent` faz
`updateDoc` no mesmo doc, por isso `onDocumentWritten` e não
`onDocumentCreated`). Guarda `before?.status === 'pending'` é a dedup:
edição de anúncio ainda na fila não repete push; aprovação/recusa/vendido/
removido não disparam. Texto sem o título do anúncio (privacidade na tela
de bloqueio, regra do comentário S58 em `admin.ts`): "Novo anúncio para
aprovar" / "<nickname> enviou um anúncio para revisão" ou "<nickname>
editou um anúncio, que voltou para a fila". `data: { type: 'listing_new',
listingId }`; toque leva a `Main > Classificados`. Nenhum push pro
anunciante. Rules intocadas (Admin SDK).

Decisões tomadas no automático: nome `onListingSubmitted` (não
`onListingCreated` — cobre create e update); trigger único
`onDocumentWritten`; destinatário só `ADMIN_UID` (uid[0]), como TODAS as
functions de admin hoje — dívida pré-existente: o 2º admin (S115) nunca
recebe push de admin, decidir se vira loop em `ADMIN_UIDS`; `data` leva
`listingId` pra deep-link futuro ao detalhe.

Dívida de documentação corrigida de passagem: `ARQUITETURA.md` dizia "31
functions" e a contagem real pelos exports de `index.ts` é 38; a tabela
ainda não lista 6 (5 de `momentos.ts` + `onGroupMessageCreated`).

---

### S169 — Classificados, lado admin (fila sem loading infinito + aba com badge)
**Status:** IMPLEMENTADA em 03/09/2026, auditoria APROVADA (1ª rodada, sem
falhas). Client puro: NÃO exige deploy de rules, functions nem indexes.
SEM teste em aparelho.

Parte A (bug): a fila "Classificados pendentes" ficava em loading infinito.
Causa em duas camadas: (1) `listPendingListings` pedia `where(status==pending)
+ orderBy(createdAt, asc)`, e a doc do Firestore exige um índice composto
POR DIREÇÃO — `firestore.indexes.json` só declara `(status ASC, createdAt
DESC)`, então a query devolvia `failed-precondition` (índice FALTANDO, não
"em construção"; o deploy de 03/09 não resolvia); (2) `AdminListingsScreen`
fazia `await` sem try/catch, e a rejeição deixava `loading` em `true` pra
sempre. Correção: a fila consulta `createdAt desc` (índice já declarado e
deployado, o mesmo de `listApprovedListings`) e inverte no cliente; a fila
e a lista pública ganham `try/catch/finally` + EmptyState com "Tentar de
novo" e a linha `erro: <code do Firestore>` (helper novo
`getFirestoreErrorCode` em `src/utils/firestoreError.ts`). Gate de
verificado da lista pública e ChatScreen intocados.

Parte B: fila vira 5ª aba inferior do admin, `Classificados` (ícone
`pricetags`), entre Denúncias e Perfil, com `tabBarBadge` numérico de
`pending` ao vivo (`pendingListings` em `AdminAlertContext`, molde S94-B
com callback de erro). Precedente S95: saiu o `Stack.Screen AdminListings`,
a rota do `RootStackParamList` e o botão "Classificados pendentes" da
ProfileScreen. Decisões tomadas no automático: aba (não dot no Perfil),
badge só de `pending`, correção da query por `desc`+`reverse` em vez de
3º índice.

Débito anotado (fora do escopo): `listenReports`/`AdminReportsScreen` têm
o mesmo padrão de listener sem callback de erro.

---

### S168 — Classificados no Explorar (sub-sprints A a C)
**Status:** S168-A IMPLEMENTADA em 03/09/2026, auditoria APROVADA (2ª
rodada — 1ª bloqueou por guarda de `rejectionReason` nas rules e
header/FAB fora do gate de verificado, corrigidos). Localização do
anúncio: só UF (perfil não tem cidade — decisão do Raphael em 03/09).
S168-B IMPLEMENTADA em 04/09/2026 (modo AUTOMATICO + GIT AUTOMATICO),
auditoria APROVADA na 1ª rodada (2 ajustes pós-auditoria: `chatId?` no
tipo de push e `hasAny` no lugar de `in` na rule de `lastReadAt`). Chat
1:1 SEM match em collection nova `listingChats/{listingId}_{uidInteressado}`
(+ `messages`), doc criado na 1ª mensagem; botão "Tenho interesse" no
detalhe (só verificado, nunca no próprio anúncio, só anúncio approved e
não expirado); "N conversas" em Meus anúncios; card "Classificados" na
aba Conversas (só verificado) com dot de não-lida; banner "Anúncio
encerrado" no chat (sold/removed/expirado/inacessível) sem bloquear
envio; paridade mínima do chat de grupo (texto, foto, responder, copiar,
ler mais, apagar pra todos — sem reações/edição/áudio/swipe). Push
`onListingChatMessageCreated` (mirror de `onMessageCreated`, sem escrever
`lastMessage` — o client escreve `lastMessage`/`lastMessageAt`). Badge da
TAB Conversas NÃO inclui esses chats (só o dot do card). EXIGE deploy de
`firestore.rules` + `storage.rules` (rules-stamp S168-B, que engloba o
S168-A ainda não confirmado) + `firestore.indexes.json` (1 índice novo
`listingChats`: participants CONTAINS + lastMessageAt DESC) +
`functions:onListingChatMessageCreated`. SEM teste em aparelho (A e B).
S168-B1 IMPLEMENTADA em 04/09/2026 (modo AUTOMATICO + GIT AUTOMATICO),
auditoria APROVADA na 1ª rodada (2 ressalvas, nenhuma bloqueante: a tela
passa `user.uid` como interessado, igual ao HEAD; e se o upload falhar
depois do `ensureListingChat` fica um chat com preview "📷 Foto" e zero
mensagens — residual aceito, sem crash). Fix client puro, NÃO exige
deploy: foto como 1ª mensagem falhava porque o upload em
`images/listingChats/{chatId}` vinha antes do doc pai e `storage.rules`
faz `firestore.get` de `listingChats/{chatId}`; agora a ordem é
`ensureListingChat` (setDoc extraído de `createListingChatWithFirstMessage`,
preview "📷 Foto", mesmo catch de corrida permission-denied → getDoc) →
upload → `sendListingChatMessage`, e `deleteListingChatImage` apaga o
órfão no Storage se a mensagem falhar depois do upload. Caminho de texto
(`handleSend`) intocado. SEM teste em aparelho.
S168-B2 IMPLEMENTADA em 04/09/2026 (lote, modo AUTOMATICO + GIT
AUTOMATICO), auditoria APROVADA na 2ª rodada (1ª bloqueou: o ramo de
denúncia de chat nas rules validava `listingOwnerId`/`listingInterestedId`
só contra o próprio payload — corrigido ancorando os dois num `get()` de
`listingChats/{chatId}`). A) Denúncia: botão `flag-outline` no header do
`ListingDetailScreen` (anúncio, só pra quem não é dono; motivos próprios
`ListingReportReason` — item proibido / golpe ou preço suspeito / anúncio
duplicado / conteúdo impróprio / outro) e do `ListingChatScreen` (a
pessoa, só participante com chat existente; motivos de pessoa). Reusa
`ReportModal` (agora genérico, prop `reasonLabels`) e a fila `reports`
com campos novos `listingId`/`listingTitle`/`listingChatId`/
`listingOwnerId`/`listingInterestedId`. Dedup NAS RULES por id
determinístico (`listing_{listingId}_{uid}` / `listingChat_{chatId}_{uid}`
via `setDoc`; doc existente vira update, que só admin pode →
`permission-denied` = "já denunciou"); ramo anúncio ancora `reportedId` no
`ownerId` real do anúncio; ramo chat ancora no doc real do chat. Denunciar
NÃO altera o anúncio. `AdminReportsScreen` mostra o tipo do alvo
(`REPORT_TARGET_LABELS`) e atalhos "Abrir anúncio ›"/"Abrir conversa ›";
`AdminReportDetailScreen` idem com botões. Admin passa a LER
`listingChats` (get/list/messages.read) e as fotos em
`images/listingChats` (storage) pra apurar; `ListingChatScreen` em modo
leitura pra não participante (sem composer, sem markRead, sem ações).
Bônus S169: `listenReports`/`listenMyReports` com `onError`,
`AdminReportsScreen` mostra `erro: <code>`, `AdminAlertContext` loga o
erro. B) Push pra TODOS os admins: `getAdminPushTokens()` em
`functions/src/shared` itera `ADMIN_UIDS` (mesma lista de `isAdminUid`;
client/rules/storage já tinham os 2 uids) e substitui
`getPushToken(ADMIN_UID)` em `onVerificationSubmitted`,
`onSupportMessageCreated` (ramo usuário) e `onListingSubmitted` — 1 push
por admin por evento. NÃO existe (nem foi criada) function de push pra
denúncia nova — fica como pergunta de produto. EXIGE deploy de
`firestore.rules` (stamp S168-B2) + `storage.rules` (stamp S168-B2) +
`functions:onVerificationSubmitted,onSupportMessageCreated,onListingSubmitted`.
SEM teste em aparelho.
S168-C IMPLEMENTADA em 04/09/2026 (lote, modo AUTOMATICO + GIT
AUTOMATICO), auditoria APROVADA na 2ª rodada (1ª bloqueou por duas
promessas absolutas que o código não sustenta — "nunca com o seu nome",
já que `getDisplayName` cai pro nome em conta legada sem apelido, e "só
acessa quando há denúncia", já que a rule deixa o admin ler qualquer
`listingChats`; redação corrigida pra "nome de exibição, o mesmo do seu
perfil" e "pode acessar essa conversa para apurar uma denúncia").
`site/privacidade.html` (o Hosting serve `site/`, não `public/`): data
04/09/2026; 2 linhas novas na tabela de dados (anúncios; chat de
anúncio); linhas de denúncias e token de push ampliadas; item novo em
"Como usamos"; frase de visibilidade só pra verificados em "Com quem
compartilhamos"; seção de retenção passa a listar momentos, grupos/
eventos criados e anúncios com fotos e conversas na exclusão (S173) e
ganha parágrafo sobre expiração/vendido/excluído. Seções 1, 6-10
intocadas. `docs/loja/data-safety-classificados.md` produzido (checklist
Play Data Safety + Apple App Privacy: nada muda se "Fotos", "Outras
mensagens no app"/"Emails or Text Messages" e "Outro conteúdo gerado
pelo usuário"/"Other User Content" já estiverem marcados com finalidade
de funcionalidade do app; sem localização, pagamento ou rastreamento
novos) — NÃO versionado: `.gitignore` ignora `docs/*` salvo
`docs/sprints/ESTADO.md`, decisão deliberada mantida; versionar é
escolha do Raphael (`!docs/loja/`). `site/excluir-conta.html` também
lista o que é apagado e NÃO foi tocado (fora do escopo pedido) — segue
sem grupos/eventos/momentos/classificados. EXIGE deploy de Hosting
(`firebase deploy --only hosting`). SEM teste.

Ideia "Classificados / OLX de funcionários" (ver "Ideias sem número",
levantada em 17/08) virou sprint numerada. A = anúncio básico (modelo
`listings/{listingId}`, feed/detalhe/criação/edição/"meus anúncios",
moderação por aprovação prévia mirror da fila de verificações, card
"Classificados" na aba Explorar — exclusivo pra membro verificado). B =
contato/chat entre interessado e anunciante (decisão do Raphael em
03/09/2026: collection própria `listingChats`, NUNCA em `matches/`; molde
do chat de grupo; conversa segue aberta com banner quando o anúncio
encerra; sem denúncia/bloqueio/contador público nesta sprint — denúncia
fica pra S168-B2). C = privacidade.html + docs/loja/data-safety-classificados.md
(escopo fechado em 04/09/2026, no lote).

---

### S149 — Grupo: paridade do chat (sub-sprints A a F)
**Status:** FECHADA · S149-A a S149-F todas FECHADAS (ver "Fechadas
recentemente") · paridade do chat de grupo com o 1:1 completa.

Chat de grupo ganhou todas as funcionalidades do chat 1:1: opção "sem
prazo" na criação (S149-A), reações e sheet de toque longo (S149-B),
responder/replyTo (S149-C), editar (S149-D), apagar pra todos (S149-E),
"ler mais" e copiar mensagem (S149-F). Nada pendente nesta frente.

---

## Fechadas recentemente

| Sprint | O que era |
|---|---|
| S167 | Toque longo na bolha do chat 1:1 não abria mais o sheet de ações (reagir/responder/copiar/editar/apagar/denunciar) — build 20 e Expo Go no HEAD `ff958ac`; funcionava no build 17 (`e5e3e73`). Diagnóstico por leitura do histórico: o ÚNICO commit entre `e5e3e73` e HEAD que tocou a árvore JSX do caminho de toque em `ChatScreen.tsx` é o `69396e9` (S158) — o `Text` espelho invisível do "ler mais" (absoluto, por cima do texto visível) tinha `pointerEvents="none"`, mas essa prop é NO-OP em `Text` no Android (RN 0.81: `ReactTextView` não implementa `ReactPointerEventsView`; o único handler de `POINTER_EVENTS` é o `ReactViewManager`, ou seja, só `View`): o espelho capturava o toque, e o `Text` visível com `onLongPress` é IRMÃO dele, não ancestral — o bubbling nunca chegava lá, "nada acontece". H2 (comparador `messageBubblePropsEqual` da S161) inocentada: `onLongPressReply` é comparado por referência e o handler é `setReplyOptionsTarget` (setter estável de `useState`). H4 (Gesture.Pan do arrastar-pra-responder, S79-E2) inocentada como causa da regressão: config e escopo idênticos entre `e5e3e73` e HEAD; nenhuma mudança de versão de gesture-handler/reanimated no intervalo. Correção mínima: espelho envolvido num `View` novo (`bubbleTextMirrorWrap`: `position:'absolute'`, top/left/right 0) com `pointerEvents="none"` — em `View` a prop funciona e bloqueia a subárvore inteira — e `bubbleTextMirror` reduzido a `{ opacity: 0 }`; mesma mudança em `GroupChatScreen.tsx`, que ganhou o espelho idêntico na S158 (mesmo defeito latente). Medição do "ler mais" preservada: `onTextLayout` é evento de layout, não de toque, e a largura do espelho continua pinada pelo wrapper dentro do `bubbleTextWrap`. Auditoria APROVADA sem falhas; ressalvas não bloqueantes: dimensionamento do wrapper absoluto pede confirmação visual em aparelho, e o espelho segue exposto a leitores de tela (pré-existente desde a S158, fora de escopo). Guardas respeitadas: Gesture.Pan/GestureDetector, `messageBubblePropsEqual`, sheet/Modal, ticker de presença, `TYPING_STALE_MS`, `behavior` do teclado e memoização da S161 intocados. Arquivos: `src/screens/ChatScreen.tsx`, `src/screens/GroupChatScreen.tsx`. Client puro, sem `firestore.rules`/Cloud Function — nenhum deploy; sem bump de versão. **Fechada em código em 02/09/2026, SEM teste em aparelho — validar no device: toque longo abre o sheet (texto/imagem/localização) e reagir/responder/copiar/editar/apagar/denunciar funcionam; "ler mais" e arrastar-pra-responder seguem ok, no 1:1 e no grupo.** |
| S166-A | Kill switch (gate admin) pros status em tempo real de online/digitando no chat 1:1. **Descartada em 02/set** — motivo: a S166-B (commit `724c2ec`, corte do loop de escrita `useUnreadCount` → `markMatchDelivered`) resolveu o travamento do chat com o outro lado online; os status em tempo real ficam como estão. |
| S166-C | Custo de render por bolha no chat 1:1 no Android. **Descartada em 02/set** — motivo: a S166-B (commit `724c2ec`, corte do loop de escrita `useUnreadCount` → `markMatchDelivered`) resolveu o travamento do chat com o outro lado online. Observação preservada (hipótese registrada na abertura da frente, nunca investigada): custo por bolha vindo do `Text` espelho da S158 ("ler mais"), de `GestureDetector` por bolha e do re-layout causado pelo `behavior` `height` do teclado. |
| S166-B | Diagnóstico + correção da tempestade de snapshots no doc `matches/{matchId}` (medição S166-0: ~1640 snapshots em `listenTypingStatus` E em `listenMatchBlockStatus` pra ~30 escritas contadas, ~50/s, stalls 5→61, só durante troca ativa de mensagens). Recon descartou as três hipóteses do pedido — vazamento de assinatura no `ChatScreen` (cleanup correto, deps primitivas estáveis, assinante único por listener no repo), `includeMetadataChanges` (não usado em nenhum dos dois `onSnapshot`) e cascata de reassinatura — e PROVOU a causa FORA da tela: loop de escrita `useUnreadCount` → `markMatchDelivered`. O hook (montado em `MainTabs`, que fica sob o `ChatScreen`) reage a cada snapshot da query global de matches; `markMatchDelivered` grava `deliveredAt.{uid}: serverTimestamp()`, o snapshot otimista LOCAL devolve o campo pendente como `null` (default `serverTimestamps:'none'` — mesmo hazard já documentado em `firestoreService.ts`/`utils/matches.ts`), `shouldMarkDelivered` (`!deliveredAt → true`) redispara a escrita, em loop local sem round-trip (~50/s) até o ack do servidor — e cada iteração acorda os DOIS listeners do mesmo doc, o que explica os dois contadores subirem juntos; `markMatchDelivered` era invisível na medição S166-0 (`useUnreadCount` não instrumentado). Correção mínima: early return `if (d.metadata.hasPendingWrites) return;` no início do `forEach` de delivered em `useUnreadCount.ts` (cálculo do badge de não lidas intocado). Instrumentação nova pra re-medição: `bump('markMatchDelivered')` gateado por `CHAT_DEBUG_OVERLAY` antes da escrita, e contadores `typing:sub`/`typing:unsub` (`useTypingIndicator.ts`) e `block:sub`/`block:unsub` (`ChatScreen.tsx`) nos efeitos que assinam — assinaturas ativas = `sub.total − unsub.total`; entram juntos os ajustes de visibilidade do overlay da sessão de medição (top 64 + `elevation`, overlay movido pra último filho do `SafeAreaView` — no Android o irmão posterior pinta por cima); `CHAT_DEBUG_OVERLAY` volta a `false`. Ressalva da auditoria (hipótese, não bloqueante): se o único write pendente no doc for o `deleteField()` de `setTypingStatus`, o ack pode ser metadata-only e não reemitir snapshot, atrasando a marcação de `deliveredAt` até a próxima mudança real de conteúdo — muito mais benigno que o loop, conferir na re-medição. Guardas respeitadas: ticker de presença, `TYPING_STALE_MS`, `behavior` do teclado, listeners do `firestoreService`, `shouldMarkDelivered`/`isMatchUnread` e dedup da S165 intocados. Arquivos: `src/hooks/useUnreadCount.ts`, `src/hooks/useTypingIndicator.ts`, `src/screens/ChatScreen.tsx`, `src/components/ChatDebugOverlay.tsx`, `src/config/flags.ts`. Client puro, sem `firestore.rules`/Cloud Function — nenhum deploy; sem bump de versão. **Fechada em código em 02/09/2026 e CONFIRMADA em aparelho no mesmo dia (Expo Go Android, --no-dev --minify): ~1,5 snapshot por escrita, 1 assinatura ativa por listener, stalls ≤315 ms com o outro online; vai no build 21.** |
| S166-0 | Instrumentação de diagnóstico do chat 1:1 (build 20, S164+S165, ainda trava com o outro lado online — sozinho funciona), sem correção nenhuma, client puro. Flag nova `CHAT_DEBUG_OVERLAY` (`src/config/flags.ts`, default `false`) gateia tudo — overlay só aparece com a flag `true` E `isAdminUid(user?.uid)` (`src/config/admin.ts`, já existente). Módulo novo `src/utils/chatDebug.ts`: contadores em memória por nome (`bump`), agregados por segundo + total desde reset, sem `setState`/Firestore; detector de stall da thread JS via `setTimeout` RECURSIVO de 100ms (nunca `setInterval` — quebra o eslint do projeto, que não declara esse global), atraso > 200ms conta stall e guarda o maior ms; `reset()`. Componente novo `src/components/ChatDebugOverlay.tsx`, montado só quando `debugEnabled`, com tick próprio de 1s (idem, `setTimeout` recursivo) isolado nele mesmo (não re-renderiza o `ChatScreen`), mostra snapshots/s por listener, renders/s de `ChatScreen`/`MessageBubble`, stalls e totais; toque = reset. Pontos instrumentados em `ChatScreen.tsx`: `listenMessages` (entrada do callback + `setMessages` separado), `listenMatchBlockStatus` (é UM único listener que entrega `blocked`/`lastReadAt`/`deliveredAt`, não três — corrige premissa do pedido original), `listenReactions` (snapshot e resubscrição contados à parte), 4 pontos de `markMatchRead`, render do `ChatScreen` e de `MessageBubble` (via bump direto no corpo, sem ref/setState). `useOtherPresence.ts` e `useTypingIndicator.ts` ganharam parâmetro opcional `debugEnabled?: boolean` (100% compatível com quem já chama sem ele) pra expor bump de `listenPresence`/`listenTypingStatus`/`setTypingStatus` de dentro dos próprios hooks, já que nenhum desses listeners chega no `ChatScreen` com acesso direto ao snapshot. Limitações registradas (não implementadas, por decisão desta sprint): `hasPendingWrites` do snapshot do Firestore não é medido — nenhum dos 5 listeners expõe `metadata` ao callback que chega no `ChatScreen`/hooks sem mudar a assinatura pública de `firestoreService.ts`, o que a sprint proibiu; `deliveredAt` não é escrito pelo `ChatScreen` (é `useUnreadCount.ts`, fora do ciclo de vida da tela), fora de escopo. Auditoria aprovada sem bloqueios (achados só cosméticos, sem efeito com a flag em `false`: `stopStallDetector` é singleton sem contagem de referência entre overlays simultâneos; `getSnapshot` pode mostrar "por segundo" defasado após um hiato sem bumps). Ticker de presença, `TYPING_STALE_MS`, throttle de `typing` e `behavior` do teclado não tocados. Único arquivos tocados: `src/config/flags.ts` (novo), `src/utils/chatDebug.ts` (novo), `src/components/ChatDebugOverlay.tsx` (novo), `src/hooks/useOtherPresence.ts`, `src/hooks/useTypingIndicator.ts`, `src/screens/ChatScreen.tsx`. Client puro, sem `firestore.rules`/Cloud Function — nenhum deploy necessário. **Fechada em código em 01/09/2026, medição feita em aparelho em 02/09/2026 (4 prints, apontou o loop da S166-B).** |
| S165 | Travamento do chat 1:1 quando o outro participante do match está ONLINE e ativo (digitando/lendo), build 18/19 Android — sozinho na conversa o chat era perfeito, o gargalo estava no caminho de atualizações em tempo real vindas do outro lado. Sprint de diagnóstico com correção dirigida (medição por leitura de código, sem profiling em aparelho). Causa principal: `listenMatchBlockStatus` (`firestoreService.ts`) reagia a QUALQUER escrita no doc `matches/{matchId}` — inclusive a escrita de `typing` do outro lado, a cada ~2s (já com throttle, não mexido) — recriando `lastReadAt`/`deliveredAt`/`blockedBy` por referência mesmo quando o conteúdo lógico era idêntico ao snapshot anterior; essas referências novas propagavam via `setOtherLastReadAt`/`setOtherDeliveredAt` até o `useMemo` de `messageListExtraData` (`ChatScreen.tsx`), forçando a FlatList a reprocessar todas as linhas visíveis a cada ciclo de digitação do outro lado. Corrigido com comparação por conteúdo dentro do próprio `listenMatchBlockStatus` (`sameStringArray`/`sameTimestampRecord` novos, comparando `blockedBy` por conteúdo e `lastReadAt`/`deliveredAt` por `.toMillis()` chave a chave), reusando a referência anterior quando nada mudou — o comparador do `React.memo` de `MessageBubble` (S161) já estava correto, o problema era o ciclo inteiro da FlatList rodar antes dele entrar em ação. Causa agravante: `lastMessageIds` (usado para resubscrever `listenReactions`, S164) trocava de referência a cada snapshot de `messages`, mesmo quando o CONTEÚDO da janela das últimas `MESSAGE_PAGE_SIZE` mensagens não mudava (ex.: edição/tombstone) — corrigido com um `useRef` que só atualiza a referência quando os ids realmente mudam. Auditoria bloqueou a 1ª rodada: `sameTimestampRecord` chamava `.toMillis()` sem checar null no lado do valor JÁ ARMAZENADO da comparação anterior — `lastReadAt`/`deliveredAt` podem chegar como `null` no snapshot local otimista de `serverTimestamp()` antes da confirmação do servidor (mesmo hazard já documentado em `src/utils/matches.ts`), o que crasharia com `TypeError` toda vez que uma leitura/entrega fosse confirmada logo depois de um ciclo de `typing`; corrigido com guard `a[key] && b[key] && ...`, reauditado e verificado pelo orquestrador contra o código real. Guardas respeitadas: ticker de presença, `TYPING_STALE_MS`, throttle de escrita de `typing` e `behavior` do teclado não tocados (recon não os condenou). Único arquivos tocados: `src/services/firestoreService.ts`, `src/screens/ChatScreen.tsx`. Client puro, sem `firestore.rules`/Cloud Function. Contexto de build: entra junto com a S164 no build 20 (ainda não gerado). **Fechada em código em 31/08/2026, SEM teste em aparelho** — validação real depende de reproduzir o travamento com o outro lado ativo (digitando/lendo/enviando em rajada) no build 20 e confirmar que deixa de travar. |
| S164 | Causa raiz da falha dos listeners do chat 1:1 em build de produção Android (v1.0.8+), sem diagnóstico via cabo/adb (restrição permanente do projeto). Parte A: o banner de retry da S163 (`ChatScreen.tsx`) passa a exibir também o `.code` do erro do Firestore (ex.: "erro: permission-denied"), discreto, abaixo do texto de retry — novo estado `messagesErrorCode`, extraído do erro do `onSnapshot` de `listenMessages` via type guard local (a assinatura de `listenMessages`, `onError?: (error: unknown) => void`, não mudou; o guard fica no `ChatScreen`), resetado junto com `messagesError`; escopo deliberadamente restrito a `listenMessages` — `listenTypingStatus`/`listenMatchBlockStatus`/`listenReactions`/`listenHiddenMessages` continuam engolindo erro internamente, sem propagar pro banner (não fazia parte do pedido). Parte B: quita a pendência adiada da S161 Parte B — `listenReactions` (`firestoreService.ts`) deixa de assinar a coleção `matches/{matchId}/reactions` inteira e passa a usar `where(documentId(), 'in', messageIds)`, com `messageIds` derivado em `ChatScreen.tsx` das últimas `MESSAGE_PAGE_SIZE` (30) mensagens já carregadas (`orderedMessages.slice(-30)`, corte por CURSOR de mensagens, nunca Timestamp — mesma armadilha de sempre); mesmo trade-off de UX já aceito no ESTADO.md: reações de mensagens que saem da janela das últimas 30 param de atualizar em tempo real. Parte C: revisão das rules das queries do chat 1:1 procurando leitura que passe no Expo Go e negue em build de produção — nenhuma edição de `firestore.rules` feita; candidatos levantados pela recon (match apagado → `permission-denied`, já documentado como armadilha abaixo; possível expiração/atraso de token de auth em background só em build assinado) não são confirmáveis só por leitura de código — a confirmação real depende do `.code` que a Parte A agora expõe em aparelho. Auditoria bloqueou uma vez (estilo novo `blockedBannerCode` com `marginTop: 2` hardcoded em vez de token de `theme.ts`) — corrigido pra `theme.spacing.xs`, reauditado e aprovado. Único arquivos tocados: `src/screens/ChatScreen.tsx`, `src/services/firestoreService.ts`. Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código em 31/08/2026, SEM teste em aparelho** — validação real depende de reproduzir os sintomas do build 18 em produção, ler o `.code` que aparece no banner (`permission-denied` favorece a hipótese de match apagado; `unauthenticated`/`unavailable` favorece a hipótese de token/rede em background) e confirmar que as reações continuam funcionando nas últimas 30 mensagens visíveis. |
| S163 | Correção da causa achada pela S162 no chat 1:1 (build 18): três listeners que assinam `matches/{matchId}` em `firestoreService.ts` não tinham callback de erro no `onSnapshot` — `listenMessages`, `listenTypingStatus` e `listenMatchBlockStatus`, ao contrário de `listenReactions`/`listenHiddenMessages`/`listenPresence`, que já seguiam esse padrão. `listenMessages` ganhou 4º parâmetro opcional `onError?: (error: unknown) => void`, repassado como callback de erro do `onSnapshot` (loga e delega ao chamador, sem disfarçar erro de sucesso com `callback([])`); `listenTypingStatus` e `listenMatchBlockStatus` ganharam callback de erro com fallback seguro mirror do padrão já usado por `listenPresence`/ramo "chave ausente" já existente. Em `ChatScreen.tsx`: novo estado `messagesError` resetado a cada abertura da conversa; `retryTick` nas deps do efeito de `listenMessages` faz um retry reexecutar o efeito inteiro (mesma "nova geração" já usada ao reabrir o chat); novo `handleRetryMessages`; novo ramo de renderização, com prioridade sobre `isBlocked`/`isUnverified`, que substitui o composer por um banner tocável ("toque para tentar novamente") reaproveitando os estilos já existentes (`blockedBanner`/`blockedBannerText`). Auditoria aprovada sem bloqueios; ressalva não bloqueante: retry manual sem debounce (toques repetidos remontam o efeito várias vezes em sequência — risco baixo, cleanup por geração já cobre). Único chamador externo dos três listeners (`useTypingIndicator.ts`) confirmado compatível (parâmetro novo é opcional). Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código em 31/08/2026, SEM teste em aparelho** — validação real depende de reproduzir os 3 sintomas do build 18 de novo (ou provocar `permission-denied` no listener) e confirmar que o skeleton nunca mais trava e que o banner de retry aparece/funciona. |
| S162 | Diagnóstico (sem correção) do chat 1:1 quebrado no build 18 (v1.0.8, relatado 31/08/2026): (1) tela presa no esqueleto de carregamento; (2) mensagem enviada não aparecia, usuário reenviava e todas as tentativas gravavam (5 duplicatas); (3) "digitando..." preso no cabeçalho. Recon (`jv-recon`) achou a causa provável dos sintomas 1 e 2: `listenMessages` (`firestoreService.ts`) é o único listener do chat que assina `matches/{matchId}/messages` sem callback de erro no `onSnapshot` — ao contrário de `listenReactions`/`listenHiddenMessages`/`listenPresence`, que já seguem a armadilha documentada abaixo ("Apagar `matches/{matchId}` devolve `permission-denied`...") com um fallback seguro. Sem esse callback, um erro (ex.: `permission-denied` por match desfeito) mata o listener em silêncio: `loading` nunca desliga (só é setado `false` dentro do callback de sucesso) e, como o composer fica fora do bloco condicional do skeleton, o usuário consegue reenviar — cada tentativa grava um doc novo sem nunca aparecer na tela. Índices do Firestore descartados como causa (queries são de campo único, sem necessidade de índice composto). Sintoma 3 (typing preso) tem a mesma lacuna de error callback em `listenTypingStatus`, mas sem mecanismo estático que prenda `isOtherTyping=true` pra sempre (o `setTimeout` de expiração é local e independe da saúde do listener) — causa raiz não confirmada só por leitura de código, precisaria de log de aparelho pra fechar. Guardas respeitadas: ticker de presença, `TYPING_STALE_MS` e `behavior:'height'` não apontados como causa sem prova direta. Nenhuma decisão de produto pendente. Raphael decidiu abrir a correção na sequência — ver S163. Sprint só de leitura, nenhum arquivo de código tocado. **Encerrada em código (diagnóstico), 31/08/2026.** |
| S161 | Performance do chat 1:1, Parte A da sprint (quitar a ressalva 1 da S157) — Parte B (limitar o listener de reações à janela de 30 mensagens) foi ADIADA pra sprint futura por decisão do Raphael (Portão 1): recon achou que os docs de `reactions` não têm nenhum campo de tempo (id do doc = messageId) e o listener em tempo real de `messages` (S101) cresce sem limite dentro da sessão (não é recortado em 30 depois do cursor inicial), então não existe cursor real pra aplicar em `reactions` como em `messages` — a única forma de reduzir leitura de fato seria `where(documentId(),'in',ids)` limitado a 30 ids, com trade-off real de UX (reações em mensagens antigas paginadas deixariam de aparecer) que precisa de mais desenho antes de implementar. Parte A: `renderMessage` (prop `renderItem` do FlatList) tinha `reactions`/`otherLastReadAt`/`otherDeliveredAt` (objetos agregados, recriados a cada snapshot mesmo quando só uma mensagem mudava) e `scrollToMessage` (muda a cada evento de mensagem em tempo real, não só paginação) nas deps do `useCallback` — corrigido com o padrão já estabelecido de "ref espelho" (mesmo molde de `visibleMessagesRef`): `reactionsRef`/`otherLastReadAtRef`/`otherDeliveredAtRef` (sincronizados por ATRIBUIÇÃO DIRETA no corpo do render, não `useEffect` — achado da 1ª rodada de auditoria: como `renderMessage` roda síncrono no mesmo commit do render de `ChatScreen`, um `useEffect` de sincronização só atualizaria o ref DEPOIS do commit, deixando reação/tique de leitura/entrega presos no valor antigo até um render não relacionado acontecer) e `scrollToMessageRef` (esse sim com `useEffect`, seguro porque só é lido dentro de `handleJumpToReply`, callback de evento sempre pós-commit). `renderMessage` ficou com deps mínimas (`user?.uid`, `otherName`, `otherPhoto`, `otherUid`, `handleOpenLocation`, `handleJumpToReply`). `MessageBubble` (`React.memo`, já aplicado na S157 mas sem efeito real) ganhou comparador customizado (`messageBubblePropsEqual`/`reactionsEqual`) que compara `otherReadAt`/`otherDeliveredAt` por `.toMillis()` e `reactions` por conteúdo, não por referência — sem isso o memo era sempre invalidado porque o SDK do Firestore recria os objetos/`Timestamp` a cada snapshot mesmo com o valor igual. FlatList ganhou `extraData` memoizado (`useMemo`, nunca array literal inline — evita reintroduzir o bug da S157 de invalidar tudo a cada tecla digitada) pra continuar sinalizando re-render dos itens visíveis já que `renderMessage` deixou de mudar de identidade. Único arquivo tocado: `src/screens/ChatScreen.tsx`. Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código, SEM teste em aparelho.** |
| S160 | Três sintomas de scroll/render no chat 1:1 (build 17): (1) conversa às vezes pulava pra mensagem citada sem toque; (2) última mensagem não aparecia ao abrir o chat; (3) mensagem anterior sumia da lista após enviar uma nova. Recon mapeou todos os setters de `pendingScrollTarget` — nenhum caminho dispara scroll sem toque real na citação — e achou duas causas concretas independentes dos sintomas 2 e 3, mais uma defensiva pro 1. Causa A (sintomas 2/3): dois mecanismos de `scrollToEnd` concorrentes e descoordenados — `setTimeout(100ms)` do S101 e `onContentSizeChange` do S154 (nunca testado em aparelho) — consolidados num só: `setTimeout` removido, `forceScrollToEndRef` sinaliza a intenção ("mensagem própria sempre desce"), e só `onContentSizeChange` chama `scrollToEnd` de fato, disparado pelo evento real de layout em vez de um tempo fixo. Causa B (sintoma 3, condicional a erro/offline na abertura): o ramo de fallback do listener (`limitToLast(30)` em `firestoreService.ts`, arquitetura do S101 mantida INTOCADA de propósito) é uma janela deslizante — mensagem sai do snapshot ao vivo sem nunca ter sido de fato apagada (deleção é tombstone via `deletedAt`, nunca `deleteDoc`); corrigido só no CONSUMO do callback em `ChatScreen.tsx` (`setMessages` vira merge funcional que prefixa mensagens sumidas do snapshot, preservando ordem cronológica), sem tocar a query do S101. Causa C (sintoma 1, defensiva): `onScrollToIndexFailed` reusava um índice capturado no momento da falha; passou a revalidar o índice pelo id da mensagem-alvo (`scrollTargetIdRef`/`visibleMessagesRef`) no momento do retry. Único arquivo tocado: `ChatScreen.tsx`; `firestoreService.ts`, `GroupChatScreen.tsx` e `MomentoRequestChatScreen.tsx` não foram tocados (bug relatado só no 1:1). Ressalvas da auditoria (não bloqueantes): `scrollTargetIdRef` não é limpo no caminho de sucesso direto do `pendingScrollTarget` (resíduo inofensivo, sempre reescrito antes do próximo uso); se uma mensagem própria chega enquanto o usuário está no meio de um salto pra citação (`pendingScrollTarget` setado), o `scrollToEnd` fica pendurado e pode puxar a tela de volta pro fim logo após o salto — consequência direta da condição `!pendingScrollTarget` já exigida pela spec, registrado como risco herdado, não desvio de implementação. Decisão tomada no Portão 1 (Raphael, MANUAL): corrigir as causas A e B nesta mesma sprint em vez de esperar o triage do Firestore/rede, já que a causa B é uma correção defensiva válida independente de ser ou não a causa exata do sintoma relatado. Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código, SEM teste em aparelho — validação depende de reproduzir os 3 sintomas de novo (e, se o sintoma 3 persistir, rodar o triage do Firestore pra confirmar se a mensagem existe no banco).** |
| S159 | Dois bugs de layout no rodapé do chat (build 17, Android, edge-to-edge do SDK 54): composer renderizava por baixo da barra de navegação do sistema, e texto multiline crescido ficava escondido atrás da própria faixa. Causa raiz: as 3 telas de chat (`ChatScreen.tsx`, `GroupChatScreen.tsx`, `MomentoRequestChatScreen.tsx`) usavam `SafeAreaView` sem prop `edges`, deixando o bottom inset implícito — que não é aplicado de forma confiável no Android sob edge-to-edge forçado, ao contrário das ~19 outras telas do app, que já usam `edges={['top']}`. Correção: as 3 telas passam a usar `SafeAreaView edges={['top']}` (unificando com o padrão do resto do app) e aplicam `insets.bottom` (via `useSafeAreaInsets`) explicitamente, somado ao padding original (nunca substituindo), no elemento que fica no rodapé fixo — `inputRow` nas 3 telas, e `blockedBanner` (2 usos condicionais em `ChatScreen.tsx`, 2 em `GroupChatScreen.tsx`; `MomentoRequestChatScreen.tsx` não tem banner alternativo). `KeyboardAvoidingView` (S157-B) e a lógica do `TextInput`/`maxHeight` não foram tocados — bug B tratado como consequência visual do bug A, sem mecanismo próprio identificado pela recon. `CLAUDE.md` § "Padrões estabelecidos" atualizado: a exceção antiga ("SafeAreaView SEM edges" pra tela com input fixo) foi removida — agora todas as telas usam `edges={['top']}`, e toda tela com elemento fixo no rodapé aplica `insets.bottom` manualmente. Ressalva da auditoria (não bloqueante): a técnica de somar `paddingBottom` por cima de um `padding` shorthand depende do Yoga resolver a aresta mais específica corretamente — comportamento documentado do RN, mas ainda assim precisa de confirmação visual em aparelho (composer acima da nav bar, texto multiline crescendo visível), já que a causa raiz em si (bottom inset implícito não confiável) não foi confirmável só por leitura de código. Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código, SEM teste em aparelho.** |
| S158 | Bug: mensagem longa no chat 1:1 (build 17, confirmado por print) aparecia cortada em ~6 linhas com reticências nativas do `numberOfLines`, sem o botão "ler mais" da S130 — `onTextLayout` estava aplicado no MESMO `Text` que já tinha `numberOfLines={6}`; no RN 0.81/Expo 54 (Fabric, ativo por padrão, sem override em `app.json`) isso faz o evento reportar as linhas já truncadas, então a contagem nunca passa de 6 e `isTextTruncated` nunca vira `true`. Correção: o `Text` visível mantém `numberOfLines`/`onLongPress`, mas perde o `onTextLayout`; um segundo `Text` "espelho" (mesmo texto, mesmo style base, sem `numberOfLines`, `position: 'absolute'`, `opacity: 0`, `pointerEvents: 'none'`, dentro de um `View` novo — `styles.bubbleTextWrap`/`bubbleTextMirror` — pra herdar a largura de wrap certa) mede o texto inteiro e dispara a mesma lógica de guarda de antes. Mirror exato em `GroupChatScreen.tsx` (mesmo mecanismo, sujeito ao mesmo bug). `MomentoRequestChatScreen.tsx` não tem esse recurso e não foi tocada — a premissa do pedido original sobre paridade S149 com essa tela estava incorreta (a paridade real de S149-F é com o chat de grupo, não com essa tela). Comentário desatualizado da S130 em `ChatScreen.tsx` corrigido pra não contradizer o código novo. Ressalva da auditoria (não bloqueante): a correção depende do Yoga/Fabric resolver corretamente a largura de um nó `position:absolute` dentro de um pai com stretch — mesma classe de suposição que causou o bug original; precisa de confirmação visual em aparelho (mensagem curta sem "ler mais", mensagem longa com "ler mais" funcionando). Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código, SEM teste em aparelho.** |
| S157-B | Regressão do S157: no Android o teclado passou a cobrir a barra de mensagem do `ChatScreen` — a S157 tinha trocado `behavior` do `KeyboardAvoidingView` de `'height'` para `undefined` no Android, apostando numa dupla compensação com `softwareKeyboardLayoutMode: "resize"` do `app.json`; documentação oficial do Expo confirma que a combinação correta pro edge-to-edge obrigatório do SDK 54 é `behavior: 'height'` JUNTO com `softwareKeyboardLayoutMode: "resize"` — não é redundância, é o padrão recomendado. `ChatScreen.tsx:1366` revertido pra `'height'`, voltando a ser espelho exato de `GroupChatScreen.tsx`/`MomentoRequestChatScreen.tsx` (essas duas nunca tiveram a regressão, por isso nunca perderam o `'height'`). Único arquivo tocado, `app.json` intocado, sem `firestore.rules`, sem Cloud Function, client puro. **Fechada em código, SEM teste em aparelho.** |
| S149-F | Chat de grupo ganha "ler mais" (mensagem longa colapsada) e "copiar mensagem", mirror exato do 1:1 (S130 e S142) — fecha a paridade do chat de grupo (S149-A a F, todas fechadas). Teto de 6 linhas (`numberOfLines`/`onTextLayout`) conferido literalmente contra `ChatScreen.tsx` antes de copiar (lição da S156); componente `GroupMessageBubble` extraído (mirror de `MessageBubble`) pra permitir `useState` local de expansão por bolha, já que o `renderItem` da FlatList do grupo era função pura sem hooks. Guard `canCopy` do copiar (`!deletedAt && !imageUrl && !!text`, via `expo-clipboard`) adaptado do 1:1 sem o campo `location` (`GroupMessage` não tem esse campo). Único arquivo tocado: `src/screens/GroupChatScreen.tsx`. Ressalva da auditoria (não bloqueante): `React.memo` do `GroupMessageBubble` não é totalmente efetivo — `renderMessage` não está em `useCallback` e `reactionEntries`/`getReplySenderLabel` mudam de identidade a cada render, então o memo não evita re-render de todas as bolhas a cada tecla digitada no composer; não é regressão (mesmo comportamento de antes da sprint), mas o comentário do código promete um ganho de performance que não existe de fato — vale revisitar numa sprint de performance do chat de grupo. Client puro, sem `firestore.rules`/Cloud Function. **Fechada em código, SEM teste em aparelho.** |
| S157 | Fluidez do chat 1:1 no Android, continuação da S142 — diagnóstico (jv-recon) confirmou 2 causas de código e descartou uma terceira. (1) `KeyboardAvoidingView` com `behavior='height'` no Android competindo com `softwareKeyboardLayoutMode: "resize"` do `app.json` (dupla compensação de teclado) — `behavior` passa a `undefined` no Android (só iOS mantém `'padding'`), `app.json` intocado. (2) `renderMessage` (prop `renderItem` da FlatList) era recriado a cada render de `ChatScreen` — envolto em `useCallback` com deps reais (confirmado que não usa `text`/`isOtherTyping`, então nenhum dos dois entra nas deps); `MessageBubble` ganhou `React.memo`, e `handleOpenLocation` (prop repassada a `MessageBubble`) precisou virar `useCallback([])` pra não invalidar o memo — sem essas duas, cada tecla digitada recalculava todas as bolhas visíveis. (3) Envio otimista: recon não achou bug, é o eco padrão do SDK do Firestore pelo mesmo listener, comportamento intencional já registrado na S142 — nenhuma mudança de código nesse eixo. Único arquivo tocado: `src/screens/ChatScreen.tsx`. Sem `firestore.rules`, sem Cloud Function, client puro. **Fechada em código, SEM teste em aparelho.** |
| S156 | Bug: teto de texto no ramo de EDITAR mensagem ficava abaixo do teto de CRIAR, nos dois chats — `firestore.rules`, `matches/{matchId}/messages` (S92) e `groups/{groupId}/messages` (S149-D, mirror exato do 1:1, herdou o mesmo erro): `allow update` tinha `text.size() <= 500`, teto de editar sobe pra 2000, igualando ao `allow create` (2000, desde S77) e ao `MAX_MESSAGE_LENGTH`/`maxLength` do client; bug de origem: mensagem de 501 a 2000 caracteres era criada mas não podia ser editada, permission-denied silencioso — o defeito no 1:1 existia desde a S92, achado de caminho ao corrigir o mirror do grupo. De caminho: carimbo do topo do `firestore.rules` ganhou entrada nova (S156) e a data final da "linha histórica" do mesmo carimbo, presa em 2026-08-03 mesmo com S149-B/S149-C já anexadas depois, foi corrigida pra 2026-08-26. Commit `c813cbd`. `firestore.rules` **deployadas em 27/08/2026**. **Fechada em código, TESTADA em aparelho e aprovada em 27/08/2026.** |
| S155 | Pipeline: `/sprint` ganha um segundo eixo de pergunta na Fase 0 — modo de git (GIT MANUAL x GIT AUTOMATICO), independente do eixo de decisão (AUTOMATICO/MANUAL) já existente. GIT AUTOMATICO estende pra sprint AVULSA a mesma exceção de commit/push que antes só existia via `lote --commit` — orquestrador roda `git add <caminhos exatos>`/`commit`/`push`, só depois de auditoria aprovada daquela sprint; guardas inalteradas: subagentes (`jv-recon`/`jv-implementa`/`jv-audita`) seguem sempre proibidos de git de escrita em qualquer modo, deploy proibido sempre, `reset`/`checkout`/`restore`/`revert`/`stash` fora da exceção sempre, nunca `git add .`. A flag `lote --commit` virou o atalho que fixa os dois eixos de uma vez (equivale a decisão=AUTOMATICO + git=GIT AUTOMATICO). Editados `.claude/commands/sprint.md` (Fase 0, Modo LOTE, Fase 6), `.claude/skills/juntavale-sprint/SKILL.md` e `CLAUDE.md` (item 2 das Regras invariantes) — commit desta própria sprint rodado via `lote --commit S155` (pedido explícito do Raphael), estreando o próprio mecanismo. Sem `firestore.rules`, sem Cloud Function — mudança de processo/documentação, não de app. **Fechada em código, SEM "teste em aparelho" aplicável (não é feature de app).** |
| S149-E | Chat de grupo ganha apagar mensagem PRA TODOS (lápide + limpeza da foto no Storage), mirror do molde do 1:1 (S85-B; "apagar só pra mim"/S85-A ficou fora do escopo) — `deleteGroupMessageForEveryone` em `groupService.ts` (update da lápide primeiro, `deleteObject` do Storage só depois de confirmado); `GROUP_DELETE_FOR_EVERYONE_WINDOW_MS` = 1h, mesmo valor de `ChatScreen.tsx:107` (decisão do Raphael); só o AUTOR apaga (decisão do Raphael: criador/dono do grupo SEM poder de moderação sobre mensagem alheia — regra nova sem nenhuma referência a `creatorId`); placeholder "Esta mensagem foi apagada" sem reações/ações; `canEdit` (S149-D) ganhou `!deletedAt`. `firestore.rules` bloco `groups/{groupId}/messages` ganhou terceiro ramo no `allow update` (mirror do bloco 1:1: autor, dentro de 1h, via única, `hasOnly(['senderId','createdAt','deletedAt'])`, `deletedAt == request.time`). **`firestore.rules` deployadas em 27/08/2026.** **Fechada em código, TESTADA em aparelho e aprovada em 27/08/2026.** |
| S149-D | Chat de grupo ganha editar mensagem, mirror do molde do 1:1 (S92) — `GroupMessage.editedAt`/`editGroupMessage` em `groupService.ts`; `GROUP_EDIT_WINDOW_MS` = 1h, mesmo valor de `ChatScreen.tsx:111` (decisão do Raphael de manter a mesma janela); opção "Editar" no sheet de toque longo (só autor, só mensagem de texto, dentro da janela); barra de composição reusada em modo de edição; indicador "(editada)" na bolha. `firestore.rules` bloco `groups/{groupId}/messages` ganhou ramo novo no `allow update` (mirror do bloco 1:1: autor, sem imageUrl, dentro de 1h, `hasOnly(['text','editedAt'])`, `text is string`, `text.size() > 0 && <= 500`, `editedAt == request.time`) — achado em auditoria e corrigido: faltavam `text is string`/`text.size() > 0` na primeira versão. **`firestore.rules` deployadas em 27/08/2026.** **Fechada em código, TESTADA em aparelho e aprovada em 27/08/2026.** |
| S149-C | Chat de grupo ganha responder/replyTo, mirror byte a byte do molde do 1:1 (S79-C/S79-B) — `GroupMessage.replyTo`/`sendGroupMessage` em `groupService.ts`, opção "Responder" no sheet de toque longo já existente (S149-B, sem Modal paralelo), barra de citação no composer e preview na bolha em `GroupChatScreen.tsx`; `buildGroupReplyQuote` cobre o caso de responder mensagem só-com-foto (rótulo `'📷 Foto'`, mesmo valor do 1:1) — achado e corrigido em auditoria. `firestore.rules` bloco `groups/{groupId}/messages` ganhou validação do campo `replyTo` no `allow create` (mirror do bloco 1:1) — **rules deployadas em 27/08/2026**. Sem scroll-to-original-message e sem swipe-to-reply (fora do escopo desta sub-sprint). **Fechada em código, TESTADA em aparelho e aprovada em 27/08/2026.** |
| S154 | Bug: ao abrir `ChatScreen` (chat 1:1) com muitas mensagens, a rolagem inicial podia parar num ponto intermediário (`setTimeout` único do S101 podia acertar um `contentSize` ainda não estabilizado) em vez de ir até o fim real. Corrigido com `onContentSizeChange` na FlatList principal, gateado por `isNearBottomRef.current && !pendingScrollTarget` (reusa estado 100% já existente do S142/S129-A, nada novo declarado) — `setTimeout` original preservado, os dois mecanismos convivem, mesmo padrão de reforço já usado em `GroupChatScreen`/`MomentoRequestChatScreen` (S149-B). Client puro, sem rules/functions. **Fechada em código, commit `d61a201`, SEM teste em aparelho.** |
| S149-B | Chat de grupo ganha reações e sheet de toque longo, mirror do chat 1:1 (S80) — `groups/{groupId}/reactions/{messageId}` novo em `firestore.rules` (membership via `groupAllowsPost`), `setGroupMessageReaction`/`listenGroupReactions` em `groupService.ts`. De caminho (itens novos pedidos pelo Raphael em 26/08/2026, mesma área): rolagem inicial corrigida em `MomentoRequestChatScreen` (corrida entre `listenMomentoRequestById`/`listenMomentoRequestMessages`, `onContentSizeChange` de reforço — `GroupChatScreen` já funcionava, não foi tocado nesse mecanismo); prévia da última mensagem em `GroupsScreen` ("Meus grupos"/"Descobrir", via `hasValidLastMessage`) e em `MomentoRequestsScreen` (card "Momentos", `rowSubtitle` mostra `lastMessage` real quando `status==='answered'`, mantém fallback genérico sem `lastMessage`) — commit `c80de63`. `firestore.rules` **deployadas em 27/08/2026** (bloco novo de reações; nenhuma Cloud Function nova). **Fechada em código, TESTADA em aparelho e aprovada em 27/08/2026.** Ressalva da auditoria (não bloqueante): a prévia em `GroupsScreen` aparece também na seção "Descobrir" (grupos que o usuário ainda não integra) — sem vazamento de permissão (rules já liberam leitura ampla de `groups/{groupId}`), mas vale confirmar com o Raphael se é o comportamento desejado. |
| S153 | Card do momento PRÓPRIO ficava pendurado depois de expirar — `myMomento` passa a vir de um listener (`onSnapshot`, `listenMyMomento`) em vez de um `getDoc` único; corrigido também o listener morrendo permanentemente após o 1º `permission-denied` (guard `listenGeneration`, revive a cada publish) — commit `d384f65`. Client puro, sem deploy necessário. **Fechada em código, SEM teste em aparelho.** |
| S152 | Card do momento próprio no Explorar sem moldura azul (render idêntico aos demais); feed e card próprio param de mostrar momento com `expiresAt` vencido (tick de 60s no client — `expireMomentos` confirmada sem bug via logs reais do Firebase); dot vermelho por conversa na lista do card Momentos, nos dois sentidos. Corrigido write-storm em `seenAt`/`authorSeenAt` (guard por `useRef`) — commits `15bd288`/`b68a6b1`. Client puro, sem deploy necessário. **Fechada em código, SEM teste em aparelho.** |
| S149-A | Criação de grupo ganha opção "sem prazo" — revoga o teto de 1 mês como via única — commit `16a1cf5`. `firestore.rules` **deployadas em 26/08/2026**. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S150 | Badge dot do Explorar acende também por mensagem nova em grupo (card Grupos) e em conversa de Momento do autor (card Momentos); 2 Cloud Functions novas (`onGroupMessageCreated`, `onMomentoRequestMessageCreated`) — commit `d2e3d5a`. `firestore.rules` e as 2 Cloud Functions **deployadas em 26/08/2026** (`firebase deploy --only firestore:rules,functions:onGroupMessageCreated,functions:onMomentoRequestMessageCreated` — "Successful create operation" nas duas). **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S148 | `expireMomentos` passa a apagar também os `momentoRequests` do autor do momento expirado; mesclagem "via Momento" da S143-C revogada na aba Conversas; card do Explorar renomeado de "Pedidos" pra "Momentos" — commit `dab9ab6`. Cloud Function `expireMomentos` **deployada em 26/08/2026** (`firebase deploy --only functions:expireMomentos` — "Successful update operation"). **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S151 | Teto de opções da enquete (perfil e grupo) sobe de 4 pra 5 — commit `a364b49`. `firestore.rules` **deployadas em 26/08/2026** (`firebase deploy --only firestore:rules`). **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S147 | Bug: momento PRÓPRIO renderizava como barra azul vazia no feed do Explorar (`myCardImage` fora do fluxo, sem nada dimensionando o card) — corrigido — commit `cf6a1ce`. Client puro, sem deploy necessário. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S142 | Fluidez do chat: item 3 (rolagem/indicador "↓ Nova mensagem") implementado e auditado (3 rodadas); opção "Copiar mensagem" no sheet de toque longo — commits `7b12583`, `4e80262`. Client puro (`expo-clipboard` nova dependência). **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** Itens 1/2/4 (envio otimista, teclado, paginação) seguem SEM decisão de produto — recon não achou bug de código, próximo passo é medir em aparelho Android real numa sprint futura. |
| S138 | Nome completo e apelido viram IMUTÁVEIS pelo usuário, edição só via chamado de suporte (admin edita); script de migração `scripts/migrarNomeCompleto.js` corrigido — commits `4bb0383`, `ef272e8`. `firestore.rules` alteradas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** Script de migração segue em modo dry-run, NÃO executado com `--confirm` contra dados reais (decisão do Raphael). |
| S138-B | Copy do cadastro: helper curto explicando o papel público/interno dos campos nome completo e apelido — commit `1a76d68`. Client puro, sem rules/functions. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S146 | Badges in-app (dot vermelho) de pedidos/aceites nas 3 frentes do Explorar (grupos, eventos, momentos) — estende "solicitação→dono" e cria "aceite→solicitante" do zero — commit `df76fc3`. `firestore.rules` **deployadas em 26/08/2026**. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S145 | Aba Explorar (não-admin) ganha acesso a Grupos, Eventos e "Pedidos de conversa" via fileira de cards, com badge (dot) na própria aba quando há pedido de Momento pendente — commit `6547fc0`. Client puro, sem rules/functions. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S143-C | Barra de resposta no viewer do Momento (chips + emojis + campo), redesenhada pós-teste pra ser independente de match — commits `d753ef7`, `faa1e36`, `00dd061`, `0447db6`, `94df3c7`. `firestore.rules` **deployadas**. Causa do permission-denied CONFIRMADA e corrigida: `allow get` de `momentoRequests/{requestId}` negava doc inexistente em vez de permitir — padrão `resource == null \|\| dono`, mesmo molde do swipe da S49. **Fechada em código E testada em aparelho (25/08/2026).** |
| S143-B | Curtir e comentar momento sem match — comentário sem match vira "pedido" tipo Instagram, resposta não cria match completo, só libera conversa isolada — commit `df08ee7`. `firestore.rules`/Cloud Functions (`expireMomentos` alterada, `onMomentoLikeCreated`/`onMomentoLikeDeleted`/`onMomentoRequestCreated`/`onMomentoRequestUpdated`) já deployadas (confirmado pelo funcionamento em produção da S143-C, que depende do mesmo encanamento). **Fechada em código E testada em aparelho, junto com a bateria da S143-C (25/08/2026).** |
| S143-A | Momento: navegar por toque nos lados (metade esquerda volta, direita avança), convivendo com o avanço automático e a pausa por toque longo da S141 — commit `6ea6c89`. Client puro, sem rules/functions. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S144-C | Quebrou `functions/src/index.ts` (1929 linhas, 31 Cloud Functions) em módulos por domínio: `chat.ts`, `admin.ts`, `account.ts`, `perfil.ts`, `momentos.ts`, `grupos.ts`, `eventos.ts`, `agendadas.ts` + `shared/index.ts` (único lugar com `initializeApp()` e `defineSecret('GMAIL_APP_PASSWORD')`). `index.ts` final é só reexport nomeado. Confirmado: os 31 nomes exportados no runtime são exatamente os mesmos de antes, sem renomear/aninhar nada — nenhum deploy foi feito nesta sprint. `ARQUITETURA.md` atualizado com a estrutura nova. |
| S144-A | Criação do `ARQUITETURA.md` (mapa de collections/Cloud Functions/moldes reusáveis) e integração ao `jv-recon` — commit `3dd5ad9`. Documentação interna, sem funcionalidade de app pra testar em aparelho. **Fechada e commitada (24/08/2026).** |
| S141 | Visualizador de Momento: safe area (cabeçalho parava de sobrepor a status bar) e avanço automático de 5s com pausa ao segurar — commit `8da1365`. Client puro, sem rules/functions. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S139 | Bug: momento de terceiros não carregava (`permission-denied`) — `allow read` de `momentos/{uid}` separado em `allow get`/`allow list` (limitação estrutural do Firestore pra provar `request.time` num listener) — commit `d0a6b15`. `firestore.rules` deployadas. **Fechada em código E testada em aparelho, aprovada em 24/08/2026.** |
| S125 | Eventos/encontros — só verificado cria, base inteira vê, local só pra quem já foi aprovado, expira mas fica no histórico ~30 dias — commit `d72b3dc`. `firestore.rules` deployadas junto com a S137. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S124-B | Grupos: enquete (reusa S126), contador de gente ativa agora (reusa presença), selo de fundador (reusa S127) — commit `724f072`. `firestore.rules` e functions `onGroupPollVoteCreated`/`onGroupPollChanged`/`getGroupActiveNowCount` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S124-A | Grupos: esqueleto — qualquer usuário cria, entrada por pedido+aprovação, prazo de encerramento (teto 1 mês) — commit `0915a2a`. Índices, rules e storage deployados; functions `expireGroups`/`onGroupMemberCreated`/`onGroupJoinRequestCreated` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026** (push de pedido/aprovação segue aguardando build 15). |
| S135 | "Como quer ser chamado" separado do nome completo/real — nome real vira PRIVADO (só admin/verificação), apelido é o público — commit `8805fd6`. `firestore.rules` e 5 functions deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026** (título/corpo do push com o nickname segue aguardando build 15). |
| S129-B | Tiques estilo WhatsApp (enviado/entregue/lido) — "entregue" definido como sincronização do app do outro lado em foreground, não recibo real de push — commit `05ef571`. `firestore.rules` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026** (os 3 estados em 2 aparelhos com build seguem em "Testes pendentes"). |
| S133 | Bug do Descobrir: card de trás ficava totalmente visível durante o arraste — 1ª correção (opacidade, commit `4661a62`) ainda revelava nome/foto/vale/intenção/UF do próximo perfil com só 25% do arrasto (ponto do gesto ainda reversível). Corrigido cobrindo o card de trás com máscara opaca (`theme.colors.surface`) atrás do `ProfileCard`, mantendo o efeito baralho (moldura/escala) mas sem nenhum conteúdo legível até ele virar o card ativo. Client puro, sem deploy. **Fechada em código nesta sessão (28/08/2026), SEM teste em aparelho.** |
| S134 | Bug: idade some quando o nome é longo — nome e idade viravam UMA string dentro de `Text numberOfLines={1}`; nome comprido truncava a string inteira e cortava a idade junto. Corrigido nos 5 arquivos onde isso ocorria (`MatchProfileScreen.tsx`, `SwipeScreen.tsx`/`ProfileCard`, `ProfileSheet.tsx`, `LikesScreen.tsx`, `AdminVerificationsScreen.tsx`): nome e idade agora são DOIS `Text` dentro de um `View` (`nameAgeGroup`/`likerNameAgeGroup`) — só o `Text` do nome tem `numberOfLines`+`flexShrink`, o `Text` da idade (`nameAge`/`likerNameAge`) nunca encolhe e só renderiza com guard `displayAge != null`. De caminho, corrigido bug lateral em `SwipeScreen.tsx` e `LikesScreen.tsx`: antes exibiam literalmente `"Nome, null"` quando `displayAge` era `null` (concatenação direta sem guard); agora não renderizam o trecho da idade nesse caso. Client puro, sem rules/functions. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S127 | Marcos e selos ("primeiro match", "perfil completo", "10 dias no app") — determinístico, sem sorte — commit `ccf8926`. `firestore.rules` e functions `onUserProfileUpdated`/`tenDaysInAppCheck` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S128 | Super Curtida diária — 1 grátis por dia; correção pós-auditoria (`existsAfter` nas rules, reavaliação periódica no hook) — commit `ed0513a`. `firestore.rules` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S123 | Curtir foto (não a pessoa), contador na foto — escopo pós-match, sem function e sem push — commit `78f6fb4`. `firestore.rules` deployadas. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S121 | Momento de 24h — story que expira, audiência é a base inteira — commit `746f163`. Rules do Firestore e do Storage deployadas; function `expireMomentos` criada. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S132 | Enquete visível e votável fora do Descobrir — agora aparece também no perfil do match (MatchProfileScreen), não só no card do Descobrir (ProfileSheet) — commit `a326077`. Client puro. **Fechada em código, ainda SEM teste em aparelho.** |
| S102-C | Denunciar mensagem específica do chat, reusando a fila de denúncias do admin (S96) — commit `825b56b`, 6 arquivos. `firestore.rules` **já deployadas em 21/08** (saída do deploy trouxe "uploading rules" e "released rules"). NENHUMA Cloud Function envolvida. **Fechada em código, SEM teste.** |
| S126 | Enquete no perfil — commit `d35b935`. `firestore.rules` e as duas functions novas (`onPollVoteCreated`, `onPollChanged`) **já deployadas em 21/08**. **Fechada em código, ainda SEM teste** (exceto push, que espera o build 15). |
| S102-B | Desfazer match de dentro da conversa — commit `5b6c49f`. Function `unmatch` (onCall, southamerica-east1) **já deployada em 21/08**. **Fechada em código, ainda SEM teste.** |
| S129-A | Tocar na mensagem citada (`replyTo`) leva até a mensagem original — commit `7439afc`. Client puro. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S101 | Paginação do chat — commits `91c734b` + `0710830` (fix: não marcar como lido quando a leitura da âncora falha). Client puro. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S122 | Push não chega mais com o app em primeiro plano — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S130 | Colar texto longo no chat (maxLength 2000 + "ler mais") — commit `12a7220`. Client puro. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S131 | X em "Suas curtidas" desfaz a curtida — commit `12a7220`. Client puro. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
| S120 | Foto obrigatória no cadastro |
| S103 | Painel de números do admin |
| S100 | Estado do Descobrir vazio |
| S98 | Bloqueio preventivo |
| S97 | Pausar perfil / modo invisível |
| S96 | Fila de denúncias no admin |

**S99 — DESCARTADA.** Era filtro de distância social (não mostrar quem é da
mesma agência/cidade). Decidido que não vamos fazer. Não repropor.

**S140 — FECHADA como OBSOLETA (Raphael, 26/08/2026).** Era o bug do build
14 que derrubava o save do perfil inteiro ao editar o nome. Fechada sem
implementação própria: a S138 tornou `name`/`nickname` imutáveis pelo dono
em QUALQUER circunstância, então o `allow update` de `users/{uid}` nunca
mais precisa aceitar `name` — a causa raiz deixou de existir por esse
caminho, não pelo previsto no recon original da sprint. As duas ressalvas
que a auditoria da S137 achou e que NÃO dependem dessa causa (exposição do
nome real de conta legada; `migrateNicknames.js` a rerodar) sobrevivem à
S140 — ver "Dívidas técnicas".

**S144-B — DESCARTADA (Raphael, 26/08/2026), mesmo tratamento da S99.** Era
enxugar o `rules-stamp` do `firestore.rules` (~5 entradas mais recentes no
topo, histórico movido pro fim do arquivo ou pro `ARQUITETURA.md`). O
histórico fica onde está — não repropor a reorganização. ⚠️ A regra da casa
de ATUALIZAR o carimbo a cada sprint que toca rules CONTINUA valendo; só a
reorganização do histórico antigo foi descartada, não a prática.

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

**Bateria do Expo Go concluída em 26/08/2026** — tudo que era testável sem
o build 15 (sem push, sem múltiplos aparelhos) foi testado e aprovado por
Raphael, incluindo S146/S148/S149-A/S150/S151 depois do deploy de rules/
functions (também em 26/08/2026 — `firebase deploy --only firestore:
rules` e `--only functions:expireMomentos,functions:onGroupMessageCreated,
functions:onMomentoRequestMessageCreated`). As sprints correspondentes
migraram pra "Fechadas recentemente" com a marca de teste (ver tabela).

**Espera o build 15** (push ou múltiplos aparelhos — Expo Go não entrega
push no SDK 54):

- S124-A — quem cria o grupo recebe push de "Novo pedido pra entrar no
  grupo" (`onGroupJoinRequestCreated`); quem tem o pedido aprovado recebe
  push de "Pedido aprovado!" (`onGroupMemberCreated`), MAS o criador NUNCA
  recebe esse segundo push sobre si mesmo na criação do próprio grupo.
  Confirma também a decisão permanente: NENHUM push é disparado por
  mensagem enviada no chat de grupo.
- S126 — dono recebe o push anônimo quando alguém vota na enquete.
- S135 — título/corpo do push de match e de mensagem mostram o NICKNAME
  (nunca o nome real).
- S122 — a correção é justamente sobre push chegar com o app em primeiro
  plano; o Expo Go não entrega push no SDK 54, então só dá pra confirmar
  com o build 15.
- S129-B — com duas contas em dois aparelhos (ou emuladores), conferir os
  3 estados do tique na conversa de quem MANDOU a mensagem: 1 tique cinza
  (enviado) assim que o outro lado ainda não abriu o app/tela de
  Conversas; 2 tiques cinza (entregue) assim que o app do outro lado
  sincronizar em foreground (não precisa abrir o chat, só estar logado);
  2 tiques verdes (lido) só depois que o outro lado abrir a conversa de
  fato. Conferir que match bloqueado (por qualquer lado) NUNCA marca
  entregue.
- S168-B — depois do deploy de `onListingChatMessageCreated`: mensagem
  nova no chat de classificados chega como push pro OUTRO participante
  (título = nickname de quem mandou, corpo = texto ou "📷 Foto", igual ao
  1:1); toque abre a conversa certa (`ListingChat`); app em primeiro plano
  não mostra banner (S122); apagar pra todos NUNCA dispara push. Roteiro
  completo (sem push, só rules/indexes) em `docs/sprints/ESTADO.md`.

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
- **S148** — `momentoRequests` cujo `momento` original já expirou ANTES do
  deploy desta sprint (S148) não são varridos pela lógica nova de
  `expireMomentos` (ela só dispara a partir da query em `momentos`, que já
  não existe mais pra esses casos) — ficam órfãos permanentemente no
  Firestore, sem limpeza automática. Script de limpeza avulso ficou fora do
  escopo, decisão deliberada.
- **S135** — conta criada pelo cliente antigo (build 14 Android / 1.0.5 iOS,
  aceita pelo `allow create` desde a S137) nasce com o nome real no doc
  PÚBLICO `users/{uid}`, sem o subdoc privado que a S135 criou pra proteger
  isso — é justamente a exposição que a S135 existia pra fechar. Achado pela
  auditoria da S137; sobrevive ao fechamento da S140 (obsoleta por outro
  motivo — ver "Fechadas recentemente").
- **S135** — `functions/scripts/migrateNicknames.js` vai precisar rodar de
  novo depois do build 15: o cabeçalho dele hoje assume que não existem
  contas pós-S135 sem `nickname`, premissa que a S137 invalidou (contas do
  cliente antigo aceitas pela S137 nascem sem passar pela migração). Achado
  pela auditoria da S137; sobrevive ao fechamento da S140.

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
- **S148 — ciclo de vida da conversa de Momento é ATRELADO ao momento, não
  independente dele.** Revoga a decisão da S143-C que separava a conversa
  de Momento (`momentoRequests`) da expiração do momento original: quando
  o momento expira, `expireMomentos` apaga junto TODOS os
  `momentoRequests` daquele autor (pendentes, respondidos e recusados —
  doc + subcoleção `messages`), independente de terem cópia própria em
  `momentoSnapshot`. Conversas de Momento NUNCA aparecem na aba Conversas
  (matches/{matchId}), só na aba Explorar; o card que leva a elas se chama
  "Momentos" (não mais "Pedidos"), e lista pedidos pendentes E conversas
  já respondidas no mesmo lugar. Qualquer sprint nova que reabra esse
  desenho (ex.: reintroduzir mesclagem na aba Conversas) é decisão de
  produto nova — não decidir sozinho, perguntar ao Raphael.

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
- Reações (`matches/{matchId}/reactions`, doc id = messageId) não têm campo
  de tempo, então não dá pra usar cursor como em `messages`. O corte de
  janela (S164) é `where(documentId(),'in', ids)` com os ids das últimas
  `MESSAGE_PAGE_SIZE` mensagens já carregadas no client (nunca Timestamp) —
  trade-off aceito: reação de mensagem fora da janela para de atualizar ao
  vivo. Limite do Firestore pra `'in'` é 30 valores, que é exatamente
  `MESSAGE_PAGE_SIZE` — não dá pra aumentar a janela sem paginar a query em
  lotes.

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
- **`lastMessage`/preview de última mensagem de qualquer thread (match,
  grupo, pedido de Momento) é SEMPRE escrito por Cloud Function (Admin
  SDK, `onDocumentCreated` na subcoleção `messages`), NUNCA pelo client
  direto.** Confirmado na S150 ao espelhar o mecanismo já usado por
  `matches/{matchId}.lastMessage` (`onMessageCreated`, `chat.ts`) pra
  `groups/{groupId}.lastMessage` (`onGroupMessageCreated`, `grupos.ts`) e
  `momentoRequests/{requestId}.lastMessage` (`onMomentoRequestMessageCreated`,
  `momentos.ts`) — mesmo shape `{text, senderId, createdAt}` nos três,
  `firestore.rules` não precisa de nenhum `hasOnly` liberando o campo (Admin
  SDK ignora rules). Qualquer thread nova com um "preview de última
  mensagem" deve seguir a MESMA via — nunca o client escrevendo o preview
  direto no doc pai, mesmo que pareça mais simples/rápido de implementar.
- **Badge de "não lida" (contador que precisa DESCER de novo depois de já
  ter zerado, ex.: mensagem nova após já ter aberto a tela) é DIFERENTE do
  badge one-shot "vi que aconteceu algo" (S146: `seenAt` de grupo/Momento,
  gravado só na 1ª vez que falta).** Confirmado na S150
  (`messagesSeenAt`/`authorSeenAt`): o campo de leitura de um badge de
  não-lidas de verdade precisa ser regravado (`serverTimestamp()`) a TODA
  abertura da tela (mount), nunca só quando ainda está ausente — senão o
  badge nunca reacende depois da primeira mensagem lida, mesmo com
  mensagens novas chegando depois. Mesmo padrão já usado por `markMatchRead`
  (`ChatScreen.tsx`/`lastReadAt`). Campo de leitura de badge one-shot e
  campo de leitura de badge recorrente NUNCA podem ser o mesmo campo,
  mesmo quando protegem a mesma entidade (grupo/pedido) — precisam ser
  campos distintos com useEffects distintos.
- **`get()`/`getAfter()` sobre um doc que pode não existir LANÇA ERRO (não
  devolve algo tipo `resource == null`) — e um erro de avaliação de rule
  vira `permission-denied` pro client, indistinguível de uma negação
  deliberada.** Descoberto duas vezes, mesma classe de bug: (1) S128,
  `swipes/{swipeId}` `allow create` — `getAfter(dailyGrant).data.*` sem
  `existsAfter(dailyGrant)` antes derrubava a `allow create` INTEIRA pra
  qualquer client que ainda não tivesse escrito `dailyGrant`, corrigido
  com `existsAfter()` como guarda/curto-circuito antes do `getAfter()`.
  (2) S143-C (várias rodadas), `momentoRequests/{requestId}` — `allow get`
  testando `resource.data.senderId == request.auth.uid` sem checar
  `resource == null` primeiro negava TODO doc inexistente com erro, não
  com `false` (a checagem de doc de existência prévia antes do 1º pedido a
  um autor batia nisso); e `getMomentoRequest(requestId)` (um `get()`
  indireto do doc PAI, chamado de dentro da subcoleção `messages`) lançava
  o mesmo erro pra um `requestId` forjado ou pra uma corrida de exclusão.
  Fix padrão: (a) pra `get()` direto do PRÓPRIO doc, `resource == null ||
  (condição de dono)` — `resource == null` como PRIMEIRO ramo de um `||`,
  nunca dentro de um `&&`; (b) pra `get()` indireto de outro doc (ex.: doc
  pai referenciado de dentro de uma subcoleção), uma função `exists(...)`
  (que nunca lança, só devolve `false`) como guarda ANTES de qualquer
  `get()`/`getAfter()` daquele doc. Qualquer rule nova que leia (direto ou
  indireto) um doc que pode não existir precisa de um dos dois guards.

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
- `npx eslint .` → **0 erros / 15 warnings**. Não pode piorar.

---

## Ideias sem número (não são sprint ainda)

Feed "rádio corredor" · joguinho de moedas · modelo de negócio. Todas
levantadas em 17/08, nenhuma com decisão. ("Classificados / OLX de
funcionários", também levantada em 17/08, virou sprint numerada — ver
"Fila aberta" § S168.)
