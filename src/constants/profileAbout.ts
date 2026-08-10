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

// ─── Grupos ──────────────────────────────────────────────────
//
// S105 — o catálogo cresce por seção da tela, não só por campo. Cada campo
// declara a que grupo pertence; a tela renderiza um cabeçalho por grupo (na
// ordem de ABOUT_GROUPS) e, dentro dele, um AboutRow por campo cujo `group`
// bate — nada de lista de campos escrita à mão na tela (ver ProfileScreen).
export const ABOUT_GROUPS = ['about', 'lifestyle'] as const;

export type AboutGroup = (typeof ABOUT_GROUPS)[number];

export const ABOUT_GROUP_LABELS: Record<AboutGroup, string> = {
  about: 'Sobre mim',
  lifestyle: 'Estilo de vida',
};

// ─── Catálogo de campos ─────────────────────────────────────
//
// Cada campo declara id, rótulo, ícone (Ionicons), grupo (S105) e tipo —
// 'number' pra entrada numérica com faixa/sufixo, 'single' pra seleção
// única e 'multi' pra múltipla escolha, com `maxSelected` opcional (S106,
// ver src/components/AboutPicker.tsx).
interface AboutFieldBase {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  group: AboutGroup;
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

export interface AboutFieldMulti<V extends string = string> extends AboutFieldBase {
  type: 'multi';
  options: readonly { value: V; label: string }[];
  maxSelected?: number;
  // S112 — pra campos multi com dois subgrupos mutuamente exclusivos (ex.:
  // `pets`: os 6 bichos vs. as 2 opções sem-bicho). Tipado contra os PRÓPRIOS
  // values do campo (V), não `string[]` solto — mesma correção que
  // AMBIGUOUS_FIELD_IDS levou na S108-A (era `Set<string>`, virou
  // `Set<AboutFieldId>`). `NoInfer<V>` é o que faz essa amarração valer de
  // verdade: sem ele, o `V` do generic seria inferido A PARTIR do PRÓPRIO
  // `exclusiveGroup` também (achado ao testar de propósito com um value
  // errado, tipo 'cachorr0' — sem NoInfer o tsc aceitava, só alargava V pra
  // incluir o erro). Com NoInfer, V só vem de `options`; exclusiveGroup é
  // checado contra esse V já fixo, e um value fora dali quebra o tsc de
  // verdade. Ausente = sem grupo exclusivo, toggle comum (ver AboutPicker.tsx).
  exclusiveGroup?: readonly NoInfer<V>[];
}

export type AboutFieldDef = AboutFieldNumber | AboutFieldSingle | AboutFieldMulti;

// Pilotos da S104: Altura (numérico) e Signo (seleção única), grupo
// 'about'. S105 acrescenta o grupo 'lifestyle': cinco campos de seleção
// única sobre hábitos (pets, bebida, cigarro, atividade física, redes
// sociais) — mesmo padrão single de `sign`, só troca as opções. S106
// acrescenta `languages`, primeiro campo `multi` do catálogo.
export const ABOUT_FIELDS = [
  {
    id: 'height',
    label: 'Altura',
    icon: 'resize-outline',
    group: 'about',
    type: 'number',
    suffix: 'cm',
    min: 120,
    max: 230,
  },
  {
    id: 'sign',
    label: 'Signo',
    icon: 'star-outline',
    group: 'about',
    type: 'single',
    options: SIGN_OPTIONS,
  },
  {
    id: 'pronouns',
    label: 'Pronomes',
    icon: 'person-outline',
    group: 'about',
    type: 'single',
    options: [
      { value: 'ele_dele', label: 'Ele/Dele' },
      { value: 'ela_dela', label: 'Ela/Dela' },
      { value: 'elu_delu', label: 'Elu/Delu' },
      { value: 'prefiro_nao_dizer', label: 'Prefiro não dizer' },
    ],
  },
  {
    id: 'education',
    label: 'Formação',
    icon: 'school-outline',
    group: 'about',
    type: 'single',
    options: [
      { value: 'ensino_medio', label: 'Ensino médio' },
      { value: 'ensino_tecnico', label: 'Ensino técnico' },
      { value: 'superior_incompleto', label: 'Superior incompleto' },
      { value: 'superior_completo', label: 'Superior completo' },
      { value: 'pos_graduacao', label: 'Pós-graduação' },
      { value: 'mestrado', label: 'Mestrado' },
      { value: 'doutorado', label: 'Doutorado' },
    ],
  },
  {
    id: 'loveLanguage',
    label: 'Linguagem do amor',
    icon: 'heart-outline',
    group: 'about',
    type: 'single',
    options: [
      { value: 'palavras_de_afirmacao', label: 'Palavras de afirmação' },
      { value: 'tempo_de_qualidade', label: 'Tempo de qualidade' },
      { value: 'presentes', label: 'Presentes' },
      { value: 'atos_de_servico', label: 'Atos de serviço' },
      { value: 'toque_fisico', label: 'Toque físico' },
    ],
  },
  {
    id: 'communication',
    label: 'Estilo de comunicação',
    icon: 'chatbubbles-outline',
    group: 'about',
    type: 'single',
    options: [
      { value: 'mando_mensagem_o_dia_todo', label: 'Mando mensagem o dia todo' },
      { value: 'prefiro_ligar', label: 'Prefiro ligar' },
      { value: 'melhor_pessoalmente', label: 'Melhor pessoalmente' },
      { value: 'demoro_pra_responder', label: 'Demoro pra responder' },
      { value: 'depende_do_dia', label: 'Depende do dia' },
    ],
  },
  {
    id: 'family',
    label: 'Família',
    icon: 'people-outline',
    group: 'about',
    type: 'single',
    options: [
      { value: 'quero_ter_filhos', label: 'Quero ter filhos' },
      { value: 'nao_quero_filhos', label: 'Não quero filhos' },
      { value: 'ja_tenho_e_quero_mais', label: 'Já tenho e quero mais' },
      { value: 'ja_tenho_e_nao_quero_mais', label: 'Já tenho e não quero mais' },
      { value: 'ainda_nao_sei', label: 'Ainda não sei' },
    ],
  },
  {
    id: 'languages',
    label: 'Idiomas que eu falo',
    icon: 'language-outline',
    group: 'about',
    type: 'multi',
    maxSelected: 5,
    options: [
      { value: 'portugues', label: 'Português' },
      { value: 'ingles', label: 'Inglês' },
      { value: 'espanhol', label: 'Espanhol' },
      { value: 'frances', label: 'Francês' },
      { value: 'alemao', label: 'Alemão' },
      { value: 'italiano', label: 'Italiano' },
      { value: 'japones', label: 'Japonês' },
      { value: 'mandarim', label: 'Mandarim' },
      { value: 'coreano', label: 'Coreano' },
      { value: 'arabe', label: 'Árabe' },
      { value: 'russo', label: 'Russo' },
      { value: 'libras', label: 'Libras' },
    ],
  },
  {
    id: 'pets',
    label: 'Pets',
    icon: 'paw-outline',
    group: 'lifestyle',
    type: 'multi',
    // S112 — sem `maxSelected` (decisão de produto: sem limite). Os 6 bichos
    // e as 2 opções sem-bicho ('nao_tenho'/'quero_ter') formam grupos
    // mutuamente exclusivos — ver `exclusiveGroup` acima e o toggle genérico
    // em AboutPicker.tsx.
    exclusiveGroup: ['nao_tenho', 'quero_ter'],
    options: [
      { value: 'cachorro', label: 'Cachorro' },
      { value: 'gato', label: 'Gato' },
      { value: 'passaro', label: 'Pássaro' },
      { value: 'peixe', label: 'Peixe' },
      { value: 'reptil', label: 'Réptil' },
      { value: 'outro', label: 'Outro' },
      { value: 'nao_tenho', label: 'Não tenho' },
      { value: 'quero_ter', label: 'Quero ter' },
    ],
  },
  {
    id: 'drinking',
    label: 'Bebida',
    icon: 'wine-outline',
    group: 'lifestyle',
    type: 'single',
    options: [
      { value: 'nao_bebo', label: 'Não bebo' },
      { value: 'socialmente', label: 'Socialmente, aos fins de semana' },
      { value: 'as_vezes', label: 'Bebo às vezes' },
      { value: 'com_frequencia', label: 'Bebo com frequência' },
    ],
  },
  {
    id: 'smoking',
    label: 'Você fuma?',
    icon: 'logo-no-smoking',
    group: 'lifestyle',
    type: 'single',
    options: [
      { value: 'nao_fumo', label: 'Não fumo' },
      { value: 'as_vezes', label: 'Fumo às vezes' },
      { value: 'fumo', label: 'Fumo' },
      { value: 'tentando_parar', label: 'Estou tentando parar' },
    ],
  },
  {
    id: 'exercise',
    label: 'Atividade física',
    icon: 'barbell-outline',
    group: 'lifestyle',
    type: 'single',
    options: [
      { value: 'todo_dia', label: 'Todo dia' },
      { value: 'frequentemente', label: 'Frequentemente' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'quase_nunca', label: 'Quase nunca' },
    ],
  },
  {
    id: 'socialMedia',
    label: 'Redes sociais',
    icon: 'share-social-outline',
    group: 'lifestyle',
    type: 'single',
    options: [
      { value: 'uso_bastante', label: 'Uso bastante as redes' },
      { value: 'de_vez_em_quando', label: 'Uso de vez em quando' },
      { value: 'so_pra_ver', label: 'Uso só pra ver' },
      { value: 'passo_longe', label: 'Passo longe' },
    ],
  },
] as const satisfies readonly AboutFieldDef[];

export type AboutFieldId = (typeof ABOUT_FIELDS)[number]['id'];

// Busca por `id` em vez de posição — inserir um campo novo NO MEIO de
// ABOUT_FIELDS não muda o que uma chamada existente de getAboutField
// aponta (achado da auditoria da S104: `ABOUT_FIELDS[0]`/`[1]` quebrava
// silenciosamente numa reordenação entre campos de mesma forma, sem o tsc
// acusar nada). `Extract` mantém o tipo estreito (o handle de `height`
// continua expondo `min`/`max`/`suffix`, o de `sign`/`pets`/etc continua
// expondo `options`) mesmo buscando por valor em runtime — usado pela
// ProfileScreen (S105) pra resolver o campo aberto no seletor a partir só
// do id guardado em estado.
type AboutFieldById<Id extends AboutFieldId> = Extract<(typeof ABOUT_FIELDS)[number], { id: Id }>;

export function getAboutField<Id extends AboutFieldId>(id: Id): AboutFieldById<Id> {
  const field = ABOUT_FIELDS.find((f): f is AboutFieldById<Id> => f.id === id);
  if (!field) throw new Error(`about field not found: ${id}`);
  return field;
}

// S112 — asserção em tempo de compilação: `exclusiveGroup?: readonly V[]`
// no field def sozinho NÃO é barrado pelo tsc contra os values do PRÓPRIO
// campo — `satisfies` numa união de interfaces genéricas com type param
// default (`AboutFieldMulti<V = string>`) não especializa V por objeto, só
// usa o default (comprovado testando de propósito com um value errado em
// `exclusiveGroup`: passou batido, mesmo com `NoInfer<V>` na interface).
// Isto aqui é o enforcement de verdade: `AboutFieldById<'pets'>` (mesmo
// `Extract` que `getAboutField` já usa pra narrow por id) fixa o tipo exato
// da entrada `pets`; `PetsValue` deriva os values ali; o `extends` abaixo só
// é `true` se `exclusiveGroup` for de fato `readonly PetsValue[]` — um value
// certo. Digitar errado um value em `exclusiveGroup` faz `_AssertPetsExclusive`
// virar `never`, e a linha seguinte (tipada `true`) quebra o tsc.
type PetsField = AboutFieldById<'pets'>;
type PetsValue = PetsField['options'][number]['value'];
type _AssertPetsExclusive = PetsField extends { exclusiveGroup: readonly PetsValue[] }
  ? true
  : never;
const _assertPetsExclusive: _AssertPetsExclusive = true;

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

// S112 — dado legado: um doc que gravou `about.pets` como STRING (de quando
// o campo ainda era `single`) faz o guard `Array.isArray` abaixo falhar assim
// que o catálogo declara `type: 'multi'` — o campo aparentaria estar vazio
// pra sempre, silenciosamente (achado do recon S112-recon, item 3). O tsc não
// pega isso porque a leitura é genérica sobre AboutFieldId, sem
// `if (id === 'pets')` em lugar nenhum. Função pura, sem efeito colateral.
export function coerceAboutValue(
  field: AboutFieldDef,
  value: string | number | string[] | undefined,
): string | number | string[] | undefined {
  if (field.type === 'multi' && typeof value === 'string') return [value];
  return value;
}

// S105/S106 — formatação do VALOR exibido no AboutRow também sai do
// catálogo: número junta o sufixo, seleção única troca o value pelo label
// da opção, múltipla escolha junta os labels na ordem do catálogo (não na
// ordem em que a pessoa marcou). A tela nunca faz `if (id === 'height')` —
// só chama isto pra cada campo. undefined aqui vira "Adicionar" no AboutRow.
export function formatAboutFieldValue(
  field: AboutFieldDef,
  rawValue: string | number | string[] | undefined,
): string | undefined {
  const value = coerceAboutValue(field, rawValue);
  if (value === undefined) return undefined;
  if (field.type === 'number') return field.suffix ? `${value} ${field.suffix}` : `${value}`;
  if (field.type === 'single') return field.options.find((o) => o.value === value)?.label;
  if (field.type === 'multi' && Array.isArray(value)) {
    const labels = field.options.filter((o) => value.includes(o.value)).map((o) => o.label);
    return labels.length > 0 ? labels.join(', ') : undefined;
  }
  return undefined;
}

// S108-A — variante de exibição em ARRAY: 1 rótulo pra `number`/`single`, N
// rótulos (na ordem do catálogo) pra `multi`, `[]` quando não há valor —
// pra telas que renderizam uma chip por valor em vez de uma string única
// junta por vírgula (ver ProfileSections). NÃO substitui
// `formatAboutFieldValue` acima — a tela de EDIÇÃO (ProfileScreen/AboutRow)
// continua dependendo dele devolver string única; este helper vive ao lado,
// mesma lógica por tipo de campo.
export function formatAboutFieldLabels(
  field: AboutFieldDef,
  rawValue: string | number | string[] | undefined,
): string[] {
  const value = coerceAboutValue(field, rawValue);
  if (value === undefined) return [];
  if (field.type === 'number') return [field.suffix ? `${value} ${field.suffix}` : `${value}`];
  if (field.type === 'single') {
    const label = field.options.find((o) => o.value === value)?.label;
    return label ? [label] : [];
  }
  if (field.type === 'multi' && Array.isArray(value)) {
    return field.options.filter((o) => value.includes(o.value)).map((o) => o.label);
  }
  return [];
}
