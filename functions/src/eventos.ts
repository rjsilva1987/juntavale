import { Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { db, getPushToken, getUserBasicInfo, REGION, sendExpoNotifications } from './shared';

// S125 — purge definitivo de eventos vencidos (rule esconde por data desde
// já, ver firestore.rules; esta function apaga de vez ~30 dias depois de
// startsAt). Mesma releitura transacional por doc antes do recursiveDelete
// de expireGroups (grupos.ts) — evita apagar um doc que mudou entre a query
// e o commit — diferença deliberada de schedule: 1x/dia (decisão 11 — a
// folga aceitável aqui é de DIAS, não de minutos, ao contrário de
// staleMatchReminder/expireGroups que rodam de hora em hora). Evento não
// tem Storage próprio (sem chat/imagem nesta sprint — decisão 10), então,
// ao contrário de expireGroups, NÃO há passo de bucket.deleteFiles.
export const expireEvents = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const snap = await db.collection('events').where('purgeAt', '<=', now).get();

    let deletedCount = 0;
    for (const eventDoc of snap.docs) {
      const ref = eventDoc.ref;
      try {
        let shouldDelete = false;
        await db.runTransaction(async (transaction) => {
          const fresh = await transaction.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data() as { purgeAt?: Timestamp };
          shouldDelete = !!data.purgeAt && data.purgeAt.toMillis() <= Timestamp.now().toMillis();
        });
        if (shouldDelete) {
          await db.recursiveDelete(ref);
          deletedCount++;
        }
      } catch (error) {
        console.error('[expireEvents] falha ao apagar evento:', ref.id, error);
      }
    }

    console.log(`[expireEvents] varridos: ${snap.size}, apagados: ${deletedCount}`);
  },
);

// S125 — notifica o CRIADOR do evento a cada pedido de participação novo.
// Mirror EXATO de onGroupJoinRequestCreated (S124-A, grupos.ts) acima, pra
// events/{eventId}/joinRequests/{uid}.
export const onEventJoinRequestCreated = onDocumentCreated(
  { document: 'events/{eventId}/joinRequests/{uid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { eventId } = event.params;
    const eventSnap = await db.doc(`events/${eventId}`).get();
    const eventData = eventSnap.data() as { title?: string; creatorId?: string } | undefined;
    if (!eventData?.creatorId) return;

    const token = await getPushToken(eventData.creatorId);
    if (!token) return;

    const requester = await getUserBasicInfo(event.params.uid);

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Novo pedido pra participar do evento',
        body: `${requester?.name ?? 'Alguém'} quer participar de "${eventData.title ?? 'seu evento'}"`,
        data: { type: 'eventJoinRequest', eventId },
      },
    ]);
  },
);

// S125 — notifica o APROVADO quando o pedido é aceito (create de
// events/{eventId}/participants/{uid}), MAS pula quando uid == creatorId do
// evento pai — o create do PRÓPRIO doc do criador acontece no mesmo
// writeBatch da criação do evento (decisão 6, ver firestore.rules), e
// notificar o criador de si mesmo nesse instante não faz sentido de
// produto. Mirror EXATO de onGroupMemberCreated (grupos.ts) acima.
export const onEventParticipantCreated = onDocumentCreated(
  { document: 'events/{eventId}/participants/{uid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { eventId, uid } = event.params;
    const eventSnap = await db.doc(`events/${eventId}`).get();
    const eventData = eventSnap.data() as { title?: string; creatorId?: string } | undefined;
    if (!eventData || eventData.creatorId === uid) return;

    const token = await getPushToken(uid);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Pedido aprovado!',
        body: `Você agora participa de "${eventData.title ?? 'um evento'}"`,
        data: { type: 'eventParticipantApproved', eventId },
      },
    ]);
  },
);
