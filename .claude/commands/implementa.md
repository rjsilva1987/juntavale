Rodada de IMPLEMENTACAO da sprint: $ARGUMENTS

Regras:
- Confira o cwd antes de cada comando (Set-Location explicito).
- Nao commite, nao pushe, nao faca deploy. A execucao disso e do Raphael.
- Nenhuma decisao de produto e sua. A spec te deu duas opcoes ou se
  contradisse? PARE e pergunte — nao escolha por conta.
- Nao rode eslint --fix em arquivo inteiro; formatacao se corrige editando
  a linha.
- Baseline de lint: 0 erros / 25 warnings. Nao pode piorar.
- Toda edicao precisa de PROVA DE ESCRITA: grep/Select-String no arquivo
  depois de editar, com a linha nova em bruto. Relatorio sem prova e
  rejeitado — isso nunca e cortado por economia.
- Se a sprint tocar firestore.rules, atualize o carimbo de versao no topo.

Validacoes obrigatorias ao final: tsc, eslint, git status, git diff --stat,
e diff vazio comprovado em tudo que a sprint NAO deveria tocar.
Siga o FORMATO DE RELATORIO da skill juntavale-sprint.
