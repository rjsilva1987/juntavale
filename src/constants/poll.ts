// src/constants/poll.ts
//
// Enquete no perfil (S126) — pergunta fixa + opções de múltipla escolha,
// texto livre (sem catálogo, ao contrário de PROMPTS_CATALOG). Teto de
// opções e de tamanho espelhados manualmente em firestore.rules (Rules não
// importa src/) — ver comentário lá.
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 5;
export const MAX_POLL_QUESTION_LENGTH = 100;
export const MAX_POLL_OPTION_LENGTH = 40;
