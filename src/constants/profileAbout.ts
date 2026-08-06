// src/constants/profileAbout.ts
//
// Catálogo do perfil estruturado (S104) — piloto do padrão `about`: mapa
// livre em users/{uid}.about (ver firestore.rules, isValidProfile), sem
// validação de chave interna no servidor de propósito — um campo novo
// aqui (S105/S106 em diante) não exige mexer nas rules nem fazer deploy,
// só uma entrada em ABOUT_FIELDS abaixo. Nada de exibição aqui — isso é a
// S108 (ProfileSections/MatchProfileScreen/ProfileSheet/card do Descobrir).
import { Ionicons } from '@expo/vector-icons';

// ─── Signo ───────────────────────────────────────────────
//
// Mesmo tripé de src/constants/vale.ts e lookingFor.ts: array de valores
// `as const` -> tipo derivado -> Record de rótulos -> array {value,label}
// pronto pro seletor.
export const SIGNS = [
  'aries',
  'touro',
  'gemeos',
  'cancer',
  'leao',
  'virgem',
  'libra',
  'escorpiao',
  'sagitario',
  'capricornio',
  'aquario',
  'peixes',
] as const;

export type Sign = (typeof SIGNS)[number];

export const SIGN_LABELS: Record<Sign, string> = {
  aries: 'Áries',
  touro: 'Touro',
  gemeos: 'Gêmeos',
  cancer: 'Câncer',
  leao: 'Leão',
  virgem: 'Virgem',
  libra: 'Libra',
  escorpiao: 'Escorpião',
  sagitario: 'Sagitário',
  capricornio: 'Capricórnio',
  aquario: 'Aquário',
  peixes: 'Peixes',
};

export const SIGN_OPTIONS: { value: Sign; label: string }[] = SIGNS.map((value) => ({
  value,
  label: SIGN_LABELS[value],
}));

// ─── Catálogo de campos ─────────────────────────────────────
//
// Cada campo declara id, rótulo, ícone (Ionicons) e tipo — 'number' pra
// entrada numérica com faixa/sufixo, 'single' pra seleção única e 'multi'
// pra múltipla escolha (seletor genérico da S104 só implementa
// single/number; multi fica pra quando o primeiro campo desse tipo
// aparecer, ver src/components/AboutPicker.tsx).
interface AboutFieldBase {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface AboutFieldNumber extends AboutFieldBase {
  type: 'number';
  suffix?: string;
  min: number;
  max: number;
}

export interface AboutFieldSingle extends AboutFieldBase {
  type: 'single';
  options: readonly { value: string; label: string }[];
}

export interface AboutFieldMulti extends AboutFieldBase {
  type: 'multi';
  options: readonly { value: string; label: string }[];
}

export type AboutFieldDef = AboutFieldNumber | AboutFieldSingle | AboutFieldMulti;

// Pilotos da S104: Altura (numérico) e Signo (seleção única).
export const ABOUT_FIELDS = [
  {
    id: 'height',
    label: 'Altura',
    icon: 'resize-outline',
    type: 'number',
    suffix: 'cm',
    min: 120,
    max: 230,
  },
  {
    id: 'sign',
    label: 'Signo',
    icon: 'star-outline',
    type: 'single',
    options: SIGN_OPTIONS,
  },
] as const satisfies readonly AboutFieldDef[];

export type AboutFieldId = (typeof ABOUT_FIELDS)[number]['id'];

// Busca por `id` em vez de posição — inserir um campo novo NO MEIO de
// ABOUT_FIELDS não muda pra que campo HEIGHT_FIELD/SIGN_FIELD abaixo
// apontam (achado da auditoria da S104: `ABOUT_FIELDS[0]`/`[1]` quebrava
// silenciosamente numa reordenação entre campos de mesma forma, sem o tsc
// acusar nada). `Extract` mantém o tipo estreito (o handle de `height`
// continua expondo `min`/`max`/`suffix`, o de `sign` continua expondo
// `options`) mesmo buscando por valor em runtime.
type AboutFieldById<Id extends AboutFieldId> = Extract<(typeof ABOUT_FIELDS)[number], { id: Id }>;

function getAboutField<Id extends AboutFieldId>(id: Id): AboutFieldById<Id> {
  const field = ABOUT_FIELDS.find((f): f is AboutFieldById<Id> => f.id === id);
  if (!field) throw new Error(`about field not found: ${id}`);
  return field;
}

export const HEIGHT_FIELD = getAboutField('height');
export const SIGN_FIELD = getAboutField('sign');

// Deriva o tipo do VALOR de cada campo a partir da própria definição em
// ABOUT_FIELDS — um campo novo no catálogo estende AboutValues sozinho,
// sem precisar tocar neste arquivo de novo.
type AboutFieldValue<F> = F extends { type: 'number' }
  ? number
  : F extends { type: 'single'; options: readonly { value: infer V }[] }
    ? V
    : F extends { type: 'multi'; options: readonly { value: infer V }[] }
      ? V[]
      : never;

export type AboutValues = Partial<{
  [F in (typeof ABOUT_FIELDS)[number] as F['id']]: AboutFieldValue<F>;
}>;
