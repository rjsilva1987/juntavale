// src/hooks/usePendingEventJoinRequests.ts
//
// S146 — mirror EXATO de usePendingGroupJoinRequests.ts, usando
// listMyEvents/listenJoinRequests de eventService.ts. Ver comentários lá
// pro raciocínio completo (sem query collectionGroup nova, contagem por
// listener por evento próprio).
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenJoinRequests, listMyEvents } from '@/services/eventService';

export function usePendingEventJoinRequests(): number {
  const { user } = useAuth();
  const [myEventIds, setMyEventIds] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) {
      setMyEventIds([]);
      return;
    }
    let cancelled = false;
    listMyEvents(user.uid)
      .then((events) => {
        if (cancelled) return;
        setMyEventIds(events.filter((e) => e.creatorId === user.uid).map((e) => e.id));
      })
      .catch(() => {
        if (!cancelled) setMyEventIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (myEventIds.length === 0) {
      setCounts({});
      return;
    }
    let localCounts: Record<string, number> = {};
    const unsubs = myEventIds.map((eventId) =>
      listenJoinRequests(eventId, (requests) => {
        localCounts = { ...localCounts, [eventId]: requests.length };
        setCounts(localCounts);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [myEventIds]);

  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
