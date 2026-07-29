// src/constants/vale.ts
//
// Fonte única do campo "vale" (S83-A): valores internos, rótulos exibidos e
// a lista ordenada usada no seletor de cadastro/filtro. Os valores abaixo
// são literais também em firestore.rules (create/update de users/{userId})
// — mudar um value aqui exige atualizar as rules manualmente, igual ao
// padrão já usado pra LookingFor/UF/ADMIN_UID.
//
// Rótulos: BB e BRB já são como todo mundo chama esses bancos no dia a dia
// (a sigla É o nome curto, diferente de UF, onde a sigla sozinha não é
// autoexplicativa pra a maioria — daí UF_NAMES expandir pro nome do estado).
// CAIXA ganha capitalização normal (Caixa) só porque digitar em CAIXA ALTA
// destoa do resto da UI, mesmo valor.
export type Vale = 'BB' | 'CAIXA' | 'BRB';

export const VALE_OPTIONS: { value: Vale; label: string }[] = [
  { value: 'BB', label: 'BB' },
  { value: 'CAIXA', label: 'Caixa' },
  { value: 'BRB', label: 'BRB' },
];

export const VALE_LABELS: Record<Vale, string> = VALE_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<Vale, string>,
);
