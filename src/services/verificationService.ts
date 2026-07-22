// src/services/verificationService.ts
import {
  collection,
  deleteField,
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

import { RejectionReason } from '@/constants/rejectionReasons';
import { db, storage } from '@/services/firebase';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Verification {
  status: VerificationStatus;
  selfieUrl: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  // S58 — só existe quando status é 'rejected'; nunca gravado (nem
  // undefined) numa aprovação. Ver reviewVerification.
  rejectionReason?: RejectionReason;
}

export interface PendingVerification extends Verification {
  uid: string;
}

// TEMPORÁRIO — DIAGNÓSTICO: loga qual etapa falhou (com code/message quando
// existirem) e relança o MESMO erro sem alterá-lo — chamado via .catch() em
// cada etapa de submitVerification abaixo, então o comportamento da função
// não muda (continua rejeitando exatamente como antes).
const logStepFailure = (step: string, error: unknown): never => {
  const err = error as { code?: string; message?: string };
  console.error(`[submitVerification] falha no ${step}:`, error, err?.code, err?.message);
  throw error;
};

export const submitVerification = async (uid: string, imageUri: string): Promise<void> => {
  const response = await fetch(imageUri).catch((error) => logStepFailure('fetch', error));
  const blob = await response.blob().catch((error) => logStepFailure('blob', error));

  const storageRef = ref(storage, `verifications/${uid}/selfie.jpg`);
  await uploadBytes(storageRef, blob).catch((error) => logStepFailure('uploadBytes', error));
  const selfieUrl = await getDownloadURL(storageRef).catch((error) =>
    logStepFailure('getDownloadURL', error),
  );

  // setDoc SEM merge: sobrescreve o documento inteiro, inclusive limpando
  // reviewedAt/reviewedBy de uma revisão anterior. firestore.rules exige que
  // o resultado final do write do dono tenha só ['status','selfieUrl',
  // 'createdAt'] — um updateDoc parcial deixaria campos de revisão antiga
  // no doc e seria rejeitado no reenvio.
  await setDoc(doc(db, 'verifications', uid), {
    status: 'pending',
    selfieUrl,
    createdAt: serverTimestamp(),
  }).catch((error) => logStepFailure('setDoc', error));
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
// affectedKeys hasOnly(['status','reviewedAt','reviewedBy','rejectionReason'])
// + uid == admin). A Cloud Function onVerificationReviewed reage a esta
// mudança e sincroniza users/{uid}.verified (e dispara o push de resultado)
// — não duplicar essa lógica aqui.
//
// S58 — `decision` é uma union discriminada por `status`: o TypeScript já
// obriga rejectionReason a existir quando status é 'rejected' e PROÍBE
// passá-lo quando é 'approved' — não dá pra chamar errado.
//
// S58 (correção) — aprovar usa deleteField() em vez de simplesmente omitir
// a chave: cobre o caso de rejeitar por engano e aprovar depois, quando o
// doc já tem rejectionReason de uma revisão anterior — sem isso a chave
// continuaria em request.resource.data e as rules negariam a aprovação.
// deleteField() num campo que nunca existiu é no-op (Firestore documenta
// isso), então aprovar um doc "limpo" continua funcionando igual.
export const reviewVerification = async (
  uid: string,
  decision: { status: 'approved' } | { status: 'rejected'; rejectionReason: RejectionReason },
  reviewerUid: string,
): Promise<void> => {
  await updateDoc(doc(db, 'verifications', uid), {
    status: decision.status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUid,
    rejectionReason: decision.status === 'rejected' ? decision.rejectionReason : deleteField(),
  });
};
