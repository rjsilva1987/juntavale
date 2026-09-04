// src/utils/firestoreError.ts
//
// S169 — extrai o `.code` de um erro do Firestore ("failed-precondition",
// "permission-denied", "unavailable"...) sem importar firebase/firestore
// (tela não importa do SDK — decisão do projeto). Molde do handler inline
// de ChatScreen (S163), agora reusável pelas telas de classificados. O
// código vai pro banner: é o único canal de diagnóstico em campo (cabo é
// banido).
export const getFirestoreErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error as { code: unknown };
  return typeof code === 'string' && code.length > 0 ? code : null;
};
