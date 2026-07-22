import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();
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

    // S53 — a selfie só serve pra decidir o status; uma vez decidido
    // (approved OU rejected), o arquivo não tem mais função e é apagado do
    // Storage. O doc verifications/{uid} permanece (status, selfieUrl morto,
    // createdAt, reviewedAt, reviewedBy) — só o arquivo em si some.
    try {
      await bucket.deleteFiles({ prefix: `verifications/${event.params.uid}/` });
    } catch (error) {
      console.error(
        '[onVerificationReviewed] falha ao apagar a selfie:',
        event.params.uid,
        error,
      );
    }

    // S58 — push de resultado. Transacional (resultado direto de uma ação
    // do próprio usuário — enviar a selfie), por isso NÃO passa pelo filtro
    // de reengagementOptOut (esse existe só pra campanhas de reengajamento,
    // ver skippedOptOut em staleMatchReminder mais abaixo). O motivo da
    // rejeição fica de fora do texto de propósito (privacidade na tela de
    // bloqueio) — quem quiser saber qual foi, abre o app. Falha de push não
    // pode derrubar a function nem a atualização de verified acima, mesmo
    // padrão do catch da selfie logo em cima.
    try {
      const token = await getPushToken(event.params.uid);
      if (token) {
        const { title, body } =
          after.status === 'approved'
            ? { title: 'Verificação aprovada!', body: 'Seu selo ✓ já está no seu perfil.' }
            : {
                title: 'Sua verificação não passou',
                body: 'Toque para ver o motivo e reenviar sua selfie.',
              };
        await sendExpoNotifications([
          {
            to: token,
            sound: 'default',
            title,
            body,
            data: { type: 'verification_reviewed' },
          },
        ]);
      }
    } catch (error) {
      console.error('[onVerificationReviewed] falha ao enviar push:', event.params.uid, error);
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

const PENDING_LIKES_QUERY_LIMIT = 50;

// Gatilho A do reengagementPush (S44b) — MESMA definição de "curtida
// pendente" do client (src/hooks/useLikers.ts): swipes recebidos (to==uid)
// com direction like/superlike, menos quem eu já swipei de volta (em
// qualquer direção, match ou não). O client resolve isso com uma segunda
// query (from==uid, sem limite) e um Set em memória; aqui isso escalaria mal
// pra contas antigas com milhares de swipes enviados, então em vez disso
// faz um .get() pontual por doc `swipes/{uid}_{likerId}` pra cada
// candidato a curtida — mesmo padrão do reverseSnap já usado em
// onSuperLikeReceived. .limit() é defensivo pra perfis com volume anômalo de
// curtidas recebidas; ver relatório da sessão pro custo estimado.
async function countPendingLikes(uid: string): Promise<number> {
  const incomingSnap = await db
    .collection('swipes')
    .where('to', '==', uid)
    .where('direction', 'in', ['like', 'superlike'])
    .limit(PENDING_LIKES_QUERY_LIMIT)
    .get();
  if (incomingSnap.empty) return 0;

  const reverseSnaps = await Promise.all(
    incomingSnap.docs.map((d) => db.doc(`swipes/${uid}_${d.data().from as string}`).get()),
  );
  return reverseSnaps.filter((s) => !s.exists).length;
}

const MATCHES_QUERY_LIMIT = 200;

interface PendingReplyMatch {
  matchId: string;
  otherUid: string;
}

// Gatilho B do reengagementPush (S44b) — primeiro match do candidato (na
// ordem retornada pela query, sem orderBy específico) onde a ÚLTIMA
// mensagem foi do OUTRO lado e já passou de 2 dias sem resposta. Mesmo
// filtro de blockedBy do staleMatchReminder (S42): não cutuca resposta numa
// conversa arquivada por bloqueio. .limit() é defensivo — não esperado
// truncar a maioria das rodadas.
async function findPendingReplyMatch(
  uid: string,
  twoDaysAgo: Timestamp,
): Promise<PendingReplyMatch | null> {
  const matchesSnap = await db
    .collection('matches')
    .where('users', 'array-contains', uid)
    .limit(MATCHES_QUERY_LIMIT)
    .get();

  for (const matchDoc of matchesSnap.docs) {
    const match = matchDoc.data() as {
      users?: string[];
      lastMessage?: { senderId: string; createdAt: Timestamp };
      blockedBy?: string[];
    };
    if (match.blockedBy && match.blockedBy.length > 0) continue;
    if (!match.lastMessage) continue;
    if (match.lastMessage.senderId === uid) continue;
    if (match.lastMessage.createdAt.toMillis() > twoDaysAgo.toMillis()) continue;

    const otherUid = match.users?.find((u) => u !== uid);
    if (!otherUid) continue;

    return { matchId: matchDoc.id, otherUid };
  }
  return null;
}

// Segunda scheduled function do projeto (S44b), complementar ao
// staleMatchReminder (S42): enquanto aquela cutuca matches sem NENHUMA
// mensagem, esta cutuca usuários inativos há 3+ dias com um de dois
// gatilhos — curtidas pendentes (prioridade) ou match com resposta devida.
// Roda às 20h, deslocada de propósito da hora do staleMatchReminder (19h)
// pra não empilhar dois pushes no mesmo minuto pro mesmo usuário.
export const reengagementPush = onSchedule(
  { schedule: 'every day 20:00', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Timestamp.now();
    const threeDaysAgo = Timestamp.fromMillis(now.toMillis() - 3 * ONE_DAY_MS);
    const sevenDaysAgo = Timestamp.fromMillis(now.toMillis() - 7 * ONE_DAY_MS);
    const twoDaysAgo = Timestamp.fromMillis(now.toMillis() - 2 * ONE_DAY_MS);

    // Range num único campo (lastActiveAt) — mesmo raciocínio do
    // staleMatchReminder pro campo createdAt: usa o índice single-field
    // automático (não deveria pedir índice composto no deploy) e, por
    // construção, um range filter nunca retorna docs onde o campo está
    // ausente — contas pré-S44a (sem lastActiveAt) já ficam de fora aqui,
    // sem precisar de um filtro em código à parte.
    const candidatesSnap = await db
      .collection('users')
      .where('lastActiveAt', '<=', threeDaysAgo)
      .get();

    let sentA = 0;
    let sentB = 0;
    let skippedOptOut = 0;
    let skippedNoToken = 0;
    let skippedFrequency = 0;
    let skippedGaveUp = 0;
    let skippedNothingToSay = 0;

    for (const userDoc of candidatesSnap.docs) {
      const uid = userDoc.id;
      try {
        const user = userDoc.data() as {
          reengagementOptOut?: boolean;
          lastActiveAt: Timestamp;
        };

        // Filtros de graça (sem read extra) antes de qualquer coisa que
        // custe leitura.
        if (user.reengagementOptOut === true) {
          skippedOptOut++;
          continue;
        }

        const token = await getPushToken(uid);
        if (!token) {
          skippedNoToken++;
          continue;
        }

        const reengagementRef = db.doc(`users/${uid}/private/reengagement`);
        const reengagementSnap = await reengagementRef.get();
        const reengagement = reengagementSnap.data() as
          | { lastPushAt?: Timestamp; streak?: number }
          | undefined;

        let effectiveStreak = 0;
        if (reengagement?.lastPushAt) {
          // Frequência: no máximo 1 push de re-engajamento por 7 dias.
          if (reengagement.lastPushAt.toMillis() >= sevenDaysAgo.toMillis()) {
            skippedFrequency++;
            continue;
          }

          // "Voltou" = lastActiveAt mais recente que o último push -> reseta
          // o contador de desistência. Senão, carrega o streak existente e
          // desiste depois de 4 pushes consecutivos sem retorno.
          if (user.lastActiveAt.toMillis() > reengagement.lastPushAt.toMillis()) {
            effectiveStreak = 0;
          } else {
            const streak = reengagement.streak ?? 0;
            if (streak >= 4) {
              skippedGaveUp++;
              continue;
            }
            effectiveStreak = streak;
          }
        }

        let message: ExpoPushMessage | null = null;

        // Gatilho A (prioridade): curtidas pendentes.
        const pendingCount = await countPendingLikes(uid);
        if (pendingCount > 0) {
          const title =
            pendingCount === 1
              ? '1 pessoa curtiu você 👀'
              : `${pendingCount} pessoas curtiram você 👀`;
          message = {
            to: token,
            sound: 'default',
            title,
            body: 'Abra o app para ver quem foi!',
            // Reaproveita o type 'superlike' (já navega pra tela de Curtidas
            // em useNotifications.ts) — nenhuma mudança no client nesta
            // sprint, então não dá pra introduzir um type novo.
            data: { type: 'superlike' },
          };
          sentA++;
        } else {
          // Gatilho B: match com resposta devida há 2+ dias.
          const pendingReply = await findPendingReplyMatch(uid, twoDaysAgo);
          if (pendingReply) {
            const other = await getUserBasicInfo(pendingReply.otherUid);
            message = {
              to: token,
              sound: 'default',
              title: 'Tem alguém esperando sua resposta 💬',
              body: 'Sua conversa está parada. Que tal continuar o papo?',
              data: {
                // Reaproveita o type 'match_reminder' e o MESMO shape de
                // payload do staleMatchReminder/onMessageCreated — abre a
                // conversa direto (ver useNotifications.ts).
                type: 'match_reminder',
                matchId: pendingReply.matchId,
                otherUid: pendingReply.otherUid,
                otherName: other?.name ?? 'Usuário',
                otherPhoto: other?.photoURL ?? '',
              },
            };
            sentB++;
          }
        }

        if (!message) {
          skippedNothingToSay++;
          continue;
        }

        await sendExpoNotifications([message]);
        await reengagementRef.set({ lastPushAt: now, streak: effectiveStreak + 1 });
      } catch (error) {
        console.error('[reengagementPush] falha ao processar candidato:', uid, error);
      }
    }

    const skippedTotal = skippedOptOut + skippedFrequency + skippedGaveUp + skippedNoToken;
    console.log(
      `[reengagementPush] candidatos: ${candidatesSnap.size} | enviados A: ${sentA} | enviados B: ${sentB} | pulados (optOut/freq/desistência/sem-token): ${skippedTotal}`,
    );
    if (skippedNothingToSay > 0) {
      console.log(
        `[reengagementPush] elegíveis sem gatilho (nenhum dos dois aplicou): ${skippedNothingToSay}`,
      );
    }
  },
);

// S50 — Pool rotativo de "Prompt da semana". Réplica mínima de
// WEEKLY_PROMPTS/getWeeklyPrompt (src/constants/prompts.ts) — functions não
// importa código de src/, então isto precisa ficar em sincronia manual com
// aquele arquivo (mesmo padrão do ADMIN_UID/SUPPORT_CATEGORY_LABELS acima).
// manter em sincronia com src/constants/prompts.ts
const WEEKLY_PROMPTS: { id: string; text: string }[] = [
  { id: 'w01', text: 'Qual foi o maior mico que você já pagou num encontro?' },
  { id: 'w02', text: 'Se dinheiro não fosse problema, seu sábado perfeito seria...' },
  { id: 'w03', text: 'Qual música você defende com a vida mesmo todo mundo zoando?' },
  { id: 'w04', text: 'Comida que você julgava antes de provar e hoje ama?' },
  { id: 'w05', text: 'Qual talento inútil você tem orgulho de ter?' },
  { id: 'w06', text: 'O que te faz rir sozinho só de lembrar?' },
  { id: 'w07', text: 'Praia lotada ou cachoeira escondida? Defenda.' },
  { id: 'w08', text: 'Qual série você já maratonou mais de uma vez?' },
  { id: 'w09', text: "Seu 'red flag' mais inofensivo?" },
  { id: 'w10', text: 'Se sua vida tivesse trilha sonora, qual seria a de abertura?' },
  { id: 'w11', text: 'Qual é a sua opinião impopular mais forte?' },
  { id: 'w12', text: 'O que você faria num domingo de chuva perfeito?' },
];

// manter em sincronia com src/constants/prompts.ts
const WEEKLY_PROMPT_EPOCH = new Date('2026-01-05T00:00:00-03:00');
const WEEKLY_PROMPT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// manter em sincronia com src/constants/prompts.ts
function getWeeklyPrompt(date: Date): { id: string; text: string } {
  const rawIndex = Math.floor((date.getTime() - WEEKLY_PROMPT_EPOCH.getTime()) / WEEKLY_PROMPT_WEEK_MS);
  const index = ((rawIndex % WEEKLY_PROMPTS.length) + WEEKLY_PROMPTS.length) % WEEKLY_PROMPTS.length;
  return WEEKLY_PROMPTS[index];
}

// Décima Cloud Function do projeto (S50): toda segunda 12:00, empurra o
// prompt da semana vigente pra todo mundo — conteúdo, não re-engajamento, por
// isso sem streak/estado por usuário (ao contrário do reengagementPush). Lê a
// collection users inteira 1x por semana (ver relatório da sessão pro custo
// estimado), pulando quem optou por não receber lembretes ou não tem token —
// mesmo filtro do reengagementPush.
export const weeklyPromptPush = onSchedule(
  { schedule: '0 12 * * 1', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const prompt = getWeeklyPrompt(new Date());

    const usersSnap = await db.collection('users').get();

    let sent = 0;
    let skippedOptOut = 0;
    let skippedNoToken = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      try {
        const user = userDoc.data() as { reengagementOptOut?: boolean };

        if (user.reengagementOptOut === true) {
          skippedOptOut++;
          continue;
        }

        const token = await getPushToken(uid);
        if (!token) {
          skippedNoToken++;
          continue;
        }

        await sendExpoNotifications([
          {
            to: token,
            sound: 'default',
            title: 'Prompt da semana 📝',
            body: `${prompt.text} — responde no seu perfil!`,
            data: { type: 'weekly_prompt' },
          },
        ]);
        sent++;
      } catch (error) {
        console.error('[weeklyPromptPush] falha ao processar usuário:', uid, error);
      }
    }

    console.log(
      `[weeklyPromptPush] prompt: ${prompt.id} | candidatos: ${usersSnap.size} | enviados: ${sent} | pulados (optOut/sem-token): ${skippedOptOut + skippedNoToken}`,
    );
  },
);

// Décima primeira Cloud Function do projeto (S51): "Selo fundador", 100 vagas
// numeradas 1..100 pela ordem de criação de conta. founderNumber é escrito
// SÓ aqui (Admin SDK) — o client nunca consegue setá-lo, ver firestore.rules
// (users/{userId} não tem 'founderNumber' na hasOnly() de create/update, e
// config/founders cai no catch-all de negação — nenhum dos dois é acessível
// ao client).
//
// Shape esperado de config/founders (doc criado manualmente pelo Raphael no
// console, esta function nunca o cria):
//   { enabled: boolean, count: number }
// O contador nasce ausente/enabled:false de propósito — contas de teste
// atuais não recebem número; Raphael liga manualmente (enabled: true) no dia
// do lançamento.
export const assignFounderNumber = onDocumentCreated(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const { uid } = event.params;

    // Admin nunca recebe número, mesmo com o contador ligado — checado antes
    // da transação pra não gastar uma leitura/escrita à toa.
    if (uid === ADMIN_UID) {
      console.log('[assignFounderNumber] uid admin, ignorado:', uid);
      return;
    }

    try {
      await db.runTransaction(async (transaction) => {
        const configRef = db.doc('config/founders');
        const configSnap = await transaction.get(configRef);
        const config = configSnap.data() as { enabled?: boolean; count?: number } | undefined;

        if (!config || config.enabled !== true) {
          console.log('[assignFounderNumber] desligado');
          return;
        }

        const count = config.count ?? 0;
        if (count >= 100) {
          console.log('[assignFounderNumber] vagas esgotadas');
          return;
        }

        const founderNumber = count + 1;
        transaction.update(configRef, { count: founderNumber });
        transaction.update(db.doc(`users/${uid}`), { founderNumber });

        console.log(`[assignFounderNumber] #${founderNumber} atribuído a ${uid}`);
      });
    } catch (error) {
      console.error('[assignFounderNumber] falha na transação:', uid, error);
    }
  },
);

// Décima segunda Cloud Function do projeto (S53) — exclusão de conta,
// exigida pela Play Store (Data Safety: apps com cadastro precisam
// oferecer exclusão dentro do próprio app, não só por e-mail). O client não
// consegue fazer isso sozinho: firestore.rules/storage.rules não liberam
// apagar em cascata os dados de outra coleção, e só o Admin SDK consegue
// apagar a conta em si no Firebase Auth. Por isso roda como callable com
// Admin SDK, que ignora as rules.
const DELETE_ACCOUNT_BATCH_LIMIT = 400;

// writeBatch tem limite de 500 operações; 400 dá folga sem precisar
// calcular o tamanho exato de cada delete.
async function deleteDocsInBatches(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += DELETE_ACCOUNT_BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + DELETE_ACCOUNT_BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export const deleteAccount = onCall(
  { region: REGION, memory: '512MiB', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
    }

    // uid vem SEMPRE do token verificado pelo Admin SDK (request.auth.uid),
    // nunca de request.data — um uid vindo do client poderia apagar a
    // conta de outra pessoa.
    const uid = request.auth.uid;
    console.log('[deleteAccount] iniciando exclusão:', uid);

    // a) matches — recursiveDelete apaga o doc do match E a subcoleção
    // messages junto; as fotos de chat desse match, num prefixo próprio no
    // Storage, são apagadas à parte logo em seguida.
    try {
      const matchesSnap = await db
        .collection('matches')
        .where('users', 'array-contains', uid)
        .get();
      console.log(`[deleteAccount] matches encontrados: ${matchesSnap.size}`);
      for (const matchDoc of matchesSnap.docs) {
        await db.recursiveDelete(matchDoc.ref);
        await bucket.deleteFiles({ prefix: `images/chats/${matchDoc.id}/` });
      }
      console.log(`[deleteAccount] matches apagados: ${matchesSnap.size}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar matches:', uid, error);
    }

    // b) swipes — dois lados: os que o usuário enviou (from) e os que
    // recebeu (to).
    try {
      const [fromSnap, toSnap] = await Promise.all([
        db.collection('swipes').where('from', '==', uid).get(),
        db.collection('swipes').where('to', '==', uid).get(),
      ]);
      const refs = [...fromSnap.docs, ...toSnap.docs].map((d) => d.ref);
      console.log(`[deleteAccount] swipes encontrados: ${refs.length}`);
      await deleteDocsInBatches(refs);
      console.log(`[deleteAccount] swipes apagados: ${refs.length}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar swipes:', uid, error);
    }

    // c) blocks — dois lados: quem o usuário bloqueou (blocker) e quem o
    // bloqueou (blocked).
    try {
      const [blockerSnap, blockedSnap] = await Promise.all([
        db.collection('blocks').where('blocker', '==', uid).get(),
        db.collection('blocks').where('blocked', '==', uid).get(),
      ]);
      const refs = [...blockerSnap.docs, ...blockedSnap.docs].map((d) => d.ref);
      console.log(`[deleteAccount] blocks encontrados: ${refs.length}`);
      await deleteDocsInBatches(refs);
      console.log(`[deleteAccount] blocks apagados: ${refs.length}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar blocks:', uid, error);
    }

    // d) support — tickets abertos pelo usuário; recursiveDelete leva a
    // subcoleção messages de cada ticket junto.
    try {
      const ticketsSnap = await db.collection('support').where('uid', '==', uid).get();
      console.log(`[deleteAccount] tickets de suporte encontrados: ${ticketsSnap.size}`);
      for (const ticketDoc of ticketsSnap.docs) {
        await db.recursiveDelete(ticketDoc.ref);
      }
      console.log(`[deleteAccount] tickets de suporte apagados: ${ticketsSnap.size}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar tickets de suporte:', uid, error);
    }

    // e) verifications/{uid} — doc de revisão + selfie no Storage (se ainda
    // não tiver sido apagada por onVerificationReviewed).
    try {
      await db.doc(`verifications/${uid}`).delete();
      await bucket.deleteFiles({ prefix: `verifications/${uid}/` });
      console.log('[deleteAccount] verification apagada');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar verification:', uid, error);
    }

    // f) Storage do perfil — avatares.
    try {
      await bucket.deleteFiles({ prefix: `avatars/${uid}/` });
      console.log('[deleteAccount] avatares apagados');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar avatares:', uid, error);
    }

    // g) users/{uid} — recursiveDelete leva junto as subcoleções privadas
    // (private/registration, private/push, private/reengagement) e
    // superLikes/usage.
    try {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      console.log('[deleteAccount] doc users apagado');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar doc users:', uid, error);
    }

    // NÃO apaga a coleção `reports`: denúncias feitas pelo usuário
    // (reporterId) ou recebidas por ele (reportedId) são registro de
    // moderação e permanecem por decisão de produto, mesmo após a exclusão
    // da conta.

    // h) Auth — por último, e de propósito FORA do padrão try/catch-e-loga
    // das etapas acima: se apagar a conta em si falhar, o erro precisa
    // propagar pro client — senão a conta continua logável mesmo com todo
    // o resto já apagado, o que seria pior que abortar cedo.
    await getAuth().deleteUser(uid);

    console.log('[deleteAccount] concluído:', uid);
    return { success: true };
  },
);
