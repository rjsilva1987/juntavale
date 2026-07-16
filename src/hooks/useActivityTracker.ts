// src/hooks/useActivityTracker.ts
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';

// Não regrava lastActiveAt se a última gravação foi há menos disso — evita
// spam de writes a cada volta rápida ao foreground.
export const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000;

export function useActivityTracker() {
  const { user } = useAuth();
  const lastRecordedAt = useRef(0);

  useEffect(() => {
    if (!user) return;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecordedAt.current < ACTIVITY_THROTTLE_MS) return;
      lastRecordedAt.current = now;

      // updateDoc direto (não updateUserProfile): lastActiveAt é Timestamp
      // no UserProfile, mas serverTimestamp() devolve um FieldValue de
      // escrita — mesmo padrão de markMatchRead em firestoreService.ts, que
      // bypassa o helper tipado por Partial<UserProfile> pelo mesmo motivo.
      // Fire-and-forget: falha aqui é só um lastActiveAt desatualizado,
      // nunca pode afetar a UX — catch silencioso (log leve) de propósito.
      updateDoc(doc(db, 'users', user.uid), { lastActiveAt: serverTimestamp() }).catch((err) => {
        console.warn('[useActivityTracker] falha ao gravar lastActiveAt', err);
      });
    };

    recordActivity();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') recordActivity();
    });

    return () => {
      subscription.remove();
    };
  }, [user]);
}
