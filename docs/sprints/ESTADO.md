# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 04/09/2026
**Commit atual:** 9892b2d (bump versionCode 25 / 1.0.15 / iOS build 5,
S176). Working tree com a S177 (avulsa, AUTOMATICO + GIT MANUAL)
IMPLEMENTADA e auditada em 04/09/2026, AGUARDANDO commit/push pelo
Raphael: Parte A client puro (badge da aba Conversas soma listingChats),
sem deploy; Parte B encerrada sem alteração de código.
Lote 2 de 04/09/2026 FECHADO: S175 (672b102) → S172-A (a716da1) → S174
(f0dda02). Lote 1 (S171 0184688 → S168-B2 5fa69ed → S172 cc60168 → S173
88885eb → S168-C 9bfa568) fechado. `docs/loja/` versionado (S175).
Deploys pendentes acumulados:
`firebase deploy --only firestore:rules,storage,firestore:indexes,hosting,functions:onListingSubmitted,functions:onVerificationSubmitted,functions:onSupportMessageCreated,functions:expireListings,functions:deleteAccount,functions:onReportCreated`
(`onListingChatMessageCreated` saiu da lista: confirmada deployada e
disparando em 04/09/2026 via lista de functions + logs, S177; o resto da
lista não foi verificado; rules-stamp S172-A engloba S172, S168-B2, S168-B e o S168-A ainda não
confirmado; storage stamp S168-B2; indexes ganha 2 índices novos —
`listingChats` participants+lastMessageAt e `listings` status+expiresAt;
hosting = `site/privacidade.html` + `site/excluir-conta.html`;
`onVerificationSubmitted`/
`onSupportMessageCreated`/`onListingSubmitted` mudaram na S168-B2;
`expireListings` é nova, S172; `deleteAccount` mudou na S173;
`onReportCreated` é nova, S174). Lado client de S168-B2/S172/S172-A/S174
entra no build versionCode 24 / 1.0.14 (bump 54c6533); S176 entrou no
bump versionCode 25 / 1.0.15 / iOS build 5 (9892b2d); a Parte A da S177
precisa de build novo (26) — testável antes em Expo Go.

## Sprints em andamento
S177 implementada e auditada (APROVADA), pendente só de commit/push pelo
Raphael (GIT MANUAL). Da S176 e dos lotes 1 e 2 de 04/09 fica só teste em
aparelho e deploy. S177 Parte A (Expo Go serve): com um listingChat com
mensagem não lida, a aba Conversas mostra o badge somado aos matches não
lidos; abrir a conversa zera e o badge some quando as duas contagens
zeram; o dot do card "Classificados" continua igual. S177 Parte B (build
26, DUAS contas em build com permissão de push concedida — conferir
`users/{uid}/private/push` no console): destinatário em background/
fechado → push "nickname + preview" chega e o toque abre a conversa; em
primeiro plano nada aparece (S122). S176 (build novo, sem
deploy): em Meus anúncios, toque longo no card ou ⋯ abre o sheet;
"Marcar como vendido" só em anúncio Aprovado → confirmação → selo
"Vendido", some do feed, "Editar" some; "Excluir anúncio" em qualquer
status (inclusive Expirado e Vendido) → confirmação avisando fotos/
anúncio somem e conversas continuam com "Anúncio encerrado" → anúncio
some de Meus anúncios e as fotos somem de `images/listings/{uid}/` no
Storage (só as daquele anúncio; as de outros anúncios do mesmo dono
ficam); "Renovar" continua inline em Expirado. No detalhe do próprio
anúncio: mesmos dois botões abaixo de "Editar anúncio", sucesso volta pra
Meus anúncios já atualizado; "Editar anúncio" não aparece em Vendido.
Interessado que abre o chat de um anúncio vendido/excluído vê "Anúncio
encerrado" (S168-B). S174 (depois do deploy da
function, em build novo, push só em build): usuário comum denuncia
(perfil, mensagem, anúncio ou chat de classificado) → os 2 admins
recebem "Nova denúncia para revisar" sem nenhum dado da denúncia e o
toque abre a aba Denúncias; denúncia feita por um admin → nenhum push;
2ª denúncia do mesmo anúncio pelo mesmo usuário → nenhum push (é update
negado, não create). S175: abrir `/excluir-conta`
depois do deploy e conferir os 3 itens novos. S172-A (depois do deploy
de rules, em build novo): editar um anúncio "Expirado" → volta pra "Em
análise" → admin aprova → fica "Aprovado" e NÃO expira na rodada das
09:00 seguinte (expiresAt = aprovação + 30d); recusar não muda o prazo.
S173 (depois
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
- Push: permissão negada uma vez não é re-solicitada nem há atalho pra
  Configurações do app; logout apaga `private/push` (achado da recon da
  S177, vale pra todo tipo de push) — decisão de produto pendente.
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
