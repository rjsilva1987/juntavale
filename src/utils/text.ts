// src/utils/text.ts
//
// S77 — ponto único de contagem de tamanho de texto de usuário. `.length`
// conta code units UTF-16 (um emoji fora do BMP, ex. 😀, vale 2); Array.from
// respeita pares substitutos e conta 1 por code point. Nenhum contador/gate
// de campo de texto deve usar `.length` direto — sempre por aqui, pra não
// divergir da contagem que as rules agora espelham (ver firestore.rules,
// carimbo S77).
export const countCodePoints = (value: string): number => Array.from(value).length;
