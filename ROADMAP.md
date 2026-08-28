# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 28/08/2026

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
| S133 | Bug do Descobrir: card de trás ficava totalmente visível durante o arraste — corrigido escondendo por opacidade — commit `4661a62`. Client puro. **Fechada em código, TESTADA em aparelho e aprovada em 26/08/2026.** |
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

Classificados / "OLX de funcionários" · feed "rádio corredor" · joguinho de
moedas · modelo de negócio. Todas levantadas em 17/08, nenhuma com decisão.
