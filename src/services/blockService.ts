// src/services/blockService.ts
import { collection, doc, deleteDoc, getDocs, setDoc, addDoc, query, where, serverTimestamp } from 'firebase/firestore';

import { db } from '@/services/firebase';

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
export const reportUser = async (
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
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
) => {
  await addDoc(collection(db, 'reports'), {
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
  });
};

export const getBlockedUsers = async (uid: string): Promise<string[]> => {
  const snap = await getDocs(query(collection(db, 'blocks'), where('blocker', '==', uid)));
  return snap.docs.map((d) => d.data().blocked as string);
};
