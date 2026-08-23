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
  // S128-fix — null enquanto o primeiro snapshot de dailyGrant ainda não
  // chegou (não sabemos se há grant disponível); só vira boolean depois
  // que o listener responde pela primeira vez. Consumidores devem tratar
  // null como "ainda carregando", nunca como false.
  dailyGrantAvailable: boolean | null;
}

// Realtime (onSnapshot) em vez de fetch único: o contador é escrito no mesmo
// batch do recordSwipe, então o badge de "restantes" reage na hora, mesmo se
// o superlike tiver sido dado em outro device.
export function useSuperLikeQuota(): SuperLikeQuota {
  const { user } = useAuth();
  const [used, setUsed] = useState(0);
  // S128 — grant diário grátis: true quando a próxima super curtida ainda
  // não paga a cota mensal (doc não existe, ou a data guardada é diferente
  // de hoje em UTC — mesma comparação usada em recordSwipe/firestoreService).
  // S128-fix — começa null ("ainda não sabemos"), nunca false: o snapshot de
  // usage pode chegar antes do de dailyGrant, e um false por padrão faria a
  // UI mostrar "cota esgotada" por engano até o segundo listener responder.
  const [dailyGrantAvailable, setDailyGrantAvailable] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (!user) return;
    const dailyGrantRef = doc(db, 'users', user.uid, 'superLikes', 'dailyGrant');
    // S128-fix — guarda o último dado bruto do snapshot fora do state pra
    // poder reavaliar isToday sob demanda (no próprio snapshot E no
    // interval abaixo), sem depender de um novo write no Firestore.
    // undefined = ainda não chegou nenhum snapshot; null = doc não existe.
    let lastData: { year: number; month: number; day: number } | null | undefined;

    const evaluate = () => {
      if (lastData === undefined) return; // 1º snapshot ainda não chegou
      if (lastData === null) {
        setDailyGrantAvailable(true);
        return;
      }
      const now = new Date();
      const isToday =
        lastData.year === now.getUTCFullYear() &&
        lastData.month === now.getUTCMonth() + 1 &&
        lastData.day === now.getUTCDate();
      setDailyGrantAvailable(!isToday);
    };

    const unsub = onSnapshot(dailyGrantRef, (snap) => {
      lastData = snap.exists()
        ? (snap.data() as { year: number; month: number; day: number })
        : null;
      evaluate();
    });

    // A virada do dia UTC não dispara um novo snapshot por si só (o doc só
    // muda quando o grant É USADO) — sem isso, dailyGrantAvailable ficaria
    // travado no valor calculado na última mudança do doc até o app
    // reiniciar. Reavalia a cada minuto a partir do mesmo lastData.
    //
    // setTimeout recursivo em vez de setInterval: setInterval/clearInterval
    // não estão na allowlist de globals do eslint.config.js deste projeto
    // (só setTimeout/clearTimeout estão — mesmo padrão de
    // usePresenceHeartbeat.ts/useTypingIndicator.ts).
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        evaluate();
        scheduleNext();
      }, 60 * 1000);
    };
    scheduleNext();

    return () => {
      unsub();
      clearTimeout(timeoutId);
    };
  }, [user]);

  return {
    used,
    remaining: Math.max(SUPER_LIKE_LIMIT - used, 0),
    limit: SUPER_LIKE_LIMIT,
    dailyGrantAvailable,
  };
}
