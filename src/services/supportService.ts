// src/services/supportService.ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { SupportCategory } from '@/constants/supportCategories';
import { db } from '@/services/firebase';

interface SubmitSupportTicketParams {
  uid: string;
  category: SupportCategory;
  message: string;
}

// Sem leitura de tickets nesta sessão (S36) — usuário não vê histórico no
// MVP. Melhoria futura: getSupportTickets(uid) pra listar os próprios
// pedidos, já que firestore.rules permite o dono ler (allow read).
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
