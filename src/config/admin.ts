// src/config/admin.ts
// uid da conta administrativa — nunca deve aparecer no Descobrir/Swipe nem
// dar match com usuários comuns. Ver também o uid hardcoded (mesmo valor)
// em firestore.rules, na regra de create de matches — Rules não importa
// deste arquivo, então os dois precisam ser mantidos em sincronia manualmente.
export const ADMIN_UID = 'Gd0pJi8WjYS60JHOnhIx9R6vktJ3';
