// src/constants/rejectionReasons.ts
//
// Fonte única dos motivos de rejeição da verificação de perfil (S58). Os
// valores abaixo são literais também em firestore.rules (bloco
// verifications) — mudar um value aqui exige atualizar as rules
// manualmente, igual ao padrão já usado em lookingFor.ts/supportCategories.ts.
export type RejectionReason =
  | 'chave_f_invalida'
  | 'selfie_ilegivel'
  | 'rosto_nao_confere'
  | 'nao_e_ao_vivo'
  | 'varias_pessoas'
  | 'requisitos_gerais';

export const REJECTION_REASON_OPTIONS: { value: RejectionReason; label: string }[] = [
  { value: 'chave_f_invalida', label: 'Chave F não encontrada ou inválida' },
  { value: 'selfie_ilegivel', label: 'Selfie sem qualidade ou rosto não identificável' },
  { value: 'rosto_nao_confere', label: 'Rosto da selfie não confere com as fotos do perfil' },
  {
    value: 'nao_e_ao_vivo',
    label: 'A selfie não é uma foto ao vivo (foto de foto ou de tela)',
  },
  { value: 'varias_pessoas', label: 'Mais de uma pessoa na selfie' },
  { value: 'requisitos_gerais', label: 'A selfie não atende aos requisitos de verificação' },
];

export const REJECTION_REASON_LABELS: Record<RejectionReason, string> =
  REJECTION_REASON_OPTIONS.reduce(
    (acc, option) => ({ ...acc, [option.value]: option.label }),
    {} as Record<RejectionReason, string>,
  );
