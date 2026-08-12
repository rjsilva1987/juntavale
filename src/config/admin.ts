// src/config/admin.ts
// S115 — dois uids administrativos. ADMIN_UIDS é a lista pra checagem
// (isAdminUid); ADMIN_UID continua exportado apontando pro uid ORIGINAL
// porque também é usado como VALOR (não só comparação) em pontos como
// firestoreService.ts (push em swipedIds) e functions/src/index.ts
// (destinatário/remetente de push) — sem "qual dos dois admins" pra decidir
// ali, esses pontos seguem no primeiro uid.
// Rules não importa deste arquivo, então os mesmos dois uids ficam também
// hardcoded, fora daqui, em MAIS QUATRO lugares que precisam ser mantidos em
// sincronia manual: functions/src/index.ts (ADMIN_UIDS local), firestore.rules
// (isAdmin() e a regra de create de matches) e storage.rules (3 literais).
export const ADMIN_UIDS = ['Gd0pJi8WjYS60JHOnhIx9R6vktJ3', '358dfiUwFlbFV0Z3KCyvKXwGGxD3'] as const;

export const ADMIN_UID = ADMIN_UIDS[0];

export function isAdminUid(uid?: string | null): boolean {
  return !!uid && (ADMIN_UIDS as readonly string[]).includes(uid);
}
