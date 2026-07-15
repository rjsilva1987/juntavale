// src/constants/supportCategories.ts
//
// Fonte única das categorias do formulário de Ajuda/Fale Conosco (S36).
// Os valores abaixo são literais também em firestore.rules (bloco support) —
// mudar um value aqui exige atualizar as rules manualmente, igual ao padrão
// já usado em lookingFor.ts.
export type SupportCategory = 'duvida' | 'problema_tecnico' | 'denuncia' | 'sugestao' | 'conta';

export const SUPPORT_CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: 'duvida', label: 'Dúvida' },
  { value: 'problema_tecnico', label: 'Problema técnico' },
  { value: 'denuncia', label: 'Denúncia' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'conta', label: 'Conta e cadastro' },
];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> =
  SUPPORT_CATEGORY_OPTIONS.reduce(
    (acc, option) => ({ ...acc, [option.value]: option.label }),
    {} as Record<SupportCategory, string>,
  );
