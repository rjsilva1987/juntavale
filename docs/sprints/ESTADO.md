# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 31/08/2026
**Commit atual:** 573ef7f — fix(chat): expoe codigo do erro no banner e
limita listenReactions as ultimas 30 mensagens (S164). S162 (diagnóstico
do chat 1:1 quebrado no build 18) encerrada sem tocar código. S163
(correção: callback de erro em `listenMessages`/`listenTypingStatus`/
`listenMatchBlockStatus` + banner de retry no `ChatScreen`) e S164 (causa
raiz do build 18: banner passa a mostrar o `.code` do Firestore,
`listenReactions` limitado às últimas 30 mensagens, rules revisadas sem
edição) já commitadas e empurradas. S165 (travamento do chat 1:1 quando
o outro participante está online e ativo: referências novas em
lastReadAt/deliveredAt/blockedBy a cada snapshot de `matches/{matchId}`
— inclusive por escrita de typing — e resubscribe desnecessário de
`listenReactions`) fechada em código e auditada nesta sessão (bloqueou
1x por `.toMillis()` sem guard de null, corrigido e reverificado),
commitada e empurrada nesta sessão via GIT AUTOMATICO.

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento. S158, S159 e S160
seguem só com teste em aparelho pendente — a S160 em especial precisa
reproduzir os 3 sintomas de novo e, se o sumiço de mensagem persistir,
rodar o triage do Firestore (ver ROADMAP.md § S160). S163/S164/S165
(chat 1:1) seguem SEM teste em aparelho — validação real depende do
build 20 (S164+S165 juntas, ainda não gerado): banner de erro mostrando
o `.code`, reações atualizando nas últimas 30 mensagens, e o travamento
com o outro lado online deixando de acontecer.

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
