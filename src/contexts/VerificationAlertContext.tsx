// src/contexts/VerificationAlertContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { Verification } from '@/services/verificationService';

// S78 — mesmo padrão de chave do onboarding (navigation/index.tsx):
// prefixo @juntavale:, valor string. Guardamos millis (string) de
// reviewedAt, não a data formatada — comparação é number vs number, nunca
// string vs string.
const VERIFICATION_SEEN_AT_KEY = '@juntavale:verification_seen_at';

interface VerificationAlertContextType {
  // true quando reviewedAt existe e é mais novo que o "visto" local (ou
  // quando não há nada guardado ainda) — aprovação OU rejeição, sem
  // distinguir uma da outra (decisão do S78: aparece nos dois casos).
  showAlert: boolean;
  // Marca o reviewedAt ATUAL como visto (grava o millis dele na chave).
  // Chamada pela VerificationScreen ao abrir.
  markSeen: () => Promise<void>;
}

const VerificationAlertContext = createContext<VerificationAlertContextType>({
  showAlert: false,
  markSeen: async () => {},
});

export const useVerificationAlert = () => useContext(VerificationAlertContext);

// S78-correção — virou Context (mesmo padrão do AuthContext): um único
// onSnapshot em verifications/{uid} e um único estado de "visto",
// compartilhados pelos três consumidores (navigation, ProfileScreen,
// VerificationScreen). Antes, cada `useVerificationAlert()` era um hook
// solto — três listeners independentes na mesma coleção, e o markSeen de um
// não atualizava o estado dos outros dois (o badge da aba só sumiria depois
// de um re-render por outro motivo, nunca na hora).
export const VerificationAlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [reviewedAtMillis, setReviewedAtMillis] = useState<number | null>(null);
  const [seenAtMillis, setSeenAtMillis] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setReviewedAtMillis(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'verifications', user.uid), (snap) => {
      const data = snap.exists() ? (snap.data() as Verification) : null;
      // Sem reviewedAt (nunca revisado, ou reenvio que limpou o doc via
      // setDoc sem merge em submitVerification) — trata como "nada a
      // avisar", nunca como alerta preso de uma revisão antiga.
      setReviewedAtMillis(data?.reviewedAt ? data.reviewedAt.toMillis() : null);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    AsyncStorage.getItem(VERIFICATION_SEEN_AT_KEY).then((value) => {
      setSeenAtMillis(value ? Number(value) : null);
    });
  }, []);

  const markSeen = useCallback(async () => {
    if (reviewedAtMillis == null) return;
    await AsyncStorage.setItem(VERIFICATION_SEEN_AT_KEY, String(reviewedAtMillis));
    setSeenAtMillis(reviewedAtMillis);
  }, [reviewedAtMillis]);

  const showAlert =
    reviewedAtMillis != null && (seenAtMillis == null || reviewedAtMillis > seenAtMillis);

  return (
    <VerificationAlertContext.Provider value={{ showAlert, markSeen }}>
      {children}
    </VerificationAlertContext.Provider>
  );
};
