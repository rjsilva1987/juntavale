// src/hooks/useActiveMatches.ts
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { getMatches, getUserProfile, Match, UserProfile } from '@/services/firestoreService';

export interface MatchWithProfile extends Match {
  otherProfile?: UserProfile;
}

interface UseActiveMatchesReturn {
  matches: MatchWithProfile[];
  loading: boolean;
}

// Matches visíveis do usuário atual: resolve o perfil do outro lado de cada
// match e aplica o filtro de bloqueio (blockedBy do match + blockedUsers do
// próprio perfil). Extraído porque a mesma lógica se repetia em
// MatchesScreen, no card "Matches"/"Conversas" do ProfileScreen e agora em
// MatchesGridScreen — 3ª cópia, mesmo critério que levou a extrair useLikers.
export function useActiveMatches(): UseActiveMatchesReturn {
  const { user, profile } = useAuth();
  const [matches, setMatches] = useState<MatchWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = getMatches(user.uid, async (rawMatches) => {
      const enriched = await Promise.all(
        rawMatches.map(async (m) => {
          const otherId = m.users.find((u) => u !== user.uid);
          if (!otherId) return { ...m, otherProfile: undefined };
          const otherProfile = await getUserProfile(otherId);
          return { ...m, otherProfile: otherProfile ?? undefined };
        }),
      );
      const blockedUsers = profile?.blockedUsers ?? [];
      const visible = enriched.filter((m) => {
        if (m.blockedBy && m.blockedBy.length > 0) return false;
        return !m.otherProfile || !blockedUsers.includes(m.otherProfile.uid);
      });
      setMatches(visible);
      setLoading(false);
    });
    return unsub;
  }, [user, profile?.blockedUsers]);

  return { matches, loading };
}
