// src/constants/chaveF.ts

// Formato exigido pra ChaveF: letra F maiúscula + exatamente 7 dígitos (ex:
// F1234567). Usado tanto na validação client-side (VerificationScreen)
// quanto para normalizar o input (toUpperCase) antes de validar/gravar.
export const CHAVEF_REGEX = /^F\d{7}$/;
