# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 02/09/2026
**Commit atual:** b4e9fc0 — fix(chat): overlay de debug gateado so pela
flag (S166-0). S163/S164/S165 (chat 1:1) e S166-0 (instrumentação de
diagnóstico do chat: overlay gateado por `CHAT_DEBUG_OVERLAY`+admin,
contadores por listener/render/stall) já commitadas e empurradas, todas
SEM teste em aparelho. A medição da S166-0 em device (Expo Go,
--no-dev --minify) achou a tempestade: ~1640 snapshots por listener do
doc do match pra ~30 escritas contadas numa troca de 5 mensagens. S166-B
(causa provada: loop de escrita `useUnreadCount` → `markMatchDelivered`
— `serverTimestamp()` pendente resolve `null` no snapshot local e
redispara a própria escrita até o ack; corrigido com gate por
`d.metadata.hasPendingWrites`, + contadores sub/unsub e bump de
`markMatchDelivered` no chatDebug) fechada em código e auditada nesta
sessão (APROVADA, ressalva não bloqueante sobre ack metadata-only de
`deleteField()` do typing), pendente de commit/push — GIT MANUAL,
comandos impressos no fim da sprint pro Raphael rodar.

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento — S166-B só aguarda o
commit/push manual do Raphael. S158, S159 e S160 seguem só com teste em
aparelho pendente — a S160 em especial precisa reproduzir os 3 sintomas
de novo e, se o sumiço de mensagem persistir, rodar o triage do
Firestore (ver ROADMAP.md § S160). Chat 1:1 (S163/S164/S165/S166-B):
próximo passo é repetir a medição da S166-0 com a correção da S166-B —
ligar `CHAT_DEBUG_OVERLAY` localmente, mesma troca de 5 mensagens,
esperado snapshots ≈ escritas (~2 por escrita), `sub − unsub = 1` por
listener, stalls de volta ao chão, e conferir se `deliveredAt` continua
marcando (ressalva do ack metadata-only, ver ROADMAP.md § S166-B).

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S136 — JuntaVale como rede social pra funcionários — BLOQUEADA até o
  fim do teste fechado (~30/08/2026); decisão que destrava tudo: qual
  tela vira a inicial (Descobrir vs. feed). Ver ROADMAP.md § S136.

## Débitos técnicos ativos
- S102-C — `messageImageUrl`/`matchId`/`messageId` sem validação de
  formato/tamanho nas rules (ver ROADMAP § "Dívidas técnicas").
- S132 — enquete ficou acima do "Prompt da semana" no perfil; risco
  aceito ao fechar.
- S148 — `momentoRequests` órfãos de momentos expirados ANTES do deploy
  desta sprint não são varridos pela lógica nova de `expireMomentos` (ver
  ROADMAP § "Dívidas técnicas").

## Pendências vivas
- **S149-B** — Ressalva da auditoria pra confirmar com o Raphael: a
  prévia de última mensagem em GroupsScreen aparece também na seção
  "Descobrir" (grupos que o usuário não integra) — ver ROADMAP.md §
  "Fechadas recentemente" (linha S149-B). `firestore.rules` já
  deployadas e testadas em 27/08/2026; só essa ressalva de produto
  segue em aberto.
- **Aguardando o BUILD 15/16** (push ou múltiplos aparelhos, Expo Go não
  entrega push no SDK 54): S124-A (push de pedido/aprovação), S126 (push
  anônimo da enquete), S135 (nickname no push), S129-B (3 estados do
  tique em 2 aparelhos); S152/S153/S154 também seguem sem teste em
  aparelho — ver ROADMAP.md § "Testes pendentes".

## Onde olhar antes de mexer
- ROADMAP.md § "Decisões de produto que valem para o projeto inteiro" e
  § "Armadilhas do chat".
- ARQUITETURA.md — mapa de collections, Cloud Functions e moldes
  reusáveis.
