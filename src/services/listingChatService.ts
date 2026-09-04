// src/services/listingChatService.ts
//
// S168-B — contato interessado↔anunciante via chat 1:1 SEM match, escopado a
// um anúncio (listings/{listingId}, S168-A). Mirror do SUBCONJUNTO de
// groupService.ts (texto, foto, responder, copiar, apagar pra todos) — SEM
// reações/edição/enquete/presença/denúncia/swipe-to-reply, nenhum deles
// existe aqui. lastMessage/lastMessageAt são escritos pelo CLIENT (create e
// a cada envio), não por Cloud Function — decisão desta sprint: a lista
// (listenMyListingChats abaixo) ordena por lastMessageAt, e escrever no
// client faz a lista funcionar antes do deploy de
// onListingChatMessageCreated (functions/src/listings.ts).
import {
  addDoc,
  collection,
  deleteField,
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
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { db, storage } from '@/services/firebase';

export const MAX_LISTING_CHAT_MESSAGE_LENGTH = 2000;
// Mesma duração de GROUP_DELETE_FOR_EVERYONE_WINDOW_MS (GroupChatScreen.tsx)
// e DELETE_FOR_EVERYONE_WINDOW_MS (ChatScreen.tsx) — constante SEPARADA de
// propósito, mesmo padrão das duas: mudar uma não pode mudar a outra em
// silêncio.
export const LISTING_CHAT_DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;
// Preview da lista (ListingChatsScreen) truncado em 120 + '…' — mesmo teto de
// onMessageCreated (functions/src/chat.ts:160).
export const LISTING_CHAT_LAST_MESSAGE_PREVIEW_MAX = 120;
// Mesmo texto de lápide da bolha apagada (GroupChatScreen.tsx:177) — usado
// aqui também como preview de lastMessage quando a ÚLTIMA mensagem do chat
// vira lápide (mirror client-side da S92 do 1:1, ver
// deleteListingChatMessageForEveryone abaixo).
export const LISTING_CHAT_DELETED_PREVIEW = 'Esta mensagem foi apagada';

export interface ListingChatLastMessage {
  text: string;
  senderId: string;
}

export interface ListingChat {
  id: string;
  listingId: string;
  ownerId: string;
  interestedId: string;
  // Exatamente 2 uids, sempre [ownerId, interestedId] nessa ordem (ver
  // ensureListingChat abaixo e firestore.rules).
  participants: string[];
  // Snapshot do título do anúncio no momento da criação do chat — sobrevive
  // a uma edição posterior do título (mesmo raciocínio de momentoSnapshot em
  // momentoRequestService.ts).
  listingTitle: string;
  lastMessage: ListingChatLastMessage;
  // null enquanto o serverTimestamp() do create/send ainda não resolveu no
  // listener local — mesmo raciocínio de Match.lastMessage.createdAt
  // (utils/matches.ts).
  lastMessageAt: Timestamp | null;
  createdAt: Timestamp;
  // Mirror de matches/{matchId}.lastReadAt (S27) — marcador de leitura por
  // participante.
  lastReadAt?: Record<string, Timestamp>;
}

// S149-C — mirror de GroupMessageReplyTo (groupService.ts): cópia truncada
// (não referência viva), só existe pra mensagem de TEXTO, já cortada em 100
// code points pelo client antes de chamar create/sendListingChatMessage (ver
// ListingChatScreen.tsx). Sem scroll-to-original nem swipe-to-reply (fora de
// escopo desta sprint).
export interface ListingChatReplyTo {
  messageId: string;
  text: string;
  senderId: string;
}

// Mirror de GroupMessage (groupService.ts:131-145) SEM editedAt — edição não
// existe neste chat (fora de escopo desta sprint).
export interface ListingChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
  imageUrl?: string;
  replyTo?: ListingChatReplyTo;
  deletedAt?: Timestamp;
}

export interface ListingChatSendOpts {
  imageUrl?: string;
  replyTo?: ListingChatReplyTo;
}

export const listingChatId = (listingId: string, interestedId: string): string =>
  `${listingId}_${interestedId}`;

const listingChatRef = (chatId: string) => doc(db, 'listingChats', chatId);
const listingChatMessagesCollection = (chatId: string) =>
  collection(db, 'listingChats', chatId, 'messages');

// Mirror do critério de isMatchUnread (utils/matches.ts:25-34): última
// mensagem enviada pelo PRÓPRIO uid nunca é "não lida". lastMessageAt nulo
// (serverTimestamp local ainda pendente) com sender != uid conta como não
// lida — mesmo raciocínio de createdAt ausente em isMatchUnread.
export function isListingChatUnread(chat: ListingChat, uid: string): boolean {
  if (chat.lastMessage.senderId === uid) return false;
  if (!chat.lastMessageAt) return true;
  const readAt = chat.lastReadAt?.[uid];
  if (!readAt) return true;
  return chat.lastMessageAt.toMillis() > readAt.toMillis();
}

// Mesmo cálculo de onMessageCreated (functions/src/chat.ts:152-160): texto
// tem prioridade sobre foto (mensagem de foto grava text:'', então na
// prática só um dos dois vem preenchido por vez), cortado em
// LISTING_CHAT_LAST_MESSAGE_PREVIEW_MAX + '…'.
export function toListingChatPreview(text: string, hasImage: boolean): string {
  const preview = text ? text : hasImage ? '📷 Foto' : '';
  return preview.length > LISTING_CHAT_LAST_MESSAGE_PREVIEW_MAX
    ? `${preview.slice(0, LISTING_CHAT_LAST_MESSAGE_PREVIEW_MAX)}…`
    : preview;
}

// permission-denied tratado pelo CALLER (onError) — ListingChatScreen decide
// "conversa indisponível" a partir daqui e do listener de mensagens abaixo
// (armadilha do ROADMAP: permission-denied nunca é erro genérico).
export const listenListingChat = (
  chatId: string,
  callback: (chat: ListingChat | null) => void,
  onError?: (error: unknown) => void,
) => {
  return onSnapshot(
    listingChatRef(chatId),
    (snap) => {
      callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<ListingChat, 'id'>) } : null);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[listenListingChat] erro no listener:', error);
    },
  );
};

// ÚNICA query de lista da sprint: lista por anúncio (ListingChatsScreen com
// param), "N conversas" (MyListingsScreen) e o badge (useUnreadListingChats)
// filtram tudo no client a partir desta mesma lista.
export const listenMyListingChats = (
  uid: string,
  callback: (chats: ListingChat[]) => void,
  onError?: (error: unknown) => void,
) => {
  const q = query(
    collection(db, 'listingChats'),
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListingChat));
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[listenMyListingChats] erro no listener:', error);
    },
  );
};

// Mirror de listenGroupMessages (groupService.ts:416-430), com um 2º
// argumento A MAIS no callback (hasPendingWrites da ÚLTIMA mensagem do
// snapshot): ListingChatScreen precisa dele pra decidir quando chamar
// markListingChatRead, e telas não podem importar firebase/firestore direto
// pra ler isso sozinhas (convenção do projeto, ARQUITETURA.md).
export const listenListingChatMessages = (
  chatId: string,
  callback: (messages: ListingChatMessage[], lastMessageHasPendingWrites: boolean) => void,
  onError?: (error: unknown) => void,
) => {
  const q = query(listingChatMessagesCollection(chatId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListingChatMessage);
      const lastDoc = snap.docs[snap.docs.length - 1];
      callback(messages, lastDoc ? lastDoc.metadata.hasPendingWrites : false);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[listenListingChatMessages] erro no listener:', error);
    },
  );
};

const buildMessagePayload = (text: string, senderId: string, opts?: ListingChatSendOpts) => ({
  text,
  senderId,
  createdAt: serverTimestamp(),
  ...(opts?.imageUrl ? { imageUrl: opts.imageUrl } : {}),
  ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
});

// Garante listingChats/{chatId} (create-only) SEM enviar mensagem — extraído
// de createListingChatWithFirstMessage (S168-B1) pra poder ser chamado
// sozinho antes do upload de foto (storage.rules images/listingChats exige o
// doc pai já existir, ver ListingChatScreen.handleSendImage). Retorna true se
// o doc foi criado agora, false se já existia (corrida).
export const ensureListingChat = async (
  listing: { listingId: string; ownerId: string; listingTitle: string },
  interestedId: string,
  preview: string,
): Promise<boolean> => {
  const chatId = listingChatId(listing.listingId, interestedId);
  const chatRef = listingChatRef(chatId);

  try {
    await setDoc(chatRef, {
      listingId: listing.listingId,
      ownerId: listing.ownerId,
      interestedId,
      participants: [listing.ownerId, interestedId],
      listingTitle: listing.listingTitle,
      lastMessage: { text: preview, senderId: interestedId },
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastReadAt: { [interestedId]: serverTimestamp() },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code !== 'permission-denied') throw error;
    // create-only na corrida (dois toques) — padrão do ROADMAP ("Padrões de
    // escrita no Firestore"): se o doc já existe, não é erro, o chamador
    // segue com addDoc/sendListingChatMessage (mesmo efeito de duas escritas
    // sequenciais).
    const existing = await getDoc(chatRef);
    if (!existing.exists()) throw error;
    return false;
  }
};

// Dois writes sequenciais de propósito: a rule de messages faz get() do pai
// (listingChats/{chatId}), que precisa já existir — mesmo raciocínio de
// answerMomentoRequest (momentoRequestService.ts:286-293).
export const createListingChatWithFirstMessage = async (
  listing: { listingId: string; ownerId: string; listingTitle: string },
  interestedId: string,
  text: string,
  opts?: ListingChatSendOpts,
): Promise<void> => {
  const chatId = listingChatId(listing.listingId, interestedId);
  const preview = toListingChatPreview(text, !!opts?.imageUrl);
  const created = await ensureListingChat(listing, interestedId, preview);
  if (created) {
    await addDoc(
      listingChatMessagesCollection(chatId),
      buildMessagePayload(text, interestedId, opts),
    );
    return;
  }
  await sendListingChatMessage(chatId, interestedId, text, opts);
};

// Limpeza de orfão no Storage quando o upload passa mas a mensagem falha
// (ListingChatScreen.handleSendImage) — mesmo estilo .catch(() => {}) de
// deleteListingChatMessageForEveryone abaixo.
export const deleteListingChatImage = async (imageUrl: string): Promise<void> => {
  await deleteObject(ref(storage, imageUrl)).catch(() => {});
};

export const sendListingChatMessage = async (
  chatId: string,
  senderId: string,
  text: string,
  opts?: ListingChatSendOpts,
): Promise<void> => {
  await addDoc(listingChatMessagesCollection(chatId), buildMessagePayload(text, senderId, opts));
  const preview = toListingChatPreview(text, !!opts?.imageUrl);
  await updateDoc(listingChatRef(chatId), {
    lastMessage: { text: preview, senderId },
    lastMessageAt: serverTimestamp(),
    [`lastReadAt.${senderId}`]: serverTimestamp(),
  });
};

export const markListingChatRead = async (chatId: string, uid: string): Promise<void> => {
  await updateDoc(listingChatRef(chatId), { [`lastReadAt.${uid}`]: serverTimestamp() });
};

// Mirror de deleteGroupMessageForEveryone (groupService.ts:470-485), sem
// editedAt (não existe aqui). `uid` = quem apaga (sempre o próprio autor —
// gate de UI em ListingChatScreen, mesmo canDeleteForEveryone do grupo):
// necessário pra gravar lastMessage.senderId no ramo isLastMessage abaixo.
export const deleteListingChatMessageForEveryone = async (
  chatId: string,
  messageId: string,
  uid: string,
  imageUrl: string | undefined,
  isLastMessage: boolean,
): Promise<void> => {
  await updateDoc(doc(db, 'listingChats', chatId, 'messages', messageId), {
    text: deleteField(),
    imageUrl: deleteField(),
    replyTo: deleteField(),
    deletedAt: serverTimestamp(),
  });
  if (isLastMessage) {
    // Mirror CLIENT-side da S92 do 1:1 (lá quem faz isso é a Cloud Function
    // onMessageDeletedForEveryone, via Admin SDK) — aqui é o client quem
    // escreve lastMessage (decisão desta sprint, ver comentário do topo do
    // arquivo).
    await updateDoc(listingChatRef(chatId), {
      lastMessage: { text: LISTING_CHAT_DELETED_PREVIEW, senderId: uid },
      lastMessageAt: serverTimestamp(),
    });
  }
  if (imageUrl) {
    await deleteObject(ref(storage, imageUrl)).catch(() => {});
  }
};

// Mirror de uploadGroupChatImage (groupService.ts:525-545), path
// images/listingChats/{chatId}/{ts}.jpg (ver storage.rules).
export const uploadListingChatImage = async (
  chatId: string,
  localUri: string,
  onProgress: (percent: number) => void,
): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/listingChats/${chatId}/${Date.now()}.jpg`);
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
