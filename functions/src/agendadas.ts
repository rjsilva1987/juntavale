import { ExpoPushMessage } from 'expo-server-sdk';
import { Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { db, getPushToken, getUserBasicInfo, REGION, sendExpoNotifications } from './shared';

// Primeira scheduled function do projeto (as outras 7 são trigger de
// Firestore) — 1x por dia, encontra matches criados há 48-72h que nunca
// tiveram mensagem (lastMessage ausente, escrito só por onMessageCreated,
// chat.ts) e manda um empurrãozinho pros dois participantes. Idempotente por
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
// onSuperLikeReceived (chat.ts). .limit() é defensivo pra perfis com volume
// anômalo de curtidas recebidas; ver relatório da sessão pro custo estimado.
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
// aquele arquivo (mesmo padrão do ADMIN_UID/SUPPORT_CATEGORY_LABELS,
// shared/index.ts e admin.ts).
// manter em sincronia com src/constants/prompts.ts
const WEEKLY_PROMPTS: { id: string; text: string }[] = [
  { id: 'w01', text: 'A pior fila que eu já enfrentei — e não vale falar do trabalho' },
  { id: 'w02', text: 'Sistema fora do ar. Eu aproveito pra...' },
  { id: 'w03', text: 'Se a minha vida tivesse extrato, meu maior gasto seria...' },
  { id: 'w04', text: 'A melhor dica de dinheiro que eu dou de graça pra amigo' },
  { id: 'w05', text: 'Uma coisa que eu juntei meses pra comprar' },
  { id: 'w06', text: 'Feriado prolongado: praia, serra ou sofá?' },
  { id: 'w07', text: 'O que toca no meu trajeto pro trabalho' },
  { id: 'w08', text: 'Meta que eu bati essa semana (não precisa ser do trabalho)' },
  { id: 'w09', text: 'Melhor lugar da cidade pra um primeiro encontro' },
  { id: 'w10', text: 'Meu talento mais inútil' },
  { id: 'w11', text: 'O que me faz rir sozinho no meio do expediente' },
  { id: 'w12', text: 'Café: como, quando e quantos' },
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
