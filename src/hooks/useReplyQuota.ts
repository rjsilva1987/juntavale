// src/hooks/useReplyQuota.ts
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { REPLY_LIMIT } from '@/constants/reply';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';

interface ReplyQuota {
  used: number;
  remaining: number;
  limit: number;
}

// S74-A — mesmo desenho do useSuperLikeQuota: realtime (onSnapshot) porque o
// contador é escrito no mesmo batch do recordSwipe, então o consumidor reage
// na hora, mesmo se a resposta tiver sido enviada em outro device. Nenhuma
// tela consome este hook ainda (ver S74-B).
export function useReplyQuota(): ReplyQuota {
  const { user } = useAuth();
  const [used, setUsed] = useState(0);

  useEffect(() => {
    if (!user) return;
    const usageRef = doc(db, 'users', user.uid, 'replies', 'usage');
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

  return { used, remaining: Math.max(REPLY_LIMIT - used, 0), limit: REPLY_LIMIT };
}
