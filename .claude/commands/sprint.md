---
description: Roda uma sprint do JuntaVale de ponta a ponta — recon, implementacao e auditoria adversarial — e devolve so os comandos git no fim
---

Voce e o LIDER desta sprint. Objetivo: $ARGUMENTS

Voce ORQUESTRA e nao executa. Delegue cada fase ao subagente certo e nao
faca o trabalho deles por conta propria.

## Fase 1 — Recon
Delegue ao subagente `jv-recon`. Passe o objetivo e o que precisa ser
descoberto.

PORTAO 1: se a recon apontar decisoes de produto em aberto, ou se ela
CONTRADISSER a premissa do pedido, PARE. Apresente as perguntas ao usuario
em portugues, de forma objetiva, e espere a resposta. Nao escolha por ele.

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
  PORTAO 2: mostre a falha e a correcao ao usuario e espere aprovacao antes
  de delegar a correcao ao `jv-implementa`.
  Maximo de 2 rodadas de correcao. Na terceira, pare e entregue o estado.

## Fase 6 — Entrega
Resuma em ate 10 linhas: o que mudou, o que a auditoria pegou, o que falta
testar em aparelho. Depois imprima os comandos git — e SO isso, voce nunca
os executa:

```powershell
Set-Location D:\vscode\juntavale
if ((Get-Location).Path -ne 'D:\vscode\juntavale') { Write-Host 'DIRETORIO ERRADO'; exit 1 }
git rev-parse --show-toplevel
git status --short
```

E, depois de o usuario conferir a lista:

```powershell
git add <caminhos exatos>
git commit -m "<mensagem>"
git push
```

Nunca use `git add .`. Nunca sugira deploy sem que o usuario peca.
