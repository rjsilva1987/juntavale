# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 04/09/2026
**Commit atual:** o commit da S168-B1 (fix(listings), sucede 2bf2949 —
S168-B, chat interessado↔anunciante em `listingChats/{listingId}_{uid}`).
S168-B1 (foto como 1ª mensagem do chat de classificados: `ensureListingChat`
cria o doc pai antes do upload em `images/listingChats`, depois
`sendListingChatMessage`; `deleteListingChatImage` apaga o órfão no
Storage se a mensagem falhar) IMPLEMENTADA e auditada (APROVADA na 1ª
rodada) em 04/09 — client puro, sem deploy; ver ROADMAP § S168. Deploys
pendentes acumulados (inalterados pela S168-B1):
`firebase deploy --only firestore:rules,storage,firestore:indexes,functions:onListingSubmitted,functions:onListingChatMessageCreated`
(rules-stamp S168-B engloba o S168-A ainda não confirmado; indexes ganha
1 índice novo de `listingChats`; `onListingSubmitted` é da S170).

## Sprints em andamento
Nenhuma sprint em código pendente de fechamento. S158, S159 e S160
seguem só com teste em aparelho pendente — a S160 em especial precisa
reproduzir os 3 sintomas de novo e, se o sumiço de mensagem persistir,
rodar o triage do Firestore (ver ROADMAP.md § S160). S167: testar em
aparelho que o toque longo volta a abrir o sheet (texto/imagem/
localização) e que reagir/responder/copiar/editar/apagar/denunciar,
"ler mais" e arrastar-pra-responder seguem funcionando, no 1:1 e no
grupo. S168-A: depois do deploy (rules + storage + indexes), testar em
aparelho o fluxo inteiro — criar anúncio (pending), aprovar/recusar como
admin, edição volta pra pending, marcar vendido/excluir, gate de não
verificado (nenhum dado real, CTA de verificação). S169: testar em
aparelho como admin que a aba "Classificados" aparece entre Denúncias e
Perfil com badge igual ao número de anúncios pending, que a fila carrega
o anúncio cadastrado (sem loading infinito) e abre o detalhe, que o badge
cai ao aprovar/recusar, e que o botão "Classificados pendentes" sumiu do
Perfil. Se a fila ainda falhar, o EmptyState mostra `erro: <code>` — esse
código é o diagnóstico (`failed-precondition` = índice; `permission-
denied` = rules). S170 (depois do deploy da function e em build com
push, não Expo Go): criar anúncio como verificado → admin recebe "Novo
anúncio para aprovar" sem o título do anúncio; toque abre a aba
Classificados; editar anúncio aprovado → push "editou um anúncio";
editar anúncio ainda pendente → nenhum push; aprovar/recusar → nenhum
push. S168-B (depois do deploy de rules + storage + indexes; push só em
build): com 2 contas verificadas, abrir um anúncio aprovado de outra
pessoa → "Tenho interesse" aparece (some no próprio anúncio, em anúncio
vendido/expirado e pra não verificado) → tela de chat vazia SEM doc
criado → 1ª mensagem cria `listingChats/{listingId}_{uid}` e aparece nos
dois lados; dono vê "1 conversa" em Meus anúncios e toca pra listar; os
dois veem o card "Classificados" na aba Conversas com dot até abrir a
conversa; foto — inclusive como 1ª mensagem, com o chat ainda sem doc
(S168-B1) —, responder, copiar, "ler mais" e apagar pra todos (1h)
funcionam; marcar vendido/excluir o anúncio → banner "Anúncio encerrado"
no topo e a conversa continua aceitando mensagem; push da mensagem chega
pro outro lado (nickname + preview) e o toque abre a conversa; app em
primeiro plano não mostra banner (S122).

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S168-B2 (denúncia dentro do chat de classificados) e S168-C — sem
  escopo, sem recon. Ver ROADMAP.md § S168.
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
