// src/hooks/useUnreadListingChats.ts
//
// S168-B — contagem agregada de conversas de classificados (dono OU
// interessado) com mensagem nova não lida, mirror de
// useUnreadMomentoAuthorMessages.ts. Chamado UMA vez em MainTabs()
// (navigation/index.tsx): soma ao badge da aba Conversas e desce por
// prop pra MatchesScreen.tsx, que usa o valor pro dot do card
// "Classificados" (S177).
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
