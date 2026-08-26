import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { bucket, db, getPushToken, getUserBasicInfo, REGION, sendExpoNotifications } from './shared';

// S124-A — expira grupos (sala de conversa com prazo de encerramento, teto 1
// mês). Mirror EXATO do padrão de expireMomentos (momentos.ts): mesmo
// schedule/timeZone/region, mesma releitura transacional por doc antes do
// recursiveDelete (evita apagar por engano um doc que mudou entre a query e
// o commit — aqui não há "sobrescrita" como em momentos, mas a transação
// ainda garante que só apaga o que está de fato expirado no momento do
// delete). recursiveDelete(ref) leva junto as 3 subcoleções (members,
// joinRequests, messages), mas NÃO leva o Storage — mensagens de grupo podem
// ter foto (images/groupChats/{groupId}/, ver uploadGroupChatImage em
// groupService.ts), mesmo caso já coberto pelo passo de matches no
// deleteAccount (account.ts, images/chats/{matchId}/). Limpa esse prefixo
// logo após o recursiveDelete ter sucesso, mesmo padrão de
// bucket.deleteFiles dentro de try/catch-e-loga do bloco `type === 'photo'`
// de expireMomentos — falha na limpeza de Storage não deve impedir a
// próxima iteração do loop.
export const expireGroups = onSchedule(
  { schedule: '0 * * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const snap = await db.collection('groups').where('expiresAt', '<=', now).get();

    let deletedCount = 0;
    for (const groupDoc of snap.docs) {
      const ref = groupDoc.ref;
      try {
        let shouldDelete = false;
        await db.runTransaction(async (transaction) => {
          const fresh = await transaction.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data() as { expiresAt?: Timestamp };
          shouldDelete = !!data.expiresAt && data.expiresAt.toMillis() <= Timestamp.now().toMillis();
        });
        if (shouldDelete) {
          await db.recursiveDelete(ref);
          deletedCount++;
          try {
            await bucket.deleteFiles({ prefix: `images/groupChats/${ref.id}/` });
          } catch (error) {
            console.error('[expireGroups] falha ao apagar fotos do grupo:', ref.id, error);
          }
        }
      } catch (error) {
        console.error('[expireGroups] falha ao apagar grupo:', ref.id, error);
      }
    }

    console.log(`[expireGroups] varridos: ${snap.size}, apagados: ${deletedCount}`);
  },
);

// S124-A — notifica o CRIADOR do grupo a cada pedido de entrada novo. Mesmo
// padrão estrutural de onSuperLikeReceived (chat.ts) (getPushToken +
// sendExpoNotifications, sem título/corpo dependentes de dado sensível). SEM
// push a cada mensagem de grupo (decisão de produto permanente, ver
// ROADMAP.md S124-B "NÃO FAZER") — este trigger é só sobre o FLUXO de
// entrada, não sobre mensagens.
export const onGroupJoinRequestCreated = onDocumentCreated(
  { document: 'groups/{groupId}/joinRequests/{uid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { groupId } = event.params;
    const groupSnap = await db.doc(`groups/${groupId}`).get();
    const group = groupSnap.data() as { name?: string; creatorId?: string } | undefined;
    if (!group?.creatorId) return;

    const token = await getPushToken(group.creatorId);
    if (!token) return;

    const requester = await getUserBasicInfo(event.params.uid);

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Novo pedido pra entrar no grupo',
        body: `${requester?.name ?? 'Alguém'} quer entrar em "${group.name ?? 'seu grupo'}"`,
        data: { type: 'groupJoinRequest', groupId },
      },
    ]);
  },
);

// S124-A — notifica o NOVO MEMBRO quando o pedido é aprovado (create de
// groups/{groupId}/members/{uid}), MAS pula quando uid == creatorId do grupo
// pai — o create do PRÓPRIO doc do criador acontece no mesmo writeBatch da
// criação do grupo (ver firestore.rules), e notificar o criador de si mesmo
// nesse instante não faz sentido de produto.
export const onGroupMemberCreated = onDocumentCreated(
  { document: 'groups/{groupId}/members/{uid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { groupId, uid } = event.params;
    const groupSnap = await db.doc(`groups/${groupId}`).get();
    const group = groupSnap.data() as { name?: string; creatorId?: string } | undefined;
    if (!group || group.creatorId === uid) return;

    const token = await getPushToken(uid);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Pedido aprovado!',
        body: `Você agora faz parte de "${group.name ?? 'um grupo'}"`,
        data: { type: 'groupMemberApproved', groupId },
      },
    ]);
  },
);

// S124-B (camada 1 — Enquete de grupo). Mirror EXATO de onPollVoteCreated
// (S126, perfil.ts) pra groups/{groupId}.pollCounts, com uma diferença
// deliberada: SEM push aqui. "Push a cada mensagem/evento de grupo" não
// está nas 3 camadas aprovadas desta sprint (ver ROADMAP.md S124-B "NÃO
// FAZER") e o ROADMAP só autoriza reusar o DESENHO da S126, não replicar o
// push dela — o push de perfil avisa o DONO de um perfil pessoal; não há
// "dono pessoal" simétrico num grupo, avisar TODO o grupo a cada voto seria
// ruído. Revisitar isso é decisão de produto nova, fora desta sprint.
// FieldValue.increment é atômico no servidor, mesmo raciocínio de
// onPollVoteCreated: seguro contra concorrência sem transação nem leitura
// prévia do valor atual.
export const onGroupPollVoteCreated = onDocumentCreated(
  { document: 'groups/{groupId}/pollVotes/{voterUid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { groupId } = event.params;
    const { optionIndex } = snap.data() as { optionIndex: number };

    await db.doc(`groups/${groupId}`).update({
      [`pollCounts.${optionIndex}`]: FieldValue.increment(1),
    });
  },
);

// S124-B (camada 1). Mirror de onPollChanged (S126, perfil.ts): pergunta/
// opções trocadas (ou enquete removida via deleteField()) zera os votos
// antigos e o agregado — "substituir", não "editar em cima". Mesma GUARDA
// ANTI-LOOP: este update só toca pollCounts (FieldValue.delete()) e apaga
// pollVotes/*, nunca `poll`, então a 2ª invocação que ele próprio dispara
// sempre vê before.poll == after.poll e sai no primeiro if, sem repetir a
// limpeza.
export const onGroupPollChanged = onDocumentUpdated(
  { document: 'groups/{groupId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const beforePoll = JSON.stringify(before.poll ?? null);
    const afterPoll = JSON.stringify(after.poll ?? null);
    if (beforePoll === afterPoll) return;

    const { groupId } = event.params;
    const votesSnap = await db.collection(`groups/${groupId}/pollVotes`).get();
    const batch = db.batch();
    votesSnap.forEach((doc) => batch.delete(doc.ref));
    batch.update(db.doc(`groups/${groupId}`), { pollCounts: FieldValue.delete() });
    await batch.commit();
  },
);

// S150 — espelha lastMessage no doc pai do grupo, MESMO MECANISMO de
// onMessageCreated (matches/{matchId}/messages, chat.ts): Cloud Function
// (Admin SDK) reagindo à criação da mensagem — NÃO um write direto do client
// (groups/{groupId} não libera 'lastMessage' no hasOnly do allow update, ver
// firestore.rules, mesmo tratamento de matches/{matchId}.lastMessage).
// Fundação do badge "mensagem nova em grupo que participo"
// (useUnreadGroupMessages.ts) — SEM push aqui: zero push por mensagem de
// grupo é decisão de produto permanente (S124-B "NÃO FAZER"), esta function
// só mantém o preview/timestamp em sincronia.
export const onGroupMessageCreated = onDocumentCreated(
  { document: 'groups/{groupId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { groupId } = event.params;
    const message = snap.data() as { senderId: string; text?: string; imageUrl?: string };

    const preview = message.text ? message.text : message.imageUrl ? '📷 Foto' : '';
    const lastMessageText = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;

    try {
      await db.doc(`groups/${groupId}`).update({
        lastMessage: {
          text: lastMessageText,
          senderId: message.senderId,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    } catch (error) {
      console.error('[onGroupMessageCreated] falha ao atualizar lastMessage:', error);
    }
  },
);

// S124-B (camada 2 — Gente ativa agora). Réplica manual de PRESENCE_ONLINE_MS
// (src/hooks/usePresenceHeartbeat.ts:20) — Cloud Functions não importa src/
// (mesmo padrão de SUPPORT_CATEGORY_LABELS, admin.ts), sincronize
// manualmente se a janela de "online" mudar lá.
const PRESENCE_ONLINE_MS = 2 * 60 * 1000;

// Decisão de arquitetura (spec S124-B): NÃO estender as rules de
// presence/{uid} pra coparticipação em grupo (custo de get() em regra +
// exposição de lastSeenAt individual de gente sem match). Callable SOB
// DEMANDA em vez disso — Admin SDK bypassa rules, mas retorna só um NÚMERO
// agregado, nunca a lista de uids nem lastSeenAt individual de ninguém.
export const getGroupActiveNowCount = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
  }

  const groupId = request.data?.groupId;
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new HttpsError('invalid-argument', 'groupId inválido.');
  }

  const callerMemberSnap = await db.doc(`groups/${groupId}/members/${request.auth.uid}`).get();
  if (!callerMemberSnap.exists) {
    throw new HttpsError('permission-denied', 'Você não é membro deste grupo.');
  }

  const membersSnap = await db.collection(`groups/${groupId}/members`).get();
  const presenceSnaps = await Promise.all(
    membersSnap.docs.map((memberDoc) => db.doc(`presence/${memberDoc.id}`).get()),
  );

  const now = Date.now();
  const count = presenceSnaps.reduce((total, presenceSnap) => {
    const lastSeenAt = presenceSnap.data()?.lastSeenAt as Timestamp | undefined;
    if (!lastSeenAt) return total;
    return now - lastSeenAt.toMillis() < PRESENCE_ONLINE_MS ? total + 1 : total;
  }, 0);

  return { count };
});
