// src/services/firestoreService.ts
import {
  collection,
  doc,
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

import { db } from '@/services/firebase';

// ─── Types ───────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  name: string;
  age: number;
  bio: string;
  photoURL: string;
  photos: string[];
  interests: string[];
  location?: { lat: number; lng: number };
  createdAt?: Timestamp;
}

export interface Match {
  id: string;
  users: string[];
  lastMessage?: string;
  lastMessageAt?: Timestamp;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
}

// ─── User ─────────────────────────────────────────────────

export const createUserProfile = async (uid: string, data: Omit<UserProfile, 'uid'>) => {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    uid,
    createdAt: serverTimestamp(),
  });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// ─── Discovery ────────────────────────────────────────────

export const getDiscoverProfiles = async (currentUid: string): Promise<UserProfile[]> => {
  // Get already-swiped user IDs
  const swipesSnap = await getDocs(
    query(collection(db, 'swipes'), where('from', '==', currentUid)),
  );
  const swipedIds = swipesSnap.docs.map((d) => d.data().to as string);
  swipedIds.push(currentUid);

  // Fetch all users not yet swiped (Firestore doesn't support NOT IN > 10 easily,
  // so for production use a Cloud Function or pagination)
  const usersSnap = await getDocs(collection(db, 'users'));
  const profiles: UserProfile[] = [];
  usersSnap.forEach((d) => {
    if (!swipedIds.includes(d.id)) {
      profiles.push(d.data() as UserProfile);
    }
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

// ─── Matches ──────────────────────────────────────────────

export const getMatches = (uid: string, callback: (matches: Match[]) => void) => {
  const q = query(collection(db, 'matches'), where('users', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
    callback(matches);
  });
};

// ─── Messages ─────────────────────────────────────────────

export const sendMessage = async (matchId: string, senderId: string, text: string) => {
  const msgRef = collection(db, 'matches', matchId, 'messages');
  await addDoc(msgRef, {
    text,
    senderId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'matches', matchId), {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
  });
};

export const listenMessages = (matchId: string, callback: (messages: Message[]) => void) => {
  const q = query(collection(db, 'matches', matchId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message);
    callback(messages);
  });
};
