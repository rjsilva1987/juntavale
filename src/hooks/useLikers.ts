// src/hooks/useLikers.ts
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

export interface Liker {
  profile: UserProfile;
  isSuperLike: boolean;
  likedPhotoURL?: string;
}

interface UseLikersReturn {
  likers: Liker[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

// Extraído de LikesScreen — mesma query (quem me curtiu e eu ainda não
// swipei de volta), compartilhada com o card "Curtidas" do ProfileScreen
// pra não duplicar as duas queries em swipes.
export function useLikers(): UseLikersReturn {
  const { user, profile } = useAuth();
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
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

      // Sentido "eu bloqueei" — mesmo padrão explícito do getDiscoverProfiles
      // (recebe blockedUsers do próprio perfil). O sentido "ele me bloqueou"
      // só dá pra confirmar depois, com o profile.blockedUsers de cada
      // entrada (ver filtro em `valid` abaixo) — não depende de propagação.
      const blockedByMeUids = new Set(profile?.blockedUsers ?? []);

      const entries = snap.docs
        .map((d) => ({
          uid: d.data().from as string,
          isSuperLike: d.data().direction === 'superlike',
          // Legado (swipe antigo sem o campo) fica undefined — tolerado.
          likedPhotoURL: d.data().likedPhotoURL as string | undefined,
        }))
        .filter((entry) => !swipedByMe.has(entry.uid) && !blockedByMeUids.has(entry.uid));

      const settled = await Promise.allSettled(
        entries.map(async (entry) => ({
          profile: await getUserProfile(entry.uid),
          isSuperLike: entry.isSuperLike,
          likedPhotoURL: entry.likedPhotoURL,
        })),
      );

      const withProfiles: {
        profile: UserProfile | null;
        isSuperLike: boolean;
        likedPhotoURL?: string;
      }[] = [];
      let rejectedCount = 0;
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { profile, isSuperLike, likedPhotoURL } = result.value;
          withProfiles.push({
            // uid do swipe é confiável mesmo quando o doc de users/{uid} é
            // legado e não tem o campo `uid` gravado.
            profile: profile ? { ...profile, uid: entries[i].uid } : null,
            isSuperLike,
            likedPhotoURL,
          });
        } else {
          rejectedCount += 1;
          console.error('[useLikers] Falha ao buscar perfil:', entries[i].uid, result.reason);
        }
      });

      if (rejectedCount > 0) {
        console.warn(`[useLikers] ${rejectedCount} perfis falharam ao carregar`);
      }

      // Sentido "ele me bloqueou" — checado direto no blockedUsers do perfil
      // do outro (já carregado acima), sem depender de propagação pro meu lado.
      const valid = withProfiles.filter(
        (entry): entry is Liker =>
          entry.profile !== null && !entry.profile.blockedUsers?.includes(user.uid),
      );
      // Super-likers primeiro; sort é estável (ES2019+), então a ordem
      // relativa dentro de cada grupo (a que já vinha do snapshot) se mantém.
      valid.sort((a, b) => Number(b.isSuperLike) - Number(a.isSuperLike));
      setLikers(valid);
    } catch (err) {
      console.error('[useLikers] Erro na query de likes:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
    setLoading(false);
  }, [user, profile?.blockedUsers]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return { likers, loading, error, reload: load };
}
