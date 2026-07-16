import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const expo = new Expo();
const REGION = 'southamerica-east1';

// Uid da conta admin, hardcoded de propósito — mesmo padrão de
// src/config/admin.ts e do literal em firestore.rules: nenhum dos três
// arquivos importa o outro, então precisam ficar em sincronia manual.
const ADMIN_UID = 'Gd0pJi8WjYS60JHOnhIx9R6vktJ3';

// Réplica mínima de SUPPORT_CATEGORY_LABELS (src/constants/supportCategories.ts)
// — functions não importa código do app, então este mapa precisa ficar em
// sincronia manual se as categorias mudarem.
const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  denuncia: 'Denúncia',
  sugestao: 'Sugestão',
  conta: 'Conta e cadastro',
};

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

// lastMessageAt (S40) é escrito só aqui (Admin SDK), nunca pelo client — ver
// firestore.rules (support/{ticketId} não libera mais esse campo em create
// nem em update). Usa o createdAt da MENSAGEM em vez de serverTimestamp():
// isso torna a function idempotente numa re-execução, mesmo padrão de
// intenção de lastMessage em matches/{matchId}, só que ali é um objeto e
// aqui é o timestamp puro do doc pai.
export const onSupportMessageCreated = onDocumentCreated(
  { document: 'support/{ticketId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { ticketId } = event.params;
    const message = snap.data() as {
      senderId: string;
      text?: string;
      createdAt?: Timestamp;
    };

    const ticketSnap = await db.doc(`support/${ticketId}`).get();
    const ticket = ticketSnap.data() as
      | { uid: string; category: string; createdAt?: Timestamp }
      | undefined;
    if (!ticket) {
      console.warn('[onSupportMessageCreated] ticket pai não encontrado:', ticketId);
      return;
    }

    const messageCreatedAt = message.createdAt ?? Timestamp.fromDate(new Date(event.time));

    try {
      await ticketSnap.ref.update({ lastMessageAt: messageCreatedAt });
    } catch (error) {
      console.error('[onSupportMessageCreated] falha ao atualizar lastMessageAt:', error);
    }

    // Mesmo writeBatch em submitSupportTicket resolve o serverTimestamp() do
    // ticket e da 1ª mensagem pro MESMO valor — createdAt igual identifica
    // "é a 1ª mensagem de um chamado novo" sem precisar de um campo à parte.
    const isNewTicket = !!ticket.createdAt && ticket.createdAt.isEqual(messageCreatedAt);

    let recipientUid: string;
    let title: string;
    let body: string;
    if (message.senderId === ADMIN_UID) {
      recipientUid = ticket.uid;
      title = 'Equipe JuntaVale';
      body = 'Sua solicitação foi respondida';
    } else {
      recipientUid = ADMIN_UID;
      const categoryLabel = SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category;
      title = isNewTicket ? 'Novo chamado de suporte' : 'Nova resposta em chamado';
      body = categoryLabel;
    }

    // Admin abrindo/respondendo chamado na própria conta: não notifica a si
    // mesmo, mas o update do lastMessageAt acima já aconteceu de qualquer forma.
    if (recipientUid === message.senderId) return;

    const token = await getPushToken(recipientUid);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title,
        body,
        data: { type: 'support', ticketId },
      },
    ]);
  },
);

// Primeira scheduled function do projeto (as outras 7 são trigger de
// Firestore) — 1x por dia, encontra matches criados há 48-72h que nunca
// tiveram mensagem (lastMessage ausente, escrito só por onMessageCreated)
// e manda um empurrãozinho pros dois participantes. Idempotente por
// construção: a janela tem 24h de largura (48-72h) e o cron roda 1x por
// dia, então cada match cai em exatamente UMA execução — não precisa
// marcar o doc como "já lembrado".
export const staleMatchReminder = onSchedule(
  { schedule: '0 19 * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const max = Timestamp.fromMillis(now.toMillis() - 48 * 60 * 60 * 1000);
    const min = Timestamp.fromMillis(now.toMillis() - 72 * 60 * 60 * 1000);

    // Range num único campo (createdAt) — usa o índice single-field
    // automático, não deveria pedir índice composto no deploy.
    const matchesSnap = await db
      .collection('matches')
      .where('createdAt', '>', min)
      .where('createdAt', '<=', max)
      .get();

    let eligibleCount = 0;
    let pushCount = 0;
    const messages: ExpoPushMessage[] = [];

    for (const matchDoc of matchesSnap.docs) {
      try {
        const match = matchDoc.data() as {
          users?: string[];
          lastMessage?: unknown;
          blockedBy?: string[];
        };

        if (match.lastMessage) continue;
        if (match.blockedBy && match.blockedBy.length > 0) continue;
        if (!match.users || match.users.length !== 2) continue;

        eligibleCount++;

        const [uidA, uidB] = match.users;
        const [profileA, profileB] = await Promise.all([
          getUserBasicInfo(uidA),
          getUserBasicInfo(uidB),
        ]);
        const profileByUid: Record<string, { name: string; photoURL?: string } | null> = {
          [uidA]: profileA,
          [uidB]: profileB,
        };

        for (const recipientUid of match.users) {
          const otherUid = match.users.find((u) => u !== recipientUid)!;

          const token = await getPushToken(recipientUid);
          if (!token) {
            console.log(
              '[staleMatchReminder] sem push token, pulando destinatário:',
              recipientUid,
            );
            continue;
          }

          const other = profileByUid[otherUid];
          messages.push({
            to: token,
            sound: 'default',
            title: 'Seu match está esperando 👀',
            body: `Você e ${other?.name ?? 'seu match'} deram match e ninguém disse oi ainda. Quebra o gelo!`,
            data: {
              type: 'match_reminder',
              matchId: matchDoc.id,
              otherUid,
              otherName: other?.name ?? 'Usuário',
              otherPhoto: other?.photoURL ?? '',
            },
          });
          pushCount++;
        }
      } catch (error) {
        console.error('[staleMatchReminder] falha ao processar match:', matchDoc.id, error);
      }
    }

    await sendExpoNotifications(messages);

    console.log(
      `[staleMatchReminder] janela: ${matchesSnap.size} matches, elegíveis: ${eligibleCount}, pushes: ${pushCount}`,
    );
  },
);
