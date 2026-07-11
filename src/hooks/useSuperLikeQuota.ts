// src/hooks/useSuperLikeQuota.ts
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { SUPER_LIKE_LIMIT } from '@/constants/superLike';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';

interface SuperLikeQuota {
  used: number;
  remaining: number;
  limit: number;
}

// Realtime (onSnapshot) em vez de fetch único: o contador é escrito no mesmo
// batch do recordSwipe, então o badge de "restantes" reage na hora, mesmo se
// o superlike tiver sido dado em outro device.
export function useSuperLikeQuota(): SuperLikeQuota {
  const { user } = useAuth();
  const [used, setUsed] = useState(0);

  useEffect(() => {
    if (!user) return;
    const usageRef = doc(db, 'users', user.uid, 'superLikes', 'usage');
    const unsub = onSnapshot(usageRef, (snap) => {
      if (!snap.exists()) {
        setUsed(0);
        return;
      }
      const data = snap.data() as { year: number; month: number; count: number };
      const now = new Date();
      const isSameMonth =
        data.year === now.getUTCFullYear() && data.month === now.getUTCMonth() + 1;
      setUsed(isSameMonth ? data.count : 0);
    });
    return unsub;
  }, [user]);

  return { used, remaining: Math.max(SUPER_LIKE_LIMIT - used, 0), limit: SUPER_LIKE_LIMIT };
}
