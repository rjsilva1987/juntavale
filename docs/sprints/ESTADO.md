# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 04/09/2026
**Commit atual:** o commit da S175 (chore(docs), sucede 9bfa568 —
S168-C, política de privacidade com Classificados). Lote 2 de 04/09/2026
em andamento: S175 commitada → S172-A → S174 (ver "Sprints em
andamento"). Lote 1 (S171 0184688 → S168-B2 5fa69ed → S172 cc60168 →
S173 88885eb → S168-C 9bfa568) fechado. `docs/loja/` agora versionado
(`!docs/loja/` no `.gitignore`, S175). Deploys pendentes acumulados:
`firebase deploy --only firestore:rules,storage,firestore:indexes,hosting,functions:onListingSubmitted,functions:onListingChatMessageCreated,functions:onVerificationSubmitted,functions:onSupportMessageCreated,functions:expireListings,functions:deleteAccount`
(rules-stamp S172 engloba S168-B2, S168-B e o S168-A ainda não
confirmado; storage stamp S168-B2; indexes ganha 2 índices novos —
`listingChats` participants+lastMessageAt e `listings` status+expiresAt;
hosting = `site/privacidade.html` + `site/excluir-conta.html`;
`onVerificationSubmitted`/
`onSupportMessageCreated`/`onListingSubmitted` mudaram na S168-B2;
`expireListings` é nova, S172; `deleteAccount` mudou na S173). Lado
client de S168-B2/S172 só entra em build novo (versionCode 23 / 1.0.13
ainda é o da S168-A+S169+S170).

## Sprints em andamento
Lote 2 de 04/09 (S175 → S172-A → S174) rodando: S175 commitada; S172-A
(aprovação do admin renova `expiresAt`) e S174 (`onReportCreated`, push
pros admins em denúncia nova) em implementação/auditoria, cada uma com
commit próprio. Do lote 1 (S171, S168-B2, S172, S173, S168-C) fica só
teste em aparelho e deploy. S175: abrir `/excluir-conta` depois do
deploy e conferir os 3 itens novos. S173 (depois
do deploy de `functions:deleteAccount`): com uma conta de teste que tem
anúncio com foto e um chat de classificado nos dois papéis, excluir a
conta → anúncio some do feed e de `listings`, `images/listings/{uid}`
vazio, `listingChats` do uid apagados com `messages` e fotos, o outro
participante recebe "conversa indisponível" ao abrir; denúncias antigas
continuam no painel do admin (com "Abrir anúncio" levando a "anúncio
indisponível"). S172 (depois do deploy de rules + indexes
+ function, em build com push): anúncio approved com `expiresAt` no
passado → na rodada das 09:00 vira "Expirado" em Meus anúncios, some do
feed, dono recebe "Um anúncio seu expirou. Toque para renovar." e o toque
abre Meus anúncios; "Renovar" (1 toque, sem confirmação) volta pra
"Aprovado" com +30 dias SEM passar pela fila do admin; editar um expirado
volta pra "Em análise"; interessado que abre o chat de um expirado vê
"Anúncio encerrado". S171: testar em aparelho que
Classificados abre em "Todos os estados", que o campo abre o seletor de
UF e o feed corta pela UF escolhida, e que ao sair e voltar o filtro
reseta. S168-B2 (depois do deploy de rules + storage + functions; push
só em build): denunciar um anúncio de outra pessoa (bandeira no header,
5 motivos próprios) → "Denúncia enviada"; denunciar de novo → "Denúncia
já enviada"; denunciar a pessoa dentro do chat de classificado (bandeira
só com chat existente) → idem; como admin, a lista de Denúncias mostra
o tipo ("Anúncio"/"Chat de classificado") e "Abrir anúncio ›"/"Abrir
conversa ›" abrem o anúncio e o chat em modo leitura (sem composer, fotos
carregam); toque no link NÃO deve abrir também o detalhe da denúncia;
verificação/chamado/anúncio novo → push chega nos 2 admins. S158, S159 e S160
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
- Push pro admin quando uma DENÚNCIA nova entra (não existe function
  pra isso — a S168-B2 só fez as existentes irem pros 2 admins); decidir
  se vale criar `onReportCreated`. Ver ROADMAP.md § S168.
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
