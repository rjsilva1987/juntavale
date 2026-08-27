---
description: Roda uma sprint do JuntaVale de ponta a ponta — recon, implementacao e auditoria adversarial — e devolve so os comandos git no fim
---

Voce e o LIDER desta sprint. Objetivo: $ARGUMENTS

Voce ORQUESTRA e nao executa. Delegue cada fase ao subagente certo e nao
faca o trabalho deles por conta propria.

## Fase 0 — Modo

ANTES DE QUALQUER OUTRA COISA, verifique se `$ARGUMENTS` comeca com
`lote --commit` seguido de uma lista de sprints (`S<NN> S<NN> ...`). Se
sim, isso e o MODO LOTE — pule as duas perguntas abaixo (o modo lote fixa
os dois eixos de uma vez, sempre, por definicao: decisao = AUTOMATICO,
git = GIT AUTOMATICO) e va direto pra secao "Modo LOTE", logo apos esta,
que substitui as Fases 0 a 6 por sprint da lista, em sequencia. Se nao,
pergunte ao Raphael via AskUserQuestion, as duas perguntas abaixo na
MESMA chamada:

Pergunta 1 — "Modo AUTOMATICO ou MANUAL?" — com as opcoes:
- AUTOMATICO: sem nenhuma interacao ate o fim. Todo portao de decisao
  (Portao 1 e Portao 2) e resolvido por voce mesmo, escolhendo sempre a
  opcao recomendada. Cada escolha feita assim fica registrada, um item
  por decisao, numa secao "Decisoes tomadas no automatico" no relatorio
  final da Fase 6 — o que foi escolhido e por que.
- MANUAL: comportamento padrao. Para em cada portao e espera resposta do
  Raphael; se ele responder "recomendado", aceita todas as recomendacoes
  de uma vez.

Pergunta 2 — "Git MANUAL ou AUTOMATICO?" — com as opcoes:
- GIT MANUAL: comportamento padrao (o de hoje). A Fase 6 so imprime o
  bloco de comandos git; o Raphael roda a mao.
- GIT AUTOMATICO: voce mesmo roda `git add <caminhos exatos>`/`commit`/
  `push` da sprint, so depois do veredito APROVADO da Fase 5 daquela
  sprint — mesma excecao que hoje so existia no modo lote, agora tambem
  pra sprint avulsa. Nunca `reset`/`checkout`/`restore`/`revert`/`stash`.
  Nunca deploy. Subagentes continuam proibidos de git de escrita nesse
  modo tambem — a excecao e so do orquestrador.

Valem no AUTOMATICO (eixo de decisao), sem excecao — o modo automatico
decide o COMO, nunca o O QUE:
- Se um portao for sobre ABRIR UMA FRENTE NOVA de produto — uma feature
  sem nenhuma decisao ja tomada no ROADMAP.md (ex.: grupos, eventos) —
  PARE e pergunte mesmo no automatico. Automatico nunca decide "o que"
  construir, so "como" construir o que ja foi pedido.

O eixo de git (Pergunta 2) e independente do eixo de decisao (Pergunta
1): o comportamento de git na Fase 6 segue o que foi escolhido na
Pergunta 2 (ou herdado do lote), nao o que foi escolhido na Pergunta 1.
Deploy continua proibido sempre, nos dois modos de git (Regras
invariantes do CLAUDE.md, item 2).

Guarde os dois modos escolhidos (decisao e git): valem para a sprint
inteira, Fase 1 a 6.

## Modo LOTE (`lote --commit S<NN> S<NN> ...`)

Só ativa com essa sintaxe exata em `$ARGUMENTS`. Fora dela, `/sprint` segue
100% como hoje — sem excecao alguma ao item 2 do CLAUDE.md.

Processe cada `S<NN>` da lista, EM SEQUENCIA. Cada uma roda o ciclo inteiro
(Fase 0-B a Fase 6) com os dois eixos fixos: decisao = AUTOMATICO, git =
GIT AUTOMATICO — as duas perguntas da Fase 0 nao se repetem, os dois
modos ja estao decididos pra lista toda; a flag `lote --commit` e o
atalho que fixa os dois de uma vez. O objetivo de cada sprint da lista e
o que ja esta registrado pra ela no ROADMAP.md/ESTADO.md; se faltar spec
suficiente pra rodar sem uma decisao de produto nova, cai na mesma guarda
de "frente nova" de baixo.

Guardas do modo lote — somam-se a tudo que ja vale no automatico, nunca
substituem:

- **Commit e push so depois de auditoria APROVADA daquela sprint.** Ao
  final da Fase 5 de cada sprint da lista, se o veredito for APROVADO,
  antes de commitar faca os dois passos obrigatorios da Fase 6 (reescrever
  o status no ROADMAP.md e atualizar o ESTADO.md) e so entao rode, voce
  mesmo — esta e uma das duas portas de entrada da excecao ao item 2 do
  CLAUDE.md (a outra e GIT AUTOMATICO avulso, Fase 0), escopo exato:
  `add`/`commit`/`push`, nunca `reset`/`checkout`/`restore`/`revert`/
  `stash`, nunca deploy:
  ```powershell
  $root = git rev-parse --show-toplevel 2>$null
  if ($root -match 'juntavale$') {
    Set-Location $root
    git add <caminhos exatos da sprint, incluindo ROADMAP.md e ESTADO.md quando fizerem parte>
    git commit -m "<tipo>(<escopo>): <resumo> (S<NN>)"
    git push
  } else { Write-Host 'nao estamos no repo do juntavale' }
  ```
  Nunca `git add .`. So depois disso passe pra proxima sprint da lista.
- **Auditoria bloqueada sem correcao possivel → PARA O LOTE INTEIRO.** Isso
  cobre: bloqueio na 3ª rodada (limite de correcao da Fase 5), ou qualquer
  bloqueio cuja correcao proposta voce mesmo nao conseguiu validar contra
  o codigo real. Nao pule pra proxima sprint da lista nem commite o que
  ficou bloqueado — pare o lote nesse ponto e reporte quais sprints da
  lista ja foram commitadas com sucesso e qual ficou pendente, com o
  motivo do bloqueio.
- **Portao de decisao de produto nova → PARA O LOTE e pergunta**, do mesmo
  jeito que no automatico fora do lote (Fase 0 / Portao 1 / Portao 2). Nao
  escolha por conta, nem pule so essa sprint da lista — pare o lote
  inteiro nesse ponto e reporte o que ja foi commitado ate ali.
- **Deploy continua proibido sempre**, no lote ou fora dele — rules,
  functions, hosting, indexes. Se alguma sprint da lista tocar algum
  desses, acumule o nome da sprint e o que precisa de deploy numa lista;
  nunca deploye. Essa lista acumulada entra inteira no relatorio final do
  lote.
- **Fora do modo lote, git de escrita segue o modo de git da Pergunta 2 da
  Fase 0 daquela sprint** — GIT MANUAL imprime os comandos git no fim
  (Fase 6 normal) e NUNCA os executa; GIT AUTOMATICO avulso e a sintaxe
  exata `lote --commit S<NN> ...` sao as duas portas de entrada
  equivalentes da mesma excecao, cada uma com as mesmas guardas (add/
  commit/push apos auditoria aprovada, nunca `git add .`, nunca reset/
  checkout/restore/revert/stash, nunca deploy).

Ao terminar — todas as sprints da lista commitadas, ou parado numa
guarda — produza UM relatorio final cobrindo o lote inteiro, entre
`=== COPIAR A PARTIR DAQUI ===` e `=== FIM ===` (item 6 do CLAUDE.md):
- uma linha por sprint da lista: commitada (com o hash curto do
  `git commit`) ou parada (com o motivo exato);
- lista acumulada de deploys pendentes (rules/functions/hosting/indexes),
  sprint a sprint, ou "nenhum" se nao houve;
- "Decisoes tomadas no automatico", uma por decisao que algum portao
  precisou resolver sozinho, em qualquer sprint da lista, ou "nenhuma".

## Fase 0-B — Trilha

Classifique a sprint ANTES de decidir se delega ao `jv-recon`:
- **Trilha P** (pequena): mudanca estimada ate ~15 linhas, sem tocar
  `firestore.rules`, sem Cloud Function nova ou alterada, sem fluxo de
  dados novo. PULA a Fase 1 (`jv-recon`) e vai direto pra Fase 2 com o
  que ja se sabe do pedido. `jv-implementa` e `jv-audita` continuam
  normais — a auditoria segue adversarial do mesmo jeito.
- **Trilha completa**: qualquer coisa que nao se encaixe acima. Segue a
  Fase 1 normalmente.

- MANUAL: proponha a trilha escolhida e espere confirmacao do Raphael
  antes de seguir.
- AUTOMATICO: decida sozinho; na duvida entre P e completa, suba pra
  completa e registre a escolha em "Decisoes tomadas no automatico"
  (Fase 6).

## Fase 1 — Recon
SO na trilha completa (ver Fase 0-B) — trilha P pula direto pra Fase 2.
Delegue ao subagente `jv-recon`. Passe o objetivo e o que precisa ser
descoberto.

PORTAO 1: se a recon apontar decisoes de produto em aberto, ou se ela
CONTRADISSER a premissa do pedido, trate assim:
- MANUAL: PARE. Apresente TODAS as decisoes em aberto de uma vez so,
  numeradas, cada uma com as opcoes e UMA marcada "(recomendado)" com uma
  linha de justificativa — nunca uma pergunta por rodada. Aceite como
  resposta valida tanto as escolhas item a item quanto a palavra
  "recomendado" sozinha, que vale como sim para todas as recomendacoes.
  Nao escolha por ele.
- AUTOMATICO: se alguma das decisoes em aberto for sobre abrir uma frente
  nova de produto (ver Fase 0), PARE e pergunte do mesmo jeito que no
  MANUAL — so essa. Todas as demais decisoes, resolva sozinho escolhendo
  sempre a opcao recomendada, e registre cada uma (o que foi escolhido e
  por que) para a secao "Decisoes tomadas no automatico" da Fase 6.

## Fase 2 — Spec
Com a recon e as respostas do usuario, escreva a spec de implementacao:
escopo exato, arquivos, comportamento esperado, o que NAO tocar, validacao.
Guarde essa spec — ela e usada de novo na Fase 4, sem alteracao.

## Fase 3 — Implementacao
Delegue ao subagente `jv-implementa`, passando a spec.

## Fase 4 — Auditoria
Delegue ao subagente `jv-audita`.

REGRA CRITICA DESTA FASE: passe pra ele APENAS a spec da Fase 2 e a lista de
arquivos tocados. NUNCA repasse o relatorio do implementador, o raciocinio
dele, as justificativas dele, nem as decisoes que ele disse ter tomado
sozinho. Se voce vazar isso, a auditoria vira teatro — ela so tem valor
porque o auditor chega no codigo sem saber o que o autor pensou.

## Fase 5 — Veredito
- APROVADO: siga pra Fase 6.
- BLOQUEADO: antes de mandar corrigir, VERIFIQUE VOCE MESMO se o mecanismo
  da correcao proposta procede no codigo real. Auditor tambem erra: uma
  correcao pode ser plausivel e mesmo assim nao funcionar por causa de algo
  que so a recon sabia.
  PORTAO 2: mostre a falha e a correcao proposta.
  - MANUAL: espere aprovacao do Raphael antes de delegar a correcao ao
    `jv-implementa`.
  - AUTOMATICO: siga direto para a correcao, a menos que ela mesma abra
    uma frente nova de produto (ver Fase 0) — nesse caso PARE e pergunte
    do mesmo jeito que no MANUAL. Se seguiu direto, registre a decisao na
    secao "Decisoes tomadas no automatico" da Fase 6.
  Maximo de 2 rodadas de correcao. Na terceira, pare e entregue o estado,
  nos dois modos.

## Fase 6 — Entrega
Tres ramos, pelo modo de git decidido na Fase 0 (ou herdado do lote):

- **NO MODO LOTE**: sem mudanca de comportamento — o commit/push de cada
  sprint ja acontece dentro do proprio loop (ver secao "Modo LOTE").
- **GIT AUTOMATICO fora do lote**: depois do veredito APROVADO da Fase 5,
  faca os dois passos obrigatorios abaixo (reescrever o Status no
  ROADMAP.md, atualizar o ESTADO.md) e SO ENTAO rode, voce mesmo, o
  mirror do bloco git do modo lote — adaptado pra uma sprint so:
  ```powershell
  $root = git rev-parse --show-toplevel 2>$null
  if ($root -match 'juntavale$') {
    Set-Location $root
    git add <caminhos exatos da sprint, incluindo ROADMAP.md e ESTADO.md quando fizerem parte>
    git commit -m "<tipo>(<escopo>): <resumo> (S<NN>)"
    git push
  } else { Write-Host 'nao estamos no repo do juntavale' }
  ```
  Mesmas restricoes: nunca `git add .`, nunca `reset`/`checkout`/
  `restore`/`revert`/`stash`, nunca deploy. O relatorio desta fase
  (formato de sempre, entre os marcadores de copia) continua obrigatorio
  mesmo quando o git roda de verdade.
- **GIT MANUAL fora do lote** (padrao, comportamento de hoje): os passos
  abaixo, incluindo o bloco de comandos git impresso (nunca executado),
  valem integralmente.

Tudo desta fase, do inicio ao fim do bloco de comandos git, vai entre
`=== COPIAR A PARTIR DAQUI ===` e `=== FIM ===` (Regras invariantes do
CLAUDE.md, item 6), pra ficar facil de colar em outro lugar.

Primeira linha do relatorio: em quais modos a sprint rodou — decisao
(AUTOMATICO ou MANUAL) e git (GIT AUTOMATICO ou GIT MANUAL). Se rodou no
AUTOMATICO (decisao), inclua logo em seguida a secao "Decisoes tomadas no
automatico", uma linha por decisao — o que foi escolhido e por que; se
nenhum portao precisou de decisao, diga isso em vez de omitir a secao.
Depois, resuma em ate 10 linhas: o que mudou, o que a auditoria pegou, o
que falta testar em aparelho.

PASSO OBRIGATORIO — REESCREVER O STATUS NO ROADMAP.md: antes de imprimir
OU RODAR qualquer comando git, reescreva a linha **Status:** da sprint no
ROADMAP.md para o estado FINAL. Isso vale sempre, inclusive quando a
sprint terminou sem alterar codigo (caso "nada a fazer") — nao pule este
passo so porque nao houve implementacao. O status final deve conter,
quando aplicavel:
- IMPLEMENTADA (ou FECHADA, ou ENCERRADA SEM ALTERACAO) e a data;
- se exige deploy de rules/functions e o nome das functions afetadas, ou
  se e client puro e nao exige deploy;
- se ja foi testada em aparelho ou nao — o padrao e "SEM teste em
  aparelho", ja que o /sprint nunca testa.
O status NAO pode ficar descrevendo uma fase intermediaria ("aguardando
auditoria", "EM CORRECAO", "fix aplicado, nao deployado") depois que a
sprint terminou — estados intermediarios so valem ENQUANTO a sprint esta
rodando. Essa reescrita e so uma edicao de arquivo: nao e um commit, nao e
git de escrita por si so — ela entra no `git add` do bloco de comandos
abaixo (impresso em GIT MANUAL, rodado por voce mesmo em GIT AUTOMATICO),
junto com o resto da sprint.

PASSO OBRIGATORIO — ATUALIZAR `docs/sprints/ESTADO.md`: logo depois de
reescrever o status no ROADMAP.md, atualize o ESTADO.md substituindo as
linhas que mudaram (sprint que fechou sai de "em andamento", pendencia
resolvida sai da lista, commit atual atualiza) — nunca acumule, o arquivo
fica curto (ver "Estado do projeto" no CLAUDE.md). Tambem entra no
`git add` do bloco abaixo.

Em GIT MANUAL fora do lote, depois imprima os comandos git — e SO isso,
voce nunca os executa:

```powershell
$root = git rev-parse --show-toplevel 2>$null
if ($root -match 'juntavale$') {
  Set-Location $root
  Write-Host $root
  git status --short
} else { Write-Host 'nao estamos no repo do juntavale' }
```

E, depois de o usuario conferir a lista:

```powershell
$root = git rev-parse --show-toplevel 2>$null
if ($root -match 'juntavale$') {
  Set-Location $root
  git add <caminhos exatos, incluindo ROADMAP.md quando ele fizer parte da sprint>
  git commit -m "<mensagem>"
  git push
} else { Write-Host 'nao estamos no repo do juntavale' }
```

Nunca use `git add .`. Nunca use `break` nem `exit` no meio do bloco: em
bloco colado no PowerShell cada linha e um comando independente e a trava
nao interrompe as seguintes. Nunca fixe caminho de maquina no comando — o
Raphael alterna entre duas maquinas com caminhos diferentes, o repo se
descobre pelo `git rev-parse --show-toplevel`. Nunca sugira deploy sem que
o usuario peca.
