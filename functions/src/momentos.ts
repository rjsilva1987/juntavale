import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { bucket, db, getPushToken, getUserBasicInfo, REGION, sendExpoNotifications } from './shared';

// S121 — expira momentos (story de 24h). Roda de hora em hora, mesmo
// timeZone do padrão de staleMatchReminder (agendadas.ts). A transação por
// doc (em vez de deleteDocsInBatches direto na lista da query) é necessária
// porque a lista da query, coletada no passo 1, pode ficar desatualizada:
// um usuário que sobrescreve o próprio momento (setDoc) entre a query e o
// commit teria o NOVO momento apagado por engano, já que a query capturou o
// doc ANTIGO antes da sobrescrita. A releitura dentro da transação garante
// que só apaga o que ainda está realmente expirado no momento do delete.
export const expireMomentos = onSchedule(
  { schedule: '0 * * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const snap = await db.collection('momentos').where('expiresAt', '<=', now).get();

    let deletedCount = 0;
    for (const momentoDoc of snap.docs) {
      const ref = momentoDoc.ref;
      let deleted = false;
      let type: string | undefined;
      try {
        await db.runTransaction(async (transaction) => {
          deleted = false;
          type = undefined;
          const fresh = await transaction.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data() as { expiresAt?: Timestamp; type?: string };
          if (data.expiresAt && data.expiresAt.toMillis() <= Timestamp.now().toMillis()) {
            type = data.type;
            transaction.delete(ref);
            deleted = true;
          }
        });
      } catch (error) {
        console.error('[expireMomentos] falha na transação:', ref.id, error);
        continue;
      }

      if (deleted) {
        deletedCount++;
        if (type === 'photo') {
          try {
            await bucket.deleteFiles({ prefix: `images/momentos/${ref.id}/` });
          } catch (error) {
            console.error('[expireMomentos] falha ao apagar fotos do momento:', ref.id, error);
          }
        }
        // S143-B — apaga também a subcoleção momentos/{uid}/likes junto do
        // momento (decisão 8). NÃO trocamos transaction.delete(ref) acima por
        // db.recursiveDelete(ref): recursiveDelete não pode rodar DENTRO de
        // uma transação do Admin SDK (faz os próprios batches internos), e
        // movê-lo pra fora da transação pra cobrir o doc PAI reabriria
        // exatamente a corrida que o comentário no topo deste arquivo explica
        // (um setDoc de republish entre a query e o delete apagaria o momento
        // NOVO por engano) — a transação continua sendo o único ponto que
        // decide COM SEGURANÇA se este doc específico ainda está expirado.
        // recursiveDelete aqui só cobre a subcoleção `likes`, que já não
        // existe mais nenhuma referência a ela depois que o doc pai sumiu
        // (best-effort, mesmo padrão do bucket.deleteFiles acima — órfã no
        // Firestore custa armazenamento, não corrompe dado nenhum).
        try {
          await db.recursiveDelete(ref.collection('likes'));
        } catch (error) {
          console.error('[expireMomentos] falha ao apagar likes do momento:', ref.id, error);
        }
        // S148 — momentoRequests é apagado junto com a expiração do momento
        // do autor (decisão 8 revogada: a cópia em momentoSnapshot não
        // justifica mais manter o pedido vivo depois que o momento original
        // some). ref.id é o uid do autor (doc id de momentos/{uid}), mesmo
        // best-effort de likes acima — não derruba a expiração se falhar.
        try {
          const requestsSnap = await db
            .collection('momentoRequests')
            .where('authorId', '==', ref.id)
            .get();
          await Promise.all(
            requestsSnap.docs.map((requestDoc) => db.recursiveDelete(requestDoc.ref)),
          );
        } catch (error) {
          console.error(
            '[expireMomentos] falha ao apagar momentoRequests do momento:',
            ref.id,
            error,
          );
        }
      }
    }

    console.log(`[expireMomentos] varridos: ${snap.size}, apagados: ${deletedCount}`);
  },
);

// S143-B — likesCount é um contador DENORMALIZADO em momentos/{authorUid},
// escrito só aqui (Admin SDK) — nunca pelo client (firestore.rules não
// libera esse campo no hasOnly de momentos/{uid}). Existe pra resolver uma
// tensão do produto: curtir momento NÃO é anônimo (o autor lista quem
// curtiu, ver getMomentoLikers em momentoService.ts), mas as rules da
// subcoleção momentos/{authorUid}/likes só liberam leitura pro próprio
// liker ou pro autor (nunca abertas à base inteira, ao contrário de
// users/{uid}/photoLikes) — um visualizador qualquer não teria como CONTAR
// a subcoleção direto. O contador aqui no doc PAI já é público (mesma
// audiência do momento em si), sem abrir a lista nominal de curtidores pra
// mais ninguém.
export const onMomentoLikeCreated = onDocumentCreated(
  { document: 'momentos/{authorUid}/likes/{likerUid}', region: REGION },
  async (event) => {
    const { authorUid } = event.params;
    try {
      await db.doc(`momentos/${authorUid}`).update({ likesCount: FieldValue.increment(1) });
    } catch (error) {
      // Momento já expirado/apagado entre a curtida e esta function rodar —
      // não deve derrubar a function, só logar (mesmo padrão de
      // onMessageCreated ao atualizar lastMessage, functions/src/chat.ts).
      console.error('[onMomentoLikeCreated] falha ao incrementar likesCount:', authorUid, error);
    }
  },
);

export const onMomentoLikeDeleted = onDocumentDeleted(
  { document: 'momentos/{authorUid}/likes/{likerUid}', region: REGION },
  async (event) => {
    const { authorUid } = event.params;
    try {
      await db.doc(`momentos/${authorUid}`).update({ likesCount: FieldValue.increment(-1) });
    } catch (error) {
      console.error('[onMomentoLikeDeleted] falha ao decrementar likesCount:', authorUid, error);
    }
  },
);

// S143-B — pedido de conversa sem match (decisão 2). Notifica o AUTOR do
// momento quando chega um pedido novo — mesmo molde de onGroupJoinRequestCreated
// (functions/src/grupos.ts).
export const onMomentoRequestCreated = onDocumentCreated(
  { document: 'momentoRequests/{requestId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { authorId, senderId } = snap.data() as { authorId: string; senderId: string };

    const token = await getPushToken(authorId);
    if (!token) return;

    const sender = await getUserBasicInfo(senderId);

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Novo pedido de conversa',
        body: `${sender?.name ?? 'Alguém'} comentou seu momento`,
        data: { type: 'momentoRequest', requestId: event.params.requestId },
      },
    ]);
  },
);

// S150 — espelha lastMessage no doc pai do pedido, MESMO MECANISMO de
// onMessageCreated (matches/{matchId}/messages, chat.ts) e de
// onGroupMessageCreated (grupos.ts, S150): Cloud Function (Admin SDK)
// reagindo à criação da mensagem — client nunca escreve este campo
// (momentoRequests/{requestId} não libera 'lastMessage' no hasOnly do allow
// update, ver firestore.rules). Fundação do badge "mensagem nova" pro AUTOR
// (useUnreadMomentoAuthorMessages.ts) — SEM push aqui, os pushes de
// pedido/resposta já existem em onMomentoRequestCreated/Updated acima, nada
// novo por mensagem de acompanhamento.
export const onMomentoRequestMessageCreated = onDocumentCreated(
  { document: 'momentoRequests/{requestId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { requestId } = event.params;
    const message = snap.data() as { senderId: string; text: string };

    const lastMessageText =
      message.text.length > 120 ? `${message.text.slice(0, 120)}…` : message.text;

    try {
      await db.doc(`momentoRequests/${requestId}`).update({
        lastMessage: {
          text: lastMessageText,
          senderId: message.senderId,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    } catch (error) {
      console.error('[onMomentoRequestMessageCreated] falha ao atualizar lastMessage:', error);
    }
  },
);

// Notifica o REMETENTE quando o autor responde (status -> answered) ou
// recusa (status -> declined) o pedido — decisão 4: responder NUNCA cria
// match, só libera a subcoleção messages deste pedido específico (ver
// firestore.rules).
export const onMomentoRequestUpdated = onDocumentUpdated(
  { document: 'momentoRequests/{requestId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() as { status?: string } | undefined;
    const after = event.data?.after.data() as
      | { status?: string; senderId: string; authorId: string }
      | undefined;
    if (!before || !after) return;
    if (before.status !== 'pending') return;
    if (after.status !== 'answered' && after.status !== 'declined') return;

    const token = await getPushToken(after.senderId);
    if (!token) return;

    const author = await getUserBasicInfo(after.authorId);

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title:
          after.status === 'answered' ? 'Seu pedido foi respondido' : 'Seu pedido foi recusado',
        body:
          after.status === 'answered'
            ? `${author?.name ?? 'Alguém'} respondeu seu comentário`
            : `${author?.name ?? 'Alguém'} recusou seu pedido de conversa`,
        data: { type: 'momentoRequestAnswer', requestId: event.params.requestId },
      },
    ]);
  },
);
