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

export const reportUser = async (
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  details?: string,
) => {
  await addDoc(collection(db, 'reports'), {
    reporterId,
    reportedId,
    reason,
    details: details ?? '',
    createdAt: serverTimestamp(),
  });
};

export const getBlockedUsers = async (uid: string): Promise<string[]> => {
  const snap = await getDocs(query(collection(db, 'blocks'), where('blocker', '==', uid)));
  return snap.docs.map((d) => d.data().blocked as string);
};
