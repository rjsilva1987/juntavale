// src/constants/chaveF.ts

// Formato da matricula: ate uma letra maiuscula opcional na frente + 1 a 7
// digitos (ex: F1234567, 123456, A42). Antes era ^F\d{7}$ (so BB); relaxado no
// S-Matricula pra aceitar CAIXA e BRB, que tem outros formatos. E relaxamento
// PURO — toda matricula F+7digitos anterior continua casando, sem migracao.
export const MATRICULA_REGEX = /^[A-Z]?\d{1,7}$/;
