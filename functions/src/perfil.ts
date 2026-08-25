import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { db, getPushToken, isAdminUid, REGION, sendExpoNotifications } from './shared';

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
    if (isAdminUid(uid)) {
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

// S126 — Enquete no perfil. onPollVoteCreated incrementa o agregado
// (users/{ownerUid}.pollCounts) a cada voto novo em
// users/{ownerUid}/pollVotes/{voterUid}. Anônimo de propósito, mesmo padrão
// do onSuperLikeReceived (chat.ts): voterUid nunca entra no push nem no
// `data` — o dono só vê a contagem agregada, nunca quem votou o quê
// (reforçado também nas rules, ver firestore.rules). FieldValue.increment é
// atômico no servidor, então o incremento é seguro contra concorrência mesmo
// com múltiplos votantes simultâneos — não precisa de transação nem de ler o
// valor atual antes.
export const onPollVoteCreated = onDocumentCreated(
  { document: 'users/{ownerUid}/pollVotes/{voterUid}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { ownerUid } = event.params;
    const { optionIndex } = snap.data() as { optionIndex: number };

    await db.doc(`users/${ownerUid}`).update({
      [`pollCounts.${optionIndex}`]: FieldValue.increment(1),
    });

    const token = await getPushToken(ownerUid);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: '🗳️ Alguém respondeu sua enquete!',
        body: 'Abra o app para ver o resultado.',
        data: { type: 'pollVote' },
      },
    ]);
  },
);

// S126 — reseta a enquete quando o dono edita ou remove `poll`: apaga todos
// os votos antigos (que não fazem mais sentido pra uma pergunta/opções
// novas) e zera o agregado. Primeiro trigger onDocumentUpdated em
// users/{uid} — GUARDA ANTI-LOOP essencial: este mesmo update só toca
// `pollCounts` (FieldValue.delete()) e apaga pollVotes/*, nunca `poll`, então
// a segunda invocação que ele próprio dispara sempre vê
// before.poll == after.poll e sai no primeiro if, sem repetir a limpeza.
// Comparação estrutural simples (JSON.stringify) — poll é um mapa pequeno
// {question, options}, não precisa de deep-equal mais sofisticado. Se
// `before.poll` já era ausente (enquete criada do zero), a limpeza roda do
// mesmo jeito — é no-op seguro (nenhum voto pra apagar, pollCounts já
// ausente).
export const onPollChanged = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const beforePoll = JSON.stringify(before.poll ?? null);
    const afterPoll = JSON.stringify(after.poll ?? null);
    if (beforePoll === afterPoll) return;

    const { uid } = event.params;
    const votesSnap = await db.collection(`users/${uid}/pollVotes`).get();
    const batch = db.batch();
    votesSnap.forEach((doc) => batch.delete(doc.ref));
    batch.update(db.doc(`users/${uid}`), { pollCounts: FieldValue.delete() });
    await batch.commit();
  },
);

// S127 — Marcos e selos: desbloqueia users/{uid}/achievements/profileComplete
// (Admin SDK, create-only — o client nunca escreve nesta subcoleção, ver
// firestore.rules) quando o critério LEVE de perfil completo é satisfeito:
// (bio não vazia OU pelo menos 1 campo de `about` preenchido) E mais de 1
// foto. Não detecta transição false->true, só checa se o doc ainda não
// existe antes de criar — idempotente por construção, sem transação (uma
// corrida rara entre dois disparos quase simultâneos no máximo tentaria
// criar duas vezes; o segundo write só sobrescreve o mesmo unlockedAt,
// inofensivo). onDocumentUpdated PRÓPRIO em users/{uid}, independente de
// onPollChanged (outro trigger no mesmo documento, acima) — não mexe nele.
export const onUserProfileUpdated = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const after = event.data?.after.data();
    if (!after) return;

    const bio = (after.bio as string | undefined) ?? '';
    const about = after.about as Record<string, unknown> | undefined;
    const photos = (after.photos as string[] | undefined) ?? [];

    const hasBio = bio.trim().length > 0;
    const hasAboutField = !!about && Object.keys(about).length > 0;
    const profileComplete = (hasBio || hasAboutField) && photos.length > 1;
    if (!profileComplete) return;

    const { uid } = event.params;
    const achievementRef = db.doc(`users/${uid}/achievements/profileComplete`);
    try {
      const achievementSnap = await achievementRef.get();
      if (achievementSnap.exists) return;
      await achievementRef.set({ unlockedAt: FieldValue.serverTimestamp() });
    } catch (error) {
      console.error('[onUserProfileUpdated] falha ao desbloquear profileComplete:', uid, error);
    }
  },
);

// S127 — Marcos e selos: terceira scheduled function do projeto (mesmo
// esqueleto de staleMatchReminder, agendadas.ts), 1x/dia, horário próprio
// (21h) pra não empilhar com staleMatchReminder (19h) nem reengagementPush
// (20h). Encontra contas com createdAt <= agora - 10 dias e desbloqueia
// users/{uid}/achievements/tenDaysInApp (Admin SDK, create-only) pra quem
// ainda não tem o doc — idempotente por checagem de existência, sem estado
// próprio (uma conta elegível continua sendo varrida todo dia até ganhar o
// doc; depois disso o achievementSnap.exists já pula ela em ~O(1) leitura).
export const tenDaysInAppCheck = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const tenDaysAgo = Timestamp.fromMillis(now.toMillis() - 10 * 24 * 60 * 60 * 1000);

    // Range num único campo (createdAt) — mesmo raciocínio de
    // staleMatchReminder: usa o índice single-field automático, não deveria
    // pedir índice composto no deploy.
    const usersSnap = await db.collection('users').where('createdAt', '<=', tenDaysAgo).get();

    let unlockedCount = 0;
    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      try {
        const achievementRef = db.doc(`users/${uid}/achievements/tenDaysInApp`);
        const achievementSnap = await achievementRef.get();
        if (achievementSnap.exists) continue;

        await achievementRef.set({ unlockedAt: FieldValue.serverTimestamp() });
        unlockedCount++;
      } catch (error) {
        console.error('[tenDaysInAppCheck] falha ao processar usuário:', uid, error);
      }
    }

    console.log(
      `[tenDaysInAppCheck] candidatos: ${usersSnap.size} | desbloqueados: ${unlockedCount}`,
    );
  },
);
