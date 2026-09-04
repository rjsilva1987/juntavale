import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
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

// S180-A — apaga um grupo inteiro (recursiveDelete leva members/
// joinRequests/messages) e as fotos dele no Storage. Mesmo molde de
// expireGroups (grupos.ts): recursiveDelete primeiro, bucket.deleteFiles
// depois num try/catch PRÓPRIO que só loga — falha ao limpar Storage não
// deve travar o resto do fluxo de deleteAccount. Reusado tanto pro grupo do
// próprio usuário que ficou sem outros membros (bloco GRUPOS CRIADOS)
// quanto pro grupo de OUTRO dono que zerou depois que o usuário saiu
// (bloco PARTICIPAÇÃO EM GRUPOS DE OUTROS).
async function deleteGroupWithPhotos(ref: DocumentReference): Promise<void> {
  await db.recursiveDelete(ref);
  try {
    await bucket.deleteFiles({ prefix: `images/groupChats/${ref.id}/` });
  } catch (error) {
    console.error('[deleteAccount] falha ao apagar fotos do grupo:', ref.id, error);
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

    // S180-A — grupos CRIADOS pelo usuário: NÃO morre mais junto com o
    // criador quando tem outra gente dentro — grupo é sala de conversa
    // ativa, sumir sem aviso pra quem ficou seria pior que herdar um novo
    // criador. Transfere pro membro mais antigo (menor joinedAt) e só apaga
    // de verdade (deleteGroupWithPhotos) quando não sobra ninguém.
    // `role: 'creator'` no doc do novo criador E `creatorId` no grupo são
    // gravados NO MESMO batch: a rule de "Sair do grupo" (firestore.rules
    // ~1787, allow delete de members/{uid}) olha `role`, e o `isCreator` do
    // client (GroupDetailScreen.tsx) olha `group.creatorId` — os dois
    // precisam concordar, senão o novo criador continuaria conseguindo
    // "sair" do próprio grupo pela UI. O doc de membro do ANTIGO criador é
    // apagado AQUI, dentro deste mesmo batch — não no bloco de
    // PARTICIPAÇÃO EM GRUPOS DE OUTROS logo abaixo, que só varre
    // collectionGroup e não distingue "grupo próprio" de "grupo de outro".
    // Try/catch POR GRUPO: uma falha num grupo não pode interromper a
    // transferência/exclusão dos demais.
    try {
      const ownedGroupsSnap = await db.collection('groups').where('creatorId', '==', uid).get();
      console.log(`[deleteAccount] grupos criados encontrados: ${ownedGroupsSnap.size}`);
      let transferred = 0;
      let deletedEmpty = 0;
      for (const groupDoc of ownedGroupsSnap.docs) {
        const groupRef = groupDoc.ref;
        try {
          const membersSnap = await groupRef
            .collection('members')
            .orderBy('joinedAt', 'asc')
            .get();
          const others = membersSnap.docs.filter((d) => d.id !== uid && d.data().uid !== uid);
          if (others.length === 0) {
            await deleteGroupWithPhotos(groupRef);
            deletedEmpty++;
            console.log(`[deleteAccount] grupo sem outros membros apagado: ${groupRef.id}`);
          } else {
            const newCreator = others[0];
            const batch = db.batch();
            batch.update(groupRef, { creatorId: newCreator.id, memberCount: others.length });
            batch.update(newCreator.ref, { role: 'creator' });
            batch.delete(groupRef.collection('members').doc(uid));
            await batch.commit();
            transferred++;
            console.log(`[deleteAccount] grupo transferido: ${groupRef.id} → ${newCreator.id}`);
          }
        } catch (error) {
          console.error('[deleteAccount] falha ao processar grupo criado:', groupRef.id, error);
        }
      }
      console.log(
        `[deleteAccount] grupos criados: transferidos ${transferred}, apagados vazios ${deletedEmpty}`,
      );
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar grupos criados:', uid, error);
    }

    // S180-A (correção rodada 1) — participação do usuário em grupos DE
    // OUTROS: só o doc de participação é apagado aqui (nunca o grupo
    // inteiro — ver bloco GRUPOS CRIADOS, acima, pro caso do grupo em si).
    // Mesma busca por collectionGroup de sempre. memberCount desce por
    // ITEM, dentro de uma runTransaction PRÓPRIA por membro — NUNCA um
    // writeBatch compartilhado com `batch.update(parentRef, ...)`: o Admin
    // SDK falha o `batch.commit()` INTEIRO se QUALQUER update mirar um doc
    // que não existe mais (grupo apagado por `expireGroups`, corrida
    // concorrente etc.) — a 1ª versão desta sprint tinha exatamente esse
    // buraco: um único grupo já apagado no meio do lote abortava a
    // exclusão de TODAS as participações daquele batch, pulava o
    // deleteDocsInBatches(joinRequests) seguinte, e o restante do fluxo de
    // deleteAccount seguia mesmo assim (exclusão incompleta e silenciosa).
    // runTransaction por item é o mesmo padrão de contador denormalizado já
    // usado do lado do client (approveJoinRequest/leaveGroup,
    // groupService.ts — ver ROADMAP.md "Padrões de escrita no Firestore"):
    // lê o grupo FRESCO dentro da própria transação, só decrementa se ele
    // ainda existir, e sempre apaga o doc de membro (delete nunca falha em
    // doc inexistente, diferente de update). Try/catch POR ITEM: uma falha
    // não pode abortar as demais nem pular o resto do fluxo. Depois, checa
    // cada grupo pai TOCADO (dedup por id, também em try/catch por item):
    // se não sobrou nenhum membro, deleteGroupWithPhotos — cobre tanto o
    // grupo que zerou por causa desta saída quanto o grupo órfão que já
    // tinha ficado sem ninguém antes. joinRequests continuam só apagados
    // (deleteDocsInBatches) — collectionGroup('joinRequests') já é varrido
    // junto aqui, sem query duplicada.
    try {
      const [memberDocs, joinRequestDocs] = await Promise.all([
        db.collectionGroup('members').where('uid', '==', uid).get(),
        db.collectionGroup('joinRequests').where('uid', '==', uid).get(),
      ]);
      console.log(
        `[deleteAccount] participações em grupos encontradas: ${memberDocs.size + joinRequestDocs.size}`,
      );

      const touchedGroupRefs = new Map<string, DocumentReference>();
      let removedMembers = 0;
      for (const memberDoc of memberDocs.docs) {
        const parentRef = memberDoc.ref.parent.parent;
        try {
          await db.runTransaction(async (tx) => {
            if (parentRef) {
              const parentSnap = await tx.get(parentRef);
              if (parentSnap.exists) {
                const current = (parentSnap.data() as { memberCount?: number }).memberCount ?? 1;
                tx.update(parentRef, { memberCount: Math.max(0, current - 1) });
                touchedGroupRefs.set(parentRef.id, parentRef);
              }
            }
            tx.delete(memberDoc.ref);
          });
          removedMembers++;
        } catch (error) {
          console.error(
            '[deleteAccount] falha ao sair do grupo:',
            parentRef?.id ?? '?',
            uid,
            error,
          );
        }
      }
      await deleteDocsInBatches(joinRequestDocs.docs.map((d) => d.ref));

      let deletedEmpty = 0;
      for (const parentRef of touchedGroupRefs.values()) {
        try {
          const remaining = await parentRef.collection('members').limit(1).get();
          if (remaining.empty) {
            await deleteGroupWithPhotos(parentRef);
            deletedEmpty++;
          }
        } catch (error) {
          console.error('[deleteAccount] falha ao apagar grupo vazio:', parentRef.id, error);
        }
      }
      console.log(
        `[deleteAccount] participações em grupos apagadas: ${removedMembers}/${memberDocs.size} (+ ${joinRequestDocs.size} pedidos), grupos vazios apagados: ${deletedEmpty}`,
      );
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar participações em grupos:', uid, error);
    }

    // S180-A — eventos CRIADOS pelo usuário: evento FUTURO vira
    // status:'cancelled' (+ cancelledAt) em vez de recursiveDelete — quem já
    // tinha sido aprovado (participants/{uid}) continua vendo o evento, só
    // que com o banner "Evento cancelado" (EventDetailScreen.tsx/
    // EventsScreen.tsx), em vez de o evento simplesmente sumir da lista sem
    // explicação. Evento PASSADO não é tocado: já é histórico, não tem
    // ninguém esperando confirmação/local pra um encontro que já aconteceu.
    // NUNCA MAIS recursiveDelete de evento aqui — o fim de vida de verdade
    // (30 dias após startsAt) continua só com a scheduled function
    // expireEvents (eventos.ts), via purgeAt; marcar 'cancelled' não mexe em
    // purgeAt nem em participants/joinRequests. SEM push (fora de escopo
    // desta sprint).
    try {
      const ownedEventsSnap = await db.collection('events').where('creatorId', '==', uid).get();
      console.log(`[deleteAccount] eventos criados encontrados: ${ownedEventsSnap.size}`);
      let cancelledCount = 0;
      let keptCount = 0;
      for (const eventDoc of ownedEventsSnap.docs) {
        const data = eventDoc.data() as { startsAt?: Timestamp };
        if (data.startsAt && data.startsAt.toMillis() > Date.now()) {
          await eventDoc.ref.update({
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
          });
          cancelledCount++;
        } else {
          keptCount++;
        }
      }
      console.log(
        `[deleteAccount] eventos futuros cancelados: ${cancelledCount}, passados mantidos: ${keptCount}`,
      );
    } catch (error) {
      console.error('[deleteAccount] falha ao cancelar eventos criados:', uid, error);
    }

    // S180-A (correção rodada 1) — participação do usuário em eventos DE
    // OUTROS: apaga o doc de participação (participants/{uid} — inclui o
    // doc do PRÓPRIO criador nos eventos que ele mesmo criou, já que o
    // criador também nasce participante aprovado por construção, ver
    // createEvent em eventService.ts) e decrementa participantCount do
    // evento pai, um por um, dentro de uma runTransaction PRÓPRIA — NUNCA
    // um writeBatch compartilhado: mesmo bug do bloco de grupos, acima
    // (batch.update em doc que pode não existir mais derruba o
    // batch.commit() INTEIRO), corrigido pelo mesmo desenho aqui. Corrige
    // também o gap que o comentário antigo deste bloco documentava: a rule
    // de events/{eventId} só tem ramo de INCREMENTO (firestore.rules,
    // allow update) — por isso o client nunca decrementa (ver leaveEvent,
    // eventService.ts) — mas essa restrição só vale pro CLIENT; o Admin
    // SDK ignora rules e por isso PODE (e deve) manter o contador coerente
    // aqui, lendo o valor FRESCO dentro da própria transação (mesmo padrão
    // do bloco de grupos, acima). Try/catch POR ITEM: uma falha não pode
    // abortar as demais. SEM query própria de joinRequests aqui:
    // collectionGroup('joinRequests') casa pelo NOME da subcoleção em
    // QUALQUER ancestral — a varredura de joinRequests da etapa de grupos,
    // acima, já cobre também events/*/joinRequests/{uid} (mesmo nome de
    // subcoleção), sem precisar de query duplicada.
    try {
      const participantDocs = await db
        .collectionGroup('participants')
        .where('uid', '==', uid)
        .get();
      console.log(`[deleteAccount] participações em eventos encontradas: ${participantDocs.size}`);

      let removedParticipations = 0;
      for (const participantDoc of participantDocs.docs) {
        const eventRef = participantDoc.ref.parent.parent;
        try {
          await db.runTransaction(async (tx) => {
            if (eventRef) {
              const eventSnap = await tx.get(eventRef);
              if (eventSnap.exists) {
                const current =
                  (eventSnap.data() as { participantCount?: number }).participantCount ?? 1;
                tx.update(eventRef, { participantCount: Math.max(0, current - 1) });
              }
            }
            tx.delete(participantDoc.ref);
          });
          removedParticipations++;
        } catch (error) {
          console.error(
            '[deleteAccount] falha ao sair do evento:',
            eventRef?.id ?? '?',
            uid,
            error,
          );
        }
      }
      console.log(
        `[deleteAccount] participações em eventos apagadas: ${removedParticipations}/${participantDocs.size}`,
      );
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar participações em eventos:', uid, error);
    }

    // S173 — Classificados (1/2): anúncios do dono. Sem subcoleção, então
    // deleteDocsInBatches (molde de swipes/blocks), e as fotos ficam em
    // images/listings/{uid}/ (path por uid do DONO, não por anúncio —
    // listingService.uploadListingPhoto), então UMA chamada de deleteFiles,
    // molde de avatars/{uid}. Denúncias que apontam pro listingId ficam
    // (reports nunca é apagado, ver comentário abaixo) — mesmo padrão já
    // aceito com matches apagados.
    try {
      const listingsSnap = await db.collection('listings').where('ownerId', '==', uid).get();
      await deleteDocsInBatches(listingsSnap.docs.map((d) => d.ref));
      await bucket.deleteFiles({ prefix: `images/listings/${uid}/` });
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar listings:', error);
    }

    // S173 — Classificados (2/2): chats de classificado em que o uid
    // participa, como dono OU interessado (participants é sempre
    // [ownerId, interestedId]). Tem subcoleção messages → recursiveDelete
    // por doc + fotos em images/listingChats/{chatId}/, molde EXATO do bloco
    // de matches acima. O outro participante recebe permission-denied no
    // listener e ListingChatScreen já trata como "conversa indisponível".
    try {
      const listingChatsSnap = await db
        .collection('listingChats')
        .where('participants', 'array-contains', uid)
        .get();
      for (const chatDoc of listingChatsSnap.docs) {
        await db.recursiveDelete(chatDoc.ref);
        await bucket.deleteFiles({ prefix: `images/listingChats/${chatDoc.id}/` });
      }
    } catch (error) {
      console.error('[deleteAccount] falha ao apagar listingChats:', error);
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
    // anexadas incluídas, mesmo após a exclusão da conta. Denúncias de
    // anúncio/chat de classificado (S168-B2, campos `listingId`/
    // `listingChatId`) seguem a mesma regra: ficam como referência solta
    // mesmo com o listing/listingChat já apagado acima (S173). Não
    // "consertar" isso depois adicionando um bucket.deleteFiles aqui.

    // h) Auth — por último, e de propósito FORA do padrão try/catch-e-loga
    // das etapas acima: se apagar a conta em si falhar, o erro precisa
    // propagar pro client — senão a conta continua logável mesmo com todo
    // o resto já apagado, o que seria pior que abortar cedo.
    await getAuth().deleteUser(uid);

    console.log('[deleteAccount] concluído:', uid);
    return { success: true };
  },
);
