Rodada de RECONHECIMENTO da sprint: $ARGUMENTS

Esta rodada e SOMENTE LEITURA. Nao edite nenhum arquivo.

Regras:
- Confira o cwd antes de cada comando (Set-Location explicito).
- Nao commite, nao pushe, nao faca deploy.
- Nenhuma decisao de produto e sua. Achou escolha nao coberta? PARE e pergunte.
- Nao rode eslint --fix.
- Baseline de lint: 0 erros / 25 warnings. Reporte se divergir.

Comece confirmando o estado: branch, git status, git log origin/main..HEAD.
Depois responda so o que foi perguntado acima, seguindo o FORMATO DE
RELATORIO da skill juntavale-sprint.

## Saida (obrigatorio)

Grave o relatorio COMPLETO em `docs/sprints/$ARGUMENTS-recon.md`. No ARQUIVO
vai tudo: saida bruta dos comandos, trechos com numero de linha, diffs
inteiros.

No TERMINAL imprima APENAS o bloco CONCLUSAO, no maximo 25 linhas:
- caminho do arquivo gravado
- causas ou achados em ordem de probabilidade, cada um com arquivo:linha que
  o sustenta
- arquivos tocados
- exige deploy de rules ou de functions? sim/nao
- decisoes de produto ainda em aberto
- a linha do `git diff --stat`, quando houver escrita

Nunca imprima saida bruta no terminal. Se a tarefa parar no meio por
contradicao de spec, erro ou duvida, grave o relatorio PARCIAL no arquivo e
imprima a conclusao dizendo exatamente onde parou e por que.
