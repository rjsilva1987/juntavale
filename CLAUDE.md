# JuntaVale — convenções do projeto

## Ambiente
- Diretório do projeto: D:\vscode\juntavale — SEMPRE confira o cwd antes
  de qualquer comando; o diretório pai (D:\vscode) é outro repositório.
- Stack: Expo 54, React Native 0.81, React 19, TypeScript,
  Firebase (projeto bbmatch-9ede5; Firestore/Functions em
  southamerica-east1, Node 22). Windows + PowerShell.

## Tema
- primary #1E3A8A / #2563EB, secondary #FBBF24, onSecondary #1E3A8A.
- REGRA DE OURO: NUNCA texto branco sobre amarelo #FBBF24.
- Só tokens do theme.ts; nenhuma cor hardcoded.

## Processo (inegociável)
- Raphael roda TODOS os git (add/commit/push) e TODOS os firebase deploy.
  Claude Code NUNCA executa git de escrita nem deploy.
- firestore.rules: pode editar, NUNCA deployar. Todo diff de rules é
  auditado externamente antes do deploy. Ao editar rules, atualize o
  comentário rules-stamp da linha 1 (sprint + data) — ele força o upload
  no deploy e identifica a versão ativa no console.
- Decisões de produto NUNCA são tomadas autonomamente: em ambiguidade de
  produto, PARE e pergunte.
- Sprints numeradas Sxx; 1 sprint = 1 commit sempre que possível.

## Relatórios (sem isso, relatório rejeitado)
- Toda validação com SAÍDA BRUTA de terminal em bloco de código.
- Nunca escrever "confirmado acima"/"já reproduzido" — tudo literal.
- Toda função/tipo/componente/constante CRIADO deve constar na lista de
  alterações.
- Baseline de lint: 0 erros / ~29 warnings (prettier pré-existentes).
  Qualquer erro novo é regressão.

## Padrões estabelecidos
- Tela com input fixo no rodapé: SafeAreaView SEM edges (padrão
  ChatScreen); tela de lista: edges={['top']}.
- Push: sempre reusar getPushToken/sendExpoNotifications e a constante
  REGION nas functions; scheduled functions seguem o esqueleto do
  staleMatchReminder.
- PNGs de ícone/splash sem chunks auxiliares (bKGD, text) — AAPT rejeita
  no build de release Android.
