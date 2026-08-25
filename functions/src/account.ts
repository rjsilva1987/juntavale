import { getAuth } from 'firebase-admin/auth';
import { type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { bucket, db, REGION } from './shared';

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
    // subcoleção messages de cada ticket junto. images/support/{uid}/ (S113,
    // fotos anexadas na thread) some junto — mesmo padrão de images/chats na
    // etapa a) de matches, acima: path já nasce com o uid no prefixo
    // justamente pra permitir essa varredura em UMA chamada, sem precisar
    // iterar ticket por ticket.
    try {
      const ticketsSnap = await db.collection('support').where('uid', '==', uid).get();
      console.log(`[deleteAccount] tickets de suporte encontrados: ${ticketsSnap.size}`);
      for (const ticketDoc of ticketsSnap.docs) {
        await db.recursiveDelete(ticketDoc.ref);
      }
      await bucket.deleteFiles({ prefix: `images/support/${uid}/` });
      console.log(`[deleteAccount] tickets de suporte apagados: ${ticketsSnap.size}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar tickets de suporte:', uid, error);
    }

    // e) verifications/{uid} — doc de revisão + selfie no Storage (se ainda
    // não tiver sido apagada por onVerificationReviewed, admin.ts).
    try {
      await db.doc(`verifications/${uid}`).delete();
      await bucket.deleteFiles({ prefix: `verifications/${uid}/` });
      console.log('[deleteAccount] verification apagada');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar verification:', uid, error);
    }

    // presence/{uid} (S82) — coleção RAIZ, fora de users/ e de matches/,
    // então nenhum recursiveDelete das etapas acima alcança este doc:
    // precisa de etapa própria. Mesmo padrão de verifications/{uid} logo
    // acima — db.doc(...).delete() dentro de try/catch-e-loga, sem
    // propagar erro pro client.
    //
    // Reações (matches/{matchId}/reactions/{messageId}) NÃO precisam de
    // etapa própria aqui: moram DENTRO do doc do match (subcoleção), e o
    // recursiveDelete(matchDoc.ref) da etapa a) de matches, acima, já leva
    // todos os descendentes junto. Não "conserte" isso de novo depois.
    try {
      await db.doc(`presence/${uid}`).delete();
      console.log('[deleteAccount] presence apagada');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar presence:', uid, error);
    }

    // momentos/{uid} (S121) — doc ID == uid, delete direto (sem
    // recursiveDelete, não tem subcoleção). Storage separado, mesmo padrão de
    // avatars/{uid} logo abaixo.
    try {
      await db.doc(`momentos/${uid}`).delete();
      await bucket.deleteFiles({ prefix: `images/momentos/${uid}/` });
      console.log('[deleteAccount] momento apagado');
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar momento:', uid, error);
    }

    // S124-A — grupos CRIADOS pelo usuário: recursiveDelete de cada um leva
    // junto members/joinRequests/messages (mesmo padrão da etapa a) de
    // matches, acima). Storage: images/groupChats/{groupId}/ por grupo —
    // mesmo motivo de images/chats/{matchId} na etapa a), só que aqui o
    // prefixo carrega o groupId, não o uid, daí o loop por doc em vez de um
    // deleteFiles único.
    try {
      const ownedGroupsSnap = await db.collection('groups').where('creatorId', '==', uid).get();
      console.log(`[deleteAccount] grupos criados encontrados: ${ownedGroupsSnap.size}`);
      for (const groupDoc of ownedGroupsSnap.docs) {
        await db.recursiveDelete(groupDoc.ref);
        await bucket.deleteFiles({ prefix: `images/groupChats/${groupDoc.id}/` });
      }
      console.log(`[deleteAccount] grupos criados apagados: ${ownedGroupsSnap.size}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar grupos criados:', uid, error);
    }

    // S124-A — participação do usuário em grupos DE OUTROS: só o doc de
    // participação (members/joinRequests), nunca o grupo inteiro — delete
    // simples, não recursiveDelete. collectionGroup pra achar sem precisar
    // saber de quais grupos o usuário participa (mesmo mecanismo de
    // listMyGroups em groupService.ts, do lado do client).
    try {
      const [memberDocs, joinRequestDocs] = await Promise.all([
        db.collectionGroup('members').where('uid', '==', uid).get(),
        db.collectionGroup('joinRequests').where('uid', '==', uid).get(),
      ]);
      const refs = [...memberDocs.docs, ...joinRequestDocs.docs].map((d) => d.ref);
      console.log(`[deleteAccount] participações em grupos encontradas: ${refs.length}`);
      await deleteDocsInBatches(refs);
      console.log(`[deleteAccount] participações em grupos apagadas: ${refs.length}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar participações em grupos:', uid, error);
    }

    // S125 — eventos CRIADOS pelo usuário: recursiveDelete de cada um leva
    // junto participants/joinRequests/private (mesmo padrão da etapa de
    // grupos criados, acima). Evento não tem Storage próprio (sem
    // chat/imagem nesta sprint — decisão 10), então, ao contrário do passo
    // de grupos, não há bucket.deleteFiles aqui.
    try {
      const ownedEventsSnap = await db.collection('events').where('creatorId', '==', uid).get();
      console.log(`[deleteAccount] eventos criados encontrados: ${ownedEventsSnap.size}`);
      for (const eventDoc of ownedEventsSnap.docs) {
        await db.recursiveDelete(eventDoc.ref);
      }
      console.log(`[deleteAccount] eventos criados apagados: ${ownedEventsSnap.size}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar eventos criados:', uid, error);
    }

    // S125 — participação do usuário em eventos DE OUTROS: só o doc de
    // participação (participants/{uid}), nunca o evento inteiro — delete
    // simples, não recursiveDelete. SEM query própria de joinRequests
    // aqui: collectionGroup('joinRequests') casa pelo NOME da subcoleção em
    // QUALQUER ancestral — a varredura de joinRequests da etapa de grupos,
    // logo acima, já cobre também events/*/joinRequests/{uid} (mesmo nome
    // de subcoleção), sem precisar de query duplicada. NÃO decrementa
    // participantCount do evento — confirmado que o equivalente de grupo
    // (participação em grupos de outros, acima) também não decrementa
    // memberCount nesse fluxo; mesmo padrão mirrorado (ver
    // eventService.ts leaveEvent pro mesmo raciocínio do lado do client).
    try {
      const participantDocs = await db
        .collectionGroup('participants')
        .where('uid', '==', uid)
        .get();
      const refs = participantDocs.docs.map((d) => d.ref);
      console.log(`[deleteAccount] participações em eventos encontradas: ${refs.length}`);
      await deleteDocsInBatches(refs);
      console.log(`[deleteAccount] participações em eventos apagadas: ${refs.length}`);
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar participações em eventos:', uid, error);
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

    // NÃO apaga a coleção `reports` NEM images/reports/ (S113): denúncias
    // feitas pelo usuário (reporterId) ou recebidas por ele (reportedId) são
    // registro de moderação e permanecem por decisão de produto, fotos
    // anexadas incluídas, mesmo após a exclusão da conta. Não "consertar"
    // isso depois adicionando um bucket.deleteFiles aqui.

    // h) Auth — por último, e de propósito FORA do padrão try/catch-e-loga
    // das etapas acima: se apagar a conta em si falhar, o erro precisa
    // propagar pro client — senão a conta continua logável mesmo com todo
    // o resto já apagado, o que seria pior que abortar cedo.
    await getAuth().deleteUser(uid);

    console.log('[deleteAccount] concluído:', uid);
    return { success: true };
  },
);
