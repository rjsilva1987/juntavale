// src/hooks/useAnsweredMomentoRequests.ts
//
// S143-C (revisão pós-teste de aparelho, decisão de produto do Raphael,
// 25/08/2026) — conversas de Momento JÁ respondidas (status 'answered',
// das duas pontas: você é o autor OU o remetente do pedido), pra entrarem
// na aba Conversas com etiqueta "via Momento", SEPARADAS do chat de match
// (decisão: "conversa só aparece na aba Conversas quando o autor responde
// ao pedido"; "pedidos 'pending' NÃO aparecem ali"; "pessoas COM match que
// conversam via Momento têm uma conversa SEPARADA do chat do match").
// Mesmo molde de useActiveMatches.ts (extraído porque MatchesScreen precisa
// mesclar isto com as conversas de match, ordenadas juntas pela última
// mensagem).
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { LastMessage, getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  listenMomentoRequestLastMessage,
  listenReceivedMomentoRequests,
  listenSentMomentoRequests,
  MomentoRequest,
} from '@/services/momentoRequestService';

export interface MomentoConversation {
  requestId: string;
  otherProfile?: UserProfile;
  lastMessage: LastMessage;
}

interface UseAnsweredMomentoRequestsReturn {
  conversations: MomentoConversation[];
  loading: boolean;
}

export function useAnsweredMomentoRequests(): UseAnsweredMomentoRequestsReturn {
  const { user } = useAuth();
  const [received, setReceived] = useState<MomentoRequest[]>([]);
  const [sent, setSent] = useState<MomentoRequest[]>([]);
  const [receivedLoaded, setReceivedLoaded] = useState(false);
  const [sentLoaded, setSentLoaded] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile | undefined>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage | undefined>>({});
  const requestedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return undefined;
    return listenReceivedMomentoRequests(user.uid, (data) => {
      setReceived(data);
      setReceivedLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    return listenSentMomentoRequests(user.uid, (data) => {
      setSent(data);
      setSentLoaded(true);
    });
  }, [user]);

  // Pedidos 'pending' NÃO aparecem na aba Conversas (decisão da revisão) —
  // só 'answered'. 'declined' também fica de fora (nunca vira conversa).
  const answered = useMemo(
    () => [...received, ...sent].filter((r) => r.status === 'answered'),
    [received, sent],
  );

  // Nomes do outro lado de cada pedido, sob demanda por uid novo — mesmo
  // padrão de dedup de MomentoRequestsScreen.tsx (requestedUidsRef).
  useEffect(() => {
    if (!user) return;
    answered.forEach((r) => {
      const otherUid = r.authorId === user.uid ? r.senderId : r.authorId;
      if (requestedUidsRef.current.has(otherUid)) return;
      requestedUidsRef.current.add(otherUid);
      getUserProfile(otherUid)
        .then((profile) => {
          setProfiles((prev) => ({ ...prev, [otherUid]: profile ?? undefined }));
        })
        .catch(() => {});
    });
  }, [answered, user]);

  // Última mensagem de cada thread respondida — só reassina quando o
  // CONJUNTO de pedidos 'answered' muda (novo pedido respondido, ou um
  // deixa de ser 'answered'), não a cada mensagem nova dentro de uma thread
  // já assinada (essa chega pelo próprio listener, sem recriar nada).
  useEffect(() => {
    const unsubs = answered.map((r) =>
      listenMomentoRequestLastMessage(r.id, (msg) => {
        setLastMessages((prev) => ({
          ...prev,
          [r.id]: msg
            ? { text: msg.text, senderId: msg.senderId, createdAt: msg.createdAt }
            : { text: r.text, senderId: r.senderId, createdAt: r.createdAt },
        }));
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered.map((r) => r.id).join(',')]);

  const conversations = useMemo<MomentoConversation[]>(() => {
    if (!user) return [];
    const result: MomentoConversation[] = [];
    answered.forEach((r) => {
      const lastMessage = lastMessages[r.id];
      if (!lastMessage) return;
      const otherUid = r.authorId === user.uid ? r.senderId : r.authorId;
      result.push({ requestId: r.id, otherProfile: profiles[otherUid], lastMessage });
    });
    return result;
  }, [answered, lastMessages, profiles, user]);

  // S143-C (revisão pós-teste de aparelho — correção pós-auditoria) — só
  // fica pronto quando TODO pedido 'answered' já conhecido também já tem
  // lastMessage carregado. Sem isso, `loading` virava false assim que os
  // dois listeners de pedidos respondiam (1º snapshot), mesmo com os
  // listeners de última mensagem ainda em voo — uma conta com conversa de
  // Momento respondida mas SEM nenhum match ativo passava por um instante
  // de "Nenhum match ainda" (hasNothing em MatchesScreen.tsx) antes de se
  // corrigir sozinha quando a última mensagem chegava.
  const momentoMessagesReady = answered.every((r) => lastMessages[r.id] !== undefined);

  return {
    conversations,
    loading: !receivedLoaded || !sentLoaded || !momentoMessagesReady,
  };
}
