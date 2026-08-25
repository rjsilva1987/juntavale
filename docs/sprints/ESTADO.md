# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 25/08/2026
**Commit atual:** 94df3c7 — fix(momentos): allow get de momentoRequests
permite doc inexistente na checagem previa (S143-C) — ver ROADMAP.md.

## Sprints em andamento
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

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S138 — nome/apelido imutáveis — decisões tomadas, sem recon.
- S140 — bug: conta do build 14 quebra ao salvar perfil com nome editado —
  sem decisões, achado da auditoria da S137.
- S142 — fluidez do chat (Android) — sem decisões, começa por RECON DE
  DIAGNÓSTICO.

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
