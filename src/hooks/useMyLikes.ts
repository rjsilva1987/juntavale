// src/hooks/useMyLikes.ts
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useActiveMatches } from '@/hooks/useActiveMatches';
import { db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

const MAX_RESULTS = 50;

export interface MyLike {
  profile: UserProfile;
  isSuperLike: boolean;
}

interface UseMyLikesReturn {
  profiles: MyLike[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

// Espelha useLikers, só que na direção oposta: perfis que EU curti (like ou
// superlike) e que ainda não viraram match. matchedUids vem de
// useActiveMatches (já tem listener próprio e filtro de bloqueio) em vez de
// uma leitura extra em matches/ por swipe.
export function useMyLikes(): UseMyLikesReturn {
  const { user, profile } = useAuth();
  const { matches } = useActiveMatches();
  const [profiles, setProfiles] = useState<MyLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'swipes'),
        where('from', '==', user.uid),
        where('direction', 'in', ['like', 'superlike']),
      );
      const snap = await getDocs(q);

      const matchedUids = new Set(
        matches.map((m) => m.users.find((u) => u !== user.uid)).filter((u): u is string => !!u),
      );
      // Sentido "eu bloqueei" — mesmo padrão explícito do getDiscoverProfiles
      // (recebe blockedUsers do próprio perfil). O sentido "ele me bloqueou"
      // é checado à parte, com o profile.blockedUsers de cada entrada (ver
      // filtro em `valid` abaixo) — não depende de onBlockCreated (Cloud
      // Function) já ter propagado pro meu lado.
      const blockedUids = new Set(profile?.blockedUsers ?? []);

      const entries = snap.docs
        .map((d) => ({
          uid: d.data().to as string,
          isSuperLike: d.data().direction === 'superlike',
          createdAt: d.data().createdAt as Timestamp | undefined,
        }))
        .filter((entry) => !matchedUids.has(entry.uid) && !blockedUids.has(entry.uid))
        // Mais recente primeiro; feito antes do slice pra pegar os N mais
        // recentes de verdade (sem índice composto from+direction+createdAt,
        // que não existe em firestore.indexes.json — ver relatório).
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
        .slice(0, MAX_RESULTS);

      const settled = await Promise.allSettled(
        entries.map(async (entry) => ({
          profile: await getUserProfile(entry.uid),
          isSuperLike: entry.isSuperLike,
        })),
      );

      const withProfiles: { profile: UserProfile | null; isSuperLike: boolean }[] = [];
      let rejectedCount = 0;
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { profile, isSuperLike } = result.value;
          withProfiles.push({
            profile: profile ? { ...profile, uid: entries[i].uid } : null,
            isSuperLike,
          });
        } else {
          rejectedCount += 1;
          console.error('[useMyLikes] Falha ao buscar perfil:', entries[i].uid, result.reason);
        }
      });

      if (rejectedCount > 0) {
        console.warn(`[useMyLikes] ${rejectedCount} perfis falharam ao carregar`);
      }

      // Sentido "ele me bloqueou" — checado direto no blockedUsers do perfil
      // do outro (já carregado acima), sem depender de propagação pro meu lado.
      const valid = withProfiles.filter(
        (entry): entry is MyLike =>
          entry.profile !== null && !entry.profile.blockedUsers?.includes(user.uid),
      );
      // Super-likes primeiro; sort é estável (ES2019+), então a ordem por
      // recência dentro de cada grupo (já aplicada acima) se mantém.
      valid.sort((a, b) => Number(b.isSuperLike) - Number(a.isSuperLike));
      setProfiles(valid);
    } catch (err) {
      console.error('[useMyLikes] Erro na query de curtidas enviadas:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
    setLoading(false);
  }, [user, matches, profile?.blockedUsers]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return { profiles, loading, error, reload: load };
}
