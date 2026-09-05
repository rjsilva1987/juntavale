# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 05/09/2026
**Commit atual:** S182-E (avulsa, 05/09/2026, AUTOMATICO + GIT AUTOMATICO:
selo oficial do Google Play + placeholder da App Store na landing, só
site; não existe S182-D), sobre S182-C 718de66 (landing com bloco de
download no lugar do teste fechado), S182-B d247081 (link "Ajuda" no
rodapé das 9 páginas de `site/`), S182-A 2513d01 (item "Excluir a conta"
da ajuda fiel à deleteAccount), S182 344b673 (`site/ajuda.html` + item
"Ajuda" no Perfil, suporte renomeado "Suporte") e 35367fb (chore: bump
build 26, 05/09/2026) —
lote 3 de 04/09/2026 (AUTOMATICO + GIT AUTOMATICO) FECHADO: S179 4c2f136
→ S178 ab64539 → S181 fef8e23 → S180-A 573d140 → S180-B cea536b.
Lote 2 (S175 672b102 → S172-A
a716da1 → S174 f0dda02) e lote 1 (S171 0184688 → S168-B2 5fa69ed → S172
cc60168 → S173 88885eb → S168-C 9bfa568) fechados; S176 (4bc25fa) e
S177 (190867c) avulsas fechadas.

**Deploys:** tudo que estava acumulado até a S177 (rules stamp S172-A,
storage stamp S168-B2, indexes, hosting, functions onListingSubmitted/
onVerificationSubmitted/onSupportMessageCreated/expireListings/
deleteAccount/onReportCreated/onListingChatMessageCreated) foi deployado
em 04/09/2026 — rules ativas conferidas idênticas ao repo (S179). Lote 3
deployado em 05/09/2026 com sucesso: `firestore:rules` (stamp S180-B, que
engloba o S178 — "released rules"), `functions:deleteAccount`
("Successful update operation") e `functions:adminDeleteContent`
("Successful create operation"). Deploys pendentes: HOSTING (S182 +
S182-A + S182-B + S182-C + S182-E, `site/ajuda.html` novo com o item
"Excluir a conta" já ajustado, link "Ajuda" no rodapé das 9 páginas e a
landing com os selos de loja, incluindo o arquivo novo
`site/badge-google-play.png` — `firebase deploy --only hosting`; depois
conferir https://juntavale.com.br (selo do Google Play abre a Play,
botão "Em breve na App Store" sem link, WhatsApp igual) e /ajuda). Sem
rules, sem functions, sem índice novo, sem storage.

**Build 26 (bump feito, build NÃO gerado):** acumula o lado client de S177 Parte A (badge),
S179 (chat de classificado sem Alert falso na 1ª mensagem), S178 (fixar
até 3 conversas no topo), S181 (item "Notificações" no Perfil +
re-registro do token no foreground), S180-A (evento cancelado some do
Explorar e mostra "Evento cancelado") e S180-B (aba "Comunidade" do
admin, "Todos" em Classificados com Remover/Excluir, grupo encerrado em
modo leitura). Bump em `app.json` commitado em 35367fb (05/09/2026):
versionCode 25→26, iOS buildNumber 5→6, version 1.0.15 sem mudança.
Falta `eas build` Android + iOS. A S182 (commitada DEPOIS do bump) NÃO
entra no build 26.

**Build 27 (sem bump ainda):** acumula o lado client da S182 — item
"Ajuda" no Perfil (abre juntavale.com.br/ajuda) e item/tela de suporte
renomeados "Suporte".

## Sprints em andamento
Nenhuma. S182, S182-A, S182-B, S182-C e S182-E fechadas em 05/09/2026;
fica o deploy de hosting (acima) e teste: home no celular e no desktop
(o selo do Google carrega e abre a Play, o botão da App Store alinha com
o selo e não clica, a fileira empilha abaixo de 620px), página de ajuda
(índice, âncoras, logo, footer com "Ajuda" em todas as páginas e "· Feito
no Brasil" na ajuda, item "Excluir a conta" com o texto novo) e,
no build 27, Perfil → "Ajuda" abre a página no navegador, "Suporte" abre
o formulário com header "Suporte", admin não vê nenhum dos dois. Lote 3
de 04/09/2026 fechado e deployado em 05/09/2026; fica só
teste em aparelho. S180-B (depois do deploy de rules + function, conta admin):
aba "Comunidade" (6ª, sem badge) só pro admin; Grupos → "⋯" → "Encerrar
grupo" → some do Explorar de outra conta, "Encerrado" em Meus grupos do
membro, chat com banner e sem composer, mensagens antigas continuam
legíveis, mandar mensagem por fora nega no servidor; "Excluir grupo" →
doc + messages + fotos somem; Eventos → "Cancelar evento" (só futuro) →
"Evento cancelado" pra quem confirmou e some do Explorar; "Excluir
evento" apaga; Classificados → "Todos" → pill de status, "Remover" tira
do feed sem apagar foto, "Excluir" apaga anúncio + fotos e a conversa
antiga mostra "Anúncio encerrado"; toque em pendente abre
AdminListingDetail, nos demais ListingDetail; limpar "Grupo 02" e
"Corridinha" (órfãos) por aqui. S180-A
(depois do deploy de `functions:deleteAccount`, conta de teste): grupo só
com a conta some com fotos; grupo com outro membro passa `creatorId` e
`role: 'creator'` pro membro mais antigo com `memberCount` coerente;
grupo de outro perde o membro e o contador cai 1; evento futuro criado
vira `cancelled` (quem confirmou vê "Evento cancelado" sem botões, some
do Explorar), passado fica; presença em evento de outro some com
`participantCount` coerente. Causa dos grupos órfãos ("Grupo 02"/"Corridinha",
creatorId CzC7c1yb…): a exclusão dessa conta em 03/09 19:33 UTC rodou uma
versão ANTIGA do deleteAccount, sem os blocos de momento/grupos/eventos
(logs); o código com esses blocos só foi deployado em 04/09 12:21. Os
dois grupos ficam pra limpeza pela área do admin (S180-B). Das sprints
anteriores fica só teste em aparelho:

S181 (build 26, aparelho real): negar a permissão no 1º prompt → Perfil
mostra "Notificações desativadas" → toque → "Ativar nas configurações"
abre as Configurações → ativar → voltar → "Notificações ativadas" e
`users/{uid}/private/push` ganha `token` sem prompt novo; logout + login
com permissão concedida grava o token sem prompt; nada reabre o diálogo
em 'denied'. S178 (Expo Go, depois do deploy das rules): toque longo num card de
"Mensagens" → sheet → "Fixar conversa" → card sobe pro topo com alfinete;
fixar 3 e tentar a 4ª → Alert "Você pode fixar até 3 conversas";
"Desafixar" volta pra ordem por última mensagem; desfazer match fixado →
o id some de `users/{uid}.pinnedMatchIds`; bloquear o outro lado de uma
fixada → o id continua e a conversa volta fixada ao desbloquear. S179
(Expo Go serve, 2 contas verificadas): "Tenho interesse" → tela
vazia sem Alert → 1ª mensagem (texto; e foto como 1ª mensagem em outro
anúncio) → nenhum Alert, mensagem aparece e a conversa segue; o outro
lado de uma conta apagada (S173) ainda vê "Conversa indisponível (erro:
permission-denied)". S177 Parte A (Expo Go serve): com um listingChat com
mensagem não lida, a aba Conversas mostra o badge somado aos matches não
lidos; abrir a conversa zera e o badge some quando as duas contagens
zeram; o dot do card "Classificados" continua igual. S177 Parte B (build
26, DUAS contas em build com permissão de push concedida — conferir
`users/{uid}/private/push` no console): destinatário em background/
fechado → push "nickname + preview" chega e o toque abre a conversa; em
primeiro plano nada aparece (S122). S176 (build 25): em Meus anúncios,
toque longo no card ou ⋯ abre o sheet; "Marcar como vendido" só em
anúncio Aprovado → confirmação → selo "Vendido", some do feed, "Editar"
some; "Excluir anúncio" em qualquer status (inclusive Expirado e Vendido)
→ confirmação avisando fotos/anúncio somem e conversas continuam com
"Anúncio encerrado" → anúncio some de Meus anúncios e as fotos somem de
`images/listings/{uid}/` no Storage (só as daquele anúncio); "Renovar"
continua inline em Expirado. No detalhe do próprio anúncio: mesmos dois
botões abaixo de "Editar anúncio", sucesso volta pra Meus anúncios já
atualizado; "Editar anúncio" não aparece em Vendido. Interessado que abre
o chat de um anúncio vendido/excluído vê "Anúncio encerrado" (S168-B).
S174 (build com push): usuário comum denuncia (perfil, mensagem, anúncio
ou chat de classificado) → os 2 admins recebem "Nova denúncia para
revisar" sem nenhum dado da denúncia e o toque abre a aba Denúncias;
denúncia feita por um admin → nenhum push; 2ª denúncia do mesmo anúncio
pelo mesmo usuário → nenhum push. S175: abrir `/excluir-conta` e conferir
os 3 itens novos. S172-A: editar um anúncio "Expirado" → volta pra "Em
análise" → admin aprova → fica "Aprovado" e NÃO expira na rodada das
09:00 seguinte (expiresAt = aprovação + 30d); recusar não muda o prazo.
S173: com uma conta de teste que tem anúncio com foto e um chat de
classificado nos dois papéis, excluir a conta → anúncio some do feed e de
`listings`, `images/listings/{uid}` vazio, `listingChats` do uid apagados
com `messages` e fotos, o outro participante recebe "conversa
indisponível" ao abrir; denúncias antigas continuam no painel do admin.
S172 (build com push): anúncio approved com `expiresAt` no passado → na
rodada das 09:00 vira "Expirado" em Meus anúncios, some do feed, dono
recebe "Um anúncio seu expirou. Toque para renovar." e o toque abre Meus
anúncios; "Renovar" (1 toque) volta pra "Aprovado" com +30 dias SEM fila
do admin; editar um expirado volta pra "Em análise"; interessado que abre
o chat de um expirado vê "Anúncio encerrado". S171: Classificados abre em
"Todos os estados", o campo abre o seletor de UF e o feed corta pela UF;
ao sair e voltar o filtro reseta. S168-B2 (push só em build): denunciar
um anúncio de outra pessoa (bandeira no header, 5 motivos próprios) →
"Denúncia enviada"; denunciar de novo → "Denúncia já enviada"; denunciar
a pessoa dentro do chat de classificado → idem; como admin, a lista de
Denúncias mostra o tipo e "Abrir anúncio ›"/"Abrir conversa ›" abrem o
anúncio e o chat em modo leitura; toque no link NÃO abre também o detalhe
da denúncia; verificação/chamado/anúncio novo → push nos 2 admins. S158,
S159 e S160 seguem só com teste em aparelho pendente — a S160 precisa
reproduzir os 3 sintomas de novo e, se o sumiço de mensagem persistir,
rodar o triage do Firestore (ROADMAP.md § S160). S167: toque longo abre
o sheet (texto/imagem/localização) e reagir/responder/copiar/editar/
apagar/denunciar, "ler mais" e arrastar-pra-responder funcionam, no 1:1
e no grupo. S168-A: criar anúncio (pending), aprovar/recusar como admin,
edição volta pra pending, marcar vendido/excluir, gate de não verificado.
S169: como admin, a aba "Classificados" aparece entre Denúncias e Perfil
com badge = anúncios pending, a fila carrega e abre o detalhe, o badge
cai ao aprovar/recusar, o botão "Classificados pendentes" sumiu do
Perfil; se a fila falhar, o EmptyState mostra `erro: <code>`. S170
(build com push): criar anúncio como verificado → admin recebe "Novo
anúncio para aprovar"; toque abre a aba Classificados; editar anúncio
aprovado → push "editou um anúncio"; pendente → nenhum push; aprovar/
recusar → nenhum push. S168-B (push só em build): com 2 contas
verificadas, abrir um anúncio aprovado de outra pessoa → "Tenho
interesse" aparece (some no próprio anúncio, em vendido/expirado e pra
não verificado) → 1ª mensagem cria `listingChats/{listingId}_{uid}` e
aparece nos dois lados; dono vê "1 conversa" em Meus anúncios; os dois
veem o card "Classificados" na aba Conversas com dot até abrir; foto
como 1ª mensagem (S168-B1), responder, copiar, "ler mais" e apagar pra
todos (1h) funcionam; vendido/excluído → banner "Anúncio encerrado" e a
conversa continua; push da mensagem chega pro outro lado e o toque abre
a conversa; app em primeiro plano não mostra banner (S122).

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
- S182-C — `testerSignups` (bloco nas rules) e `onTesterSignupCreated`
  (`functions/src/admin.ts`) ficaram órfãos: a landing não grava mais
  cadastro de testador. Remover numa sprint própria (deploy de rules +
  functions).

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
