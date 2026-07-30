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
