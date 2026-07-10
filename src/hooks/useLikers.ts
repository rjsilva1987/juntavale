// src/hooks/useLikers.ts
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

interface UseLikersReturn {
  likers: UserProfile[];
  loading: boolean;
  reload: () => Promise<void>;
}

// Extraído de LikesScreen — mesma query (quem me curtiu e eu ainda não
// swipei de volta), compartilhada com o card "Curtidas" do ProfileScreen
// pra não duplicar as duas queries em swipes.
export function useLikers(): UseLikersReturn {
  const { user } = useAuth();
  const [likers, setLikers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // People who liked me but I haven't swiped yet
      const q = query(
        collection(db, 'swipes'),
        where('to', '==', user.uid),
        where('direction', 'in', ['like', 'superlike']),
      );
      const snap = await getDocs(q);

      // Check I haven't swiped them back
      const mySwipesSnap = await getDocs(
        query(collection(db, 'swipes'), where('from', '==', user.uid)),
      );
      const swipedByMe = new Set(mySwipesSnap.docs.map((d) => d.data().to));

      const uids = snap.docs
        .map((d) => d.data().from as string)
        .filter((uid) => !swipedByMe.has(uid));

      const profiles = await Promise.all(uids.map((uid) => getUserProfile(uid)));
      setLikers(profiles.filter(Boolean) as UserProfile[]);
    } catch (_) {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return { likers, loading, reload: load };
}
