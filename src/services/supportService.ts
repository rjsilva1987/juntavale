// src/services/supportService.ts
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
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
}

interface SubmitSupportTicketParams {
  uid: string;
  category: SupportCategory;
  message: string;
}

// Sem leitura de tickets pelo próprio usuário nesta sessão (S36) — ele não
// vê histórico no MVP, só o admin lista (S37, abaixo). firestore.rules já
// permite o dono ler o próprio ticket, então isso continua disponível como
// melhoria futura sem mexer nas rules de novo.
export const submitSupportTicket = async ({
  uid,
  category,
  message,
}: SubmitSupportTicketParams): Promise<void> => {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 1000) {
    throw new Error('Mensagem inválida');
  }

  await addDoc(collection(db, 'support'), {
    uid,
    category,
    message: trimmed,
    status: 'open',
    createdAt: serverTimestamp(),
  });
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

export const getSupportTicket = async (ticketId: string): Promise<SupportTicket | null> => {
  const snap = await getDoc(doc(db, 'support', ticketId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<SupportTicket, 'id'>) } : null;
};

// Só o admin consegue de fato escrever isso (firestore.rules exige
// diff().affectedKeys().hasOnly(['status'])) — mesmo padrão de
// reviewVerification em verificationService.ts.
export const updateTicketStatus = async (
  ticketId: string,
  status: SupportTicketStatus,
): Promise<void> => {
  await updateDoc(doc(db, 'support', ticketId), { status });
};
