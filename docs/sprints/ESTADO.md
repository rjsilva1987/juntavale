# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 25/08/2026
**Commit atual:** 00dd061 — fix(momentos): permission-denied no 1o pedido +
emoji prematuro durante carregamento (S143-C) — ver ROADMAP.md.

## Sprints em andamento
- S143-C — REDESENHO por decisão de produto do Raphael (25/08/2026), ainda
  SEM commit (mudanças no working tree por cima de 00dd061, aguardando o
  Raphael fechar num commit único): responder a um Momento (emoji, chip,
  texto) virou INDEPENDENTE de match — sempre pedido (`momentoRequests`),
  nunca mensagem direta em `matches/{matchId}/messages`, nunca curtida; a
  aba Conversas passou a mesclar conversas de match + conversas de Momento
  respondidas ("via Momento", `useAnsweredMomentoRequests.ts`);
  `firestore.rules` (bloco `momentoRequests`) ganhou endurecimento
  defensivo (`exists()` antes de `get()`) contra a classe de bug do
  permission-denied. Esse permission-denied do teste de aparelho SEGUE sem
  causa confirmada — instrumentação `TEMP-DIAG S143-C` ativa em
  `momentoRequestService.ts` até passar no teste. Precisa de
  `firebase deploy --only firestore:rules` depois do commit. Ver ROADMAP.md
  § S143-C pro histórico completo (design revogado + decisões novas).
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
