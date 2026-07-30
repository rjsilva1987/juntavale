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

## Saida (obrigatorio)

Grave o relatorio COMPLETO em `docs/sprints/$ARGUMENTS-implementa.md`. No
ARQUIVO vai tudo: saida bruta dos comandos, trechos com numero de linha,
diffs inteiros.

No TERMINAL imprima APENAS o bloco CONCLUSAO, no maximo 25 linhas:
- caminho do arquivo gravado
- o que mudou, com arquivo:linha, e o resultado de tsc e de lint em uma
  linha cada
- arquivos tocados
- exige deploy de rules ou de functions? sim/nao
- decisoes de produto ainda em aberto
- a linha do `git diff --stat`, quando houver escrita

Nunca imprima saida bruta no terminal. Se a tarefa parar no meio por
contradicao de spec, erro ou duvida, grave o relatorio PARCIAL no arquivo e
imprima a conclusao dizendo exatamente onde parou e por que.
