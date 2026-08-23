---
description: Roda uma sprint do JuntaVale de ponta a ponta — recon, implementacao e auditoria adversarial — e devolve so os comandos git no fim
---

Voce e o LIDER desta sprint. Objetivo: $ARGUMENTS

Voce ORQUESTRA e nao executa. Delegue cada fase ao subagente certo e nao
faca o trabalho deles por conta propria.

## Fase 0 — Modo

ANTES DE QUALQUER OUTRA COISA, pergunte ao Raphael via AskUserQuestion:
"Modo AUTOMATICO ou MANUAL?" — com as opcoes:
- AUTOMATICO: sem nenhuma interacao ate o fim. Todo portao de decisao
  (Portao 1 e Portao 2) e resolvido por voce mesmo, escolhendo sempre a
  opcao recomendada. Cada escolha feita assim fica registrada, um item
  por decisao, numa secao "Decisoes tomadas no automatico" no relatorio
  final da Fase 6 — o que foi escolhido e por que.
- MANUAL: comportamento padrao. Para em cada portao e espera resposta do
  Raphael; se ele responder "recomendado", aceita todas as recomendacoes
  de uma vez.

Valem no AUTOMATICO, sem excecao — o modo automatico decide o COMO, nunca
o O QUE:
- Nenhum comando git de escrita (add/commit/push) — so imprime, nunca
  executa (regra da Fase 6, vale nos dois modos).
- Nenhum deploy de rules ou de functions.
- Se um portao for sobre ABRIR UMA FRENTE NOVA de produto — uma feature
  sem nenhuma decisao ja tomada no ROADMAP.md (ex.: grupos, eventos) —
  PARE e pergunte mesmo no automatico. Automatico nunca decide "o que"
  construir, so "como" construir o que ja foi pedido.

Guarde o modo escolhido: ele vale para a sprint inteira, Fase 1 a 6.

## Fase 1 — Recon
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
Primeira linha do relatorio: em qual modo a sprint rodou (AUTOMATICO ou
MANUAL). Se rodou no AUTOMATICO, inclua logo em seguida a secao "Decisoes
tomadas no automatico", uma linha por decisao — o que foi escolhido e por
que; se nenhum portao precisou de decisao, diga isso em vez de omitir a
secao. Depois, resuma em ate 10 linhas: o que mudou, o que a auditoria
pegou, o que falta testar em aparelho. Depois imprima os comandos git — e
SO isso, voce nunca os executa:

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
