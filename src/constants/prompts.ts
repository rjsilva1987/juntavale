// src/constants/prompts.ts
//
// Catálogo fixo de prompts estilo Hinge (S33). IDs estáveis — os textos podem
// ser editados depois sem migração, mas o id nunca muda (é o que fica salvo
// em users/{uid}.prompts[].id). Padrão análogo a src/constants/lookingFor.ts.
export type PromptId =
  'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08' | 'p09' | 'p10';

export const PROMPTS_CATALOG: { id: PromptId; text: string }[] = [
  { id: 'p01', text: 'O que me trouxe pro banco foi...' },
  { id: 'p02', text: 'Na semana da minha posse, eu não fazia ideia de que...' },
  { id: 'p03', text: 'Lidar com gente todo dia me ensinou que...' },
  { id: 'p04', text: 'Meu plano pra aposentadoria (já tem planilha)...' },
  { id: 'p05', text: 'Fora do expediente, você me encontra...' },
  { id: 'p06', text: 'Tenho paciência infinita pra ___ e nenhuma pra ___' },
  { id: 'p07', text: 'Comigo você pode contar quando...' },
  { id: 'p08', text: 'Domingo perfeito, na minha régua, é...' },
  { id: 'p09', text: 'Me ganha na hora quem...' },
  { id: 'p10', text: 'Uma coisa que eu levo a sério mais do que deveria...' },
];

// S50 — bumped de 3 para 4: o prompt da semana grava no MESMO array
// `prompts[]` (decisão fechada, ver ProfileScreen), então o teto de itens do
// array precisa caber os 3 prompts normais + 1 semanal. Decisão a validar na
// auditoria: como MAX_PROMPTS também governa o botão "Adicionar" do catálogo
// normal (abaixo), isso tecnicamente permite 4 prompts normais também, caso o
// usuário nunca responda o semanal — não só "3 normais + 1 semanal".
export const MAX_PROMPTS = 4;
export const MAX_ANSWER_LENGTH = 150;

// Tolerante a um catálogo futuro maior que o do app instalado: id desconhecido
// (ex: doc gravado por uma versão mais nova) cai no fallback '', em vez de
// quebrar a leitura.
export const getPromptText = (id: string): string =>
  PROMPTS_CATALOG.find((p) => p.id === id)?.text ??
  WEEKLY_PROMPTS.find((p) => p.id === id)?.text ??
  '';

// S50 — Pool rotativo do "Prompt da semana". IDs estáveis (mesmo padrão de
// PROMPTS_CATALOG acima): o texto pode mudar depois, o id nunca muda, porque
// é o que fica salvo em users/{uid}.prompts[].id quando o usuário responde.
// Respostas de semanas passadas permanecem no array como prompts normais
// (decisão fechada) — por isso getPromptText acima também procura aqui.
export type WeeklyPromptId =
  'w01' | 'w02' | 'w03' | 'w04' | 'w05' | 'w06' | 'w07' | 'w08' | 'w09' | 'w10' | 'w11' | 'w12';

export const WEEKLY_PROMPTS: { id: WeeklyPromptId; text: string }[] = [
  { id: 'w01', text: 'A pior fila que eu já enfrentei — e não vale falar do trabalho' },
  { id: 'w02', text: 'Sistema fora do ar. Eu aproveito pra...' },
  { id: 'w03', text: 'Se a minha vida tivesse extrato, meu maior gasto seria...' },
  { id: 'w04', text: 'A melhor dica de dinheiro que eu dou de graça pra amigo' },
  { id: 'w05', text: 'Uma coisa que eu juntei meses pra comprar' },
  { id: 'w06', text: 'Feriado prolongado: praia, serra ou sofá?' },
  { id: 'w07', text: 'O que toca no meu trajeto pro trabalho' },
  { id: 'w08', text: 'Meta que eu bati essa semana (não precisa ser do trabalho)' },
  { id: 'w09', text: 'Melhor lugar da cidade pra um primeiro encontro' },
  { id: 'w10', text: 'Meu talento mais inútil' },
  { id: 'w11', text: 'O que me faz rir sozinho no meio do expediente' },
  { id: 'w12', text: 'Café: como, quando e quantos' },
];

// EPOCH fixa: segunda-feira 2026-01-05T00:00:00-03:00 (America/Sao_Paulo) =
// semana 0 do pool. NUNCA mudar depois de publicado (mudaria o prompt de todo
// mundo retroativamente). Duplicada em functions/src/index.ts (Rules/Functions
// não importam src/) — manter as duas em sincronia.
export const WEEKLY_PROMPT_EPOCH = new Date('2026-01-05T00:00:00-03:00');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Determinístico: mesma data (em qualquer device/timezone, porque Date usa
// epoch UTC internamente) sempre resolve pro mesmo índice do pool.
export const getWeeklyPrompt = (date: Date): { id: WeeklyPromptId; text: string } => {
  const rawIndex = Math.floor((date.getTime() - WEEKLY_PROMPT_EPOCH.getTime()) / WEEK_MS);
  const index =
    ((rawIndex % WEEKLY_PROMPTS.length) + WEEKLY_PROMPTS.length) % WEEKLY_PROMPTS.length;
  return WEEKLY_PROMPTS[index];
};
