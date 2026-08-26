// src/services/groupService.ts
//
// S124-A — camada única de acesso a Firestore/Storage para "grupos" (salas de
// conversa em grupo, com prazo de encerramento). Nenhuma tela importa
// firebase/firestore diretamente (convenção do projeto) — GroupsScreen/
// CreateGroupScreen/GroupDetailScreen/GroupChatScreen só chamam as funções
// abaixo. Mesmo molde de momentoService.ts/reportService.ts.
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
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
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { db, functions, storage } from '@/services/firebase';

// Mesmo teto de nickname (firestore.rules) — nome do grupo.
export const MAX_GROUP_NAME_LENGTH = 120;
// Mesmo teto de bio (firestore.rules) — descrição do grupo.
export const MAX_GROUP_DESCRIPTION_LENGTH = 2000;
// Decisão de produto (S124-A): prazo de encerramento escolhido por quem
// cria, teto de 1 mês. Espelha duration.value(30, 'd') em firestore.rules —
// mexer aqui significa mexer lá também.
export const MAX_GROUP_DURATION_DAYS = 30;

export type GroupMemberRole = 'creator' | 'member';

// S124-B (camada 1 — Enquete de grupo) — mesmo shape de users/{uid}.poll
// (firestoreService.ts:176), schema PARALELO (não aponta pra mesma
// collection). Tetos em src/constants/poll.ts (MIN_POLL_OPTIONS/
// MAX_POLL_OPTIONS/MAX_POLL_QUESTION_LENGTH/MAX_POLL_OPTION_LENGTH),
// reusados, nunca duplicados.
export interface GroupPoll {
  question: string;
  options: string[];
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  // Denormalizado, mantido pelo CLIENT junto com criação/entrada/saída de
  // membro (ver createGroup/approveJoinRequest/leaveGroup abaixo) — nunca
  // por Cloud Function. Início em 1 na criação (o criador já é membro).
  memberCount: number;
  // S124-B (camada 1) — só o criador cria/edita (setGroupPoll/removeGroupPoll
  // abaixo), reforçado nas rules (firestore.rules: ramo novo do allow update
  // de groups/{groupId}, restrito a request.auth.uid == creatorId). Trocar a
  // pergunta zera os votos (onGroupPollChanged, functions/src/index.ts) —
  // "substituir", não "editar em cima". Ausente = grupo sem enquete.
  poll?: GroupPoll;
  // S124-B — mapa esparso de contagem por opção (chave = índice como
  // string), escrito SÓ pela Cloud Function onGroupPollVoteCreated (Admin
  // SDK) — o client, inclusive o criador, NUNCA grava este campo (ver
  // firestore.rules: não entra em nenhum hasOnly de client). Chave ausente =
  // contagem zero pra aquela opção.
  pollCounts?: Record<string, number>;
  // S150 — espelho de LastMessage (matches, firestoreService.ts), escrito só
  // pela Cloud Function onGroupMessageCreated (Admin SDK, functions/src/
  // grupos.ts) — o client nunca grava lastMessage (ver firestore.rules).
  // Fundação do badge "mensagem nova em grupo que participo"
  // (useUnreadGroupMessages.ts).
  lastMessage?: GroupMessagePreview;
}

// S150 — mesmo shape de LastMessage (matches, firestoreService.ts), schema
// PARALELO (grupo não referencia matches/).
export interface GroupMessagePreview {
  text: string;
  senderId: string;
  createdAt: Timestamp;
}

export interface GroupMember {
  uid: string;
  joinedAt: Timestamp;
  role: GroupMemberRole;
  // S146 — badge "aceite→solicitante": ausente até o membro (não-dono) abrir
  // GroupDetailScreen pela 1ª vez depois de aprovado (markGroupMembershipSeen
  // abaixo). Mesmo molde de lastReadAt em matches (firestoreService.ts).
  seenAt?: Timestamp;
  // S150 — badge "mensagem nova em grupo": DISTINTO de seenAt acima (aquele é
  // o badge "aceite→solicitante", one-shot, S146 — não mexer). Gravado a
  // TODA abertura de GroupChatScreen (mount), não só na primeira vez —
  // precisa acompanhar mensagens novas subsequentes, ao contrário de seenAt.
  // Ver markGroupMessagesSeen abaixo e useUnreadGroupMessages.ts.
  messagesSeenAt?: Timestamp;
}

export interface GroupJoinRequest {
  uid: string;
  requestedAt: Timestamp;
}

// S124-A decisão 11 — mesmo mínimo do chat 1:1 (matches/{matchId}/messages),
// SEM reações/replyTo/read-receipts/edição/exclusão: só texto e foto.
export interface GroupMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
  imageUrl?: string;
}

const groupRef = (groupId: string) => doc(db, 'groups', groupId);
const memberRef = (groupId: string, uid: string) => doc(db, 'groups', groupId, 'members', uid);
const joinRequestRef = (groupId: string, uid: string) =>
  doc(db, 'groups', groupId, 'joinRequests', uid);
const messagesCollection = (groupId: string) => collection(db, 'groups', groupId, 'messages');

// permission-denied aqui significa "grupo expirou/foi apagado entre a
// navegação e a leitura" (mesmo princípio de getMyMomento, momentoService.ts)
// — nunca erro genérico. allow read de groups/{groupId} é isSignedIn(), então
// isso só acontece pra doc que já sumiu.
export const getGroup = async (groupId: string): Promise<Group | null> => {
  try {
    const snap = await getDoc(groupRef(groupId));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Group, 'id'>) } : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return null;
    throw error;
  }
};

export const listenGroup = (groupId: string, callback: (group: Group | null) => void) => {
  return onSnapshot(
    groupRef(groupId),
    (snap) =>
      callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Group, 'id'>) } : null),
    (error) => {
      // Mesmo tratamento de permission-denied de getGroup acima — grupo
      // sumiu (expirou/foi apagado) enquanto a tela estava aberta.
      if ((error as { code?: string })?.code === 'permission-denied') {
        callback(null);
        return;
      }
      console.error('[listenGroup] erro no listener:', error);
    },
  );
};

// writeBatch cria groups/{id} + groups/{id}/members/{creatorUid} (role
// creator) no MESMO batch — exigência das rules (getAfter do doc pai no
// create do member). memberCount nasce em 1: só o criador existe até a
// primeira aprovação.
export const createGroup = async (
  creatorUid: string,
  name: string,
  description: string,
  expiresAt: Date,
): Promise<string> => {
  const ref = doc(collection(db, 'groups'));
  const batch = writeBatch(db);
  batch.set(ref, {
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    creatorId: creatorUid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    memberCount: 1,
  });
  batch.set(memberRef(ref.id, creatorUid), {
    uid: creatorUid,
    joinedAt: serverTimestamp(),
    role: 'creator',
  });
  await batch.commit();
  return ref.id;
};

// Grupos onde o uid é membro (inclui os que o próprio uid criou — o criador
// também tem doc em members/). collectionGroup pra achar TODOS os
// groups/*/members/{uid} do usuário sem precisar manter uma lista própria;
// groupId vem do path do doc (d.ref.parent.parent), nunca do conteúdo.
export const listMyGroups = async (uid: string): Promise<Group[]> => {
  const memberDocs = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  const groupIds = memberDocs.docs
    .map((d) => d.ref.parent.parent?.id)
    .filter((id): id is string => !!id);
  const groups = await Promise.all(groupIds.map((id) => getGroup(id)));
  return groups.filter((g): g is Group => g != null);
};

// "Descobrir": grupos ainda não expirados onde o uid NÃO é membro. Grupo já
// expirado (mas ainda não varrido pela expireGroups) fica de fora — mesmo
// corte de momentos/{uid} (S121).
//
// S124-A-fix (correção pós-auditoria) — NÃO exclui grupo com pedido
// pendente: excluir também deixaria o grupo inacessível pra sempre (não
// está em "Meus grupos" por ainda não ser membro, e sumiria de "Descobrir"
// também), sem nenhuma tela pra voltar e ver "Pedido enviado"/cancelar. O
// próprio `GroupDetailScreen` já resolve o estado certo (pedido pendente vs.
// "Pedir pra entrar") ao reabrir o grupo — não precisa filtrar aqui.
export const listDiscoverableGroups = async (uid: string): Promise<Group[]> => {
  const [allSnap, myGroups] = await Promise.all([
    getDocs(
      query(
        collection(db, 'groups'),
        where('expiresAt', '>', Timestamp.now()),
        orderBy('expiresAt', 'asc'),
      ),
    ),
    listMyGroups(uid),
  ]);
  const myGroupIds = new Set(myGroups.map((g) => g.id));
  return allSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Group, 'id'>) }))
    .filter((g) => !myGroupIds.has(g.id));
};

export const getMyMembership = async (
  groupId: string,
  uid: string,
): Promise<GroupMember | null> => {
  const snap = await getDoc(memberRef(groupId, uid));
  return snap.exists() ? (snap.data() as GroupMember) : null;
};

// S146 — versão reativa de getMyMembership, usada por useUnseenAcceptedGroups
// (badge "aceite→solicitante"): precisa saber em tempo real quando `seenAt`
// é gravado, mesmo padrão de erro de listenGroup acima (permission-denied
// aqui é inesperado — o próprio uid sempre pode ler o próprio doc de member,
// ver allow read de members/{uid} — mas tratado sem derrubar o listener).
export const listenMyMembership = (
  groupId: string,
  uid: string,
  callback: (member: GroupMember | null) => void,
) => {
  return onSnapshot(
    memberRef(groupId, uid),
    (snap) => callback(snap.exists() ? (snap.data() as GroupMember) : null),
    (error) => {
      console.error('[listenMyMembership] erro no listener:', error);
    },
  );
};

// S146 — badge "aceite→solicitante": chamado fire-and-forget no mount de
// GroupDetailScreen quando o usuário logado é membro não-criador e o
// próprio doc ainda não tem `seenAt` (mesmo padrão de markMatchRead em
// firestoreService.ts, chamado por ChatScreen.tsx).
export const markGroupMembershipSeen = async (groupId: string, uid: string): Promise<void> => {
  await updateDoc(memberRef(groupId, uid), { seenAt: serverTimestamp() });
};

// S150 — badge "mensagem nova em grupo": chamado fire-and-forget no mount de
// GroupChatScreen, SEMPRE (não só na 1ª vez, ao contrário de
// markGroupMembershipSeen acima) — precisa acompanhar toda mensagem nova
// lida, mesmo padrão de markMatchRead (firestoreService.ts/ChatScreen.tsx).
export const markGroupMessagesSeen = async (groupId: string, uid: string): Promise<void> => {
  await updateDoc(memberRef(groupId, uid), { messagesSeenAt: serverTimestamp() });
};

export const getMyJoinRequest = async (
  groupId: string,
  uid: string,
): Promise<GroupJoinRequest | null> => {
  const snap = await getDoc(joinRequestRef(groupId, uid));
  return snap.exists() ? (snap.data() as GroupJoinRequest) : null;
};

// create-only nas rules (!exists(members/{uid})) — um permission-denied aqui
// numa corrida (dois toques) significa "pedido já enviado", nunca erro
// genérico (mesmo padrão já usado no projeto pra escrita create-only, ver
// ROADMAP.md "Padrões de escrita no Firestore").
export const requestToJoinGroup = async (groupId: string, uid: string): Promise<void> => {
  try {
    await setDoc(joinRequestRef(groupId, uid), {
      uid,
      requestedAt: serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return;
    throw error;
  }
};

export const cancelJoinRequest = async (groupId: string, uid: string): Promise<void> => {
  await deleteDoc(joinRequestRef(groupId, uid));
};

// Só o criador chama isto — a rejeição só apaga o pedido pendente.
export const rejectJoinRequest = async (groupId: string, requesterUid: string): Promise<void> => {
  await deleteDoc(joinRequestRef(groupId, requesterUid));
};

// S124-A-fix (correção pós-auditoria) — segundo argumento de erro
// adicionado ao onSnapshot, mesmo padrão já usado em listenGroup acima
// (era uma omissão, não uma escolha deliberada de deixar sem tratamento).
export const listenJoinRequests = (
  groupId: string,
  callback: (requests: GroupJoinRequest[]) => void,
) => {
  const q = query(collection(db, 'groups', groupId, 'joinRequests'), orderBy('requestedAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as GroupJoinRequest));
    },
    (error) => {
      console.error('[listenJoinRequests] erro no listener:', error);
    },
  );
};

// Aprovação: runTransaction do criador — cria members/{uid} + apaga
// joinRequests/{uid} + incrementa memberCount.
//
// S124-A-fix (correção pós-auditoria) — TROCADO de writeBatch (que recebia
// currentMemberCount já carregado na tela) pra runTransaction: com
// writeBatch, um memberCount desatualizado na tela (ex.: dois approves em
// sequência antes do listener propagar o primeiro) fazia a rule negar o
// BATCH INTEIRO — inclusive o set do member e o delete do joinRequest, que
// estavam corretos. A transação lê `groups/{groupId}` FRESCO (transaction.get,
// não o parâmetro da tela) e escreve currentMemberCount+1 a partir desse
// valor lido ali mesmo, eliminando a origem do dado desatualizado.
export const approveJoinRequest = async (groupId: string, requesterUid: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const groupSnap = await transaction.get(groupRef(groupId));
    if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
    const currentMemberCount = (groupSnap.data() as Omit<Group, 'id'>).memberCount;
    transaction.set(memberRef(groupId, requesterUid), {
      uid: requesterUid,
      joinedAt: serverTimestamp(),
      role: 'member',
    });
    transaction.delete(joinRequestRef(groupId, requesterUid));
    transaction.update(groupRef(groupId), { memberCount: currentMemberCount + 1 });
  });
};

// Sair do grupo: só membro comum (rules negam se role=='creator').
//
// S124-A-fix (correção pós-auditoria) — mesma troca de approveJoinRequest
// acima: runTransaction lendo memberCount FRESCO em vez de receber
// currentMemberCount como parâmetro. O `Math.max(0, ...)` que existia antes
// não protegia nada de verdade (um valor de tela desatualizado que desse
// negativo continuava sendo rejeitado pela rule, só numa forma diferente) —
// lendo o valor real dentro da transação, o clamp deixa de ser necessário.
export const leaveGroup = async (groupId: string, uid: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const groupSnap = await transaction.get(groupRef(groupId));
    if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
    const currentMemberCount = (groupSnap.data() as Omit<Group, 'id'>).memberCount;
    transaction.delete(memberRef(groupId, uid));
    transaction.update(groupRef(groupId), { memberCount: currentMemberCount - 1 });
  });
};

// ─── Messages ─────────────────────────────────────────────
//
// Sem paginação/janela (S101) de propósito — S124-A decisão 11: grupo de
// chat nesta sprint é o mínimo (texto + foto), mesmo padrão simples de
// listenReportMessages (reportService.ts), sem o custo de reproduzir a
// paginação inteira do ChatScreen.

// S124-A-fix (correção pós-auditoria) — segundo argumento de erro
// adicionado ao onSnapshot, mesmo padrão de listenGroup/listenJoinRequests.
export const listenGroupMessages = (
  groupId: string,
  callback: (messages: GroupMessage[]) => void,
) => {
  const q = query(messagesCollection(groupId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GroupMessage));
    },
    (error) => {
      console.error('[listenGroupMessages] erro no listener:', error);
    },
  );
};

export const sendGroupMessage = async (
  groupId: string,
  senderId: string,
  text: string,
  imageUrl?: string,
): Promise<void> => {
  await addDoc(messagesCollection(groupId), {
    text,
    senderId,
    createdAt: serverTimestamp(),
    ...(imageUrl ? { imageUrl } : {}),
  });
};

// Mesmo molde de uploadChatImage (firestoreService.ts), path próprio
// images/groupChats/{groupId}/{ts}.jpg — ver storage.rules.
export const uploadGroupChatImage = async (
  groupId: string,
  localUri: string,
  onProgress: (percent: number) => void,
): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/groupChats/${groupId}/${Date.now()}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      () => resolve(),
    );
  });

  return getDownloadURL(storageRef);
};

// ─── Enquete de grupo (S124-B, camada 1) ─────────────────────
//
// Réplica FIEL do desenho de enquete de perfil (S126), escopada a
// groups/{groupId} em vez de users/{uid} — schema NOVO e PARALELO, não
// aponta pra mesma collection. Ver GroupPoll/Group.pollCounts acima.

const groupPollVoteRef = (groupId: string, voterUid: string) =>
  doc(db, 'groups', groupId, 'pollVotes', voterUid);

// Só deve ser chamada pela UI quando isCreator (mesma checagem de
// GroupDetailScreen.tsx) — quem garante de verdade é a rule (allow update
// restrito a request.auth.uid == resource.data.creatorId).
export const setGroupPoll = async (
  groupId: string,
  question: string,
  options: string[],
): Promise<void> => {
  await updateDoc(groupRef(groupId), { poll: { question, options } });
};

// Mesmo padrão de handleRemovePoll (perfil, firestoreService.ts:333-338/
// 650-660) — deleteField(), não gravar undefined. A limpeza de
// pollVotes/pollCounts é responsabilidade da Cloud Function
// onGroupPollChanged (reage à mudança do campo `poll`; deleteField() conta
// como mudança).
export const removeGroupPoll = async (groupId: string): Promise<void> => {
  await updateDoc(groupRef(groupId), { poll: deleteField() });
};

// Mirror de getMyPollVote (firestoreService.ts:826-829).
export const getMyGroupPollVote = async (
  groupId: string,
  voterUid: string,
): Promise<number | null> => {
  const snap = await getDoc(groupPollVoteRef(groupId, voterUid));
  return snap.exists() ? (snap.data().optionIndex as number) : null;
};

// setDoc sem merge, mirror de castPollVote (firestoreService.ts:837-846):
// mesmo comportamento esperado de corrida — se o doc já existe (voto em
// outro aparelho/tela ao mesmo tempo), as rules negam o update (allow
// update: if false) e a Promise rejeita com permission-denied. Isso é
// ESPERADO, não é bug — o chamador (GroupDetailScreen) trata como "já
// votou", nunca como Alert genérico de erro.
export const castGroupPollVote = async (
  groupId: string,
  voterUid: string,
  optionIndex: number,
): Promise<void> => {
  await setDoc(groupPollVoteRef(groupId, voterUid), {
    optionIndex,
    createdAt: serverTimestamp(),
  });
};

// ─── Gente ativa agora (S124-B, camada 2) ────────────────────
//
// Decisão de arquitetura (registrada na spec): NÃO estender as rules de
// presence/{uid} pra coparticipação em grupo (custo de get() em regra +
// exposição de lastSeenAt individual de gente sem match). Callable SOB
// DEMANDA, Admin SDK (bypassa rules), retorna só um número agregado —
// NUNCA a lista de quem está ativo nem lastSeenAt individual. Ver
// getGroupActiveNowCount em functions/src/index.ts.
export const getGroupActiveNowCount = async (groupId: string): Promise<number> => {
  const call = httpsCallable<{ groupId: string }, { count: number }>(
    functions,
    'getGroupActiveNowCount',
  );
  const result = await call({ groupId });
  return result.data.count;
};
