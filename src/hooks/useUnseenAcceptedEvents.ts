// src/hooks/useUnseenAcceptedEvents.ts
//
// S146 — mirror EXATO de useUnseenAcceptedGroups.ts, usando
// listMyEvents/listenMyParticipation de eventService.ts (participants/{uid}
// em vez de members/{uid}).
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenMyParticipation, listMyEvents } from '@/services/eventService';

export function useUnseenAcceptedEvents(): number {
  const { user } = useAuth();
  const [otherEventIds, setOtherEventIds] = useState<string[]>([]);
  const [unseen, setUnseen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) {
      setOtherEventIds([]);
      return;
    }
    let cancelled = false;
    listMyEvents(user.uid)
      .then((events) => {
        if (cancelled) return;
        setOtherEventIds(events.filter((e) => e.creatorId !== user.uid).map((e) => e.id));
      })
      .catch(() => {
        if (!cancelled) setOtherEventIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || otherEventIds.length === 0) {
      setUnseen({});
      return;
    }
    let localUnseen: Record<string, boolean> = {};
    const unsubs = otherEventIds.map((eventId) =>
      listenMyParticipation(eventId, user.uid, (participant) => {
        localUnseen = { ...localUnseen, [eventId]: !!participant && !participant.seenAt };
        setUnseen(localUnseen);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [otherEventIds, user]);

  return Object.values(unseen).filter(Boolean).length;
}
