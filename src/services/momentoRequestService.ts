// src/services/momentoRequestService.ts
//
// S143-B — pedido de conversa gerado por um comentário/resposta a um
// momento (decisão 2, molde Instagram: fica pendente até o autor
// responder, ignorar ou recusar). Responder um pedido NUNCA cria um match
// (decisão 4): só libera a subcoleção messages deste pedido específico,
// sem nenhuma outra feature de match (imagem/localização/reação/edição/
// apagar/typing/bloqueio/unmatch/MatchProfileScreen).
// S143-C (revisão pós-teste de aparelho, 25/08/2026 — decisão de produto do
// Raphael, revoga o roteamento por match desta sprint): responder a um
// Momento é INDEPENDENTE de match — sendMomentoComment abaixo é o ÚNICO
// caminho, sem consulta de match nenhuma. Quem já é match e conversa via
// Momento ganha uma thread SEPARADA do chat do match (aqui, não em
// matches/{matchId}/messages) — "via Momento" na aba Conversas
// (useAnsweredMomentoRequests.ts) não se mistura com o chat normal do
// match.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import { MomentoWithId } from '@/services/momentoService';

export type MomentoRequestStatus = 'pending' | 'answered' | 'declined';

export interface MomentoRequestSnapshot {
  type: 'text' | 'photo';
  text?: string;
  photoUrl?: string;
  createdAt: Timestamp;
}

export interface MomentoRequest {
  id: string;
  authorId: string;
  senderId: string;
  text: string;
  momentoSnapshot: MomentoRequestSnapshot;
  status: MomentoRequestStatus;
  createdAt: Timestamp;
}

export interface MomentoRequestMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

// "mesmo limite de tamanho de texto de mensagem de chat" (escopo desta
// sprint) — 2000, mesmo teto de matches/{matchId}/messages.text e de
// momentoRequests/{requestId}(.text|/messages/{messageId}.text) em
// firestore.rules. .length (não countCodePoints) de propósito: Firestore
// `size()` de string mede UTF-16 code units, igual ao .length do JS — as
// duas pontas (aqui e na rule) usam a MESMA unidade, sem guarda 4x (essa
// guarda é só pros campos de texto livre do S77, este teto já É o teto
// real do produto, não uma régua de UX).
export const MOMENTO_REQUEST_TEXT_MAX = 2000;
// 400 = mesmo teto de replyTo.text/momentoRef.text (ChatScreen.tsx/
// firestore.rules) — cópia truncada do momento, guarda de abuso, não régua
// de UX (o momento original pode ter até 1120 code units, S77).
const MOMENTO_SNAPSHOT_TEXT_MAX = 400;

const buildRequestId = (authorId: string, senderId: string, momento: MomentoWithId): string =>
  `${authorId}_${senderId}_${momento.createdAt.toMillis()}`;

const truncate = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value;

const buildMomentoSnapshot = (momento: MomentoWithId): MomentoRequestSnapshot => ({
  type: momento.type,
  createdAt: momento.createdAt,
  ...(momento.text ? { text: truncate(momento.text, MOMENTO_SNAPSHOT_TEXT_MAX) } : {}),
  ...(momento.photoUrl ? { photoUrl: momento.photoUrl } : {}),
});

// Só funciona quando o pedido pai já está 'answered' (rules exigem) —
// chamar antes disso é sempre permission-denied, ver firestore.rules
// (momentoRequests/{requestId}/messages).
export const sendMomentoRequestMessage = async (
  requestId: string,
  senderId: string,
  text: string,
): Promise<void> => {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MOMENTO_REQUEST_TEXT_MAX) {
    throw new Error('Mensagem inválida.');
  }
  const payload = { senderId, text: trimmed, createdAt: serverTimestamp() };
  await addDoc(collection(db, 'momentoRequests', requestId, 'messages'), payload);
};

export interface MomentoCommentResult {
  requestId: string;
  status: MomentoRequestStatus;
  // S143-C (revisão pós-teste de aparelho) — true quando o pedido já
  // existia ANTES desta chamada (nada foi escrito agora, o remetente já
  // tinha 1 pedido pendente pra esta instância do momento, decisão 3);
  // deixa handleSendText (MomentoViewerModal.tsx) distinguir "acabei de
  // criar o pedido" de "você já tinha mandado, isso foi no-op" em vez de
  // mostrar o mesmo "Pedido enviado" pros dois casos.
  alreadyExisted: boolean;
}

// S143-C (revisão pós-teste de aparelho) — ÚNICO caminho pra responder um
// Momento (emoji, chip e texto livre, decisão 1: independente de match ou
// curtida). Ninguém comenta o próprio momento por aqui (decisão 9, mesma
// guarda de likeMomento em momentoService.ts).
export const sendMomentoComment = async (
  uid: string,
  momento: MomentoWithId,
  text: string,
): Promise<MomentoCommentResult> => {
  if (uid === momento.authorId) {
    throw new Error('Não é possível comentar no próprio momento.');
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MOMENTO_REQUEST_TEXT_MAX) {
    throw new Error('Comentário inválido.');
  }

  // S143-C (débito da S143-B, decisão 7) — checa o `blockedUsers` do
  // PRÓPRIO remetente ANTES de qualquer getDoc/setDoc do pedido. Cobre os
  // dois sentidos de bloqueio (eu bloqueei OU ele me bloqueou): a Cloud
  // Function onBlockCreated propaga o uid do outro lado pros dois perfis
  // (ver comentário em firestore.rules), então o array do PRÓPRIO usuário
  // já basta — não precisa ler o perfil do autor.
  const myProfileSnap = await getDoc(doc(db, 'users', uid));
  const blockedUsers = (myProfileSnap.data()?.blockedUsers ?? []) as string[];
  if (blockedUsers.includes(momento.authorId)) {
    throw new Error('Não é possível enviar — bloqueio ativo entre vocês.');
  }

  const requestId = buildRequestId(momento.authorId, uid, momento);
  const ref = doc(db, 'momentoRequests', requestId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Decisão 3 — no máximo 1 pedido pendente por remetente por instância do
    // momento: já existe um pedido pra este trio author/sender/instância.
    // Se já foi RESPONDIDO, este novo texto é uma mensagem de acompanhamento
    // na thread já aberta (rules já liberam, status == 'answered'); se ainda
    // está pending ou foi declined, não tenta escrever nada (a rule negaria
    // mesmo) — só devolve o estado atual pra UI decidir o que mostrar (ex.:
    // "aguardando resposta" ou "pedido recusado").
    const data = existing.data() as Omit<MomentoRequest, 'id'>;
    if (data.status === 'answered') {
      await sendMomentoRequestMessage(requestId, uid, trimmed);
    }
    return { requestId, status: data.status, alreadyExisted: true };
  }

  const newRequestPayload = {
    authorId: momento.authorId,
    senderId: uid,
    text: trimmed,
    momentoSnapshot: buildMomentoSnapshot(momento),
    status: 'pending',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, newRequestPayload);
  return { requestId, status: 'pending', alreadyExisted: false };
};

// Pedidos em que o usuário é o AUTOR (recebidos) — pendentes e já
// respondidos/recusados, a mesma tela lista os três estados (ver
// MomentoRequestsScreen.tsx). Sem orderBy (evita índice composto, mesmo
// raciocínio de listenMyReports em reportService.ts) — ordenação por
// createdAt é client-side.
export const listenReceivedMomentoRequests = (
  authorId: string,
  callback: (requests: MomentoRequest[]) => void,
) => {
  const q = query(collection(db, 'momentoRequests'), where('authorId', '==', authorId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MomentoRequest));
  });
};

// Pedidos que o usuário MANDOU (enviados) — espelho do acima, filtrando por
// senderId.
export const listenSentMomentoRequests = (
  senderId: string,
  callback: (requests: MomentoRequest[]) => void,
) => {
  const q = query(collection(db, 'momentoRequests'), where('senderId', '==', senderId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MomentoRequest));
  });
};

// Doc único, em tempo real — cabeçalho da MomentoRequestChatScreen (status/
// momentoSnapshot/texto inicial podem mudar sob o próprio usuário, ex.: o
// autor responde enquanto a tela do remetente está aberta). Mesmo padrão de
// listenMyReports().find(id) em ReportThreadScreen, mas com um doc só (sem
// precisar filtrar uma lista inteira).
export const listenMomentoRequestById = (
  requestId: string,
  callback: (request: MomentoRequest | null) => void,
) => {
  return onSnapshot(doc(db, 'momentoRequests', requestId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as MomentoRequest) : null);
  });
};

export const listenMomentoRequestMessages = (
  requestId: string,
  callback: (messages: MomentoRequestMessage[]) => void,
) => {
  const q = query(
    collection(db, 'momentoRequests', requestId, 'messages'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MomentoRequestMessage));
  });
};

// S143-C (revisão pós-teste de aparelho) — última mensagem da thread, usada
// pela aba Conversas (useAnsweredMomentoRequests.ts) pra ordenar/mostrar
// preview das conversas 'answered' junto das de match. Só a thread de
// pedidos JÁ respondidos tem preview aqui — answerMomentoRequest sempre
// escreve a 1ª mensagem no MESMO momento em que muda o status pra
// 'answered' (dois writes sequenciais, ver comentário abaixo), então nunca
// existe um pedido 'answered' com a subcoleção messages vazia.
export const listenMomentoRequestLastMessage = (
  requestId: string,
  callback: (message: MomentoRequestMessage | null) => void,
) => {
  const q = query(
    collection(db, 'momentoRequests', requestId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.empty
        ? null
        : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as MomentoRequestMessage),
    );
  });
};

// Responder um pedido pendente: transição pending -> answered (só o autor,
// ver firestore.rules) SEGUIDA do envio da primeira mensagem da thread —
// dois writes sequenciais de propósito, a rule da subcoleção só libera
// create depois que o status do pai já é 'answered' de verdade.
export const answerMomentoRequest = async (
  requestId: string,
  authorId: string,
  firstReplyText: string,
): Promise<void> => {
  await updateDoc(doc(db, 'momentoRequests', requestId), { status: 'answered' });
  await sendMomentoRequestMessage(requestId, authorId, firstReplyText);
};

export const declineMomentoRequest = async (requestId: string): Promise<void> => {
  await updateDoc(doc(db, 'momentoRequests', requestId), { status: 'declined' });
};
