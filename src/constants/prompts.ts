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

export const MAX_PROMPTS = 3;
export const MAX_ANSWER_LENGTH = 150;

// Tolerante a um catálogo futuro maior que o do app instalado: id desconhecido
// (ex: doc gravado por uma versão mais nova) cai no fallback '', em vez de
// quebrar a leitura.
export const getPromptText = (id: string): string =>
  PROMPTS_CATALOG.find((p) => p.id === id)?.text ?? '';
