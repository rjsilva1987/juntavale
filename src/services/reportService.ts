// src/services/reportService.ts
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { ReportReason } from '@/services/blockService';
import { db } from '@/services/firebase';
import { countCodePoints } from '@/utils/text';

export type ReportStatus = 'open' | 'resolved';

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details: string;
  createdAt: Timestamp;
  // Ausente em denúncias criadas antes da S96-A (client rodando um build
  // antigo do reportUser, que ainda não manda o campo — firestore.rules
  // aceita o create sem ele). Ausente == pendente, mesma leitura de 'open'.
  status?: ReportStatus;
  // Escritos só pelo Admin SDK (onReportMessageCreated, functions/src/index.ts,
  // S96-A), nunca pelo client — mesmo padrão de lastMessageAt/lastSenderId
  // em SupportTicket (supportService.ts).
  lastMessageAt?: Timestamp;
  lastSenderId?: string;
}

export interface ReportMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

// S96-A — painel do admin: TODAS as denúncias, mais recentes primeiro.
// orderBy('createdAt') sozinho usa o índice single-field automático (sem
// exigir índice composto) — por isso sem where de status aqui, mesmo
// raciocínio de getSupportTickets em supportService.ts. Sem where também
// cobre o dado legado: denúncia sem o campo status precisa aparecer igual.
export const listenReports = (callback: (reports: Report[]) => void) => {
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const reports = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) }));
    callback(reports);
  });
};

// Denúncias feitas pelo próprio usuário — where('reporterId', ...) sozinho
// não exige índice composto, mesmo padrão de subscribeMyTickets.
export const listenMyReports = (uid: string, callback: (reports: Report[]) => void) => {
  const q = query(collection(db, 'reports'), where('reporterId', '==', uid));
  return onSnapshot(q, (snap) => {
    const reports = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) }));
    callback(reports);
  });
};

export const listenReportMessages = (
  reportId: string,
  callback: (messages: ReportMessage[]) => void,
) => {
  const q = query(collection(db, 'reports', reportId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReportMessage);
    callback(messages);
  });
};

export const sendReportMessage = async (
  reportId: string,
  senderId: string,
  text: string,
): Promise<void> => {
  const trimmed = text.trim();
  if (countCodePoints(trimmed) === 0 || countCodePoints(trimmed) > 4000) {
    throw new Error('Mensagem inválida');
  }

  const messageRef = doc(collection(db, 'reports', reportId, 'messages'));
  await setDoc(messageRef, { senderId, text: trimmed, createdAt: serverTimestamp() });
};

// Só o admin consegue de fato escrever isso (firestore.rules restringe a
// isAdmin() e a affectedKeys().hasOnly(['status'])), mesmo padrão de
// updateTicketStatus em supportService.ts.
export const setReportStatus = async (reportId: string, status: ReportStatus): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), { status });
};
