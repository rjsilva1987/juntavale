# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 02/09/2026
**Commit atual:** ff958ac — docs: descarta S166-A e S166-C, registra
teste da S166-B e alinha ESTADO.md. Build 21 (1.0.11, e88927b) leva
S166-0 + S166-B; a S166-B (corte do loop de escrita `useUnreadCount` →
`markMatchDelivered`) foi CONFIRMADA em aparelho em 02/09 (~1,5
snapshot por escrita, 1 assinatura ativa por listener, stalls ≤315 ms —
ver ROADMAP § S166-B). S167 (toque longo do chat 1:1 morto desde a
S158: `pointerEvents="none"` é no-op em `Text` no Android, o espelho do
"ler mais" capturava o toque; corrigido com wrapper `View
pointerEvents="none"` no espelho, `ChatScreen.tsx` +
`GroupChatScreen.tsx`) fechada em código e auditada nesta sessão
(APROVADA), pendente de commit/push — GIT MANUAL, comandos impressos no
fim da sprint pro Raphael rodar.

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento — S167 só aguarda o
commit/push manual do Raphael. S158, S159 e S160 seguem só com teste em
aparelho pendente — a S160 em especial precisa reproduzir os 3 sintomas
de novo e, se o sumiço de mensagem persistir, rodar o triage do
Firestore (ver ROADMAP.md § S160). S167: testar em aparelho que o toque
longo volta a abrir o sheet (texto/imagem/localização) e que reagir/
responder/copiar/editar/apagar/denunciar, "ler mais" e
arrastar-pra-responder seguem funcionando, no 1:1 e no grupo.

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
