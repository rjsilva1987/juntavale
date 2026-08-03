// src/contexts/SupportAlertContext.tsx
//
// S84 — aviso in-app de resposta em chamado. O push ja existe
// (onSupportMessageCreated), este contexto e so o aviso dentro do app, pra
// quem nao tocou na notificacao ou esta com push desligado.
//
// lastMessageAt muda com QUALQUER mensagem, inclusive as do proprio usuario —
// por isso markSeen e chamado tambem DEPOIS DE ENVIAR (ver
// SupportThreadScreen), senao a pessoa escreve e acende o proprio aviso.
//
// IMPRECISAO DELIBERADA: um carimbo so, o maior lastMessageAt entre todos os
// tickets, em vez de um por ticket. Com varios chamados abertos, abrir um
// marca todos como vistos. Simplifica muito e o caso e raro; nao e bug.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { subscribeMyTickets } from '@/services/supportService';

const SUPPORT_SEEN_AT_KEY = '@juntavale:support_seen_at';

interface SupportAlertContextType {
  showAlert: boolean;
  markSeen: () => Promise<void>;
}

const SupportAlertContext = createContext<SupportAlertContextType>({
  showAlert: false,
  markSeen: async () => {},
});

export const useSupportAlert = () => useContext(SupportAlertContext);

export const SupportAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [lastMessageAtMillis, setLastMessageAtMillis] = useState<number | null>(null);
  const [seenAtMillis, setSeenAtMillis] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setLastMessageAtMillis(null);
      return;
    }
    const unsub = subscribeMyTickets(user.uid, (tickets) => {
      // Ticket sem lastMessageAt (anterior ao S38) e ignorado no calculo, nao
      // vira zero — senao um chamado antigo sem essa gravacao derrubaria o
      // maior valor pra 0 e escondia um aviso real.
      const millis = tickets
        .map((t) => t.lastMessageAt?.toMillis())
        .filter((m): m is number => m != null);
      setLastMessageAtMillis(millis.length > 0 ? Math.max(...millis) : null);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    AsyncStorage.getItem(SUPPORT_SEEN_AT_KEY).then((value) => {
      setSeenAtMillis(value ? Number(value) : null);
    });
  }, []);

  const markSeen = useCallback(async () => {
    if (lastMessageAtMillis == null) return;
    await AsyncStorage.setItem(SUPPORT_SEEN_AT_KEY, String(lastMessageAtMillis));
    setSeenAtMillis(lastMessageAtMillis);
  }, [lastMessageAtMillis]);

  const showAlert =
    lastMessageAtMillis != null && (seenAtMillis == null || lastMessageAtMillis > seenAtMillis);

  return (
    <SupportAlertContext.Provider value={{ showAlert, markSeen }}>
      {children}
    </SupportAlertContext.Provider>
  );
};
