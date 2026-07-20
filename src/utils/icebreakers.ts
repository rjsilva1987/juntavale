// src/utils/icebreakers.ts
import { LookingFor } from '@/constants/lookingFor';
import { PROMPTS_CATALOG } from '@/constants/prompts';
import { getSharedInterestSet, normalizeInterest } from '@/utils/interests';

export interface IcebreakerProfile {
  interests?: string[] | null;
  lookingFor?: LookingFor;
  prompts?: { id: string; answer: string }[];
  // S48 — "Meus lugares"/"No meu radar", texto livre. Categoria #2 (abaixo
  // de prompts, acima do resto) — ver bloco (a1) abaixo.
  places?: string[] | null;
  events?: string[] | null;
}

// Mensagem vira draft de chat — não pode ficar gigante. Trunca dentro da
// citação, não a mensagem inteira.
const PROMPT_ANSWER_QUOTE_LIMIT = 60;
const PROMPT_ANSWER_TRUNCATED_LENGTH = 57;

const truncatePromptAnswer = (answer: string): string =>
  answer.length > PROMPT_ANSWER_QUOTE_LIMIT
    ? `${answer.slice(0, PROMPT_ANSWER_TRUNCATED_LENGTH)}...`
    : answer;

// 2 variações, escolhidas de forma determinística pelo índice do promptId no
// catálogo (par/ímpar) — mesmo prompt sempre gera a mesma variação.
const PROMPT_ANSWER_TEMPLATES: ((answer: string) => string)[] = [
  (answer) => `Você escreveu: "${answer}" — adorei, me conta mais sobre isso!`,
  (answer) => `"${answer}" — essa resposta me ganhou. Como assim? 😄`,
];

const SHARED_INTEREST_TEMPLATES: ((interest: string) => string)[] = [
  (interest) =>
    `Vi que você também curte ${interest}! Qual foi a última vez que você se envolveu com isso?`,
  (interest) => `${interest} em comum! O que te fez começar?`,
  (interest) => `Também sou de ${interest} 😄 me conta sua história favorita sobre isso`,
];

const LOOKING_FOR_TEMPLATES: Record<LookingFor, string> = {
  relacionamento_serio:
    'Gostei de ver que você também busca algo sério. O que não pode faltar pra você numa relação?',
  casual: 'A gente combina no que procura 😄 qual seu programa favorito pra um encontro leve?',
  amizade: 'Também tô aqui pra fazer amizades! Qual seu rolê favorito na cidade?',
  descobrindo:
    'Nós dois ainda descobrindo o que procuramos... já é algo em comum! O que te trouxe pro app?',
};

const FALLBACK_ICEBREAKER = 'Oi! Adorei seu perfil, deu match por algum motivo né? 😄';

// S48 — categoria #2 (abaixo de prompts, acima de interesses em comum).
// Cita só a 1ª tag de cada campo do perfil ALVO (mesmo padrão de firstPrompt
// abaixo, que só usa prompts[0]) — sem looping por todas as tags como faz o
// bloco de interesses compartilhados logo depois.
const placeIcebreakerTemplate = (tag: string): string =>
  `Vi que você curte ${tag}. Topa me mostrar por quê?`;

const eventIcebreakerTemplate = (tag: string): string =>
  `${tag} também tá no meu radar! Vamos juntos?`;

// Casos cobertos (sem framework de teste, checagem mental):
// - myProfile/theirProfile undefined ou sem interests/lookingFor/prompts -> retorna só [FALLBACK_ICEBREAKER]
// - theirProfile com prompts[0] + 2 interesses em comum + mesmo lookingFor -> 1 de prompt + 2 de interesse + 1 de lookingFor + fallback = 5 itens, prompt sempre em [0]
// - interests com grafias diferentes (" Praia " vs "praia") -> ainda casa (normalizeInterest) e usa a grafia original de theirProfile.interests
// - resposta de prompt > 60 chars -> citação truncada em 57 chars + "..."
export function getIcebreakers(
  myProfile?: IcebreakerProfile | null,
  theirProfile?: IcebreakerProfile | null,
): string[] {
  const suggestions: string[] = [];

  // (a0) Prompt respondido — maior prioridade: usa só o primeiro
  // (prompts[0], o que a pessoa escolheu mostrar primeiro no perfil).
  const firstPrompt = theirProfile?.prompts?.[0];
  if (firstPrompt) {
    const catalogIndex = PROMPTS_CATALOG.findIndex((p) => p.id === firstPrompt.id);
    const templateIndex = (catalogIndex >= 0 ? catalogIndex : 0) % PROMPT_ANSWER_TEMPLATES.length;
    const quoted = truncatePromptAnswer(firstPrompt.answer);
    suggestions.push(PROMPT_ANSWER_TEMPLATES[templateIndex](quoted));
  }

  // (a1) "Meus lugares" / "No meu radar" do perfil ALVO — se o alvo não tem
  // o campo (ou ele está vazio), simplesmente não concorre, igual firstPrompt
  // acima.
  const firstPlace = theirProfile?.places?.[0];
  if (firstPlace) {
    suggestions.push(placeIcebreakerTemplate(firstPlace));
  }
  const firstEvent = theirProfile?.events?.[0];
  if (firstEvent) {
    suggestions.push(eventIcebreakerTemplate(firstEvent));
  }

  const shared = getSharedInterestSet(myProfile?.interests, theirProfile?.interests);
  const theirInterests = theirProfile?.interests ?? [];
  let index = 0;
  for (const normalized of shared) {
    const original =
      theirInterests.find((interest) => normalizeInterest(interest) === normalized) ?? normalized;
    const template = SHARED_INTEREST_TEMPLATES[index % SHARED_INTEREST_TEMPLATES.length];
    suggestions.push(template(original));
    index += 1;
  }

  if (
    myProfile?.lookingFor &&
    theirProfile?.lookingFor &&
    myProfile.lookingFor === theirProfile.lookingFor
  ) {
    suggestions.push(LOOKING_FOR_TEMPLATES[myProfile.lookingFor]);
  }

  suggestions.push(FALLBACK_ICEBREAKER);

  return suggestions;
}
