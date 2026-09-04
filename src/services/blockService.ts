// src/services/blockService.ts
import { collection, doc, deleteDoc, getDocs, setDoc, addDoc, query, where, serverTimestamp } from 'firebase/firestore';

import { db } from '@/services/firebase';
import { countCodePoints } from '@/utils/text';

export type ReportReason =
  | 'spam'
  | 'offensive_content'
  | 'fake_profile'
  | 'inappropriate_behavior'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  offensive_content: 'Conteúdo ofensivo',
  fake_profile: 'Perfil falso',
  inappropriate_behavior: 'Comportamento inadequado',
  other: 'Outro',
};

// S168-B2 — motivos de denúncia de ANÚNCIO (ListingDetailScreen). 'other' é
// compartilhado com ReportReason de propósito (mesma chave, mesmo label).
export type ListingReportReason =
  | 'prohibited_item'
  | 'scam_or_suspicious_price'
  | 'duplicate_listing'
  | 'inappropriate_content'
  | 'other';

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  prohibited_item: 'Item proibido',
  scam_or_suspicious_price: 'Golpe ou preço suspeito',
  duplicate_listing: 'Anúncio duplicado',
  inappropriate_content: 'Conteúdo impróprio',
  other: 'Outro',
};

export type AnyReportReason = ReportReason | ListingReportReason;

// Rótulo de qualquer denúncia (painel admin, MyReports, ReportThread).
export const ALL_REPORT_REASON_LABELS: Record<AnyReportReason, string> = {
  ...REPORT_REASON_LABELS,
  ...LISTING_REPORT_REASON_LABELS,
};

// S168-B2 — trunca pro teto de 80 code points que firestore.rules exige em
// listingTitle (reports/{reportId}) — mesmo mecanismo de truncateReplyQuote
// (ListingChatScreen.tsx), sem util compartilhada pronta pra reusar aqui.
const truncateListingTitle = (value: string): string =>
  countCodePoints(value) > 80 ? Array.from(value).slice(0, 80).join('') : value;

// S168-B2 — traduz o permission-denied provocado pelo id determinístico
// (ver reportUser abaixo) em "você já denunciou isso", sem espalhar a
// checagem de err.code pelos callers novos (ListingDetailScreen/
// ListingChatScreen).
export const isDuplicateReportError = (err: unknown): boolean =>
  (err as { code?: string })?.code === 'permission-denied';

export const blockUser = async (blockerUid: string, blockedUid: string) => {
  await setDoc(doc(db, 'blocks', `${blockerUid}_${blockedUid}`), {
    blocker: blockerUid,
    blocked: blockedUid,
    createdAt: serverTimestamp(),
  });
};

export const unblockUser = async (blockerUid: string, blockedUid: string) => {
  await deleteDoc(doc(db, 'blocks', `${blockerUid}_${blockedUid}`));
};

// S102-C — messageContext: presente só quando a denúncia parte de uma
// mensagem específica do chat (ChatScreen.handleReportMessage), reusa a
// mesma coleção/fila de denúncia de perfil (S96). messageImageUrl só entra
// no addDoc se a mensagem denunciada tinha foto.
// S121 — momentoContext: presente só quando a denúncia parte de um momento
// (story de 24h) específico (MomentoViewerModal), mesmo molde de
// messageContext acima. Quem chama decide qual dos dois contexts passar —
// nunca os dois juntos na mesma chamada, a função não valida mutex entre
// eles.
// S124-A — groupContext: presente só quando a denúncia parte de um grupo
// (GroupDetailScreen/GroupChatScreen), mesmo molde dos dois acima. Quem
// chama decide o reportedId (== creatorId do grupo) — esta função não
// resolve isso sozinha.
// S125 — eventContext: presente só quando a denúncia parte de um evento
// (EventDetailScreen), mirror EXATO de groupContext — reportedId, nesse
// caso, é sempre o creatorId do EVENTO (decisão 8: nunca um participante
// específico), resolvido por quem chama, não por esta função.
// S143-B — momentoRequestContext: presente só quando a denúncia parte de
// uma mensagem/pedido dentro de um momentoRequests/{requestId}
// (MomentoRequestChatScreen/MomentoRequestsScreen), sem match. Ao contrário
// de messageContext/momentoContext acima, aqui não há um campo de texto
// dedicado (ex.: "momentoRequestText") — o conteúdo denunciado já é texto
// puro da própria mensagem/pedido, sem novo teto pra inventar (escopo desta
// sprint). momentoRequestSenderId é o senderId ORIGINAL do pedido — dá
// contexto de qual dos dois papéis (autor ou remetente) era o senderId,
// já que reportedId sozinho não diz isso.
// S168-B2 — listingContext: denúncia de um ANÚNCIO inteiro
// (ListingDetailScreen), reportedId é o ownerId do anúncio. listingChatContext:
// denúncia da PESSOA dentro de um chat de classificado (ListingChatScreen),
// reportedId é o outro participante. Os dois usam id DETERMINÍSTICO em vez
// de addDoc (ver dispatch no fim da função) — é a dedup: 2ª denúncia do
// mesmo uid pro mesmo alvo vira UPDATE do doc já existente, que só o admin
// pode (firestore.rules), e o setDoc falha com permission-denied
// (isDuplicateReportError acima traduz isso pro client). Nunca os dois
// contexts juntos na mesma chamada, mesma regra de mutex dos contexts acima.
export const reportUser = async (
  reporterId: string,
  reportedId: string,
  reason: AnyReportReason,
  details?: string,
  messageContext?: {
    matchId: string;
    messageId: string;
    messageText: string;
    messageImageUrl?: string;
  },
  momentoContext?: {
    momentoId: string;
    momentoText?: string;
    momentoPhotoUrl?: string;
  },
  groupContext?: {
    groupId: string;
    groupName: string;
  },
  eventContext?: {
    eventId: string;
    eventName: string;
  },
  momentoRequestContext?: {
    momentoRequestId: string;
    momentoRequestSenderId: string;
  },
  listingContext?: { listingId: string; listingTitle: string },
  listingChatContext?: {
    listingChatId: string;
    listingId: string;
    ownerId: string;
    interestedId: string;
    listingTitle: string;
  },
) => {
  const data = {
    reporterId,
    reportedId,
    reason,
    details: details ?? '',
    createdAt: serverTimestamp(),
    status: 'open',
    ...(messageContext
      ? {
          matchId: messageContext.matchId,
          messageId: messageContext.messageId,
          messageText: messageContext.messageText,
          ...(messageContext.messageImageUrl
            ? { messageImageUrl: messageContext.messageImageUrl }
            : {}),
        }
      : {}),
    ...(momentoContext
      ? {
          momentoId: momentoContext.momentoId,
          ...(momentoContext.momentoText ? { momentoText: momentoContext.momentoText } : {}),
          ...(momentoContext.momentoPhotoUrl
            ? { momentoPhotoUrl: momentoContext.momentoPhotoUrl }
            : {}),
        }
      : {}),
    ...(groupContext
      ? {
          groupId: groupContext.groupId,
          groupName: groupContext.groupName,
        }
      : {}),
    ...(eventContext
      ? {
          eventId: eventContext.eventId,
          eventName: eventContext.eventName,
        }
      : {}),
    ...(momentoRequestContext
      ? {
          momentoRequestId: momentoRequestContext.momentoRequestId,
          momentoRequestSenderId: momentoRequestContext.momentoRequestSenderId,
        }
      : {}),
    ...(listingContext
      ? {
          listingId: listingContext.listingId,
          listingTitle: truncateListingTitle(listingContext.listingTitle),
        }
      : {}),
    ...(listingChatContext
      ? {
          listingChatId: listingChatContext.listingChatId,
          listingId: listingChatContext.listingId,
          listingOwnerId: listingChatContext.ownerId,
          listingInterestedId: listingChatContext.interestedId,
          listingTitle: truncateListingTitle(listingChatContext.listingTitle),
        }
      : {}),
  };

  // Dedup por id determinístico: só entra aqui quando a denúncia carrega
  // contexto de listing — doc já existente faz o setDoc virar UPDATE nas
  // rules (só admin pode), então a 2ª denúncia do mesmo uid pro mesmo alvo
  // falha com permission-denied em vez de criar um 2º doc. Sem contexto de
  // listing, comportamento INTOCADO: addDoc com id aleatório, como sempre foi.
  if (listingContext) {
    await setDoc(doc(db, 'reports', `listing_${listingContext.listingId}_${reporterId}`), data);
    return;
  }
  if (listingChatContext) {
    await setDoc(
      doc(db, 'reports', `listingChat_${listingChatContext.listingChatId}_${reporterId}`),
      data,
    );
    return;
  }
  await addDoc(collection(db, 'reports'), data);
};

export const getBlockedUsers = async (uid: string): Promise<string[]> => {
  const snap = await getDocs(query(collection(db, 'blocks'), where('blocker', '==', uid)));
  return snap.docs.map((d) => d.data().blocked as string);
};
