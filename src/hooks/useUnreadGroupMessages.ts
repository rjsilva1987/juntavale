// src/hooks/useUnreadGroupMessages.ts
//
// S150 — contagem agregada de grupos que o usuário logado participa (membro
// OU criador — listMyGroups não filtra por creatorId, ao contrário de
// usePendingGroupJoinRequests/useUnseenAcceptedGroups) com mensagem nova não
// lida. Mesmo raciocínio de agregação (1 listener por grupo) dos dois hooks
// irmãos acima, mas aqui precisa de DOIS listeners por grupo — o doc do
// grupo (lastMessage, espelhado pela Cloud Function onGroupMessageCreated,
// functions/src/grupos.ts) e o próprio doc de membership (messagesSeenAt,
// gravado no mount de GroupChatScreen.tsx) — porque os dois campos vivem em
// documentos diferentes (ao contrário do hook irmão de Momento, onde os dois
// campos vivem no mesmo doc). Mesmo critério de "não lida" de isMatchUnread
// (utils/matches.ts): última mensagem enviada pelo PRÓPRIO uid nunca conta
// como não lida.
import { Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  GroupMessagePreview,
  listenGroup,
  listenMyMembership,
  listMyGroups,
} from '@/services/groupService';

export function useUnreadGroupMessages(): number {
  const { user } = useAuth();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, GroupMessagePreview | undefined>>(
    {},
  );
  const [seenAt, setSeenAt] = useState<Record<string, Timestamp | undefined>>({});

  useEffect(() => {
    if (!user) {
      setGroupIds([]);
      return;
    }
    let cancelled = false;
    listMyGroups(user.uid)
      .then((groups) => {
        if (cancelled) return;
        setGroupIds(groups.map((g) => g.id));
      })
      .catch(() => {
        if (!cancelled) setGroupIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (groupIds.length === 0) {
      setLastMessages({});
      return;
    }
    let localLastMessages: Record<string, GroupMessagePreview | undefined> = {};
    const unsubs = groupIds.map((groupId) =>
      listenGroup(groupId, (group) => {
        localLastMessages = { ...localLastMessages, [groupId]: group?.lastMessage };
        setLastMessages(localLastMessages);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [groupIds]);

  useEffect(() => {
    if (!user || groupIds.length === 0) {
      setSeenAt({});
      return;
    }
    let localSeenAt: Record<string, Timestamp | undefined> = {};
    const unsubs = groupIds.map((groupId) =>
      listenMyMembership(groupId, user.uid, (member) => {
        localSeenAt = { ...localSeenAt, [groupId]: member?.messagesSeenAt };
        setSeenAt(localSeenAt);
      }),
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [groupIds, user]);

  if (!user) return 0;
  const uid = user.uid;

  return groupIds.filter((groupId) => {
    const lastMessage = lastMessages[groupId];
    if (!lastMessage || lastMessage.senderId === uid) return false;
    const readAt = seenAt[groupId];
    if (!readAt) return true;
    return lastMessage.createdAt.toMillis() > readAt.toMillis();
  }).length;
}
