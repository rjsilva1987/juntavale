# Estado do projeto

Curto, derivado do git log e do ROADMAP.md. Quem fecha sprint atualiza
substituindo linhas, nunca acumulando (ver CLAUDE.md, "Estado do projeto").

**Atualizado:** 25/08/2026
**Commit atual:** df08ee7 — feat(momentos): curtir e comentar momento sem
match (S143-B, FECHADA em código e DEPLOYADA, aprovada na 2ª auditoria,
SEM teste em aparelho) — ver ROADMAP.md.

## Sprints em andamento
- S143-C — barra de resposta no viewer do momento (chips + emojis +
  campo): ABERTA, decisões tomadas, sem recon, bloqueada até a bateria de
  testes em aparelho da S143-B — ver ROADMAP.md.
- S144-B — enxugar carimbo do `firestore.rules`: revertida (commit
  fa757f5) — a refazer.

## Fila aberta sem decisão e/ou sem recon
- S102-A — mensagem de áudio no chat — sem decisões, sem recon.
- S138 — nome/apelido imutáveis — decisões tomadas, sem recon.
- S140 — bug: conta do build 14 quebra ao salvar perfil com nome editado —
  sem decisões, achado da auditoria da S137.
- S142 — fluidez do chat (Android) — sem decisões, começa por RECON DE
  DIAGNÓSTICO.

## Débitos técnicos ativos
- S102-C — `messageImageUrl`/`matchId`/`messageId` sem validação de
  formato/tamanho nas rules (ver ROADMAP § "Dívidas técnicas").
- S132 — enquete ficou acima do "Prompt da semana" no perfil; risco
  aceito ao fechar.

## Pendências vivas
- Volume grande de sprints fechadas em código mas SEM teste em aparelho —
  lista completa e acumulativa em ROADMAP.md § "Testes pendentes"
  (aguardando build 15).

## Onde olhar antes de mexer
- ROADMAP.md § "Decisões de produto que valem para o projeto inteiro" e
  § "Armadilhas do chat".
- ARQUITETURA.md — mapa de collections, Cloud Functions e moldes
  reusáveis.
