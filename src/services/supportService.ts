// src/services/supportService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { SupportCategory } from '@/constants/supportCategories';
import { db } from '@/services/firebase';

export type SupportTicketStatus = 'open' | 'resolved';

export interface SupportTicket {
  id: string;
  uid: string;
  category: SupportCategory;
  message: string;
  status: SupportTicketStatus;
  createdAt: Timestamp;
  // Ausente em tickets criados antes da S38 — getMyTickets() cai pra
  // createdAt como fallback de ordenação nesse caso.
  lastMessageAt?: Timestamp;
}

export interface SupportMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

interface SubmitSupportTicketParams {
  uid: string;
  category: SupportCategory;
  message: string;
}

// S38: cria o ticket E a primeira mensagem da thread atomicamente (mesmo
// writeBatch) — o campo `message` no pai é mantido por compat (painel admin
// da S37 exibe ele direto, sem ler a subcollection; a S39 decide se
// deprecia). `doc(collection(...))` gera os dois ids no client antes do
// commit, permitindo referenciar a subcollection do ticket (ticketRef.id)
// sem round-trip.
export const submitSupportTicket = async ({
  uid,
  category,
  message,
}: SubmitSupportTicketParams): Promise<void> => {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 1000) {
    throw new Error('Mensagem inválida');
  }

  const ticketRef = doc(collection(db, 'support'));
  const messageRef = doc(collection(db, 'support', ticketRef.id, 'messages'));

  const batch = writeBatch(db);
  batch.set(ticketRef, {
    uid,
    category,
    message: trimmed,
    status: 'open',
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  });
  batch.set(messageRef, {
    senderId: uid,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
};

// orderBy('createdAt') sozinho usa o índice single-field automático do
// Firestore (não exige índice composto) — por isso NÃO filtramos por status
// aqui via where(): um where('status', '==', ...) + orderBy('createdAt')
// juntos exigiriam um índice composto. Em vez disso trazemos todos os
// tickets (volume baixo, é um painel admin) e particionamos open/resolved
// client-side em AdminSupportScreen. Débito técnico se o volume crescer:
// paginar com startAfter() ou criar o índice composto e filtrar server-side.
export const getSupportTickets = async (): Promise<SupportTicket[]> => {
  const q = query(collection(db, 'support'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SupportTicket, 'id'>) }));
};

// Mesma lógica de índice de getSupportTickets: where('uid', ...) sozinho não
// exige índice composto, então a ordenação por "atividade mais recente"
// (lastMessageAt, com fallback pra createdAt em tickets pré-S38) é
// client-side aqui, sem orderBy no server.
export const getMyTickets = async (uid: string): Promise<SupportTicket[]> => {
  const q = query(collection(db, 'support'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SupportTicket, 'id'>) }));
  return tickets.sort((a, b) => {
    const aTime = (a.lastMessageAt ?? a.createdAt)?.toMillis() ?? 0;
    const bTime = (b.lastMessageAt ?? b.createdAt)?.toMillis() ?? 0;
    return bTime - aTime;
  });
};

export const getSupportTicket = async (ticketId: string): Promise<SupportTicket | null> => {
  const snap = await getDoc(doc(db, 'support', ticketId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<SupportTicket, 'id'>) } : null;
};

// Só o admin consegue de fato escrever isso (firestore.rules exige
// diff().affectedKeys().hasOnly(['lastMessageAt','status']) e restringe o
// dono a só reabrir) — mesmo padrão de reviewVerification em
// verificationService.ts.
export const updateTicketStatus = async (
  ticketId: string,
  status: SupportTicketStatus,
): Promise<void> => {
  await updateDoc(doc(db, 'support', ticketId), { status });
};

// S39 vai chamar isso a partir da tela de thread — aqui só precisa existir
// e compilar. writeBatch: mensagem nova na subcollection + lastMessageAt no
// pai, atomicamente. Reabertura: só quando quem manda é o DONO e o ticket já
// estava 'resolved' — admin respondendo nunca muda o status (e as rules
// também não deixam o dono ir na direção contrária, resolver o próprio
// chamado). lastMessageAt é escrito pelo client por enquanto; quando existir
// a Cloud Function onSupportMessageCreated (S40), avaliar mover essa escrita
// pro servidor, como lastMessage em matches/{matchId} já funciona hoje.
export const sendSupportMessage = async (
  ticketId: string,
  senderId: string,
  text: string,
): Promise<void> => {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 1000) {
    throw new Error('Mensagem inválida');
  }

  const ticketRef = doc(db, 'support', ticketId);
  const ticketSnap = await getDoc(ticketRef);
  const ticket = ticketSnap.data() as SupportTicket | undefined;
  const shouldReopen = ticket?.uid === senderId && ticket?.status === 'resolved';

  const messageRef = doc(collection(db, 'support', ticketId, 'messages'));
  const batch = writeBatch(db);
  batch.set(messageRef, {
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  batch.update(ticketRef, {
    lastMessageAt: serverTimestamp(),
    ...(shouldReopen ? { status: 'open' } : {}),
  });
  await batch.commit();
};

// S39: histórico em tempo real da thread (SupportThreadScreen). createdAt
// pode chegar null por 1 frame antes do serverTimestamp() resolver — mesmo
// comportamento tolerado em listenMessages (firestoreService.ts)/ChatScreen,
// que já renderizam '' nesse instante em vez de formatar null.
export const subscribeSupportMessages = (
  ticketId: string,
  callback: (messages: SupportMessage[]) => void,
) => {
  const q = query(collection(db, 'support', ticketId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportMessage);
    callback(messages);
  });
};

// S39: o doc pai muda durante a conversa (lastMessageAt a cada mensagem,
// status quando reabre/resolve) — a thread reage sem precisar de refetch
// manual. callback(null) cobre ticket apagado/inacessível.
export const subscribeSupportTicket = (
  ticketId: string,
  callback: (ticket: SupportTicket | null) => void,
) => {
  return onSnapshot(doc(db, 'support', ticketId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<SupportTicket, 'id'>) } : null);
  });
};
