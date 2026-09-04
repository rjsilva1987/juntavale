import { ExpoPushMessage } from 'expo-server-sdk';
import { Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  db,
  getAdminPushTokens,
  getPushToken,
  getUserBasicInfo,
  isAdminUid,
  REGION,
  sendExpoNotifications,
} from './shared';

// S170 — avisa o admin quando um anúncio de classificados entra na fila de
// moderação. onDocumentWritten de propósito, NÃO onDocumentCreated: além
// do create (createListing, sempre `pending`), a edição de conteúdo pelo
// dono (updateListingContent) faz updateDoc no MESMO doc e devolve
// `approved`/`rejected` pra `pending` — pro Firestore isso é UPDATE, e um
// onDocumentCreated perderia toda re-submissão. Mesmo raciocínio de
// onVerificationSubmitted (admin.ts). A guarda `before?.status ===
// 'pending'` é a dedup: edição de anúncio AINDA pendente (pending→pending)
// não gera push — um push por entrada na fila, nunca por edição.
//
// Texto sem o título do anúncio (privacidade na tela de bloqueio, mesma
// regra do push de resultado de verificação — ver comentário S58 em
// admin.ts): só o nickname do anunciante, como em `verification_new`.
// Destinatário: TODOS os admins (getAdminPushTokens, S168-B2) — antes só
// ADMIN_UID, igual a todas as functions de admin da época.
export const onListingSubmitted = onDocumentWritten(
  { document: 'listings/{listingId}', region: REGION },
  async (event) => {
    const listingId = event.params.listingId;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;

    if (!after) return; // doc apagado
    if (after.status !== 'pending') return; // revisão do admin, vendido, removido
    if (before?.status === 'pending') return; // já estava na fila: edição sem mudança de estado
    if (isAdminUid(after.ownerId as string | undefined)) return; // admin anunciando: modera o próprio

    const tokens = await getAdminPushTokens();
    if (tokens.length === 0) return;

    const name = (after.ownerNickname as string | undefined) || 'Alguém';
    // before === null → anúncio novo; before existente (approved/rejected) →
    // edição que voltou pra fila. O admin sabe por que recebeu o push de novo.
    const body = before
      ? `${name} editou um anúncio, que voltou para a fila`
      : `${name} enviou um anúncio para revisão`;

    await sendExpoNotifications(
      tokens.map((to) => ({
        to,
        sound: 'default',
        title: 'Novo anúncio para aprovar',
        body,
        data: { type: 'listing_new', listingId },
      })),
    );
  },
);

// S168-B — push pro OUTRO participante do chat interessado↔anunciante
// (listingChats/{chatId}) quando uma mensagem nova é criada. Mirror de
// onMessageCreated (chat.ts:135-203) SEM o update de lastMessage: aqui é o
// CLIENT quem escreve lastMessage/lastMessageAt em listingChats/{chatId}
// (decisão desta sprint, ver listingChatService.ts), então a function só
// notifica — nunca reescreve o preview. Lápide ("apagar pra todos") nunca
// dispara onDocumentCreated (é um update da própria mensagem, não um
// create), mas a guarda abaixo cobre também o caso degenerado de uma
// mensagem sem texto e sem imagem chegar aqui por qualquer outro motivo.
export const onListingChatMessageCreated = onDocumentCreated(
  { document: 'listingChats/{chatId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { chatId } = event.params;
    const message = snap.data() as { senderId: string; text?: string; imageUrl?: string };
    if (!message.text && !message.imageUrl) return;

    const chatSnap = await db.doc(`listingChats/${chatId}`).get();
    const chat = chatSnap.data() as
      | {
          participants: string[];
          listingId: string;
          ownerId: string;
          interestedId: string;
          listingTitle: string;
        }
      | undefined;
    if (!chat) return;

    const recipientUid = chat.participants.find((u) => u !== message.senderId);
    if (!recipientUid) return;

    const token = await getPushToken(recipientUid);
    if (!token) return;

    const sender = await getUserBasicInfo(message.senderId);
    const preview = message.text ? message.text : '📷 Foto';

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: sender?.name ?? 'Alguém',
        body: preview,
        data: {
          type: 'listing_message',
          chatId,
          listingId: chat.listingId,
          ownerId: chat.ownerId,
          interestedId: chat.interestedId,
          listingTitle: chat.listingTitle,
        },
      },
    ]);
  },
);

// S172 — expira anúncios approved com expiresAt vencido: approved → expired
// (nunca delete) + 1 push pro dono. 1 rodada/dia às 09:00 de São Paulo
// (molde de staleMatchReminder). Query composta status+expiresAt exige o
// índice (status ASC, expiresAt ASC) de firestore.indexes.json. Releitura
// em transação por doc (molde de expireMomentos): entre a query e o write o
// dono pode ter marcado sold/removed ou editado (pending) — só expira o que
// AINDA está approved e vencido no instante do write. Texto sem o título do
// anúncio (privacidade na tela de bloqueio, mesma regra de listing_new).
export const expireListings = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const snap = await db
      .collection('listings')
      .where('status', '==', 'approved')
      .where('expiresAt', '<=', now)
      .get();

    let expiredCount = 0;
    const messages: ExpoPushMessage[] = [];

    for (const listingDoc of snap.docs) {
      const ref = listingDoc.ref;
      let expired = false;
      let ownerId: string | undefined;
      try {
        await db.runTransaction(async (transaction) => {
          expired = false;
          ownerId = undefined;
          const fresh = await transaction.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data() as { status?: string; expiresAt?: Timestamp; ownerId?: string };
          if (
            data.status === 'approved' &&
            data.expiresAt &&
            data.expiresAt.toMillis() <= Timestamp.now().toMillis()
          ) {
            transaction.update(ref, { status: 'expired' });
            expired = true;
            ownerId = data.ownerId;
          }
        });
      } catch (error) {
        console.error('[expireListings] falha na transação:', ref.id, error);
        continue;
      }
      if (!expired) continue;
      expiredCount++;
      if (!ownerId) continue;

      const token = await getPushToken(ownerId);
      if (!token) continue;
      messages.push({
        to: token,
        sound: 'default',
        title: 'Anúncio expirado',
        body: 'Um anúncio seu expirou. Toque para renovar.',
        data: { type: 'listing_expired', listingId: ref.id },
      });
    }

    await sendExpoNotifications(messages);
    console.log(
      `[expireListings] varridos: ${snap.size}, expirados: ${expiredCount}, pushes: ${messages.length}`,
    );
  },
);
