// src/constants/prompts.ts
//
// Catálogo fixo de prompts estilo Hinge (S33). IDs estáveis — os textos podem
// ser editados depois sem migração, mas o id nunca muda (é o que fica salvo
// em users/{uid}.prompts[].id). Padrão análogo a src/constants/lookingFor.ts.
export type PromptId =
  'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08' | 'p09' | 'p10';

export const PROMPTS_CATALOG: { id: PromptId; text: string }[] = [
  { id: 'p01', text: 'Meu domingo perfeito é...' },
  { id: 'p02', text: 'Não vivo sem...' },
  { id: 'p03', text: 'A comida que me conquista é...' },
  { id: 'p04', text: 'Meu lugar favorito no mundo é...' },
  { id: 'p05', text: 'Uma coisa que pouca gente sabe sobre mim...' },
  { id: 'p06', text: 'Meu hobby do momento é...' },
  { id: 'p07', text: 'A música que não sai da minha cabeça...' },
  { id: 'p08', text: 'Se eu pudesse jantar com qualquer pessoa...' },
  { id: 'p09', text: 'Meu maior orgulho é...' },
  { id: 'p10', text: 'Topo qualquer plano que envolva...' },
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
  { id: 'w01', text: 'Qual foi o maior mico que você já pagou num encontro?' },
  { id: 'w02', text: 'Se dinheiro não fosse problema, seu sábado perfeito seria...' },
  { id: 'w03', text: 'Qual música você defende com a vida mesmo todo mundo zoando?' },
  { id: 'w04', text: 'Comida que você julgava antes de provar e hoje ama?' },
  { id: 'w05', text: 'Qual talento inútil você tem orgulho de ter?' },
  { id: 'w06', text: 'O que te faz rir sozinho só de lembrar?' },
  { id: 'w07', text: 'Praia lotada ou cachoeira escondida? Defenda.' },
  { id: 'w08', text: 'Qual série você já maratonou mais de uma vez?' },
  { id: 'w09', text: "Seu 'red flag' mais inofensivo?" },
  { id: 'w10', text: 'Se sua vida tivesse trilha sonora, qual seria a de abertura?' },
  { id: 'w11', text: 'Qual é a sua opinião impopular mais forte?' },
  { id: 'w12', text: 'O que você faria num domingo de chuva perfeito?' },
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
