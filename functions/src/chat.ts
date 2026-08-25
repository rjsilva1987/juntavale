import { ExpoPushMessage } from 'expo-server-sdk';
import { FieldValue } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { bucket, db, getPushToken, getUserBasicInfo, REGION, sendExpoNotifications } from './shared';

export const onMatchCreated = onDocumentCreated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { matchId } = event.params;
    const users = snap.data().users as string[];
    const initiatedBy = snap.data().initiatedBy as string | undefined;

    // S127 — Marcos e selos: matchesCount é incrementado SÓ aqui (Admin SDK)
    // — o client nunca escreve este campo, ver firestore.rules e o
    // comentário em src/services/firestoreService.ts. Transação por uid
    // (mesmo padrão de assignFounderNumber em perfil.ts) pra evitar leitura
    // suja quando a mesma pessoa dá dois matches quase simultâneos. Quando o
    // novo valor é exatamente 1 (primeiro match de todos), cria
    // users/{uid}/achievements/firstMatch NA MESMA transação — create-only,
    // nunca sobrescreve um doc que já exista.
    for (const uid of users) {
      try {
        await db.runTransaction(async (transaction) => {
          const userRef = db.doc(`users/${uid}`);
          const userSnap = await transaction.get(userRef);
          const currentCount = (userSnap.data()?.matchesCount as number | undefined) ?? 0;
          const newCount = currentCount + 1;

          transaction.update(userRef, { matchesCount: newCount });

          if (newCount === 1) {
            transaction.set(db.doc(`users/${uid}/achievements/firstMatch`), {
              unlockedAt: FieldValue.serverTimestamp(),
            });
          }
        });
      } catch (error) {
        console.error('[onMatchCreated] falha ao incrementar matchesCount:', uid, error);
      }
    }

    const messages: ExpoPushMessage[] = [];
    for (const uid of users) {
      // Nao notifica quem FECHOU o match (initiatedBy): essa pessoa acabou de
      // tocar em curtir e ja esta com a tela do match aberta, entao o push de
      // "novo match" chega redundante e parece bug. O OUTRO participante (quem
      // curtiu antes) nao esta com nada aberto e continua recebendo
      // normalmente. Usamos initiatedBy como proxy de "esta vendo agora"
      // porque o servidor nao enxerga primeiro plano do app.
      if (initiatedBy && initiatedBy === uid) continue;

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
//
// S68 — o doc de swipe (evento onDocumentCreated) já traz `note` (S67,
// bilhete opcional anexado à super curtida) no mesmo snap.data() acima,
// sem precisar de nenhuma leitura extra. Quando presente, o texto do push
// só SINALIZA que veio um recado — nunca mostra o conteúdo de `note` nem
// nada que identifique quem mandou (from não entra no `data` do push, igual
// antes desta sprint): mesmo grau de anonimato de hoje, só a variação de
// título/corpo. Sem bilhete, título e corpo ficam byte a byte iguais ao
// texto anterior a esta sprint.
export const onSuperLikeReceived = onDocumentCreated(
  { document: 'swipes/{swipeId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { from, to, direction, note } = snap.data() as {
      from: string;
      to: string;
      direction: string;
      note?: string;
    };
    if (direction !== 'superlike') return;

    const reverseSnap = await db.doc(`swipes/${to}_${from}`).get();
    if (reverseSnap.exists && reverseSnap.data()?.direction !== 'nope') return;

    const token = await getPushToken(to);
    if (!token) return;

    const hasNote = !!note;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: hasNote ? '⭐ Super Like com bilhete!' : '⭐ Alguém te deu um Super Like!',
        body: hasNote
          ? 'Abra o app para ler o bilhete e descobrir quem foi 👀'
          : 'Abra o app para descobrir quem foi 👀',
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

// S92+S85-C2 — quando a ÚLTIMA mensagem da conversa vira lápide ("apagar pros
// dois", S85-B) ou é editada (S92), o preview em Conversas (MatchesScreen.tsx,
// campo lastMessage do doc do match) precisa acompanhar.
export const onMessageDeletedForEveryone = onDocumentUpdated(
  { document: 'matches/{matchId}/messages/{messageId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const becameTombstone = !before.deletedAt && !!after.deletedAt;
    const wasEdited = !after.deletedAt && !!after.editedAt && before.text !== after.text;
    if (!becameTombstone && !wasEdited) return;

    const { matchId, messageId } = event.params;

    // Precisa ser a ÚLTIMA mensagem da conversa pra mexer no preview —
    // apagar uma mensagem do meio não pode reordenar nem sobrescrever o que
    // já está lá. Comparação por ID, NUNCA por createdAt: lastMessage.createdAt
    // é o serverTimestamp de quando onMessageCreated rodou (acima, neste
    // arquivo), não o createdAt da própria mensagem — os dois nunca
    // coincidem. A lápide continua na subcoleção, então ela mesma volta
    // nesta consulta quando for de fato a última: esperado, não é bug.
    const lastSnap = await db
      .collection(`matches/${matchId}/messages`)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (lastSnap.empty || lastSnap.docs[0].id !== messageId) return;

    const lastMessageText = becameTombstone
      ? 'Esta mensagem foi apagada'
      : wasEdited
        ? after.text.length > 120
          ? `${after.text.slice(0, 120)}…`
          : after.text
        : null;

    if (!lastMessageText) return;

    // Notação de ponto: só o texto muda. senderId e createdAt do lastMessage
    // ficam como estavam — sobrescrever createdAt reordenaria a lista de
    // Conversas, que ordena por ele (MatchesScreen.tsx). Sem push: apagar
    // e editar não são eventos que avisam ninguém.
    try {
      await db.doc(`matches/${matchId}`).update({
        'lastMessage.text': lastMessageText,
      });
    } catch (error) {
      console.error('[onMessageDeletedForEveryone] falha ao atualizar lastMessage:', error);
    }
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

// S102-B — desfaz um match a pedido de um dos dois usuários: apaga
// DEFINITIVAMENTE o doc matches/{matchId} (recursiveDelete leva junto as
// subcoleções messages/hidden/reactions) e as imagens de chat desse match no
// Storage. Sem push pro outro usuário, sem undo. Ao contrário de
// deleteAccount (account.ts), aqui as duas chamadas NÃO ficam em try/catch:
// se falharem, o erro deve propagar pro client (o SDK converte a exceção em
// erro `internal` automaticamente), porque o client precisa saber que a
// operação não terminou e pode tentar de novo — a conta inteira não vai
// sumir de qualquer forma como em deleteAccount, então não é best-effort
// aqui.
export const unmatch = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }

  const matchId = request.data?.matchId;
  if (typeof matchId !== 'string' || matchId.length === 0) {
    throw new HttpsError('invalid-argument', 'matchId inválido.');
  }

  const matchRef = db.doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError('not-found', 'Match não encontrado.');
  }

  // uid vem SEMPRE do token verificado pelo Admin SDK (request.auth.uid),
  // nunca de request.data — mesmo raciocínio do comentário em deleteAccount
  // (account.ts): um uid vindo do client poderia apagar o match de outra
  // pessoa.
  const users = (matchSnap.data()?.users as string[] | undefined) ?? [];
  if (!users.includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Você não faz parte desse match.');
  }

  console.log('[unmatch] apagando match:', matchId);
  await db.recursiveDelete(matchRef);
  await bucket.deleteFiles({ prefix: `images/chats/${matchId}/` });
  console.log('[unmatch] concluído:', matchId);

  return { success: true };
});
