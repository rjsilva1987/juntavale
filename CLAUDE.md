# JuntaVale — convenções do projeto

## Ambiente
- Diretório do projeto: varia por máquina. Acer = D:\vscode\juntavale; Dell = C:\Users\Raphael\vscode\juntavale
- O shell abre na pasta PAI. SEMPRE comece com Set-Location no caminho da máquina em uso e confirme com Get-Location antes de qualquer comando
- Se o Set-Location falhar, PARE e reporte — não tente adivinhar o caminho
- Stack: Expo 54, React Native 0.81, React 19, TypeScript,
  Firebase (projeto bbmatch-9ede5; Firestore/Functions em
  southamerica-east1, Node 22). Windows + PowerShell.

## Tema
- primary #1E3A8A / #2563EB, secondary #FBBF24, onSecondary #1E3A8A.
- REGRA DE OURO: NUNCA texto branco sobre amarelo #FBBF24.
- Só tokens do theme.ts; nenhuma cor hardcoded.

## Processo (inegociável)
- firestore.rules: pode editar, NUNCA deployar. Todo diff de rules é
  auditado externamente antes do deploy. Ao editar rules, atualize o
  comentário rules-stamp da linha 1 (sprint + data) — ele força o upload
  no deploy e identifica a versão ativa no console.
- Decisões de produto NUNCA são tomadas autonomamente: em ambiguidade de
  produto, PARE e pergunte.
- Sprints numeradas Sxx; 1 sprint = 1 commit sempre que possível.
- Regras de pipeline (git, deploy, recon, prova de escrita, relatório,
  auditoria): ver "Regras invariantes do pipeline" abaixo — fonte única,
  agentes e skills só referenciam por número.

## Regras invariantes do pipeline
1. **Recon é só-leitura.** jv-recon só tem Read/Grep/Glob; nunca edita nem
   roda Bash de escrita.
2. **Claude Code nunca roda git de escrita** (add/commit/push/reset/
   checkout/restore/revert) **nem deploy** (firebase deploy, eas build/
   submit) — isso é sempre do Raphael. EXCEÇÃO ÚNICA: modo lote do
   `/sprint` (`/sprint lote --commit S<NN> S<NN> ...`) pode rodar
   `git add`/`commit`/`push` — nunca reset/checkout/restore/revert, nunca
   deploy — e só depois de auditoria aprovada de cada sprint da lista.
   Fora dessa sintaxe exata, vale a proibição normal. Guardas completas
   (parada em auditoria bloqueada, parada em decisão de produto nova,
   deploy sempre proibido): seção "Modo LOTE" de
   `.claude/commands/sprint.md`.
3. **Prova de escrita obrigatória** depois de CADA edição: Select-String
   (ou grep) das linhas-chave alteradas, com `arquivo:linha` e saída
   bruta, mais `git diff -w <arquivo>`. Nunca escrever "confirmado acima"/
   "já reproduzido" sem a saída literal. Relatório sem prova é rejeitado.
4. **Relatório enxuto:** diff por hunk/intervalo de linhas, nunca o
   arquivo inteiro (exceção: arquivo novo, cola inteiro uma vez só).
   Validações (tsc/eslint) resumidas à linha de resultado e ao exit code —
   saída completa só quando divergir da baseline da sessão (ver
   "Baseline de tsc/lint" abaixo). Toda função/tipo/componente/constante
   CRIADA entra na lista de alterações. Formato completo do relatório:
   skill `juntavale-sprint`.
5. **Auditoria é adversarial:** jv-audita NUNCA lê relatório, raciocínio
   ou justificativa de quem implementou (arquivos com "implementa",
   "correcao" ou "relatorio" no nome). Ler o relatório de RECON é
   permitido — é terreno factual, não autojustificativa.
6. **Saída final da sprint** (Fase 6 do `/sprint`) vai entre
   `=== COPIAR A PARTIR DAQUI ===` e `=== FIM ===`.

## Baseline de tsc/lint (relativa à sessão)
- jv-implementa roda `npx tsc --noEmit` e `npx eslint .` ANTES de editar
  (baseline da sessão) e DEPOIS de editar.
- Critério: tsc sai com exit 0; contagem de erros/warnings do eslint fica
  ≤ baseline medida no início da sessão. Nunca comparar contra um número
  fixo de sessões passadas — o baseline é sempre o da sessão atual.
- Proibido `git stash` para isolar mudanças (CRLF quebra no Windows).

## Estado do projeto
- Agentes leem `docs/sprints/ESTADO.md` por padrão (commit atual, sprints
  em andamento, pendências vivas, débitos ativos). Relatórios antigos em
  `docs/sprints/` só entram quando a tarefa tocar naquele terreno
  específico.
- Quem fecha uma sprint atualiza o `ESTADO.md` substituindo as linhas que
  mudaram, nunca acumulando — histórico completo vive no ROADMAP.md e nos
  relatórios de sprint.

## Padrões estabelecidos
- Tela com input fixo no rodapé: SafeAreaView SEM edges (padrão
  ChatScreen); tela de lista: edges={['top']}.
- Push: sempre reusar getPushToken/sendExpoNotifications e a constante
  REGION nas functions; scheduled functions seguem o esqueleto do
  staleMatchReminder.
- PNGs de ícone/splash sem chunks auxiliares (bKGD, text) — AAPT rejeita
  no build de release Android.
