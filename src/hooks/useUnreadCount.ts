// src/hooks/useUnreadCount.ts
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { CHAT_DEBUG_OVERLAY } from '@/config/flags';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { Match, markMatchDelivered } from '@/services/firestoreService';
import { chatDebug } from '@/utils/chatDebug';
import { isMatchUnread, shouldMarkDelivered } from '@/utils/matches';

// Listener PRÓPRIO em vez de derivar de useActiveMatches: aquele hook
// enriquece cada match com um getUserProfile() (getDoc, não realtime) do
// outro lado — ótimo pra tela de Conversas, mas overhead desnecessário só
// pra contar não lidas (dispararia 1 getDoc por match a cada snapshot). Esta
// query é a mesma base (matches where users array-contains uid), só sem a
// enriquecimento.
export function useUnreadCount(): number {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const uid = user.uid;
    const blockedUsers = profile?.blockedUsers ?? [];
    const q = query(collection(db, 'matches'), where('users', 'array-contains', uid));
    const unsub = onSnapshot(q, (snap) => {
      const unread = snap.docs.filter((d) => {
        const m = d.data() as Match;
        // Mesmo critério de visibilidade do useActiveMatches: match
        // bloqueado (por qualquer lado) não aparece na lista de Conversas,
        // então também não deve contar pro badge.
        if (m.blockedBy && m.blockedBy.length > 0) return false;
        const otherId = m.users.find((u) => u !== uid);
        if (otherId && blockedUsers.includes(otherId)) return false;

        return isMatchUnread(m, uid);
      });
      setCount(unread.length);

      // S129-B — mesmo critério de visibilidade acima (match bloqueado, por
      // qualquer lado, não conta): marca deliveredAt em fire-and-forget, sem
      // bloquear o cálculo de count acima. Mesmo padrão de tratamento de
      // erro de markMatchRead em ChatScreen.tsx (.catch(() => {})).
      snap.docs.forEach((d) => {
        // S166-B — escrita local pendente devolve deliveredAt.{uid} como
        // null (serverTimestamps:'none' default), o que faria
        // shouldMarkDelivered voltar true e re-disparar a própria escrita em
        // loop até o ack. O snapshot do ack (hasPendingWrites false) reavalia.
        if (d.metadata.hasPendingWrites) return;
        const m = d.data() as Match;
        if (m.blockedBy && m.blockedBy.length > 0) return;
        const otherId = m.users.find((u) => u !== uid);
        if (otherId && blockedUsers.includes(otherId)) return;

        if (shouldMarkDelivered(m, uid)) {
          if (CHAT_DEBUG_OVERLAY) chatDebug.bump('markMatchDelivered');
          markMatchDelivered(d.id, uid).catch(() => {});
        }
      });
    });
    return unsub;
  }, [user, profile?.blockedUsers]);

  return count;
}
