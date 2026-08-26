# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 25/08/2026
**Commit atual:** 94df3c7 — fix(momentos): allow get de momentoRequests
permite doc inexistente na checagem previa (S143-C) — ver ROADMAP.md.

## Sprints em andamento
- S147 — FECHADA em código e COMMITADA (25/08/2026, via `/sprint lote
  --commit`), auditoria APROVADA sem ressalvas bloqueantes: bug do
  momento PRÓPRIO renderizando como barra azul vazia no feed do Explorar
  (`MomentosScreen.tsx` — `myCardImage` saía do fluxo via
  `StyleSheet.absoluteFillObject` sem nada dimensionando o card no caso
  `photo`). Client puro, sem deploy. Ver ROADMAP.md § S147. SEM teste em
  aparelho.
- S146 — FECHADA em código (25/08/2026), auditoria APROVADA sem ressalvas
  bloqueantes, pendente de commit do Raphael: badge in-app (dot vermelho)
  de pedidos/aprovações nas 3 frentes do Explorar (grupos, eventos,
  momentos). Estende o badge "solicitação→dono" (S145) pra grupos/eventos
  e cria do zero o badge "aceite→solicitante" nas 3 frentes (`seenAt` novo
  em `groups/{groupId}/members/{uid}`, `events/{eventId}/participants/{uid}`,
  `momentoRequests/{requestId}`). `firestore.rules` alteradas (2
  `allow update` saem de `if false` pra liberar só `seenAt` do próprio uid;
  `momentoRequests` ganha ramo OR pro sender) — **EXIGE DEPLOY de rules**,
  nenhuma Cloud Function tocada. Ver ROADMAP.md § S146. SEM teste em
  aparelho.
- S138 — FECHADA em código (25/08/2026), pendente de commit do Raphael:
  nome completo (`legalName`) e apelido (`nickname`) viram IMUTÁVEIS pelo
  usuário no app, sempre (inclusive pré-verificação) — única via de
  correção é o admin, a partir de um chamado de suporte
  (`AdminSupportDetailScreen`, ação nova "Editar nome/apelido", exceção
  estreita à regra S135 de nunca mostrar `legalName` fora da verificação,
  ver ROADMAP.md § "Decisões de produto que valem para o projeto inteiro").
  `firestore.rules` alteradas: `nickname` sai do `hasOnly` livre do dono,
  `private/legalName allow update` do dono vira `if false`; duas vias novas
  isoladas pra admin (`isAdmin() && affectedKeys().hasOnly([...])`, com
  validação de tipo/tamanho e `allow create` pro subdocumento que ainda não
  existir). **EXIGE DEPLOY de rules**, nenhuma function afetada. Script de
  migração `scripts/migrarNomeCompleto.js` (molde de `limpeza.js`,
  dry-run/`--confirm`/`--project`) escrito, NÃO executado. Auditoria
  bloqueou 1ª rodada (rules de admin sem validação de tipo/tamanho + sem
  `allow create` pro `legalName`, e `nickname` incondicional no
  `updateUserProfile` do `ProfileScreen` quebrava save de perfil inteiro
  pra conta legada) — corrigido e APROVADO na 2ª rodada. Correção adicional
  (25/08/2026): dry-run real zerava (base legada sem `nickname`) porque o
  script só olhava `nickname`; critério corrigido pra espelhar o fallback
  `nickname ?? name` do `getDisplayName`, com idempotência (não sobrescreve
  `legalName` já migrado) e relatório de dry-run por conta — auditoria
  APROVADA, script ainda NÃO rodado com `--confirm`. Ver ROADMAP.md § S138.
  SEM teste em aparelho.
- S138-B — FECHADA em código (25/08/2026), auditoria APROVADA sem
  ressalvas, pendente de commit do Raphael: copy do RegisterScreen ganha
  helper curto por campo explicando o papel de nome completo (interno) e
  apelido (público), sem mexer em obrigatoriedade/labels/placeholders nem
  no aviso de imutabilidade da S138. Client puro, sem rules/functions. Ver
  ROADMAP.md § S138-B. SEM teste em aparelho.
- S145 — FECHADA em código (25/08/2026), pendente de commit do Raphael:
  aba Explorar (não-admin) ganha acesso a Grupos, Eventos e "Pedidos de
  conversa" via fileira de cards no topo do feed de Momentos, com badge
  (dot) na própria aba quando há pedido de Momento pendente
  (`usePendingMomentoRequests`, novo hook reusado em 3 pontos). Grupos e
  Eventos saíram do menu da ProfileScreen (relocados); "Pedidos de
  conversa" na ProfileScreen ficou só pro admin (aba Explorar não existe
  pra admin). Client puro, sem rules/functions, auditoria APROVADA. Ver
  ROADMAP.md § S145. SEM teste em aparelho.
- S143-C — FECHADA e TESTADA em aparelho (25/08/2026): responder a um
  Momento (emoji, chip, texto) é INDEPENDENTE de match — sempre pedido
  (`momentoRequests`), nunca mensagem direta em
  `matches/{matchId}/messages`, nunca curtida; a aba Conversas mescla
  conversas de match + conversas de Momento respondidas ("via Momento",
  `useAnsweredMomentoRequests.ts`). Causa do permission-denied CONFIRMADA
  e corrigida: `allow get` de `momentoRequests/{requestId}` negava doc
  inexistente (`resource != null &&` vira `&&` inteiro false quando
  resource é null) — corrigido pro padrão `resource == null || dono`
  (mesmo molde do swipe da S49, ver ROADMAP.md § "Padrões de escrita no
  Firestore"). Instrumentação `TEMP-DIAG S143-C` removida de
  `momentoRequestService.ts` após o teste passar — mudança no working
  tree, pendente de commit do Raphael. `firestore.rules` já **deployadas**
  (correção de semântica em produção). Ver ROADMAP.md § S143-C pro
  histórico completo (design revogado + decisões novas).
- S144-B — enxugar carimbo do `firestore.rules`: revertida (commit
  fa757f5) — a refazer.
- S142 — ENCERRADA (25/08/2026), pendente de commit do Raphael: item 3
  (rolagem/indicador "↓ Nova mensagem" na `ChatScreen`, decisão de produto
  fechada por Raphael no mesmo dia) fechado em código e auditado (3
  rodadas, 2 correções, APROVADO na 3ª). Itens 1, 2 e 4 (envio otimista,
  teclado, paginação) tiveram RECON DE DIAGNÓSTICO reconfirmada numa
  continuação, nenhum bug de código encontrado nas duas rodadas — seguem em
  aberto pra decisão futura (medir em aparelho Android depois do build 15).
  Item 5 ("digitando…") já funciona. Continuação também IMPLEMENTOU e
  auditou (1 rodada, APROVADO direto) a opção "Copiar mensagem" no sheet de
  toque longo — client puro, nova dependência `expo-clipboard`, arquivos
  `ChatScreen.tsx`/`package.json`/`package-lock.json`, sem rules/functions.
  Ver ROADMAP.md § S142. SEM teste em aparelho.

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S140 — bug: conta do build 14 quebra ao salvar perfil com nome editado —
  REAVALIADA (25/08/2026): a S138 pode ter eliminado a causa por outro
  caminho (`name`/`nickname` imutáveis pelo dono); decisão de fechar ou
  manter aberta ainda PENDENTE, ver ROADMAP.md § S140.

## Débitos técnicos ativos
- S102-C — `messageImageUrl`/`matchId`/`messageId` sem validação de
  formato/tamanho nas rules (ver ROADMAP § "Dívidas técnicas").
- S132 — enquete ficou acima do "Prompt da semana" no perfil; risco
  aceito ao fechar.

## Pendências vivas
- Volume grande de sprints fechadas em código mas SEM teste em aparelho —
  lista completa e acumulativa em ROADMAP.md § "Testes pendentes"
  (aguardando build 15).

## Onde olhar antes de mexer
- ROADMAP.md § "Decisões de produto que valem para o projeto inteiro" e
  § "Armadilhas do chat".
- ARQUITETURA.md — mapa de collections, Cloud Functions e moldes
  reusáveis.
