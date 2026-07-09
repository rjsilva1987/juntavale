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
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

import { ADMIN_UID } from '@/config/admin';
import { db, storage } from '@/services/firebase';
import { haversineDistanceKm } from '@/utils/geo';

// ─── Types ───────────────────────────────────────────────

export type Gender = 'masculino' | 'feminino' | 'outro';

export interface DiscoverFilters {
  ageMin: number;
  ageMax: number;
  maxDistance: number;
  gender: Gender | 'all';
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

export const recordSwipe = async (
  fromUid: string,
  toUid: string,
  direction: 'like' | 'nope' | 'superlike',
): Promise<boolean> => {
  // Save swipe
  await setDoc(doc(db, 'swipes', `${fromUid}_${toUid}`), {
    from: fromUid,
    to: toUid,
    direction,
    createdAt: serverTimestamp(),
  });

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
