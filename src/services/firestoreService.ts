// src/services/firestoreService.ts
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { ADMIN_UID } from '@/config/admin';
import { LookingFor } from '@/constants/lookingFor';
import { SUPER_LIKE_LIMIT } from '@/constants/superLike';
import { db, storage } from '@/services/firebase';
import { haversineDistanceKm } from '@/utils/geo';

// ─── Types ───────────────────────────────────────────────

export type Gender = 'masculino' | 'feminino' | 'outro';

export interface DiscoverFilters {
  ageMin: number;
  ageMax: number;
  maxDistance: number;
  gender: Gender | 'all';
  lookingFor: LookingFor | 'all';
}

export interface UserProfile {
  uid: string;
  name: string;
  age: number;
  bio: string;
  photoURL: string;
  photos: string[];
  interests: string[];
  gender?: Gender;
  // Opcional só por causa de contas de teste criadas antes deste campo
  // existir — nas rules (isValidProfile) é obrigatório em create/update pra
  // toda conta nova, nunca fica vazio depois de setado uma vez.
  lookingFor?: LookingFor;
  location?: { lat: number; lng: number };
  filters?: DiscoverFilters;
  createdAt?: Timestamp;
  blockedUsers?: string[];
  verified?: boolean;
}

export interface Match {
  id: string;
  users: string[];
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  typing?: Record<string, boolean>;
  blockedBy?: string[];
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
  imageUrl?: string;
  location?: { latitude: number; longitude: number };
}

// ─── User ─────────────────────────────────────────────────

// Criação do doc público (users/{uid}) e do ChaveF privado
// (users/{uid}/private/registration) é feita num writeBatch único em
// AuthContext.register() — não aqui — pra garantir que os dois setDoc
// entrem juntos ou nenhum entre.

export interface RegistrationPrivate {
  chaveF: string;
  createdAt?: Timestamp;
}

// Admin-only na prática: firestore.rules só libera o read deste doc pro
// próprio dono ou pra isAdmin(). Contas criadas antes do ChaveF existir não
// têm este doc — retorna null nesse caso.
export const getRegistrationPrivate = async (
  uid: string,
): Promise<RegistrationPrivate | null> => {
  const snap = await getDoc(doc(db, 'users', uid, 'private', 'registration'));
  return snap.exists() ? (snap.data() as RegistrationPrivate) : null;
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// ─── Profile photos ───────────────────────────────────────
//
// photos[0] é sempre a principal; photoURL é um espelho de photos[0],
// mantido em sincronia em toda mutação abaixo pra que os consumidores de
// foto única (Likes, Matches, BlockedUsers, AdminVerifications, MatchModal,
// nav params de Chat/MatchProfile, avatar do topo do ProfileScreen)
// continuem corretos sem precisar ler photos[].

export const MAX_PROFILE_PHOTOS = 4;

export const uploadProfilePhoto = async (uid: string, localUri: string): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `avatars/${uid}/${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const addProfilePhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  if (photos.length >= MAX_PROFILE_PHOTOS) {
    throw new Error('MAX_PHOTOS_REACHED');
  }
  const nextPhotos = [...photos, url];
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] });
  return nextPhotos;
};

export const removeProfilePhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  const nextPhotos = photos.filter((p) => p !== url);
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] ?? '' });
  // Órfão no Storage é só custo de armazenamento, não um dado incorreto pro
  // usuário — não vale falhar a remoção (já refletida no Firestore acima)
  // por causa de um erro na limpeza do arquivo.
  await deleteObject(ref(storage, url)).catch(() => {});
  return nextPhotos;
};

export const setPrincipalPhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  // Só reordena as URLs — o arquivo em si não muda de lugar no Storage.
  const nextPhotos = [url, ...photos.filter((p) => p !== url)];
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] });
  return nextPhotos;
};

// ─── Discovery ────────────────────────────────────────────

export const getDiscoverProfiles = async (
  currentUid: string,
  filters?: DiscoverFilters,
  currentLocation?: { lat: number; lng: number },
  blockedUsers?: string[],
): Promise<UserProfile[]> => {
  // Get already-swiped user IDs
  const swipesSnap = await getDocs(
    query(collection(db, 'swipes'), where('from', '==', currentUid)),
  );
  const swipedIds = swipesSnap.docs.map((d) => d.data().to as string);
  // ADMIN_UID nunca aparece no Descobrir, mesmo sem bloqueio/swipe prévio.
  swipedIds.push(currentUid, ADMIN_UID, ...(blockedUsers ?? []));

  // Fetch all users not yet swiped (Firestore doesn't support NOT IN > 10 easily,
  // so for production use a Cloud Function or pagination). Age/gender/distance
  // filters are applied client-side here for the same reason — Firestore's
  // client SDK has no geo-query support, so distance can't be pushed server-side.
  const usersSnap = await getDocs(collection(db, 'users'));
  const profiles: UserProfile[] = [];
  usersSnap.forEach((d) => {
    if (swipedIds.includes(d.id)) return;
    const candidate = d.data() as UserProfile;

    if (filters) {
      if (candidate.age < filters.ageMin || candidate.age > filters.ageMax) return;
      if (filters.gender !== 'all' && candidate.gender !== filters.gender) return;
      if (filters.lookingFor !== 'all' && candidate.lookingFor !== filters.lookingFor) return;
      if (currentLocation && candidate.location) {
        const distance = haversineDistanceKm(currentLocation, candidate.location);
        if (distance > filters.maxDistance) return;
      }
    }

    profiles.push(candidate);
  });
  return profiles;
};

// ─── Swipes & Matches ─────────────────────────────────────

interface SuperLikeUsage {
  year: number;
  month: number;
  count: number;
}

// Lançado por recordSwipe quando o superlike estouraria o limite mensal —
// tipado por 'code' (padrão de erro do Firebase) pra a UI distinguir essa
// falha de qualquer outro erro de rede/permissão sem depender da mensagem.
export class SuperLikeQuotaExceededError extends Error {
  code = 'superlike/quota-exceeded' as const;

  constructor() {
    super('Limite mensal de superlikes atingido.');
    this.name = 'SuperLikeQuotaExceededError';
  }
}

export const recordSwipe = async (
  fromUid: string,
  toUid: string,
  direction: 'like' | 'nope' | 'superlike',
): Promise<boolean> => {
  const swipeRef = doc(db, 'swipes', `${fromUid}_${toUid}`);
  const swipeData = {
    from: fromUid,
    to: toUid,
    direction,
    createdAt: serverTimestamp(),
  };

  if (direction === 'superlike') {
    // Contador mensal em UTC — bate com request.time.year()/month() usados
    // nas rules (getAfter() do batch abaixo), que o servidor calcula em UTC.
    const usageRef = doc(db, 'users', fromUid, 'superLikes', 'usage');
    const usageSnap = await getDoc(usageRef);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const usage = usageSnap.exists() ? (usageSnap.data() as SuperLikeUsage) : null;
    const isSameMonth = usage != null && usage.year === year && usage.month === month;

    if (isSameMonth && usage.count >= SUPER_LIKE_LIMIT) {
      throw new SuperLikeQuotaExceededError();
    }

    const nextCount = isSameMonth ? usage.count + 1 : 1;

    const batch = writeBatch(db);
    batch.set(usageRef, { year, month, count: nextCount });
    batch.set(swipeRef, swipeData);
    await batch.commit();
  } else {
    await setDoc(swipeRef, swipeData);
  }

  if (direction === 'nope') return false;

  // Check if other person already liked me → it's a match!
  const reverseSnap = await getDoc(doc(db, 'swipes', `${toUid}_${fromUid}`));
  if (reverseSnap.exists() && reverseSnap.data().direction !== 'nope') {
    const matchId = [fromUid, toUid].sort().join('_');
    await setDoc(doc(db, 'matches', matchId), {
      users: [fromUid, toUid],
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
    });
    return true; // it's a match!
  }
  return false;
};

export const undoSwipe = async (
  fromUid: string,
  toUid: string,
  isMatch: boolean,
): Promise<void> => {
  await deleteDoc(doc(db, 'swipes', `${fromUid}_${toUid}`));
  if (isMatch) {
    const matchId = [fromUid, toUid].sort().join('_');
    await deleteDoc(doc(db, 'matches', matchId));
  }
};

// ─── Matches ──────────────────────────────────────────────

export const getMatches = (uid: string, callback: (matches: Match[]) => void) => {
  const q = query(collection(db, 'matches'), where('users', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
    callback(matches);
  });
};

export const getMatchById = async (matchId: string): Promise<Match | null> => {
  const snap = await getDoc(doc(db, 'matches', matchId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Match) : null;
};

// ─── Messages ─────────────────────────────────────────────

export const sendMessage = async (
  matchId: string,
  senderId: string,
  text: string,
  imageUrl?: string,
  location?: { latitude: number; longitude: number },
) => {
  const msgRef = collection(db, 'matches', matchId, 'messages');
  await addDoc(msgRef, {
    text,
    senderId,
    createdAt: serverTimestamp(),
    ...(imageUrl ? { imageUrl } : {}),
    ...(location ? { location } : {}),
  });
  await updateDoc(doc(db, 'matches', matchId), {
    lastMessage: imageUrl ? '📷 Foto' : location ? '📍 Localização' : text,
    lastMessageAt: serverTimestamp(),
  });
};

export const uploadChatImage = async (
  matchId: string,
  localUri: string,
  onProgress: (percent: number) => void,
): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/chats/${matchId}/${Date.now()}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      () => resolve(),
    );
  });

  return getDownloadURL(storageRef);
};

export const listenMessages = (matchId: string, callback: (messages: Message[]) => void) => {
  const q = query(collection(db, 'matches', matchId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message);
    callback(messages);
  });
};

// ─── Typing indicator ──────────────────────────────────────

export const setTypingStatus = async (matchId: string, uid: string, isTyping: boolean) => {
  await updateDoc(doc(db, 'matches', matchId), { [`typing.${uid}`]: isTyping });
};

export const listenTypingStatus = (
  matchId: string,
  currentUid: string,
  callback: (isTyping: boolean) => void,
) => {
  return onSnapshot(doc(db, 'matches', matchId), (snap) => {
    const data = snap.data() as Match | undefined;
    const otherUid = data?.users?.find((u) => u !== currentUid);
    callback(Boolean(otherUid && data?.typing?.[otherUid]));
  });
};

// ─── Block status (S19) ─────────────────────────────────────

export const listenMatchBlockStatus = (
  matchId: string,
  callback: (blockedBy: string[]) => void,
) => {
  return onSnapshot(doc(db, 'matches', matchId), (snap) => {
    const data = snap.data() as Match | undefined;
    callback(data?.blockedBy ?? []);
  });
};
