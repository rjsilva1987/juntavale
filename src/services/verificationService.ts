// src/services/verificationService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { db, storage } from '@/services/firebase';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Verification {
  status: VerificationStatus;
  selfieUrl: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

export interface PendingVerification extends Verification {
  uid: string;
}

export const submitVerification = async (uid: string, imageUri: string): Promise<void> => {
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `verifications/${uid}/selfie.jpg`);
  await uploadBytes(storageRef, blob);
  const selfieUrl = await getDownloadURL(storageRef);

  // setDoc SEM merge: sobrescreve o documento inteiro, inclusive limpando
  // reviewedAt/reviewedBy de uma revisão anterior. firestore.rules exige que
  // o resultado final do write do dono tenha só ['status','selfieUrl',
  // 'createdAt'] — um updateDoc parcial deixaria campos de revisão antiga
  // no doc e seria rejeitado no reenvio.
  await setDoc(doc(db, 'verifications', uid), {
    status: 'pending',
    selfieUrl,
    createdAt: serverTimestamp(),
  });
};

export const getVerificationStatus = async (uid: string): Promise<Verification | null> => {
  const snap = await getDoc(doc(db, 'verifications', uid));
  return snap.exists() ? (snap.data() as Verification) : null;
};

// Admin-only na prática: firestore.rules só permite este list() pra quem
// bate com isAdmin() (validado no Firestore Emulator com o rules-unit-testing
// antes desta função existir) — qualquer outro uid recebe permission-denied.
export const getPendingVerifications = async (): Promise<PendingVerification[]> => {
  const q = query(
    collection(db, 'verifications'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Verification) }));
};

// Só o admin consegue de fato escrever isso (firestore.rules exige
// affectedKeys hasOnly(['status','reviewedAt','reviewedBy']) + uid == admin).
// A Cloud Function onVerificationReviewed reage a esta mudança e sincroniza
// users/{uid}.verified — não duplicar essa lógica aqui.
export const reviewVerification = async (
  uid: string,
  status: 'approved' | 'rejected',
  reviewerUid: string,
): Promise<void> => {
  await updateDoc(doc(db, 'verifications', uid), {
    status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUid,
  });
};
