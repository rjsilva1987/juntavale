// src/constants/vale.ts
//
// Fonte única do campo "vale" (S83-A): valores internos, rótulos exibidos e
// a lista ordenada usada no seletor de cadastro/filtro. Os valores abaixo
// são literais também em firestore.rules (create/update de users/{userId})
// — mudar um value aqui exige atualizar as rules manualmente, igual ao
// padrão já usado pra LookingFor/UF/ADMIN_UID.
export const VALES = ['BB', 'CAIXA', 'BRB'] as const;

export type Vale = (typeof VALES)[number];

// Record literal (não `.reduce()` com `as Record<...>`): se alguém
// acrescentar um value em VALES sem vir aqui, o TypeScript acusa a chave
// faltando — mesma vantagem de completude que UF_NAMES já tem em ufs.ts.
//
// BB e BRB já são como todo mundo chama esses bancos no dia a dia (a sigla
// É o nome curto, diferente de UF, onde a sigla sozinha não é
// autoexplicativa pra maioria — daí UF_NAMES expandir pro nome do estado).
// CAIXA ganha capitalização normal (Caixa) só porque digitar em CAIXA ALTA
// destoa do resto da UI, mesmo valor.
export const VALE_LABELS: Record<Vale, string> = {
  BB: 'BB',
  CAIXA: 'Caixa',
  BRB: 'BRB',
};

export const VALE_OPTIONS: { value: Vale; label: string }[] = VALES.map((value) => ({
  value,
  label: VALE_LABELS[value],
}));
