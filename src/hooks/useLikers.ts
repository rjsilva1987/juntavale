// src/hooks/useLikers.ts
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

export interface Liker {
  profile: UserProfile;
  isSuperLike: boolean;
}

interface UseLikersReturn {
  likers: Liker[];
  loading: boolean;
  reload: () => Promise<void>;
}

// Extraído de LikesScreen — mesma query (quem me curtiu e eu ainda não
// swipei de volta), compartilhada com o card "Curtidas" do ProfileScreen
// pra não duplicar as duas queries em swipes.
export function useLikers(): UseLikersReturn {
  const { user } = useAuth();
  const [likers, setLikers] = useState<Liker[]>([]);
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

      const entries = snap.docs
        .map((d) => ({
          uid: d.data().from as string,
          isSuperLike: d.data().direction === 'superlike',
        }))
        .filter((entry) => !swipedByMe.has(entry.uid));

      const withProfiles = await Promise.all(
        entries.map(async (entry) => ({
          profile: await getUserProfile(entry.uid),
          isSuperLike: entry.isSuperLike,
        })),
      );

      const valid = withProfiles.filter((entry): entry is Liker => entry.profile !== null);
      // Super-likers primeiro; sort é estável (ES2019+), então a ordem
      // relativa dentro de cada grupo (a que já vinha do snapshot) se mantém.
      valid.sort((a, b) => Number(b.isSuperLike) - Number(a.isSuperLike));
      setLikers(valid);
    } catch (_) {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return { likers, loading, reload: load };
}
