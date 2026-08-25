// src/services/momentoService.ts
//
// S121 — camada única de acesso a Firestore/Storage para "momentos" (story
// de 24h). Nenhuma tela importa firebase/firestore diretamente (convenção
// do projeto) — MomentosScreen/MomentoComposerModal/MomentoViewerModal só
// chamam as funções abaixo.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { countCodePoints } from '@/utils/text';

const MOMENTO_TTL_MS = 24 * 60 * 60 * 1000;
export const MOMENTO_TEXT_MAX = 280;

export interface Momento {
  authorId: string;
  type: 'text' | 'photo';
  text?: string;
  photoUrl?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  // S143-B — contador de curtidas, DENORMALIZADO neste doc e escrito SÓ pelo
  // Admin SDK (onMomentoLikeCreated/onMomentoLikeDeleted, functions/src/
  // momentos.ts), nunca pelo client — mesmo padrão de matchesCount em
  // users/{uid} (onMatchCreated, functions/src/chat.ts). Existe porque a
  // subcoleção momentos/{authorUid}/likes só é legível pelo próprio liker ou
  // pelo autor (não anônima, mas também não aberta à base — ver
  // firestore.rules), então um visualizador qualquer não teria como CONTAR
  // a subcoleção direto; o contador aqui no doc PAI é público (mesma
  // audiência do momento em si) sem abrir a lista nominal de curtidores.
  // Ausente == 0 (momento sem curtida ainda, ou publicado antes desta
  // sprint).
  likesCount?: number;
}

export type MomentoWithId = Momento & { id: string };

// Audiência é a base inteira (decisão de produto), não só matches — ver
// firestore.rules. IMPORTANTE: orderBy('expiresAt', ...), nunca
// orderBy('createdAt', ...) combinado com where('expiresAt', ...) — campos
// diferentes em inequality+orderBy exigiriam índice composto manual;
// expiresAt nos dois usa o índice single-field automático. Como
// expiresAt = createdAt + 24h fixo, ordenar por expiresAt desc já equivale a
// ordenar por mais recente primeiro.
export const listenActiveMomentos = (callback: (momentos: MomentoWithId[]) => void) => {
  const q = query(
    collection(db, 'momentos'),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const momentos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Momento) }));
      callback(momentos);
    },
    (error) => {
      console.error('[listenActiveMomentos] erro no listener:', error);
      callback([]);
    },
  );
};

// Doc ID == uid do autor (1 momento ativo por usuário). permission-denied
// aqui significa "momento expirado, rules já negam a leitura, mas a
// function de limpeza (expireMomentos) ainda não varreu o doc" — mesmo
// princípio já usado no projeto (permission-denied = recurso sumiu, não
// erro genérico). Não propaga esse erro pra tela, só null.
export const getMyMomento = async (uid: string): Promise<MomentoWithId | null> => {
  try {
    const snap = await getDoc(doc(db, 'momentos', uid));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Momento) } : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return null;
    throw error;
  }
};

// Mesmo molde de uploadProfilePhoto (firestoreService.ts).
export const uploadMomentoPhoto = async (uid: string, localUri: string): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/momentos/${uid}/${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

// setDoc SEM merge: overwrite total do doc anterior (limite de 1 momento
// ativo por usuário) — some com photoUrl de um momento anterior, se havia.
export const publishTextMomento = async (uid: string, text: string): Promise<void> => {
  const trimmed = text.trim();
  const length = countCodePoints(trimmed);
  if (length < 1 || length > MOMENTO_TEXT_MAX) {
    throw new Error('Texto do momento inválido');
  }
  await setDoc(doc(db, 'momentos', uid), {
    authorId: uid,
    type: 'text',
    text: trimmed,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + MOMENTO_TTL_MS),
  });
};

export const publishPhotoMomento = async (uid: string, photoUrl: string): Promise<void> => {
  await setDoc(doc(db, 'momentos', uid), {
    authorId: uid,
    type: 'photo',
    photoUrl,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + MOMENTO_TTL_MS),
  });
};

// Best-effort: apagar por URL nunca deve travar quem chamou — órfão no
// Storage é só custo de armazenamento, não dado incorreto (mesmo raciocínio
// de removeUserPhoto, firestoreService.ts:348-350). Reusada por
// deleteMyMomento (abaixo) e pelo fluxo de substituição do
// MomentoComposerModal, pra não duplicar a lógica de "apagar por URL
// best-effort".
export const deleteMomentoPhotoBestEffort = async (photoUrl: string): Promise<void> => {
  await deleteObject(ref(storage, photoUrl)).catch(() => {});
};

export const deleteMyMomento = async (uid: string, previousPhotoUrl?: string): Promise<void> => {
  await deleteDoc(doc(db, 'momentos', uid));
  if (previousPhotoUrl) {
    await deleteMomentoPhotoBestEffort(previousPhotoUrl);
  }
};

// ─── Curtir momento (S143-B) ────────────────────────────────
//
// Aberto à base inteira (decisão 1 — momento é público), NÃO anônimo
// (decisão 6: autor vê nome/vale de quem curtiu, nunca legalName). Doc id ==
// likerUid (1 curtida por pessoa por momento) — permite setDoc/deleteDoc
// diretos, sem query prévia, mesmo molde de likePhoto/unlikePhoto (S123,
// firestoreService.ts). permission-denied no toggle concorrente (curtir em
// dois aparelhos quase ao mesmo tempo) é tratado como sucesso silencioso,
// mesmo raciocínio do comentário em likePhoto: setDoc num doc que já existe
// vira "update" aos olhos das rules (negado, allow update é sempre false) e
// deleteDoc num doc que já sumiu também é negado — os dois casos significam
// "o estado final já é o que o usuário queria", não um erro de verdade.
const isPermissionDenied = (error: unknown): boolean =>
  (error as { code?: string })?.code === 'permission-denied';

export const likeMomento = async (authorUid: string, likerUid: string): Promise<void> => {
  try {
    await setDoc(doc(db, 'momentos', authorUid, 'likes', likerUid), {
      likerUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (isPermissionDenied(error)) return;
    throw error;
  }
};

export const unlikeMomento = async (authorUid: string, likerUid: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'momentos', authorUid, 'likes', likerUid));
  } catch (error) {
    if (isPermissionDenied(error)) return;
    throw error;
  }
};

export const hasLikedMomento = async (authorUid: string, uid: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, 'momentos', authorUid, 'likes', uid));
  return snap.exists();
};

export interface MomentoLiker {
  uid: string;
  // null == conta excluída (mesmo raciocínio de reportedNames em
  // MyReportsScreen.tsx) — a UI precisa distinguir isso de "ainda
  // carregando", por isso este campo não é opcional: sempre presente,
  // podendo ser null.
  profile: UserProfile | null;
}

// Lista NOMINAL COMPLETA (decisão 6 — nunca resumo "e mais N"). Só deve ser
// chamada quando authorId === uid do usuário logado: rules negam a leitura
// da subcoleção pra qualquer outro uid (ver firestore.rules), então chamar
// isto como outro usuário sempre falha com permission-denied.
export const getMomentoLikers = async (authorUid: string): Promise<MomentoLiker[]> => {
  const snap = await getDocs(collection(db, 'momentos', authorUid, 'likes'));
  return Promise.all(
    snap.docs.map(async (d) => {
      const uid = d.data().likerUid as string;
      const profile = await getUserProfile(uid);
      return { uid, profile };
    }),
  );
};
