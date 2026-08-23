// src/hooks/useAchievements.ts
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { AchievementId } from '@/constants/achievements';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';

interface UseAchievements {
  unlockedIds: AchievementId[];
  loading: boolean;
}

// S127 — Marcos e selos: realtime (onSnapshot) na subcoleção
// users/{uid}/achievements, escrita SÓ por Cloud Function (Admin SDK) — o
// client nunca cria/edita um doc aqui (ver firestore.rules: allow write: if
// false). Mesmo padrão de useReplyQuota/useSuperLikeQuota: nenhuma TELA
// importa firebase/firestore diretamente, quem acessa o Firestore é este
// hook.
export function useAchievements(): UseAchievements {
  const { user } = useAuth();
  const [unlockedIds, setUnlockedIds] = useState<AchievementId[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setUnlockedIds([]);
      setLoading(false);
      return;
    }
    const achievementsRef = collection(db, 'users', user.uid, 'achievements');
    const unsub = onSnapshot(achievementsRef, (snap) => {
      setUnlockedIds(snap.docs.map((d) => d.id as AchievementId));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  return { unlockedIds, loading };
}
