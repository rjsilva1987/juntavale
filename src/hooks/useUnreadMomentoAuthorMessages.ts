// src/hooks/useUnreadMomentoAuthorMessages.ts
//
// S150 — contagem agregada de pedidos de conversa (Momento) em que o usuário
// logado é o AUTOR do momento e há mensagem nova não lida na thread já
// respondida (status 'answered' — pendente/recusado não têm lastMessage,
// ver decisão técnica desta sprint). lastMessage/authorSeenAt vivem no MESMO
// doc momentoRequests/{requestId} — ao contrário do hook irmão de grupo
// (useUnreadGroupMessages), aqui basta o listener já existente
// listenReceivedMomentoRequests (S143-B), sem listener extra por doc. Mesmo
// critério de "não lida" de isMatchUnread (utils/matches.ts): última
// mensagem enviada pelo PRÓPRIO uid nunca conta como não lida.
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenReceivedMomentoRequests } from '@/services/momentoRequestService';

export function useUnreadMomentoAuthorMessages(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const uid = user.uid;
    const unsub = listenReceivedMomentoRequests(uid, (requests) => {
      setCount(
        requests.filter((r) => {
          if (r.status !== 'answered' || !r.lastMessage) return false;
          if (r.lastMessage.senderId === uid) return false;
          if (!r.authorSeenAt) return true;
          return r.lastMessage.createdAt.toMillis() > r.authorSeenAt.toMillis();
        }).length,
      );
    });
    return unsub;
  }, [user]);

  return count;
}
