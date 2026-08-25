// src/hooks/useUnseenAcceptedGroups.ts
//
// S146 — contagem agregada de grupos em que o usuário logado foi ACEITO
// (é membro, mas NÃO é o creator) e ainda não viu a aceitação — próprio doc
// groups/{groupId}/members/{uid} sem `seenAt` (marcado por
// markGroupMembershipSeen, chamado no mount de GroupDetailScreen). Mesmo
// raciocínio de "1 listener por grupo" de usePendingGroupJoinRequests, mas
// assinando o PRÓPRIO doc de membership (listenMyMembership) em vez de
// joinRequests.
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenMyMembership, listMyGroups } from '@/services/groupService';

export function useUnseenAcceptedGroups(): number {
  const { user } = useAuth();
  const [otherGroupIds, setOtherGroupIds] = useState<string[]>([]);
  const [unseen, setUnseen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) {
      setOtherGroupIds([]);
      return;
    }
    let cancelled = false;
    listMyGroups(user.uid)
      .then((groups) => {
        if (cancelled) return;
        setOtherGroupIds(groups.filter((g) => g.creatorId !== user.uid).map((g) => g.id));
      })
      .catch(() => {
        if (!cancelled) setOtherGroupIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || otherGroupIds.length === 0) {
      setUnseen({});
      return;
    }
    let localUnseen: Record<string, boolean> = {};
    const unsubs = otherGroupIds.map((groupId) =>
      listenMyMembership(groupId, user.uid, (member) => {
        localUnseen = { ...localUnseen, [groupId]: !!member && !member.seenAt };
        setUnseen(localUnseen);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [otherGroupIds, user]);

  return Object.values(unseen).filter(Boolean).length;
}
