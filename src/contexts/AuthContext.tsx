// src/contexts/AuthContext.tsx
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { LookingFor } from '@/constants/lookingFor';
import { auth, db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { removePushToken } from '@/services/notifications';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  register: (
    email: string,
    password: string,
    name: string,
    age: number,
    bio: string,
    interests: string[],
    lookingFor: LookingFor,
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listener do doc users/{uid} em vez de getDoc único — precisa refletir em
    // tempo real quando o admin aprova a verificação (campo `verified`), sem
    // o usuário precisar relogar. unsubProfile é recriado a cada troca de
    // user e encerrado tanto na troca quanto no logout (u === null), pra não
    // vazar listener de um uid antigo.
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubProfile?.();
      unsubProfile = undefined;

      setUser(u);

      if (u) {
        // loading só vira false no primeiro snapshot: entre o setUser acima e
        // a primeira resposta do listener, profile ainda está null — o app
        // não pode considerar o boot concluído nesse meio-tempo.
        let firstSnapshot = true;
        unsubProfile = onSnapshot(doc(db, 'users', u.uid), (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
          if (firstSnapshot) {
            firstSnapshot = false;
            setLoading(false);
          }
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const register = async (
    email: string,
    password: string,
    name: string,
    age: number,
    bio: string,
    interests: string[],
    lookingFor: LookingFor,
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const newProfile: Omit<UserProfile, 'uid'> = {
      name,
      age,
      bio,
      photoURL: '',
      photos: [],
      interests,
      lookingFor,
    };
    // createUserWithEmailAndPassword acima fica fora deste setDoc de
    // propósito — Auth não é Firestore, as duas operações não podem ser
    // atômicas entre si. Se o setDoc abaixo falhar, sobra uma conta Auth sem
    // doc no Firestore. O ChaveF (users/{uid}/private/registration) não é
    // mais capturado aqui — passou a ser pedido na VerificationScreen, junto
    // do envio da selfie (ver submitRegistrationPrivate em firestoreService.ts).
    await setDoc(doc(db, 'users', cred.user.uid), {
      ...newProfile,
      uid: cred.user.uid,
      createdAt: serverTimestamp(),
    });

    setProfile({ ...newProfile, uid: cred.user.uid });
  };

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const p = await getUserProfile(cred.user.uid);
    setProfile(p);
  };

  const logout = async () => {
    if (user) {
      await removePushToken(user.uid).catch(() => {});
    }
    await signOut(auth);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await getUserProfile(user.uid);
      setProfile(p);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, register, login, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};
