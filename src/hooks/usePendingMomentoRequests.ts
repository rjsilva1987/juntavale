// src/hooks/usePendingMomentoRequests.ts
//
// S145 — extraído de ProfileScreen.tsx (lógica antes inline, ver S143-B):
// conta de pedidos de conversa RECEBIDOS ainda pendentes (você é o autor do
// momento comentado). Usado tanto pelo ponto de aviso da linha "Pedidos de
// conversa" (ProfileScreen, agora só admin) quanto pelo badge da aba
// Explorar e pelo card "Pedidos" em MomentosScreen.
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenReceivedMomentoRequests } from '@/services/momentoRequestService';

export function usePendingMomentoRequests(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const unsub = listenReceivedMomentoRequests(user.uid, (requests) => {
      setCount(requests.filter((r) => r.status === 'pending').length);
    });
    return unsub;
  }, [user]);

  return count;
}
