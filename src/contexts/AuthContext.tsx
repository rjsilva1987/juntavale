// src/contexts/AuthContext.tsx
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { LookingFor } from '@/constants/lookingFor';
import { UF } from '@/constants/ufs';
import { Vale } from '@/constants/vale';
import { auth, db } from '@/services/firebase';
import {
  clearSessionSwipes,
  getUserProfile,
  Gender,
  uploadProfilePhoto,
  UserProfile,
} from '@/services/firestoreService';
import { removePushToken } from '@/services/notifications';
import { calculateAge } from '@/utils/birthDate';

// S115 — apelido de login pros dois admins, resolvido em login() abaixo
// (cobre qualquer chamador, não só a LoginScreen). Mapa EXPLÍCITO e fechado:
// só os dois apelidos abaixo viram e-mail; qualquer outro texto passa intacto
// pro Firebase, sem completar domínio genericamente.
const ADMIN_LOGIN_ALIASES: Record<string, string> = {
  admin: 'admin@admin.com',
  admin2: 'admin2@admin.com',
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  register: (
    email: string,
    password: string,
    name: string,
    nickname: string,
    birthDate: Date,
    bio: string,
    interests: string[],
    lookingFor: LookingFor,
    uf: UF,
    vale: Vale,
    gender: Gender,
    photoUri: string,
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
    nickname: string,
    birthDate: Date,
    bio: string,
    interests: string[],
    lookingFor: LookingFor,
    uf: UF,
    vale: Vale,
    gender: Gender,
    photoUri: string,
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // S120 — createUserWithEmailAndPassword acima ainda fica fora do try:
    // se ELE falhar, nenhuma conta Auth chega a existir, não há o que
    // desfazer. A partir daqui (updateProfile, upload da foto, setDoc), a
    // conta Auth já existe — Auth e Firestore/Storage continuam não-atômicos
    // entre si, então qualquer falha destas três chamadas cai no catch, que
    // desfaz a conta Auth recém-criada (deleteUser) antes de relançar o
    // erro. Isso fecha a janela de conta órfã que existia antes (setDoc sem
    // rollback); a única forma de ainda sobrar órfã é o próprio deleteUser
    // falhar (ex.: sem rede no momento do catch) — caso residual, tratado
    // abaixo com console.error identificando o uid órfão, sem mascarar o
    // erro original que já vai pro Alert da tela (o throw continua o mesmo).
    // O ChaveF
    // (users/{uid}/private/registration) não é capturado aqui — segue pedido
    // na VerificationScreen, junto do envio da selfie de verificação (ver
    // submitRegistrationPrivate em firestoreService.ts) — não confundir com
    // a foto de perfil deste cadastro.
    try {
      await updateProfile(cred.user, { displayName: name });
      // S76-A — age é derivado de birthDate, calculado uma vez aqui no cadastro.
      const age = calculateAge(birthDate, new Date());
      const photoURL = await uploadProfilePhoto(cred.user.uid, photoUri);
      const newProfile: Omit<UserProfile, 'uid'> = {
        nickname,
        age,
        bio,
        photoURL,
        photos: [photoURL],
        interests,
        lookingFor,
        uf,
        vale,
        gender,
      };
      // S135 — dois writes atômicos no mesmo batch: doc público (nickname,
      // sem o nome real) + subdocumento privado legalName (nome real, só
      // dono/admin leem — ver firestoreService.ts). Continua dentro do
      // mesmo try que já existia: se qualquer um dos dois falhar, o catch
      // abaixo desfaz a conta Auth recém-criada (deleteUser), cobrindo os
      // dois writes como antes cobria só o do perfil público.
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', cred.user.uid), {
        ...newProfile,
        uid: cred.user.uid,
        birthDate,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', cred.user.uid, 'private', 'legalName'), {
        name,
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      setProfile({ ...newProfile, uid: cred.user.uid });
    } catch (e) {
      await deleteUser(cred.user).catch((rollbackError) => {
        // S120 — o erro original (e) já vai pro Alert da tela via throw
        // abaixo; este console.error é só pra não perder o rastro de QUAL
        // conta ficou órfã quando o próprio rollback falha (caso residual
        // documentado no comentário acima).
        console.error(
          `[AuthContext.register] rollback falhou — uid ${cred.user.uid} pode ter ficado órfão no Auth`,
          rollbackError,
        );
      });
      throw e;
    }
  };

  const login = async (email: string, password: string) => {
    const alias = ADMIN_LOGIN_ALIASES[email.trim().toLowerCase()];
    const cred = await signInWithEmailAndPassword(auth, alias ?? email, password);
    const p = await getUserProfile(cred.user.uid);
    setProfile(p);
  };

  const logout = async () => {
    if (user) {
      await removePushToken(user.uid).catch(() => {});
    }
    await signOut(auth);
    setProfile(null);
    // S57 — a próxima conta a logar neste device não pode herdar os uids
    // decididos pela conta anterior.
    clearSessionSwipes();
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
