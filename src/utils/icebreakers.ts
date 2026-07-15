// src/utils/icebreakers.ts
import { LookingFor } from '@/constants/lookingFor';
import { getSharedInterestSet, normalizeInterest } from '@/utils/interests';

export interface IcebreakerProfile {
  interests?: string[] | null;
  lookingFor?: LookingFor;
}

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

// Casos cobertos (sem framework de teste, checagem mental):
// - myProfile/theirProfile undefined ou sem interests/lookingFor -> retorna só [FALLBACK_ICEBREAKER]
// - 2 interesses em comum + mesmo lookingFor -> 2 sugestões de interesse + 1 de lookingFor + fallback = 4 itens
// - interests com grafias diferentes (" Praia " vs "praia") -> ainda casa (normalizeInterest) e usa a grafia original de theirProfile.interests
export function getIcebreakers(
  myProfile?: IcebreakerProfile | null,
  theirProfile?: IcebreakerProfile | null,
): string[] {
  const suggestions: string[] = [];

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
