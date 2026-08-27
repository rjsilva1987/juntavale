---
name: juntavale-sprint
description: Ciclo de sprint do JuntaVale e formato de relatorio. Use em toda rodada de recon, implementacao, auditoria ou fechamento neste repositorio.
---

# Ciclo de sprint

recon (so leitura, so na trilha completa) -> implementacao -> auditoria ->
commit/push/deploy pelo Raphael -> teste em device. Isso e o padrao (modo
de git = GIT MANUAL, escolhido na Fase 0 de cada sprint). Quando o modo de
git da Fase 0 for GIT AUTOMATICO — seja numa sprint avulsa, seja via
`lote --commit` — quem roda commit/push e o proprio orquestrador, nunca um
subagente, e sempre so depois de auditoria aprovada daquela sprint. Deploy
continua sendo sempre do Raphael, em qualquer modo de git.

Uma sprint por sessao — excecao: modo lote do `/sprint`
(`lote --commit S<NN> S<NN> ...`) processa varias sprints em sequencia na
mesma sessao, cada uma pelo ciclo completo em automatico, com commit/push
proprio so apos auditoria aprovada daquela sprint. A excecao de git de
escrita ao item 2 do CLAUDE.md tem hoje duas portas de entrada
equivalentes — modo lote, ou GIT AUTOMATICO escolhido avulso na Fase 0 —
ambas com a mesma guarda: so apos auditoria aprovada da sprint em questao
(guardas completas em `.claude/commands/sprint.md`). Deploy fica proibido
sempre, em qualquer modo de git — so o Raphael deploya.

Quem escreve o codigo nao e quem aprova. A auditoria existe pra achar o que
o implementador nao viu; se ela so confirmar o proprio trabalho, perdeu a
funcao.

Regras de pipeline (git/deploy proibidos, recon so-leitura, prova de
escrita, relatorio enxuto, auditoria adversarial, saida final): Regras
invariantes do CLAUDE.md, itens 1-6. Baseline de tsc/lint: secao
"Baseline de tsc/lint" do mesmo arquivo. Carimbo de versao no topo do
firestore.rules a cada sprint que mexer em rules continua valendo (ver
CLAUDE.md, "Processo").

# FORMATO DE RELATORIO

O relatorio e lido por outra instancia do Claude, que ja conhece o projeto.
Ele existe pra provar o que foi feito, nao pra reapresentar o codigo.

1. NUNCA cole arquivo inteiro sem pedido explicito. Cole o intervalo de
   linhas relevante, com numero de linha.
2. Arquivo NOVO e a unica excecao: cole inteiro, uma vez so.
3. Mudanca em arquivo existente se mostra com git diff — nunca com um
   "antes" e um "depois" reescritos a mao.
4. grep/Select-String: use contexto curto (2 linhas), nao a funcao inteira.
5. Nao repita no relatorio codigo que ja apareceu antes na mesma rodada.
   Referencie ("mesmo trecho do item 2").
6. Validacoes: cole a linha de resultado e o exit code. A saida completa do
   eslint so quando divergir da baseline da sessao — se bater dentro dela,
   uma linha basta.
7. Comparacoes vao em tabela, nao em prosa.
8. Achados: uma linha por achado, com a evidencia minima que o prova.
9. Se um passo pedido exigir colar mais de ~80 linhas, PARE antes e
   pergunte se vale.
10. Economia NUNCA vale suprimir evidencia de escrita, diff de rules, ou
    saida de validacao que divergiu. Corta-se repeticao, nunca prova.
