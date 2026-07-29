// src/hooks/useOtherPresence.ts
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';

import { PRESENCE_ONLINE_MS } from '@/hooks/usePresenceHeartbeat';
import { listenPresence } from '@/services/firestoreService';

// Intervalo do ticker que recalcula o rótulo sem depender de um novo
// snapshot — a escada muda com o tempo (ex.: "Online" -> "visto há pouco")
// mesmo que o carimbo em si não mude.
const PRESENCE_LABEL_TICK_MS = 30 * 1000;
const PRESENCE_RECENT_MS = 60 * 60 * 1000;

interface UseOtherPresenceReturn {
  presenceLabel: string | null;
}

export function buildPresenceLabel(lastSeenAt: Date | null, now: Date): string | null {
  if (!lastSeenAt) return null;

  // O relógio do aparelho pode estar atrasado em relação ao serverTimestamp
  // gravado por usePresenceHeartbeat — sem este grampeio, uma leve
  // dessincronia gera idade negativa e escapa de toda faixa abaixo,
  // caindo direto em "visto há alguns dias".
  const ageMs = Math.max(0, now.getTime() - lastSeenAt.getTime());

  if (ageMs < PRESENCE_ONLINE_MS) return 'Online';
  if (ageMs < PRESENCE_RECENT_MS) return 'visto há pouco';
  if (dayjs(lastSeenAt).isSame(now, 'day')) return 'visto hoje';
  if (dayjs(lastSeenAt).isSame(dayjs(now).subtract(1, 'day'), 'day')) return 'visto ontem';
  return 'visto há alguns dias';
}

export function useOtherPresence(otherUid: string): UseOtherPresenceReturn {
  const [presenceLabel, setPresenceLabel] = useState<string | null>(null);
  const lastSeenAtRef = useRef<Date | null>(null);
  const labelRef = useRef<string | null>(null);

  const applyLabel = (label: string | null) => {
    // Só regrava o state quando a STRING muda: o ticker de 30s recalcula o
    // rótulo continuamente, e a maioria dos recálculos cai na mesma faixa
    // da escada — sem este guard, cada tick re-renderizaria o ChatScreen
    // à toa.
    if (label !== labelRef.current) {
      labelRef.current = label;
      setPresenceLabel(label);
    }
  };

  useEffect(() => {
    if (!otherUid) return;

    const unsub = listenPresence(otherUid, (lastSeenAt) => {
      lastSeenAtRef.current = lastSeenAt;
      applyLabel(buildPresenceLabel(lastSeenAt, new Date()));
    });

    return unsub;
  }, [otherUid]);

  useEffect(() => {
    if (!otherUid) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      applyLabel(buildPresenceLabel(lastSeenAtRef.current, new Date()));
      timeoutId = setTimeout(tick, PRESENCE_LABEL_TICK_MS);
    };

    timeoutId = setTimeout(tick, PRESENCE_LABEL_TICK_MS);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [otherUid]);

  return { presenceLabel };
}
