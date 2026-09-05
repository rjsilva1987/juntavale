// src/services/adminService.ts
//
// S180-B — camada única de acesso a Firestore/Cloud Function pro admin
// encerrar/excluir grupos, eventos e anúncios (aba "Comunidade" +
// "Todos" em Classificados). Nenhuma tela importa firebase/firestore
// diretamente (convenção do projeto) — AdminCommunityScreen/
// AdminListingsScreen só chamam as funções abaixo. Reusa os tipos
// Group/Event/Listing já definidos em groupService/eventService/
// listingService, sem duplicar shape.
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { Event } from '@/services/eventService';
import { db, functions } from '@/services/firebase';
import { Group } from '@/services/groupService';
import { Listing } from '@/services/listingService';

// Sem where/orderBy no servidor de propósito (lista TODA a collection, sem
// filtro de status): índice único (createdAt) já cobre a query, sem exigir
// índice composto novo. Ordenação client-side, tolerando createdAt ausente
// (defensivo — todo doc de verdade tem createdAt, mas evita um crash caso
// algum doc legado não tenha).
export const listAllGroups = async (): Promise<Group[]> => {
  const snap = await getDocs(collection(db, 'groups'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Group, 'id'>) }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
};

export const listAllEvents = async (): Promise<Event[]> => {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Event, 'id'>) }))
    .sort((a, b) => (b.startsAt?.toMillis() ?? 0) - (a.startsAt?.toMillis() ?? 0));
};

export const listAllListings = async (): Promise<Listing[]> => {
  const snap = await getDocs(collection(db, 'listings'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, 'id'>) }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
};

// "Encerrar" grupo — update direto do client, sob o ramo admin novo do
// allow update de groups/{groupId} (firestore.rules, S180-B):
// hasOnly(['status','removedAt','removedBy']), status fixo 'removed',
// removedAt/removedBy do próprio request.
export const adminCloseGroup = async (groupId: string, adminUid: string): Promise<void> => {
  await updateDoc(doc(db, 'groups', groupId), {
    status: 'removed' as const,
    removedAt: serverTimestamp(),
    removedBy: adminUid,
  });
};

// "Cancelar" evento — mirror de adminCloseGroup, ramo admin novo do allow
// update de events/{eventId} (firestore.rules, S180-B).
export const adminCancelEvent = async (eventId: string, adminUid: string): Promise<void> => {
  await updateDoc(doc(db, 'events', eventId), {
    status: 'cancelled' as const,
    cancelledAt: serverTimestamp(),
    cancelledBy: adminUid,
  });
};

// "Remover" anúncio — reusa o ramo admin JÁ EXISTENTE do allow update de
// listings/{listingId} (hasOnly(['status','reviewedAt','reviewedBy',
// 'rejectionReason','expiresAt']), status in [...,'removed']); sem
// rejectionReason/expiresAt, mesmo shape de reviewListing (listingService.ts)
// quando não é 'rejected'/'approved'. SEM apagar fotos — storage.rules não
// libera delete pro admin (mesma ressalva da spec).
export const adminRemoveListing = async (listingId: string, adminUid: string): Promise<void> => {
  await updateDoc(doc(db, 'listings', listingId), {
    status: 'removed' as const,
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
  });
};

// "Excluir" (grupo/evento/anúncio) — o client não consegue apagar em
// cascata sozinho (rules não liberam), por isso é callable com Admin SDK.
// Ver functions/src/admin.ts (adminDeleteContent).
export const adminDeleteContent = async (
  kind: 'group' | 'event' | 'listing',
  id: string,
): Promise<void> => {
  const call = httpsCallable(functions, 'adminDeleteContent');
  await call({ kind, id });
};
