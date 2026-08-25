// src/hooks/usePendingGroupJoinRequests.ts
//
// S146 — contagem agregada de pedidos de entrada PENDENTES nos grupos que o
// usuário logado CRIOU (só o dono vê o dot "solicitação→dono"). Sem query
// collectionGroup pra "todos os pedidos de todos os meus grupos de uma vez"
// (não existe hoje) — em vez disso, assina UM listenJoinRequests
// (groupService.ts) por grupo próprio e soma as contagens.
// groups/{groupId}/joinRequests/{uid} só existe enquanto pendente (aprovar
// ou rejeitar apaga o doc, ver groupService.ts), então len(requests) já É a
// contagem de pendentes daquele grupo, sem filtro de status extra.
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenJoinRequests, listMyGroups } from '@/services/groupService';

export function usePendingGroupJoinRequests(): number {
  const { user } = useAuth();
  // Grupos onde o usuário logado é o creator — resolvido 1x por mudança de
  // usuário via listMyGroups (getDocs, não listener); a parte REATIVA do
  // hook vem do efeito abaixo, que assina um listener por grupo.
  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) {
      setMyGroupIds([]);
      return;
    }
    let cancelled = false;
    listMyGroups(user.uid)
      .then((groups) => {
        if (cancelled) return;
        setMyGroupIds(groups.filter((g) => g.creatorId === user.uid).map((g) => g.id));
      })
      .catch(() => {
        if (!cancelled) setMyGroupIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (myGroupIds.length === 0) {
      setCounts({});
      return;
    }
    // localCounts fica escopado a ESTA versão de myGroupIds — evita que
    // contagem de um grupo que saiu da lista (ex.: expirou) fique presa em
    // counts depois que os listeners antigos já foram desmontados.
    let localCounts: Record<string, number> = {};
    const unsubs = myGroupIds.map((groupId) =>
      listenJoinRequests(groupId, (requests) => {
        localCounts = { ...localCounts, [groupId]: requests.length };
        setCounts(localCounts);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [myGroupIds]);

  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
