// src/services/reportService.ts
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

import { ReportReason } from '@/services/blockService';
import { db, storage } from '@/services/firebase';
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
  // S102-C — presentes só quando a denúncia partiu de uma mensagem
  // específica do chat (ChatScreen.handleReportMessage), reusando esta
  // mesma coleção/fila (S96). messageText é uma CÓPIA truncada (<=400,
  // mesmo teto de replyTo.text) do texto original, não uma referência
  // viva — a mensagem original pode ter sido apagada depois.
  matchId?: string;
  messageId?: string;
  messageText?: string;
  messageImageUrl?: string;
  // S121 — presentes só quando a denúncia partiu de um momento (story de
  // 24h). momentoId é o uid do autor (== doc ID de momentos/{uid}).
  // momentoText/momentoPhotoUrl são CÓPIA truncada, não referência viva — o
  // momento pode ter expirado ou sido apagado depois.
  momentoId?: string;
  momentoText?: string;
  momentoPhotoUrl?: string;
  // S124-A — presentes só quando a denúncia partiu de um grupo
  // (GroupDetailScreen/GroupChatScreen). reportedId, nesse caso, é o
  // creatorId do grupo (ver blockService.reportUser) — groupId/groupName
  // são só o rótulo exibido no painel do admin, sem foto (grupo não tem).
  groupId?: string;
  groupName?: string;
}

export interface ReportMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
  // S113 — foto anexada, mesmo campo/molde de imageUrl em Message
  // (firestoreService.ts). Uma foto por mensagem; "sem limite" se resolve
  // mandando várias mensagens, decisão de produto.
  imageUrl?: string;
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

// S96-B — fetch único da denúncia pra AdminReportDetailScreen, mesmo padrão
// de getSupportTicket em supportService.ts (a tela troca status localmente
// no state após setReportStatus, sem precisar de listener no doc pai).
export const getReport = async (reportId: string): Promise<Report | null> => {
  const snap = await getDoc(doc(db, 'reports', reportId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Report, 'id'>) } : null;
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

// S113 — imageUrl opcional: mensagem só-imagem é permitida (texto vazio +
// imageUrl), mesma regra de conteúdo do firestore.rules (texto OU foto,
// nunca as duas ausentes) — daí o throw continuar exigindo texto quando não
// há imagem, e deixar de exigi-lo quando há.
export const sendReportMessage = async (
  reportId: string,
  senderId: string,
  text: string,
  imageUrl?: string,
): Promise<void> => {
  const trimmed = text.trim();
  if (!imageUrl && countCodePoints(trimmed) === 0) {
    throw new Error('Mensagem inválida');
  }
  if (countCodePoints(trimmed) > 4000) {
    throw new Error('Mensagem inválida');
  }

  const messageRef = doc(collection(db, 'reports', reportId, 'messages'));
  await setDoc(messageRef, {
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
    ...(imageUrl ? { imageUrl } : {}),
  });
};

// S113 — irmã de uploadChatImage (firestoreService.ts), mesmo molde:
// images/reports/{reportId}/{ts}.jpg, autorização espelhada em storage.rules
// (reporterId da denúncia ou admin).
export const uploadReportImage = async (
  reportId: string,
  localUri: string,
  onProgress: (percent: number) => void,
): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/reports/${reportId}/${Date.now()}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      () => resolve(),
    );
  });

  return getDownloadURL(storageRef);
};

// Só o admin consegue de fato escrever isso (firestore.rules restringe a
// isAdmin() e a affectedKeys().hasOnly(['status'])), mesmo padrão de
// updateTicketStatus em supportService.ts.
export const setReportStatus = async (reportId: string, status: ReportStatus): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), { status });
};
