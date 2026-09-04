// src/hooks/useUnreadListingChats.ts
//
// S168-B — contagem agregada de conversas de classificados (dono OU
// interessado) com mensagem nova não lida, mirror de
// useUnreadMomentoAuthorMessages.ts. Alimenta SÓ o dot do card
// "Classificados" na aba Conversas (MatchesScreen.tsx) — NÃO entra em
// useUnreadCount nem no tabBarBadge (fora de escopo, seção 0 da spec).
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { isListingChatUnread, listenMyListingChats } from '@/services/listingChatService';

export function useUnreadListingChats(): number {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || profile?.verified !== true) {
      setCount(0);
      return;
    }
    const uid = user.uid;
    const unsub = listenMyListingChats(uid, (chats) => {
      setCount(chats.filter((chat) => isListingChatUnread(chat, uid)).length);
    });
    return unsub;
  }, [user, profile?.verified]);

  return count;
}
