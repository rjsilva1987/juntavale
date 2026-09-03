// src/constants/listingRejectionReasons.ts
//
// S168-A — Fonte única dos motivos de rejeição de anúncio de classificados,
// mesmo molde de src/constants/rejectionReasons.ts (verificação de perfil).
// Os valores abaixo são literais também em firestore.rules (bloco listings)
// — mudar um value aqui exige atualizar as rules manualmente, igual ao
// padrão já usado em rejectionReasons.ts/lookingFor.ts/supportCategories.ts.
export type ListingRejectionReason =
  | 'item_proibido'
  | 'fotos_inadequadas'
  | 'informacoes_insuficientes'
  | 'suspeita_de_golpe'
  | 'outro_motivo';

export const LISTING_REJECTION_REASON_OPTIONS: {
  value: ListingRejectionReason;
  label: string;
}[] = [
  { value: 'item_proibido', label: 'Item proibido no catálogo de classificados' },
  { value: 'fotos_inadequadas', label: 'Fotos inadequadas ou de baixa qualidade' },
  { value: 'informacoes_insuficientes', label: 'Informações insuficientes no anúncio' },
  { value: 'suspeita_de_golpe', label: 'Suspeita de golpe ou fraude' },
  { value: 'outro_motivo', label: 'Outro motivo' },
];

export const LISTING_REJECTION_REASON_LABELS: Record<ListingRejectionReason, string> =
  LISTING_REJECTION_REASON_OPTIONS.reduce(
    (acc, option) => ({ ...acc, [option.value]: option.label }),
    {} as Record<ListingRejectionReason, string>,
  );
