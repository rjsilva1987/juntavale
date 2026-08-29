# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 28/08/2026
**Commit atual:** efaa4f6 — fix(chat): consolida scroll para o fim e
protege janela deslizante do listener no chat 1:1 (S160) — ver ROADMAP.md.
S158/S159/S160 já commitadas e no HEAD. S161 (Parte A — performance do
renderMessage/MessageBubble do chat 1:1) fechada em código nesta sessão,
aguardando commit/push (GIT MANUAL).

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento. S161 Parte A fechada em
código (ver ROADMAP.md § "Fechadas recentemente"), só falta commit/push
manual e teste em aparelho (reação/tique de leitura/entrega em tempo real,
sem travar). S158, S159 e S160 seguem só com teste em aparelho pendente —
a S160 em especial precisa reproduzir os 3 sintomas de novo e, se o
sumiço de mensagem persistir, rodar o triage do Firestore (ver ROADMAP.md
§ S160).

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S136 — JuntaVale como rede social pra funcionários — BLOQUEADA até o
  fim do teste fechado (~30/08/2026); decisão que destrava tudo: qual
  tela vira a inicial (Descobrir vs. feed). Ver ROADMAP.md § S136.
- S140 — bug do build 14 ao salvar perfil com nome editado — REAVALIADA,
  possivelmente obsoleta após a S138; decisão de fechar ou manter aberta
  PENDENTE. Ver ROADMAP.md § S140.
- S144-B — enxugar carimbo do `firestore.rules` — a refazer (commit
  `db12492` revertido em `fa757f5`). Ver ROADMAP.md § S144-B.

## Débitos técnicos ativos
- S102-C — `messageImageUrl`/`matchId`/`messageId` sem validação de
  formato/tamanho nas rules (ver ROADMAP § "Dívidas técnicas").
- S132 — enquete ficou acima do "Prompt da semana" no perfil; risco
  aceito ao fechar.
- S148 — `momentoRequests` órfãos de momentos expirados ANTES do deploy
  desta sprint não são varridos pela lógica nova de `expireMomentos` (ver
  ROADMAP § "Dívidas técnicas").

## Pendências vivas
- **S161 Parte B** (adiada, decisão do Raphael) — listener de reações do
  chat 1:1 (`listenReactions`, `matches/{matchId}/reactions`) continua
  escutando a subcoleção inteira sem corte de janela. Não há campo de
  tempo no doc de reação (id = messageId) pra usar cursor como em
  `messages`; a única forma de reduzir leitura de fato seria
  `where(documentId(),'in',ids)` limitado a 30 ids, com trade-off de UX
  (reações em mensagens antigas paginadas somem) — precisa de mais
  desenho/decisão antes de virar sprint. Ver ROADMAP.md § "Fechadas
  recentemente" (linha S161).
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
