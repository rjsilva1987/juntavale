// src/services/listingService.ts
//
// S168-A — camada única de acesso a Firestore/Storage pra "classificados"
// (anúncios de itens/serviços entre a base, moderados por aprovação prévia,
// exclusivos pra membro verificado). Nenhuma tela importa firebase/firestore
// diretamente (convenção do projeto, ARQUITETURA.md) — ListingsScreen/
// ListingDetailScreen/CreateListingScreen/MyListingsScreen/AdminListingsScreen/
// AdminListingDetailScreen só chamam as funções abaixo. Mesmo molde de
// groupService.ts/verificationService.ts.
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { ListingRejectionReason } from '@/constants/listingRejectionReasons';
import { db, storage } from '@/services/firebase';

// S172 — 'expired' é setado SÓ pela scheduled function `expireListings`
// (functions/src/listings.ts), nunca pelo client; o dono volta pra
// 'approved' via `renewListing` abaixo (nunca por updateListingContent).
export type ListingStatus = 'pending' | 'approved' | 'rejected' | 'sold' | 'removed' | 'expired';
export type ListingPriceType = 'fixed' | 'negotiable' | 'donation';

// S172 — 30 dias, mesmo teto de +31d usado nas rules (folga de 1 dia pro
// relógio do client). Único literal de prazo do módulo: createListing e
// renewListing usam esta constante.
export const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Listing {
  id: string;
  ownerId: string;
  // S135 — nome público é sempre o nickname (nunca o nome legal), copiado de
  // users/{uid}.nickname no create — ver createListing abaixo.
  ownerNickname: string;
  title: string;
  description: string;
  priceType: ListingPriceType;
  // Presente SÓ quando priceType === 'fixed' — ver createListing/
  // updateListingContent (spread condicional / deleteField()).
  price?: number;
  category: string;
  // Copiada de users/{uid}.uf no create; imutável depois (decisão fechada —
  // sem cidade nesta sprint). Nunca reescrita por updateListingContent.
  uf: string;
  photos: string[];
  status: ListingStatus;
  // Só existe quando status é 'rejected' — mesmo padrão de rejectionReason em
  // verifications (verificationService.ts).
  rejectionReason?: ListingRejectionReason;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  createdAt: Timestamp;
  // +30 dias a partir da criação, computado no client (Timestamp.fromMillis).
  // S172 — a expiração de verdade agora é a scheduled function diária
  // `expireListings` (functions/src/listings.ts, approved→expired quando
  // expiresAt vence); o filtro client em listApprovedListings continua
  // existindo como cinto de segurança pro intervalo entre uma rodada e
  // outra da function. Rules de get/list continuam SEM `request.time`
  // (armadilha S139/S125-A do ROADMAP: numa regra de list derruba o list
  // inteiro, não filtra doc a doc).
  expiresAt: Timestamp;
}

// Catálogo fixo de categoria — chaves também literais em firestore.rules
// (bloco listings), mudar aqui exige atualizar as rules manualmente, mesmo
// padrão de lookingFor.ts/supportCategories.ts.
export const LISTING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'eletronicos', label: 'Eletrônicos' },
  { key: 'moveis', label: 'Móveis' },
  { key: 'veiculos', label: 'Veículos' },
  { key: 'roupas', label: 'Roupas' },
  { key: 'imoveis', label: 'Imóveis/aluguel' },
  { key: 'servicos', label: 'Serviços' },
  { key: 'outros', label: 'Outros' },
];

// Mostrado no formulário de criação/edição (CreateListingScreen), acima do
// botão de enviar — moderação humana continua sendo a barreira real (fila de
// aprovação, AdminListingsScreen), isto é só o aviso pro anunciante.
export const PROHIBITED_ITEMS: string[] = [
  'Armas de qualquer tipo',
  'Remédios e produtos de saúde',
  'Bebidas alcoólicas e tabaco',
  'Animais',
  'Produtos financeiros, empréstimos e consórcios',
];

// Molde exato de normalize() em src/components/UfPicker.tsx:34-36 — lowercase
// + remoção de acentos, pra busca por texto (ListingsScreen) tolerante a
// acentuação/caixa. NÃO alterar UfPicker.tsx.
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Molde exato de uploadProfilePhoto (firestoreService.ts:423-429):
// fetch→blob→uploadBytes→getDownloadURL. Path images/listings/{uid}/{ts}.jpg,
// mesma convenção de images/momentos/{uid} (storage.rules).
export const uploadListingPhoto = async (uid: string, localUri: string): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/listings/${uid}/${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export interface CreateListingInput {
  ownerId: string;
  ownerNickname: string;
  uf: string;
  title: string;
  description: string;
  priceType: ListingPriceType;
  price?: number;
  category: string;
  photos: string[];
}

// status nasce sempre 'pending' (moderação prévia) — o client nunca cria um
// anúncio já aprovado. expiresAt = createdAt (aproximado, calculado no
// momento do write) + 30 dias, computado no client (mesmo raciocínio de
// expiresAt opcional em groups — aqui é sempre presente, sem opção "sem
// prazo"). Spread condicional pro campo `price`: molde createGroup
// (groupService.ts:192-215) — quando priceType !== 'fixed', a CHAVE não vai
// no doc (nunca `price: undefined`, que o Firestore rejeitaria de qualquer
// forma).
export const createListing = async (input: CreateListingInput): Promise<string> => {
  const ref = await addDoc(collection(db, 'listings'), {
    ownerId: input.ownerId,
    ownerNickname: input.ownerNickname,
    title: input.title,
    description: input.description,
    priceType: input.priceType,
    ...(input.priceType === 'fixed' ? { price: input.price } : {}),
    category: input.category,
    uf: input.uf,
    photos: input.photos,
    status: 'pending' as const,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + LISTING_TTL_MS),
  });
  return ref.id;
};

export interface UpdateListingContentInput {
  title: string;
  description: string;
  priceType: ListingPriceType;
  price?: number;
  category: string;
  photos: string[];
}

// Edição do dono: SEMPRE volta pra 'pending' (fila de moderação de novo) —
// nunca preserva 'approved'/'rejected'. Só os campos de conteúdo listados
// abaixo — ownerId/ownerNickname/uf/createdAt/expiresAt são imutáveis por
// aqui (reforçado nas rules, allow update do dono). deleteField() quando
// priceType deixa de ser 'fixed', pro caso de editar um anúncio que já tinha
// price gravado de uma versão anterior (mesmo raciocínio de aprovar depois
// de rejeitar em reviewVerification, verificationService.ts).
export const updateListingContent = async (
  id: string,
  input: UpdateListingContentInput,
): Promise<void> => {
  await updateDoc(doc(db, 'listings', id), {
    title: input.title,
    description: input.description,
    priceType: input.priceType,
    price: input.priceType === 'fixed' ? input.price : deleteField(),
    category: input.category,
    photos: input.photos,
    status: 'pending' as const,
  });
};

export const markListingSold = async (id: string): Promise<void> => {
  await updateDoc(doc(db, 'listings', id), { status: 'sold' as const });
};

// S176 — best-effort por URL (nunca por prefixo: o path é
// images/listings/{uid}/{fileName}, sem listingId, então apagar por prefixo
// levaria fotos de OUTROS anúncios do mesmo dono). Roda DEPOIS do updateDoc
// de removeListing — se a rule negar o status, nada é apagado.
export const deleteListingPhotosBestEffort = async (photos: string[]): Promise<void> => {
  await Promise.all(photos.map((url) => deleteObject(ref(storage, url)).catch(() => {})));
};

// Soft delete — nunca deleteDoc (mesmo padrão de moderação/histórico já
// usado no projeto, ex.: blocks/verifications nunca são apagados).
export const removeListing = async (id: string, photos: string[]): Promise<void> => {
  await updateDoc(doc(db, 'listings', id), { status: 'removed' as const });
  await deleteListingPhotosBestEffort(photos);
};

// S176 — espelha o ramo de edição do allow update do dono (firestore.rules,
// status in ['pending','approved','rejected','expired']); sold/removed dão
// permission-denied.
export const canEditListing = (status: Listing['status']): boolean =>
  status === 'pending' || status === 'approved' || status === 'rejected' || status === 'expired';

// S172 — renovação em 1 toque: expired → approved com +30 dias, SEM voltar
// pra fila (conteúdo não mudou). Rules só aceitam esse par de campos e só a
// partir de 'expired' (ramo próprio do allow update do dono).
export const renewListing = async (id: string): Promise<void> => {
  await updateDoc(doc(db, 'listings', id), {
    status: 'approved' as const,
    expiresAt: Timestamp.fromMillis(Date.now() + LISTING_TTL_MS),
  });
};

// permission-denied aqui significa "anúncio removido/inacessível pro uid
// atual" (mesmo princípio de getGroup, groupService.ts) — nunca erro
// genérico; ListingDetailScreen trata como "anúncio indisponível".
export const getListing = async (id: string): Promise<Listing | null> => {
  try {
    const snap = await getDoc(doc(db, 'listings', id));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Listing, 'id'>) } : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return null;
    throw error;
  }
};

// Feed público (ListingsScreen, gate de verificado): só aprovados, mais
// recentes primeiro, teto de 100. Filtro de expiração é CLIENT
// (expiresAt.toMillis() > Date.now()) — a query não usa where('expiresAt',
// '>', ...) de propósito (armadilha S139/S125-A: condição de request.time
// dentro da regra de list derruba o list inteiro).
export const listApprovedListings = async (): Promise<Listing[]> => {
  const q = query(
    collection(db, 'listings'),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  const now = Date.now();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, 'id'>) }))
    .filter((listing) => listing.expiresAt.toMillis() > now);
};

// "Meus anúncios" (MyListingsScreen) — todos os status do dono, mais
// recentes primeiro, exceto 'removed' (soft delete, filtrado no client).
export const listMyListings = async (uid: string): Promise<Listing[]> => {
  const q = query(
    collection(db, 'listings'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, 'id'>) }))
    .filter((listing) => listing.status !== 'removed');
};

// Fila de moderação (AdminListingsScreen) — mais antigo primeiro, mesmo
// critério de getPendingVerifications (verificationService.ts).
// S169 — a query consulta `createdAt desc` e inverte no cliente: a doc do
// Firestore exige um índice composto POR DIREÇÃO (`==` + orderBy asc e
// `==` + orderBy desc são índices distintos), e firestore.indexes.json só
// declara (status ASC, createdAt DESC) — o mesmo que listApprovedListings
// usa. Consultar `asc` aqui exigiria um 3º índice que nunca foi declarado
// nem deployado: era isso que devolvia failed-precondition e travava a
// fila. Fila é pequena e sem limit, inverter em memória custa nada.
export const listPendingListings = async (): Promise<Listing[]> => {
  const q = query(
    collection(db, 'listings'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, 'id'>) })).reverse();
};

// Molde de reviewVerification (verificationService.ts:104-115) — union
// discriminada por status: TypeScript já obriga rejectionReason a existir
// quando status é 'rejected' e proíbe passá-lo quando é 'approved'.
// deleteField() em vez de omitir a chave: cobre o caso de reprovar/aprovar em
// sequência sobre o mesmo doc, quando ele já tem rejectionReason de uma
// revisão anterior.
// S172-A — TODA aprovação renova o prazo (+30 dias a partir de agora), mesmo
// teto de +31d do create e de renewListing nas rules. Sem isso um anúncio
// expirado que o dono editou (volta pra pending com expiresAt vencido)
// expiraria de novo na rodada seguinte de expireListings. Recusa não toca
// expiresAt.
export const reviewListing = async (
  id: string,
  decision:
    { status: 'approved' } | { status: 'rejected'; rejectionReason: ListingRejectionReason },
  adminUid: string,
): Promise<void> => {
  await updateDoc(doc(db, 'listings', id), {
    status: decision.status,
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
    rejectionReason: decision.status === 'rejected' ? decision.rejectionReason : deleteField(),
    // S172-A — TODA aprovação renova o prazo (+30 dias a partir de agora),
    // mesmo teto de +31d do create e de renewListing nas rules. Sem isso um
    // anúncio expirado que o dono editou (volta pra pending com expiresAt
    // vencido) expiraria de novo na rodada seguinte de expireListings.
    // Recusa não toca expiresAt.
    ...(decision.status === 'approved'
      ? { expiresAt: Timestamp.fromMillis(Date.now() + LISTING_TTL_MS) }
      : {}),
  });
};

const listingPriceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatListingPrice(listing: Pick<Listing, 'priceType' | 'price'>): string {
  if (listing.priceType === 'fixed') return listingPriceFormatter.format(listing.price ?? 0);
  if (listing.priceType === 'donation') return 'Doação';
  return 'A combinar';
}
