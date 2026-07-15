import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';

initializeApp();

const db = getFirestore();
const expo = new Expo();
const REGION = 'southamerica-east1';

async function getPushToken(uid: string): Promise<string | null> {
  const snap = await db.doc(`users/${uid}/private/push`).get();
  const token = snap.data()?.token as string | undefined;
  return token && Expo.isExpoPushToken(token) ? token : null;
}

async function getUserBasicInfo(
  uid: string,
): Promise<{ name: string; photoURL?: string } | null> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data) return null;
  return { name: data.name as string, photoURL: data.photoURL as string | undefined };
}

async function sendExpoNotifications(messages: ExpoPushMessage[]): Promise<void> {
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket) => {
        if (ticket.status === 'error') {
          // TODO: se ticket.details?.error === 'DeviceNotRegistered', apagar o
          // token em users/{uid}/private/push. Exige mapear ticket -> uid via
          // getReceiptsAsync (assíncrono, chega minutos depois) — fora de
          // escopo desta sessão.
          console.error('[push] ticket error:', ticket.message, ticket.details?.error);
        }
      });
    } catch (error) {
      console.error('[push] falha ao enviar chunk:', error);
    }
  }
}

export const onMatchCreated = onDocumentCreated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { matchId } = event.params;
    const users = snap.data().users as string[];

    const messages: ExpoPushMessage[] = [];
    for (const uid of users) {
      const token = await getPushToken(uid);
      if (!token) continue;

      const otherUid = users.find((u) => u !== uid)!;
      const other = await getUserBasicInfo(otherUid);

      messages.push({
        to: token,
        sound: 'default',
        title: 'Novo match! 🎉',
        body: 'Você tem um novo match! 🎉',
        data: {
          type: 'match',
          matchId,
          otherUid,
          otherName: other?.name ?? 'Alguém',
          otherPhoto: other?.photoURL,
        },
      });
    }

    await sendExpoNotifications(messages);
  },
);

// Notifica quem recebeu um superlike, anonimamente (sem fromUid/nome/foto —
// decisão de produto: só o match revela quem foi). Se o superlike já virou
// match nesta mesma escrita (swipe reverso existente e != 'nope'),
// onMatchCreated já notifica os dois lados — não duplicar aqui.
export const onSuperLikeReceived = onDocumentCreated(
  { document: 'swipes/{swipeId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { from, to, direction } = snap.data() as {
      from: string;
      to: string;
      direction: string;
    };
    if (direction !== 'superlike') return;

    const reverseSnap = await db.doc(`swipes/${to}_${from}`).get();
    if (reverseSnap.exists && reverseSnap.data()?.direction !== 'nope') return;

    const token = await getPushToken(to);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: '⭐ Alguém te deu um Super Like!',
        body: 'Abra o app para descobrir quem foi 👀',
        data: { type: 'superlike' },
      },
    ]);
  },
);

export const onMessageCreated = onDocumentCreated(
  { document: 'matches/{matchId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { matchId } = event.params;
    const message = snap.data() as {
      senderId: string;
      text?: string;
      imageUrl?: string;
      location?: { latitude: number; longitude: number };
    };

    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const users = matchSnap.data()?.users as string[] | undefined;
    if (!users) return;

    const preview = message.text
      ? message.text
      : message.imageUrl
        ? '📷 Foto'
        : message.location
          ? '📍 Localização'
          : '';
    const lastMessageText = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;

    // Fundação pro badge de não lidas (S27) e pro preview da lista de
    // conversas (S29): lastMessage só é escrito aqui (Admin SDK), nunca pelo
    // client — ver firestore.rules (matches/{matchId} não libera 'lastMessage'
    // no allow update). Match arquivado/apagado entre o envio da mensagem e
    // esta function rodar não deve derrubar a function — só loga e segue.
    try {
      await matchSnap.ref.update({
        lastMessage: {
          text: lastMessageText,
          senderId: message.senderId,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    } catch (error) {
      console.error('[onMessageCreated] falha ao atualizar lastMessage:', error);
    }

    const recipientUid = users.find((u) => u !== message.senderId);
    if (!recipientUid) return;

    const token = await getPushToken(recipientUid);
    if (!token) return;

    const sender = await getUserBasicInfo(message.senderId);

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: sender?.name ?? 'Alguém',
        body: preview,
        data: {
          type: 'message',
          matchId,
          otherUid: message.senderId,
          otherName: sender?.name ?? 'Alguém',
          otherPhoto: sender?.photoURL,
        },
      },
    ]);
  },
);

export const onBlockCreated = onDocumentCreated(
  { document: 'blocks/{blockId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { blocker, blocked } = snap.data() as { blocker: string; blocked: string };

    // Arquiva o match (em vez de apagar) para que desbloquear restaure a
    // conversa inteira. blockedBy é escrito só por aqui (Admin SDK) — o
    // client nunca consegue setar esse campo, ver firestore.rules.
    const matchRefs = [
      db.doc(`matches/${blocker}_${blocked}`),
      db.doc(`matches/${blocked}_${blocker}`),
    ];
    const matchSnaps = await Promise.all(matchRefs.map((ref) => ref.get()));

    await Promise.all([
      db.doc(`users/${blocker}`).update({ blockedUsers: FieldValue.arrayUnion(blocked) }),
      db.doc(`users/${blocked}`).update({ blockedUsers: FieldValue.arrayUnion(blocker) }),
      ...matchRefs
        .filter((_, i) => matchSnaps[i].exists)
        .map((ref) => ref.update({ blockedBy: FieldValue.arrayUnion(blocker) })),
    ]);
  },
);

export const onBlockDeleted = onDocumentDeleted(
  { document: 'blocks/{blockId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { blocker, blocked } = snap.data() as { blocker: string; blocked: string };

    const matchRefs = [
      db.doc(`matches/${blocker}_${blocked}`),
      db.doc(`matches/${blocked}_${blocker}`),
    ];
    const matchSnaps = await Promise.all(matchRefs.map((ref) => ref.get()));

    await Promise.all([
      db.doc(`users/${blocker}`).update({ blockedUsers: FieldValue.arrayRemove(blocked) }),
      db.doc(`users/${blocked}`).update({ blockedUsers: FieldValue.arrayRemove(blocker) }),
      ...matchRefs
        .filter((_, i) => matchSnaps[i].exists)
        .map((ref) => ref.update({ blockedBy: FieldValue.arrayRemove(blocker) })),
    ]);
  },
);

// verified (S20) é escrito só por aqui (Admin SDK) — o client nunca consegue
// setá-lo, ver firestore.rules (users/{userId} não tem 'verified' na
// hasOnly() de create/update). O client só consegue mudar o status do pedido
// pra 'pending'; só o admin consegue mudar pra 'approved'/'rejected' (ver
// firestore.rules, match /verifications/{uid}) — esta function reage a essa
// mudança e sincroniza o booleano no perfil.
export const onVerificationReviewed = onDocumentUpdated(
  { document: 'verifications/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;

    if (after.status === 'approved') {
      await db.doc(`users/${event.params.uid}`).update({ verified: true });
    } else if (after.status === 'rejected') {
      await db.doc(`users/${event.params.uid}`).update({ verified: false });
    }
  },
);
