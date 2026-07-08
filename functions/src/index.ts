import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';

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

    const recipientUid = users.find((u) => u !== message.senderId);
    if (!recipientUid) return;

    const token = await getPushToken(recipientUid);
    if (!token) return;

    const sender = await getUserBasicInfo(message.senderId);
    const preview = message.text
      ? message.text
      : message.imageUrl
        ? '📷 Foto'
        : message.location
          ? '📍 Localização'
          : '';

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

    await Promise.all([
      db.doc(`users/${blocker}`).update({ blockedUsers: FieldValue.arrayUnion(blocked) }),
      db.doc(`users/${blocked}`).update({ blockedUsers: FieldValue.arrayUnion(blocker) }),
      db.doc(`matches/${blocker}_${blocked}`).delete(),
      db.doc(`matches/${blocked}_${blocker}`).delete(),
    ]);
  },
);

export const onBlockDeleted = onDocumentDeleted(
  { document: 'blocks/{blockId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { blocker, blocked } = snap.data() as { blocker: string; blocked: string };

    await Promise.all([
      db.doc(`users/${blocker}`).update({ blockedUsers: FieldValue.arrayRemove(blocked) }),
      db.doc(`users/${blocked}`).update({ blockedUsers: FieldValue.arrayRemove(blocker) }),
    ]);
  },
);
