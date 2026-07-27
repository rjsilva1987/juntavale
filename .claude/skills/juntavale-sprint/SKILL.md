---
name: juntavale-sprint
description: Ciclo de sprint do JuntaVale e formato de relatorio. Use em toda rodada de recon, implementacao, auditoria ou fechamento neste repositorio.
---

# Ciclo de sprint

recon (so leitura) -> implementacao -> auditoria -> commit/push/deploy pelo
Raphael -> teste em device. Uma sprint por sessao.

Quem escreve o codigo nao e quem aprova. A auditoria existe pra achar o que
o implementador nao viu; se ela so confirmar o proprio trabalho, perdeu a
funcao.

# Regras inegociaveis

- O Claude Code NUNCA roda git de escrita (add/commit/push) nem
  firebase deploy nem eas build. Isso e sempre do Raphael.
- Decisao de produto nao e do Claude Code. Na duvida, PARE e pergunte.
- Prova de escrita obrigatoria: nada de "confirmado acima" sem a saida
  bruta do terminal.
- Nao rodar eslint --fix em arquivo inteiro (reformata linha alheia ao
  escopo da sprint).
- Carimbo de versao no topo do firestore.rules a cada sprint que mexer em
  rules — e ele que forca o upload no deploy.

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
   eslint so quando divergir da baseline — se bater 0/25, uma linha basta.
7. Comparacoes vao em tabela, nao em prosa.
8. Achados: uma linha por achado, com a evidencia minima que o prova.
9. Se um passo pedido exigir colar mais de ~80 linhas, PARE antes e
   pergunte se vale.
10. Economia NUNCA vale suprimir evidencia de escrita, diff de rules, ou
    saida de validacao que divergiu. Corta-se repeticao, nunca prova.
