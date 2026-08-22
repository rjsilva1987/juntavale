# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 22/08/2026

---

## Como ler

- **ABERTA** — na fila, ainda não implementada
- **FECHADA** — implementada, auditada e commitada
- **DESCARTADA** — decidida como "não vamos fazer"

Sprint sem "Decisões" listadas ainda não teve decisão de produto tomada. Nesse
caso o agente **para e pergunta** em vez de escolher.

---

## Fila aberta

### S102-A — Chat, mensagem de áudio
**Status:** ABERTA · sem decisões · sem recon

Gravar e enviar mensagem de áudio — a mais cara de todas: gravação,
upload, storage e moderação de conteúdo que não dá pra buscar por texto.

### S121 — Momento de 24h
**Status:** ABERTA · decisões tomadas · sem recon

Story que expira: publica texto ou foto e some em 24h.

**Decisões:** audiência é a base inteira, não só matches.

### S123 — Curtir foto
**Status:** ABERTA · sem decisões · sem recon

Curtir a **foto**, não a pessoa, com contador na foto e notificação por
curtida (modelo Instagram). Em aberto se entra comentário junto.

Interage com S122: notificação por curtida é candidata a virar spam.

### S124 — Grupos / salas
**Status:** ABERTA · sem decisões · sem recon

Sala de conversa por tema (corrida, viagem, concurso) ou por instituição, pra
dar motivo de voltar ao app mesmo sem match.

**Custo alto:** modelo de dados novo + superfície de moderação nova.

### S125 — Eventos / encontros
**Status:** ABERTA · sem decisões · sem recon

Alguém marca um encontro (ex.: happy hour) e quem topa entra numa lista de
participantes. Mesmo custo de moderação da S124.

### S127 — Marcos e selos
**Status:** ABERTA · sem decisões · sem recon

Conquistas: "primeiro match", "perfil completo", "10 dias no app".

**Restrição obrigatória:** determinístico, **sem sorte**. Recompensa aleatória
obriga a refazer as respostas de jogos de azar dadas à Apple e pode empurrar a
classificação etária pra cima.

### S128 — Super Curtida diária
**Status:** ABERTA · sem decisões · sem recon

1 Super Curtida grátis por dia pra quem abriu o app. Recompensa por retorno,
não por sorte. Pressupõe que a Super Curtida seja escassa hoje — a recon
começa por confirmar isso.

### S129-B — Tiques estilo WhatsApp (entregue)
**Status:** ABERTA · sem decisões · sem recon

Tiques estilo WhatsApp: enviado / entregue / lido.

⚠️ **Reabre** a decisão do S86, que entregou só dois estados (um tique =
enviado, dois verdes = lido) e deixou o "entregue" de fora de propósito,
porque exigiria recibo por dispositivo.

---

## Fechadas recentemente

| Sprint | O que era |
|---|---|
| S132 | Enquete visível e votável fora do Descobrir — agora aparece também no perfil do match (MatchProfileScreen), não só no card do Descobrir (ProfileSheet) — commit `a326077`. Client puro. **Fechada em código, ainda SEM teste em aparelho.** |
| S102-B | Desfazer match de dentro da conversa — commit `5b6c49f`. Function `unmatch` (onCall, southamerica-east1) **já deployada em 21/08**. **Fechada em código, ainda SEM teste.** |
| S102-C | Denunciar mensagem específica do chat, reusando a fila de denúncias do admin (S96) — commit `825b56b`, 6 arquivos. `firestore.rules` **já deployadas em 21/08** (saída do deploy trouxe "uploading rules" e "released rules"). NENHUMA Cloud Function envolvida. **Fechada em código, SEM teste.** |
| S126 | Enquete no perfil — commit `d35b935`. `firestore.rules` e as duas functions novas (`onPollVoteCreated`, `onPollChanged`) **já deployadas em 21/08**. **Fechada em código, ainda SEM teste** (exceto push, que espera o build 15). |
| S101 | Paginação do chat — commits `91c734b` + `0710830` (fix: não marcar como lido quando a leitura da âncora falha). Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S122 | Push não chega mais com o app em primeiro plano — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S130 | Colar texto longo no chat (maxLength 2000 + "ler mais") — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S131 | X em "Suas curtidas" desfaz a curtida — commit `12a7220`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S129-A | Tocar na mensagem citada (`replyTo`) leva até a mensagem original — commit `7439afc`. Client puro. **Fechada em código, SEM teste em aparelho — bateria pendente do build 15.** |
| S120 | Foto obrigatória no cadastro |
| S103 | Painel de números do admin |
| S100 | Estado do Descobrir vazio |
| S98 | Bloqueio preventivo |
| S97 | Pausar perfil / modo invisível |
| S96 | Fila de denúncias no admin |

**S99 — DESCARTADA.** Era filtro de distância social (não mostrar quem é da
mesma agência/cidade). Decidido que não vamos fazer. Não repropor.

---

## Testes pendentes

Seção acumulativa: o que ainda falta testar, por onde dá pra testar.

**Testável no Expo Go agora:**

- S102-B — desfazer match de dentro da conversa; conferir o que acontece na
  tela do **outro** usuário que está com a conversa aberta na hora (risco de
  cair em `permission-denied` em vez de sair da tela); conferir se as
  imagens do chat sumiram do Storage.
- S102-C — denunciar uma mensagem específica do chat (long-press → Denunciar
  mensagem); conferir que a opção só aparece na mensagem do outro usuário e
  some em mensagem apagada.
- S102-C — denunciar uma mensagem de TEXTO: o registro chega na fila do
  admin com o trecho da mensagem, o motivo e o `details`.
- S102-C — denunciar uma mensagem com FOTO: a imagem aparece no detalhe do
  admin.
- S102-C — denunciar mensagem com mais de 400 caracteres: o client tem que
  truncar ANTES de enviar; se não truncar, as rules rejeitam e a denúncia
  falha em silêncio. É o ponto mais provável de quebra.
- S102-C — denúncia de PERFIL continua funcionando (S96 intacta): os 4
  campos novos são opcionais, o caminho antigo não pode ter regredido.
- S102-C — o admin consegue resolver a denúncia normalmente.
- S102-C — copy: o trecho da mensagem tem que aparecer como INFORMADO PELO
  DENUNCIANTE, nunca como transcrição verificada.
- S126 — criar enquete no ProfileScreen (2 a 4 opções), editar e remover;
  conferir que remover/editar zera `pollCounts` e apaga `pollVotes/*` de
  verdade (`onPollChanged`).
- S126 — votar a partir do Descobrir (ProfileSheet) com uma conta B, sem ter
  dado like antes; conferir que a contagem agregada sobe, sem nenhum jeito
  de descobrir quem votou (nem no Console, sem usar Admin SDK).
- S126 — votar duas vezes rápido (dois toques, ou dois devices/telas com a
  mesma conta) — conferir que o segundo toque não derruba a UI com Alert de
  erro (deve cair no ramo `permission-denied` = "já votou", ver
  `handleVotePoll`).
- S126 — perfil sem enquete: card "Enquete" no Descobrir simplesmente não
  aparece; ProfileScreen mostra só o botão "Criar enquete".
- S132 — abrir o perfil de um match com enquete ativa pelo MatchProfileScreen
  (fora do Descobrir); conferir que a enquete aparece e dá pra votar.
- S132 — no ProfileScreen (perfil do dono), conferir que a seção da enquete
  aparece ACIMA do slot "Prompt da semana".
- S132 — regressão: votar pela ProfileSheet/Descobrir (fluxo original da
  S126) continua funcionando.
- **Pré-condição pra qualquer teste de voto acima (S126 e S132):** perfil já
  curtido some do Descobrir, então com duas contas que já se curtiram não há
  de onde votar — precisa de uma terceira conta comum que nunca tenha
  swipado o dono da enquete. A conta admin não serve, a S95 tirou o
  Descobrir dela.

**Espera o build 15:**

- S101, S122, S129-A, S130, S131 (bateria a definir).
- S126 — dono recebe o push anônimo quando alguém vota na enquete; Expo Go
  não entrega push no SDK 54, precisa do build.

---

## Dívidas técnicas (não bloqueiam, sem sprint própria por enquanto)

- **S102-C** — `messageImageUrl` aceita qualquer string; a tela do admin
  renderiza como imagem, então o aparelho dele busca URL arbitrária
  fornecida por usuário. Fecha com
  `matches('https://firebasestorage\\.googleapis\\.com/.*')`.
- **S102-C** — `matchId` e `messageId` não têm limite de tamanho (`details`
  tem 2000, `messageText` tem 400, esses dois não têm nada).
- **S102-C** — `matchId`/`messageId` são texto livre sem vínculo com o
  denunciante: dá pra mandar `matchId` de conversa alheia ou inventado.
  Risco de moderação, não de segurança.
- **S132** — a enquete ficou acima do "Prompt da semana" (S50) na ordem do
  ProfileScreen; o push semanal de segunda 12h do S50 convida a responder o
  prompt, e esse convite deixou de ser o primeiro chamado à ação do perfil.
  Risco aceito ao fechar a sprint; revisitar se virar problema real.

---

## Decisões de produto que valem para o projeto inteiro

- Desfazer curtida ou super curtida **nunca devolve cota**.
- Ação destrutiva pede **confirmação** antes.
- Salvaguarda de segurança **falha fechada**: se a verificação não puder ser
  concluída, a ação arriscada não acontece.
- Nenhuma **tela** importa de `firebase/firestore` — quem traduz é o serviço.
- Erro não é engolido em silêncio; falha que o usuário causou, o usuário vê.
- A ficha das duas lojas promete "sem 'assine para ver quem curtiu você'" —
  nenhum modelo de monetização pode contradizer isso.

## Armadilhas do chat (valem pra qualquer sprint que mexa em ChatScreen/listenMessages)

- O corte da janela do listener tem que ser por **cursor** (`startAt` com
  `QueryDocumentSnapshot`), **nunca** por `where('createdAt','>=',Timestamp)`.
  Motivo: um `where` exige mesmo typeOrder, e mensagem recém-enviada tem
  `serverTimestamp` **pendente** (typeOrder 4) ≠ `Timestamp` concreto
  (typeOrder 3) — o eco otimista do próprio envio some da tela. Cursor usa
  outro caminho de comparação e inclui o pendente.
- `limitToLast` **exige** `orderBy` explícito no mesmo query, senão lança em
  runtime. O `tsc` não pega isso.
- A tela é reusada em deep link/notificação **sem desmontar** — toda função
  assíncrona precisa de guarda de cancelamento por `matchId`.
- O chat acumulou muita coisa que depende do histórico: reações (S80), tique
  de leitura (S86), `replyTo`, editar (S92), apagar (S85) e o "ler mais"
  (S130). Qualquer mudança na janela mexe com todas.
- Apagar o doc `matches/{matchId}` devolve `permission-denied` pro listener
  do **outro** usuário, não "documento inexistente" — toda tela que ouve um
  match tem que tratar `permission-denied` como "match desfeito" e sair,
  nunca como erro genérico.

## Padrões de escrita no Firestore (valem para o projeto inteiro)

- **Escrita create-only** (rule com `allow update: if false`, sem contar
  `deleteField()`/reset explícito de outra fonte) que falha com
  `permission-denied` numa corrida (dois toques, dois devices/telas
  simultâneos) **não é erro** — é sinal de que o estado já existe (swipe já
  registrado, voto já dado). O client trata como sucesso silencioso
  (estado otimista já está certo), **nunca** Alert genérico de erro. Padrão
  usado em `getSwipe`/`recordSwipe` (S49, MatchProfileScreen), `unmatch`
  (S102-B, apagar match) e `castPollVote` (S126, `pollVotes/{voterUid}`) —
  qualquer collection nova com o mesmo desenho (1 doc por par de uids,
  create-only) deve seguir o mesmo tratamento no catch.

## Baseline técnica

- `npx tsc --noEmit` → exit 0
- `npx eslint .` → **0 erros / 21 warnings**. Não pode piorar.

---

## Ideias sem número (não são sprint ainda)

Classificados / "OLX de funcionários" · feed "rádio corredor" · joguinho de
moedas · modelo de negócio. Todas levantadas em 17/08, nenhuma com decisão.
