// src/constants/lookingFor.ts
//
// Fonte única do campo "Busca" (lookingFor): valores internos, rótulos
// exibidos e a lista ordenada usada no seletor de cadastro/filtro. Os
// valores abaixo são literais também em firestore.rules (isValidProfile) —
// mudar um value aqui exige atualizar as rules manualmente, igual ao padrão
// já usado pra ADMIN_UID.
export type LookingFor = 'relacionamento_serio' | 'casual' | 'amizade' | 'descobrindo';

export const LOOKING_FOR_OPTIONS: { value: LookingFor; label: string }[] = [
  { value: 'relacionamento_serio', label: 'Relacionamento sério' },
  { value: 'casual', label: 'Algo casual' },
  { value: 'amizade', label: 'Amizade' },
  { value: 'descobrindo', label: 'Ainda descobrindo' },
];

export const LOOKING_FOR_LABELS: Record<LookingFor, string> = LOOKING_FOR_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<LookingFor, string>,
);
