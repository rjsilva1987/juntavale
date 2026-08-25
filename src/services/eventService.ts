// src/services/eventService.ts
//
// S125 — camada única de acesso a Firestore pra "eventos" (encontros
// presenciais com horário marcado, prazo de histórico de ~30 dias). Mirror
// de groupService.ts (S124-A), SEM as camadas de chat/enquete/presença/selo
// (fora de escopo desta sprint — decisão 10) e com uma peça nova que grupo
// não tem: o subdocumento events/{eventId}/private/location, legível só por
// criador/participante aprovado (decisão 3). Nenhuma tela importa
// firebase/firestore diretamente (convenção do projeto) — EventsScreen/
// CreateEventScreen/EventDetailScreen só chamam as funções abaixo.
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

// Mesmo teto de nome de grupo (firestore.rules) — título do evento. Spec
// S125: "reusar os MESMOS limites já usados pra nome/descrição de grupo".
export const MAX_EVENT_TITLE_LENGTH = 120;
// Mesmo teto de descrição de grupo (firestore.rules).
export const MAX_EVENT_DESCRIPTION_LENGTH = 2000;
// Sem precedente direto no projeto pra texto livre curto de local — teto
// escolhido pela própria spec S125 (300).
export const MAX_EVENT_LOCATION_LENGTH = 300;
// Espelha duration.value(30, 'd') em firestore.rules (purgeAt ==
// startsAt + 30d) — mexer aqui significa mexer lá também.
export const EVENT_PURGE_AFTER_DAYS = 30;

export type EventParticipantRole = 'creator' | 'participant';

export interface Event {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  startsAt: Timestamp;
  createdAt: Timestamp;
  // Denormalizado, mantido pelo CLIENT (mesmo padrão de memberCount em
  // Group) — nasce em 1 na criação (o criador já é participante aprovado,
  // decisão 6). Ao contrário de memberCount, só SOBE nesta sprint: a rule
  // de allow update de events/{eventId} só tem ramo de incremento (ver
  // firestore.rules) — sair do evento NÃO decrementa (ver leaveEvent
  // abaixo).
  participantCount: number;
  // startsAt + 30 dias, calculado e gravado na CRIAÇÃO (não em cada
  // leitura) — é o campo que a function expireEvents usa em
  // where('purgeAt','<=', now).
  purgeAt: Timestamp;
}

export interface EventParticipant {
  uid: string;
  joinedAt: Timestamp;
  role: EventParticipantRole;
  // S146 — mirror EXATO de GroupMember.seenAt (groupService.ts) — badge
  // "aceite→solicitante".
  seenAt?: Timestamp;
}

export interface EventJoinRequest {
  uid: string;
  requestedAt: Timestamp;
}

// events/{eventId}/private/location — só criador/participante aprovado lê
// (firestore.rules), imutável após a criação (decisão 9 — sem edição de
// local nesta sprint).
export interface EventLocation {
  text: string;
  createdAt: Timestamp;
}

const eventRef = (eventId: string) => doc(db, 'events', eventId);
const participantRef = (eventId: string, uid: string) =>
  doc(db, 'events', eventId, 'participants', uid);
const joinRequestRef = (eventId: string, uid: string) =>
  doc(db, 'events', eventId, 'joinRequests', uid);
const locationRef = (eventId: string) => doc(db, 'events', eventId, 'private', 'location');

// permission-denied aqui significa "evento expirou/foi apagado entre a
// navegação e a leitura" (mesmo princípio de getGroup, groupService.ts) —
// nunca erro genérico.
export const getEvent = async (eventId: string): Promise<Event | null> => {
  try {
    const snap = await getDoc(eventRef(eventId));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Event, 'id'>) } : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return null;
    throw error;
  }
};

export const listenEvent = (eventId: string, callback: (event: Event | null) => void) => {
  return onSnapshot(
    eventRef(eventId),
    (snap) =>
      callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Event, 'id'>) } : null),
    (error) => {
      if ((error as { code?: string })?.code === 'permission-denied') {
        callback(null);
        return;
      }
      console.error('[listenEvent] erro no listener:', error);
    },
  );
};

// writeBatch cria events/{id} + events/{id}/private/location +
// events/{id}/participants/{creatorUid} no MESMO commit (mirror de
// createGroup, mais o subdocumento de local — decisão 6: o criador nasce
// participante aprovado no mesmo batch, por isso a rule de leitura do
// local não precisa de caso especial pra ele). purgeAt calculado aqui, não
// em cada leitura — ver EVENT_PURGE_AFTER_DAYS acima.
export const createEvent = async (
  creatorUid: string,
  title: string,
  description: string,
  startsAt: Date,
  locationText: string,
): Promise<string> => {
  const ref = doc(collection(db, 'events'));
  const batch = writeBatch(db);
  const startsAtTs = Timestamp.fromDate(startsAt);
  const purgeAt = Timestamp.fromMillis(
    startsAtTs.toMillis() + EVENT_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  );
  batch.set(ref, {
    title: title.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    creatorId: creatorUid,
    createdAt: serverTimestamp(),
    startsAt: startsAtTs,
    participantCount: 1,
    purgeAt,
  });
  batch.set(locationRef(ref.id), {
    text: locationText.trim(),
    createdAt: serverTimestamp(),
  });
  batch.set(participantRef(ref.id, creatorUid), {
    uid: creatorUid,
    joinedAt: serverTimestamp(),
    role: 'creator',
  });
  await batch.commit();
  return ref.id;
};

// Eventos onde o uid é participante aprovado (inclui os que o próprio uid
// criou — o criador também tem doc em participants/, decisão 6).
// collectionGroup pra achar TODOS os events/*/participants/{uid} sem
// manter lista própria — mirror de listMyGroups.
export const listMyEvents = async (uid: string): Promise<Event[]> => {
  const participantDocs = await getDocs(
    query(collectionGroup(db, 'participants'), where('uid', '==', uid)),
  );
  const eventIds = participantDocs.docs
    .map((d) => d.ref.parent.parent?.id)
    .filter((id): id is string => !!id);
  const events = await Promise.all(eventIds.map((id) => getEvent(id)));
  return events.filter((e): e is Event => e != null);
};

// "Descobrir": eventos ainda não passados (startsAt > agora) onde o uid
// NÃO é participante aprovado — mirror de listDiscoverableGroups, incluindo
// a mesma decisão de NÃO excluir evento com pedido pendente (o próprio
// EventDetailScreen resolve o estado certo ao reabrir).
export const listDiscoverableEvents = async (uid: string): Promise<Event[]> => {
  const [allSnap, myEvents] = await Promise.all([
    getDocs(
      query(
        collection(db, 'events'),
        where('startsAt', '>', Timestamp.now()),
        orderBy('startsAt', 'asc'),
      ),
    ),
    listMyEvents(uid),
  ]);
  const myEventIds = new Set(myEvents.map((e) => e.id));
  return allSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Event, 'id'>) }))
    .filter((e) => !myEventIds.has(e.id));
};

export const getMyParticipation = async (
  eventId: string,
  uid: string,
): Promise<EventParticipant | null> => {
  const snap = await getDoc(participantRef(eventId, uid));
  return snap.exists() ? (snap.data() as EventParticipant) : null;
};

// S146 — mirror EXATO de listenMyMembership (groupService.ts) — usado por
// useUnseenAcceptedEvents (badge "aceite→solicitante").
export const listenMyParticipation = (
  eventId: string,
  uid: string,
  callback: (participant: EventParticipant | null) => void,
) => {
  return onSnapshot(
    participantRef(eventId, uid),
    (snap) => callback(snap.exists() ? (snap.data() as EventParticipant) : null),
    (error) => {
      console.error('[listenMyParticipation] erro no listener:', error);
    },
  );
};

// S146 — mirror EXATO de markGroupMembershipSeen (groupService.ts), chamado
// fire-and-forget no mount de EventDetailScreen.
export const markEventParticipationSeen = async (eventId: string, uid: string): Promise<void> => {
  await updateDoc(participantRef(eventId, uid), { seenAt: serverTimestamp() });
};

export const getMyEventJoinRequest = async (
  eventId: string,
  uid: string,
): Promise<EventJoinRequest | null> => {
  const snap = await getDoc(joinRequestRef(eventId, uid));
  return snap.exists() ? (snap.data() as EventJoinRequest) : null;
};

// create-only nas rules (!exists(participants/{uid})) — permission-denied
// aqui numa corrida (dois toques) significa "pedido já enviado", nunca erro
// genérico (mesmo padrão de requestToJoinGroup).
export const requestToJoinEvent = async (eventId: string, uid: string): Promise<void> => {
  try {
    await setDoc(joinRequestRef(eventId, uid), {
      uid,
      requestedAt: serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return;
    throw error;
  }
};

export const cancelJoinRequest = async (eventId: string, uid: string): Promise<void> => {
  await deleteDoc(joinRequestRef(eventId, uid));
};

// Só quem criou o evento chama isto — a rejeição só apaga o pedido pendente.
export const rejectJoinRequest = async (eventId: string, requesterUid: string): Promise<void> => {
  await deleteDoc(joinRequestRef(eventId, requesterUid));
};

export const listenJoinRequests = (
  eventId: string,
  callback: (requests: EventJoinRequest[]) => void,
) => {
  const q = query(collection(db, 'events', eventId, 'joinRequests'), orderBy('requestedAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as EventJoinRequest));
    },
    (error) => {
      console.error('[listenJoinRequests] erro no listener:', error);
    },
  );
};

// Aprovação: runTransaction de quem criou — cria participants/{uid} + apaga
// joinRequests/{uid} + incrementa participantCount. Mirror de
// approveJoinRequest (groupService.ts): transaction.get lê o valor FRESCO
// de dentro da própria transação, nunca um valor já em mãos na tela (ver
// ROADMAP.md "Padrões de escrita no Firestore").
export const approveJoinRequest = async (eventId: string, requesterUid: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const eventSnap = await transaction.get(eventRef(eventId));
    if (!eventSnap.exists()) throw new Error('EVENT_NOT_FOUND');
    const currentParticipantCount = (eventSnap.data() as Omit<Event, 'id'>).participantCount;
    transaction.set(participantRef(eventId, requesterUid), {
      uid: requesterUid,
      joinedAt: serverTimestamp(),
      role: 'participant',
    });
    transaction.delete(joinRequestRef(eventId, requesterUid));
    transaction.update(eventRef(eventId), { participantCount: currentParticipantCount + 1 });
  });
};

// Sair do evento: só participante comum (rules negam se role=='creator',
// mesmo mirror de leaveGroup). DIFERENÇA deliberada em relação a
// leaveGroup: participantCount NÃO desce aqui — a rule de allow update de
// events/{eventId} só tem ramo de INCREMENTO (ver firestore.rules), sem
// ramo simétrico de decremento por saída. Mesmo comportamento já confirmado
// no passo de deleteAccount pra participação em GRUPO de outros (não
// decrementa memberCount nesse fluxo, ver functions/src/index.ts) — aqui o
// campo também nunca desce, nem por saída nem por exclusão de conta.
export const leaveEvent = async (eventId: string, uid: string): Promise<void> => {
  await deleteDoc(participantRef(eventId, uid));
};

// Lista de participantes aprovados — usada pelo criador em
// EventDetailScreen (spec: "se sou criador... lista de participantes").
// Autorizado pela mesma rule de leitura de participants/{uid} que já cobre
// "quem já é participante lê a lista inteira" (o criador é participante
// aprovado por construção, decisão 6).
export const listEventParticipants = async (eventId: string): Promise<EventParticipant[]> => {
  const snap = await getDocs(
    query(collection(db, 'events', eventId, 'participants'), orderBy('joinedAt', 'asc')),
  );
  return snap.docs.map((d) => d.data() as EventParticipant);
};

// Local do evento — só criador/participante aprovado lê (firestore.rules).
// permission-denied aqui é ESPERADO pra quem só vê o evento na lista geral
// (ainda não foi aprovado) — tratado como "sem acesso" (null), nunca como
// erro genérico (mesmo padrão de getGroup acima).
export const getEventLocation = async (eventId: string): Promise<EventLocation | null> => {
  try {
    const snap = await getDoc(locationRef(eventId));
    return snap.exists() ? (snap.data() as EventLocation) : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return null;
    throw error;
  }
};
