# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 27/08/2026
**Commit atual:** 9ed6baa — feat(grupo): chat de grupo ganha apagar
mensagem pra todos, mirror do 1:1 (S149-E) — ver ROADMAP.md.

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento. Bateria de testes do
Expo Go concluída em 26/08/2026 e ROADMAP.md consolidado no mesmo dia:
S121-S153 (lote de sprints anteriores + o lote da madrugada S147-S153)
migradas pra "Fechadas recentemente". Ver ROADMAP.md § "Fechadas
recentemente" pra detalhe por sprint.

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
- S149 — restam "ler mais" e "copiar" (mirror do 1:1) pra fechar a
  paridade do chat de grupo — sem letra própria nem recon/decisão ainda.
  Reações (S149-B), responder/replyTo (S149-C), editar (S149-D) e apagar
  (S149-E) já fechadas. Ver ROADMAP.md § S149.

## Débitos técnicos ativos
- S102-C — `messageImageUrl`/`matchId`/`messageId` sem validação de
  formato/tamanho nas rules (ver ROADMAP § "Dívidas técnicas").
- S132 — enquete ficou acima do "Prompt da semana" no perfil; risco
  aceito ao fechar.
- S148 — `momentoRequests` órfãos de momentos expirados ANTES do deploy
  desta sprint não são varridos pela lógica nova de `expireMomentos` (ver
  ROADMAP § "Dívidas técnicas").

## Pendências vivas
- **S149-B** — `firestore.rules` com o bloco novo de reações de grupo
  ainda NÃO deployada; sem teste em aparelho. Ressalva da auditoria pra
  confirmar com o Raphael: a prévia de última mensagem em GroupsScreen
  aparece também na seção "Descobrir" (grupos que o usuário não integra)
  — ver ROADMAP.md § "Fechadas recentemente" (linha S149-B).
- **S149-C** — `firestore.rules` com a validação nova de `replyTo` em
  `groups/{groupId}/messages` ainda NÃO deployada; sem teste em aparelho.
- **S149-D** — `firestore.rules` com o ramo novo de editar em
  `groups/{groupId}/messages` ainda NÃO deployada; sem teste em aparelho.
- **S149-E** — `firestore.rules` com o ramo novo de apagar em
  `groups/{groupId}/messages` ainda NÃO deployada; sem teste em aparelho.
- **Aguardando o BUILD 15** (push ou múltiplos aparelhos, Expo Go não
  entrega push no SDK 54): S124-A (push de pedido/aprovação), S126 (push
  anônimo da enquete), S135 (nickname no push), S129-B (3 estados do
  tique em 2 aparelhos) — ver ROADMAP.md § "Testes pendentes".

## Onde olhar antes de mexer
- ROADMAP.md § "Decisões de produto que valem para o projeto inteiro" e
  § "Armadilhas do chat".
- ARQUITETURA.md — mapa de collections, Cloud Functions e moldes
  reusáveis.
