// src/services/verificationService.ts
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
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
