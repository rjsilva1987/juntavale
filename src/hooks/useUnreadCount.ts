// src/hooks/useUnreadCount.ts
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { Match } from '@/services/firestoreService';
import { isMatchUnread } from '@/utils/matches';

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
    });
    return unsub;
  }, [user, profile?.blockedUsers]);

  return count;
}
