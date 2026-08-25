// src/hooks/useUnseenAnsweredMomentoRequests.ts
//
// S146 — contagem agregada de pedidos de conversa que o usuário logado
// MANDOU e que já foram respondidos/recusados, mas ainda não viu o desfecho
// (sem `seenAt` — marcado por markMomentoRequestSeen, chamado no mount de
// MomentoRequestChatScreen quando o usuário é o sender). Reusa
// listenSentMomentoRequests (S143-B), já existente — sem query nova, sem
// listener por doc (a própria query já traz o campo seenAt de cada pedido).
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenSentMomentoRequests } from '@/services/momentoRequestService';

export function useUnseenAnsweredMomentoRequests(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const unsub = listenSentMomentoRequests(user.uid, (requests) => {
      setCount(requests.filter((r) => r.status !== 'pending' && !r.seenAt).length);
    });
    return unsub;
  }, [user]);

  return count;
}
