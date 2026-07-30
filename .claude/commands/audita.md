Rodada de AUDITORIA do que ja esta na working tree: $ARGUMENTS

Esta rodada e SOMENTE LEITURA. Nao edite nada — nem o menor ajuste de
formatacao. Achou problema? REPORTE, nao conserte.

Cheque, no minimo:
- Escopo: git status e git diff --stat batem exatamente com o esperado?
  Diff vazio no que nao deveria ser tocado?
- Divergencia silenciosa: condicoes de render, comparacoes e props mudaram
  de forma que o tsc nao pega? Compare com o baseline (git show HEAD:arquivo).
- Codigo orfao: import, estado, estilo ou helper que ficou sem uso depois
  da mudanca. Prove com grep, um por um.
- Duplicacao: estilo ou constante que passou a existir em dois lugares.
- tsc e eslint contra a baseline.

Termine com uma avaliacao explicita: pronto pra commit, ou tem pendencia?
Deixe claro que e avaliacao tecnica, nao autorizacao.
Siga o FORMATO DE RELATORIO da skill juntavale-sprint.

## Saida (obrigatorio)

Grave o relatorio COMPLETO em `docs/sprints/$ARGUMENTS-audita.md`. No
ARQUIVO vai tudo: saida bruta dos comandos, trechos com numero de linha,
diffs inteiros.

No TERMINAL imprima APENAS o bloco CONCLUSAO, no maximo 25 linhas:
- caminho do arquivo gravado
- veredito (passa / nao passa) e cada achado com arquivo:linha e severidade
- arquivos tocados
- exige deploy de rules ou de functions? sim/nao
- decisoes de produto ainda em aberto
- a linha do `git diff --stat`, quando houver escrita

Nunca imprima saida bruta no terminal. Se a tarefa parar no meio por
contradicao de spec, erro ou duvida, grave o relatorio PARCIAL no arquivo e
imprima a conclusao dizendo exatamente onde parou e por que.

## Isolamento da auditoria

E PROIBIDO ler `docs/sprints/$ARGUMENTS-implementa.md` ou qualquer relatorio
de implementacao. Ler o raciocinio de quem escreveu o codigo contamina a
auditoria. Ler o relatorio de RECON e permitido — e levantamento de
terreno, nao autojustificativa.
