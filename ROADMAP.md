# Roadmap do JuntaVale

Arquivo de referência para quem (pessoa ou agente) precisa saber o que é uma
sprint pelo número. Atualizado à mão quando uma sprint fecha ou uma decisão
de produto muda.

**Última atualização:** 21/08/2026

---

## Como ler

- **ABERTA** — na fila, ainda não implementada
- **FECHADA** — implementada, auditada e commitada
- **DESCARTADA** — decidida como "não vamos fazer"

Sprint sem "Decisões" listadas ainda não teve decisão de produto tomada. Nesse
caso o agente **para e pergunta** em vez de escolher.

---

## Fila aberta

### S102 — Chat, três partes
**Status:** ABERTA · sem decisões · sem recon

- **A)** gravar e enviar mensagem de áudio
- **B)** desfazer o match de dentro da própria conversa
- **C)** denunciar uma **mensagem** específica (hoje a denúncia é do perfil
  inteiro, via S96)

A parte A é a mais cara de todas: gravação, upload, storage e moderação de
conteúdo que não dá pra buscar por texto.

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

### S126 — Enquete no perfil
**Status:** ABERTA · sem decisões · sem recon

Pergunta no perfil respondida direto do card do Descobrir, sem precisar
curtir. Barata: se pendura em estruturas que já existem.

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

## Baseline técnica

- `npx tsc --noEmit` → exit 0
- `npx eslint .` → **0 erros / 21 warnings**. Não pode piorar.

---

## Ideias sem número (não são sprint ainda)

Classificados / "OLX de funcionários" · feed "rádio corredor" · joguinho de
moedas · modelo de negócio. Todas levantadas em 17/08, nenhuma com decisão.
