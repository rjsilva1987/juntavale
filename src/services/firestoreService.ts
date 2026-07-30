// src/services/firestoreService.ts
import {
  collection,
  doc,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { ADMIN_UID } from '@/config/admin';
import { LookingFor } from '@/constants/lookingFor';
import { REPLY_LIMIT } from '@/constants/reply';
import { SUPER_LIKE_LIMIT } from '@/constants/superLike';
import { UF } from '@/constants/ufs';
import { VALES, Vale } from '@/constants/vale';
import { db, storage } from '@/services/firebase';

// ─── Types ───────────────────────────────────────────────

export type Gender = 'masculino' | 'feminino' | 'outro';

export interface DiscoverFilters {
  ageMin: number;
  ageMax: number;
  uf: UF | 'all';
  gender: Gender | 'all';
  lookingFor: LookingFor | 'all';
  // S83-B — primeiro filtro de múltipla escolha do app: os outros campos
  // usam sentinela 'all' (um valor só, "sem restrição"); vale é uma lista de
  // valores marcados. Ver getDiscoverProfiles pra como isso é interpretado
  // (seleção total/vazia = inerte, parcial = filtra).
  vale: Vale[];
  verifiedOnly: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  age: number;
  // S76-A — `age` segue no schema, escrito no cadastro (derivado, ver
  // AuthContext.register/calculateAge), mas a FONTE DA VERDADE passa a ser
  // birthDate. Opcional: perfis antigos não têm o campo.
  birthDate?: Timestamp;
  bio: string;
  photoURL: string;
  photos: string[];
  interests: string[];
  gender?: Gender;
  // Opcional só por causa de contas de teste criadas antes deste campo
  // existir — nas rules (isValidProfile) é obrigatório em create/update pra
  // toda conta nova, nunca fica vazio depois de setado uma vez.
  lookingFor?: LookingFor;
  // S44 — mesmo padrão de lookingFor: opcional no tipo só por causa de
  // contas legadas anteriores à descoberta nacional; obrigatório no create
  // (RegisterScreen + firestore.rules) pra toda conta nova, nunca fica vazio
  // depois de setado uma vez (ver rules de update).
  uf?: UF;
  // S83-A — mesmo padrão de lookingFor/uf acima: OPCIONAL no tipo de
  // propósito, mesmo sendo obrigatório no cadastro. Contas que já existem
  // (criadas antes deste campo existir) não têm vale na base — marcar como
  // obrigatório aqui faria o TypeScript mentir sobre o formato real dos
  // docs antigos. Gravável uma vez só depois de setado (ver firestore.rules).
  vale?: Vale;
  // S44 removeu o uso de location no Descobrir (geo trocado por UF) — campo
  // mantido no schema/rules por não ter sido pedida a remoção nesta sprint;
  // não confundir com Message.location (compartilhamento de localização no
  // chat), que é outro campo, em outra collection, e não é afetado.
  location?: { lat: number; lng: number };
  filters?: DiscoverFilters;
  createdAt?: Timestamp;
  blockedUsers?: string[];
  verified?: boolean;
  // Selo fundador (S51) — atribuído SÓ por Cloud Function (assignFounderNumber,
  // Admin SDK); o client nunca escreve este campo, ver firestore.rules
  // (users/{userId} não tem 'founderNumber' na hasOnly() de create/update).
  // Ausente = sem selo (contador desligado, admin, ou vaga esgotada).
  founderNumber?: number;
  // Prompts estilo Hinge (S33) — até 3, ordem = ordem de exibição escolhida
  // pelo usuário. Opcional: docs legados sem o campo = sem prompts, toda
  // leitura precisa tolerar undefined. Ver src/constants/prompts.ts.
  prompts?: { id: string; answer: string }[];
  // S59 — Prompt da semana (id wXX do pool rotativo em src/constants/prompts.ts)
  // ganha campo próprio, fora de prompts[]/MAX_PROMPTS: slot único, a resposta
  // de uma semana nova SOBRESCREVE a anterior (não acumula, diferente dos 4
  // prompts normais). Ausente = nunca respondeu (ou removeu, via
  // removeWeeklyPromptAnswer abaixo). Contas de antes do S59 podem ter um item
  // wXX preso dentro de prompts[] — legado intencionalmente não migrado, ver
  // relatório da sprint.
  weeklyPromptAnswer?: { id: string; answer: string };
  // S44a — gravado por useActivityTracker (mount + volta ao foreground, com
  // throttle de 1h). Opcional: contas existentes não têm até o primeiro
  // foreground pós-deploy; base pro re-engajamento (S44b).
  lastActiveAt?: Timestamp;
  // S44c — opt-OUT dos pushes de re-engajamento (S44b, ainda não existe).
  // Ausente ou false = recebe lembretes (padrão); true = não recebe.
  // Nomeado como opt-out de propósito: contas existentes sem o campo
  // continuam elegíveis sem precisar de migração.
  reengagementOptOut?: boolean;
  // S48 — "Meus lugares", texto livre, até 5 tags. Opcional: não entra no
  // cadastro (RegisterScreen), só editável depois via ProfileScreen; contas
  // sem o campo não têm migração, simplesmente não renderizam nada.
  places?: string[];
  // S48 — "No meu radar", texto livre, até 3 tags. Mesmo padrão de places
  // acima (opcional, sem migração, só editável no ProfileScreen).
  events?: string[];
}

// Escrito só pela Cloud Function onMessageCreated (Admin SDK) — o client
// nunca grava lastMessage, ver firestore.rules. text já vem truncado (~120
// chars) e com o placeholder de foto/localização quando a mensagem não tem
// texto.
export interface LastMessage {
  text: string;
  senderId: string;
  createdAt: Timestamp;
}

export interface Match {
  id: string;
  users: string[];
  // Gravado em recordSwipe() na criação do doc — sempre presente em matches
  // novos; opcional só pra não quebrar leituras de docs antigos que, na
  // prática, também têm o campo (existe desde a primeira versão do matching).
  createdAt?: Timestamp;
  lastMessage?: LastMessage;
  // Mapa por usuário, escrito pelo CLIENTE (cada um só escreve a própria
  // chave — ver firestore.rules) ao abrir/focar o chat. Base do badge de não
  // lidas em useUnreadCount.
  lastReadAt?: Record<string, Timestamp>;
  typing?: Record<string, Timestamp>;
  blockedBy?: string[];
}

// S79 — cópia truncada (não uma referência viva) da mensagem original: v1
// só existe pra mensagem de TEXTO, guardada já cortada em 100 code points
// pelo client antes de chamar sendMessage (ver ChatScreen.tsx). Tocar na
// citação não pula pra mensagem original (decisão de produto do S79).
export interface MessageReplyTo {
  messageId: string;
  text: string;
  senderId: string;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
  imageUrl?: string;
  location?: { latitude: number; longitude: number };
  replyTo?: MessageReplyTo;
  // S85-B — presente só em mensagem apagada "pros dois" (lápide). Nesse
  // caso text/imageUrl/location/replyTo ficam ausentes por construção (ver
  // firestore.rules e deleteMessageForEveryone abaixo).
  deletedAt?: Timestamp;
}

// ─── User ─────────────────────────────────────────────────

// Criação do doc público (users/{uid}) é feita em AuthContext.register() —
// não aqui. O ChaveF privado (users/{uid}/private/registration) não é mais
// capturado no cadastro: é pedido na VerificationScreen, junto do envio da
// selfie (submitRegistrationPrivate abaixo), já que agora só é exigido de
// quem quer conversar, não de quem só quer usar o app.

export interface RegistrationPrivate {
  chaveF: string;
  createdAt?: Timestamp;
}

// Admin-only na prática: firestore.rules só libera o read deste doc pro
// próprio dono ou pra isAdmin(). Contas criadas antes do ChaveF existir não
// têm este doc — retorna null nesse caso.
export const getRegistrationPrivate = async (uid: string): Promise<RegistrationPrivate | null> => {
  const snap = await getDoc(doc(db, 'users', uid, 'private', 'registration'));
  return snap.exists() ? (snap.data() as RegistrationPrivate) : null;
};

// Chamado pela VerificationScreen antes de submitVerification, só quando
// getRegistrationPrivate ainda não achou um doc existente — as rules tornam
// este doc create-only (allow update, delete: if false), então uma segunda
// chamada pro mesmo uid seria rejeitada pelo servidor.
export const submitRegistrationPrivate = async (uid: string, chaveF: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'private', 'registration'), {
    chaveF,
    createdAt: serverTimestamp(),
  });
};

// S75 — corrige o chaveF depois de uma recusa (verifications/{uid}.status
// == 'rejected'); a janela e o formato são validados nas rules, não aqui.
// updateDoc, não setDoc: setDoc sem merge apagaria createdAt, e a rule (que
// exige createdAt inalterado nesta operação) rejeitaria o write.
export const updateChaveF = async (uid: string, chaveF: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid, 'private', 'registration'), { chaveF });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// ─── Profile photos ───────────────────────────────────────
//
// photos[0] é sempre a principal; photoURL é um espelho de photos[0],
// mantido em sincronia em toda mutação abaixo pra que os consumidores de
// foto única (Likes, Matches, BlockedUsers, AdminVerifications, MatchModal,
// nav params de Chat/MatchProfile, avatar do topo do ProfileScreen)
// continuem corretos sem precisar ler photos[].

export const MAX_PROFILE_PHOTOS = 4;

export const uploadProfilePhoto = async (uid: string, localUri: string): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `avatars/${uid}/${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const addProfilePhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  if (photos.length >= MAX_PROFILE_PHOTOS) {
    throw new Error('MAX_PHOTOS_REACHED');
  }
  const nextPhotos = [...photos, url];
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] });
  return nextPhotos;
};

export const removeProfilePhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  const nextPhotos = photos.filter((p) => p !== url);
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] ?? '' });
  // Órfão no Storage é só custo de armazenamento, não um dado incorreto pro
  // usuário — não vale falhar a remoção (já refletida no Firestore acima)
  // por causa de um erro na limpeza do arquivo.
  await deleteObject(ref(storage, url)).catch(() => {});
  return nextPhotos;
};

export const setPrincipalPhoto = async (
  uid: string,
  photos: string[],
  url: string,
): Promise<string[]> => {
  // Só reordena as URLs — o arquivo em si não muda de lugar no Storage.
  const nextPhotos = [url, ...photos.filter((p) => p !== url)];
  await updateUserProfile(uid, { photos: nextPhotos, photoURL: nextPhotos[0] });
  return nextPhotos;
};

// ─── Weekly prompt (S59) ────────────────────────────────────
//
// Salvar usa updateUserProfile normalmente (weeklyPromptAnswer é um campo
// opcional comum em UserProfile). Remover precisa de deleteField(): passar
// `undefined` em updateDoc não apaga a chave, deixa como está — mesmo padrão
// já usado em reviewVerification (verificationService.ts) pra rejectionReason.

export const removeWeeklyPromptAnswer = async (uid: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), { weeklyPromptAnswer: deleteField() });
};

// ─── Discovery ────────────────────────────────────────────

// S43 — perfis cadastrados há menos disso ganham posição garantida no deck.
const NEW_PROFILE_BOOST_WINDOW_MS = 48 * 60 * 60 * 1000;
// A cada N regulares, 1 boosted é intercalado (posições 3, 7, 11... 0-indexed).
const NEW_PROFILE_BOOST_GAP = 3;

// Intercala `boosted` dentro de `regular` a cada `gap` itens, preservando a
// ordem interna de cada lista. Se uma lista acabar antes da outra, o restante
// da lista que sobrou é anexado na sequência (sem re-sort).
export const interleaveBoostedProfiles = (
  regular: UserProfile[],
  boosted: UserProfile[],
  gap: number,
): UserProfile[] => {
  const result: UserProfile[] = [];
  let regularIdx = 0;
  let boostedIdx = 0;

  while (regularIdx < regular.length || boostedIdx < boosted.length) {
    for (let i = 0; i < gap && regularIdx < regular.length; i++) {
      result.push(regular[regularIdx]);
      regularIdx++;
    }
    if (boostedIdx < boosted.length) {
      result.push(boosted[boostedIdx]);
      boostedIdx++;
    }
  }

  return result;
};

// Fisher-Yates puro (não muta `list`) — usado pra embaralhar os perfis
// regulares (não-boosted) de cada partição de UF antes de intercalar os
// boosted (S44).
const shuffled = <T>(list: T[]): T[] => {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Boost (S43) é secundário DENTRO de uma partição de UF (S44): separa
// boosted/regular só entre os perfis já filtrados pra uma mesma partição,
// embaralha os regulares e intercala os boosted por cima — nunca mistura
// perfis de partições diferentes.
const applyBoostAndShuffle = (list: UserProfile[]): UserProfile[] => {
  const boostThreshold = Date.now() - NEW_PROFILE_BOOST_WINDOW_MS;
  const regular: UserProfile[] = [];
  const boosted: UserProfile[] = [];
  list.forEach((p) => {
    if (p.createdAt && p.createdAt.toMillis() >= boostThreshold) {
      boosted.push(p);
    } else {
      regular.push(p);
    }
  });

  return interleaveBoostedProfiles(shuffled(regular), boosted, NEW_PROFILE_BOOST_GAP);
};

export const getDiscoverProfiles = async (
  currentUid: string,
  filters?: DiscoverFilters,
  currentUserUf?: UF,
  blockedUsers?: string[],
): Promise<UserProfile[]> => {
  // Get already-swiped user IDs
  const swipesSnap = await getDocs(
    query(collection(db, 'swipes'), where('from', '==', currentUid)),
  );
  const swipedIds = swipesSnap.docs.map((d) => d.data().to as string);
  // ADMIN_UID nunca aparece no Descobrir, mesmo sem bloqueio/swipe prévio.
  swipedIds.push(currentUid, ADMIN_UID, ...(blockedUsers ?? []));

  // Fetch all users not yet swiped (Firestore doesn't support NOT IN > 10 easily,
  // so for production use a Cloud Function or pagination). Age/gender/UF
  // filters are applied client-side here for the same reason — descoberta
  // agora é nacional (S44), sem geo-query.
  const usersSnap = await getDocs(collection(db, 'users'));
  const profiles: UserProfile[] = [];
  usersSnap.forEach((d) => {
    if (swipedIds.includes(d.id)) return;
    const candidate = d.data() as UserProfile;

    if (filters) {
      if (candidate.age < filters.ageMin || candidate.age > filters.ageMax) return;
      if (filters.gender !== 'all' && candidate.gender !== filters.gender) return;
      if (filters.lookingFor !== 'all' && candidate.lookingFor !== filters.lookingFor) return;
      if (filters.verifiedOnly && candidate.verified !== true) return;
      // Perfil SEM uf é excluído quando um estado específico está filtrado —
      // comportamento intencional (S44).
      if (filters.uf !== 'all' && candidate.uf !== filters.uf) return;
      // S83-B — vale só filtra quando a seleção é PARCIAL (>0 e <VALES.length).
      // Com os três marcados (padrão) ou nenhum marcado, o filtro fica
      // INERTE e não exclui ninguém: contas existentes ainda não têm vale, e
      // uma condição ingênua (`filters.vale.includes(candidate.vale)` sem
      // essa guarda) esvaziaria o Descobrir inteiro com o filtro no padrão
      // (perfil sem vale nunca bateria contra nenhuma seleção), parecendo
      // bug de query em vez de filtro funcionando. Quando a seleção É
      // parcial, perfil SEM vale não aparece — comportamento pedido.
      if (filters.vale.length > 0 && filters.vale.length < VALES.length) {
        if (!candidate.vale || !filters.vale.includes(candidate.vale)) return;
      }
    }

    profiles.push(candidate);
  });

  // S44 — descoberta nacional: partição por UF é o critério PRIMÁRIO
  // (perfis da mesma UF do usuário logado aparecem antes de todo o resto),
  // o boost de perfis novos (S43) é secundário e reaplicado dentro de cada
  // partição via applyBoostAndShuffle — ver comentário dessa função.
  const sameUf: UserProfile[] = [];
  const rest: UserProfile[] = [];
  profiles.forEach((p) => {
    if (currentUserUf && p.uf === currentUserUf) {
      sameUf.push(p);
    } else {
      rest.push(p);
    }
  });

  return [...applyBoostAndShuffle(sameUf), ...applyBoostAndShuffle(rest)];
};

// ─── Swipes & Matches ─────────────────────────────────────

interface SuperLikeUsage {
  year: number;
  month: number;
  count: number;
}

// S74-A — contador mensal de "Responder" (bilhete em curtida normal, via
// prompt), mesma forma do SuperLikeUsage acima, em doc separado
// (users/{uid}/replies/usage) — quota independente da de super like.
interface ReplyUsage {
  year: number;
  month: number;
  count: number;
}

// S35-A — o que estava visível no card no momento do like/superlike, como
// REFERÊNCIA (índice da foto ou id do prompt), nunca a URL/texto em si.
// Coexiste com likedPhotoURL (S35, já em produção) — ver decisão registrada
// no relatório da tarefa; a consolidação dos dois fica pra uma etapa futura.
export type SwipeContext =
  { type: 'photo'; photoIndex: number } | { type: 'prompt'; promptId: string };

// Lançado por recordSwipe quando o superlike estouraria o limite mensal —
// tipado por 'code' (padrão de erro do Firebase) pra a UI distinguir essa
// falha de qualquer outro erro de rede/permissão sem depender da mensagem.
export class SuperLikeQuotaExceededError extends Error {
  code = 'superlike/quota-exceeded' as const;

  constructor() {
    super('Limite mensal de superlikes atingido.');
    this.name = 'SuperLikeQuotaExceededError';
  }
}

// S74-B — mesmo padrão do SuperLikeQuotaExceededError acima, agora pro
// contador próprio de "Responder".
export class ReplyQuotaExceededError extends Error {
  code = 'reply/quota-exceeded' as const;

  constructor() {
    super('Limite mensal de respostas atingido.');
    this.name = 'ReplyQuotaExceededError';
  }
}

// S57 — registro em memória (não persiste, não é Firestore) dos uids
// decididos (like/nope/superlike) NESTA sessão do app. O SwipeScreen usa isso
// pra reconciliar o deck localmente (sem refetch) quando volta de outra tela
// (MatchProfileScreen) onde um swipe pode ter sido gravado. Módulo é
// singleton em toda a app — por isso o Set não é exportado diretamente, só
// as funções de acesso abaixo, pra centralizar quem pode ler/escrever nele.
const sessionSwipedUids = new Set<string>();

export const markSwiped = (uid: string): void => {
  sessionSwipedUids.add(uid);
};

export const unmarkSwiped = (uid: string): void => {
  sessionSwipedUids.delete(uid);
};

export const getSessionSwipedUids = (): ReadonlySet<string> => sessionSwipedUids;

export const clearSessionSwipes = (): void => {
  sessionSwipedUids.clear();
};

// S49 — leitura pontual de um swipe já registrado (ou não), sem depender
// do read-after-write dentro de recordSwipe. Usado pelo MatchProfileScreen
// pra saber, no mount, se o usuário já curtiu este perfil (evita reoferecer
// o botão de curtir e tentar um create/update duplicado, que as rules
// negam — swipe é imutável) e no catch de handleSwipeAction pra distinguir
// "negado por já existir" de um erro real. Depende do null-guard de
// firestore.rules (match /swipes/{swipeId}) pra não estourar
// permission-denied quando o doc ainda não existe.
export interface SwipeRecord {
  direction: 'like' | 'nope' | 'superlike';
}

export const getSwipe = async (fromUid: string, toUid: string): Promise<SwipeRecord | null> => {
  const snap = await getDoc(doc(db, 'swipes', `${fromUid}_${toUid}`));
  return snap.exists() ? (snap.data() as SwipeRecord) : null;
};

export const recordSwipe = async (
  fromUid: string,
  toUid: string,
  direction: 'like' | 'nope' | 'superlike',
  likedPhotoURL?: string,
  context?: SwipeContext,
  // S67 — bilhete opcional anexado à super curtida (só SwipeScreen envia;
  // MatchProfileScreen continua chamando com 5 args, sem quebrar).
  note?: string,
): Promise<boolean> => {
  const swipeRef = doc(db, 'swipes', `${fromUid}_${toUid}`);
  const trimmedNote = note?.trim();
  const swipeData = {
    from: fromUid,
    to: toUid,
    direction,
    createdAt: serverTimestamp(),
    // Contexto pra "Curtiram você" (S35): só grava em like/superlike — nope
    // é sempre anônimo pro alvo, então nunca deve carregar essa informação.
    ...(direction !== 'nope' && likedPhotoURL ? { likedPhotoURL } : {}),
    // S35-A: mesma regra de direction do likedPhotoURL acima, mas como
    // referência (photoIndex/promptId) em vez de URL — ver SwipeContext.
    ...(direction !== 'nope' && context ? { context } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };

  if (direction === 'superlike') {
    // Contador mensal em UTC — bate com request.time.year()/month() usados
    // nas rules (getAfter() do batch abaixo), que o servidor calcula em UTC.
    const usageRef = doc(db, 'users', fromUid, 'superLikes', 'usage');
    const usageSnap = await getDoc(usageRef);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const usage = usageSnap.exists() ? (usageSnap.data() as SuperLikeUsage) : null;
    const isSameMonth = usage != null && usage.year === year && usage.month === month;

    if (isSameMonth && usage.count >= SUPER_LIKE_LIMIT) {
      throw new SuperLikeQuotaExceededError();
    }

    const nextCount = isSameMonth ? usage.count + 1 : 1;

    const batch = writeBatch(db);
    batch.set(usageRef, { year, month, count: nextCount });
    batch.set(swipeRef, swipeData);
    await batch.commit();
  } else if (direction === 'like' && trimmedNote) {
    // S74-A/B — contador de "Responder", mesmo desenho do superlike acima
    // (getDoc do usage, cálculo de mês em UTC, writeBatch juntando usage e
    // swipe), em doc separado (não compartilha quota com superlike).
    const usageRef = doc(db, 'users', fromUid, 'replies', 'usage');
    const usageSnap = await getDoc(usageRef);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const usage = usageSnap.exists() ? (usageSnap.data() as ReplyUsage) : null;
    const isSameMonth = usage != null && usage.year === year && usage.month === month;

    if (isSameMonth && usage.count >= REPLY_LIMIT) {
      throw new ReplyQuotaExceededError();
    }

    const nextCount = isSameMonth ? usage.count + 1 : 1;

    const batch = writeBatch(db);
    batch.set(usageRef, { year, month, count: nextCount });
    batch.set(swipeRef, swipeData);
    await batch.commit();
  } else {
    await setDoc(swipeRef, swipeData);
  }

  // S57 — marca como decidido só depois do write ter dado certo (like, nope
  // OU superlike): o SwipeScreen usa isso pra reconciliar o deck sem refetch
  // quando o swipe é gravado a partir de outra tela (MatchProfileScreen).
  markSwiped(toUid);

  if (direction === 'nope') return false;

  // Check if other person already liked me → it's a match!
  const reverseSnap = await getDoc(doc(db, 'swipes', `${toUid}_${fromUid}`));
  if (reverseSnap.exists() && reverseSnap.data().direction !== 'nope') {
    const matchId = [fromUid, toUid].sort().join('_');
    await setDoc(doc(db, 'matches', matchId), {
      users: [fromUid, toUid],
      createdAt: serverTimestamp(),
    });
    return true; // it's a match!
  }
  return false;
};

export const undoSwipe = async (
  fromUid: string,
  toUid: string,
  isMatch: boolean,
): Promise<void> => {
  await deleteDoc(doc(db, 'swipes', `${fromUid}_${toUid}`));
  // S57 — desfaz a marca de sessão: sem isso, a reconciliação do SwipeScreen
  // continuaria filtrando esse perfil do deck mesmo depois do undo.
  unmarkSwiped(toUid);
  if (isMatch) {
    const matchId = [fromUid, toUid].sort().join('_');
    await deleteDoc(doc(db, 'matches', matchId));
  }
};

// ─── Matches ──────────────────────────────────────────────

export const getMatches = (uid: string, callback: (matches: Match[]) => void) => {
  const q = query(collection(db, 'matches'), where('users', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
    callback(matches);
  });
};

export const getMatchById = async (matchId: string): Promise<Match | null> => {
  const snap = await getDoc(doc(db, 'matches', matchId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Match) : null;
};

// ─── Messages ─────────────────────────────────────────────

export const sendMessage = async (
  matchId: string,
  senderId: string,
  text: string,
  imageUrl?: string,
  location?: { latitude: number; longitude: number },
  replyTo?: MessageReplyTo,
) => {
  const msgRef = collection(db, 'matches', matchId, 'messages');
  await addDoc(msgRef, {
    text,
    senderId,
    createdAt: serverTimestamp(),
    ...(imageUrl ? { imageUrl } : {}),
    ...(location ? { location } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
  // lastMessage do doc do match é escrito pela Cloud Function onMessageCreated
  // (Admin SDK), não aqui — ver firestore.rules e a interface LastMessage.
};

// S85-B — "apagar pros dois": vira lápide, nunca deleta o doc (a rule nega
// delete). deleteField() nos quatro campos de conteúdo faz o resultado bater
// com o hasOnly(['senderId','createdAt','deletedAt']) da rule; serverTimestamp()
// resolve pro request.time que a rule compara em deletedAt — mesmo padrão do
// lastSeenAt em usePresenceHeartbeat.ts. Guarda de autor/prazo/via-única mora
// só na rule; a tela já filtra antes de oferecer a opção (ver S85-B no
// ChatScreen.tsx), mas quem decide de verdade é o server.
export const deleteMessageForEveryone = async (matchId: string, messageId: string) => {
  await updateDoc(doc(db, 'matches', matchId, 'messages', messageId), {
    text: deleteField(),
    imageUrl: deleteField(),
    location: deleteField(),
    replyTo: deleteField(),
    deletedAt: serverTimestamp(),
  });
};

export const uploadChatImage = async (
  matchId: string,
  localUri: string,
  onProgress: (percent: number) => void,
): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `images/chats/${matchId}/${Date.now()}.jpg`);
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

export const listenMessages = (matchId: string, callback: (messages: Message[]) => void) => {
  const q = query(collection(db, 'matches', matchId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message);
    callback(messages);
  });
};

// ─── Reações (S80-A) ────────────────────────────────────────

// Precisa ficar em sincronia manual com a lista literal de firestore.rules
// (match /reactions/{messageId}, comentário "S80-A") — rules não importa
// nada do client, os dois lados são mantidos à mão.
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

// merge:true (não updateDoc) porque o doc matches/{matchId}/reactions/{messageId}
// pode não existir ainda — mesmo motivo do presence/{userId} (S79-C2-A).
// emoji null = remover a reação (traduzido pra deleteField() aqui dentro,
// o chamador não precisa importar nada de 'firebase/firestore').
export const setMessageReaction = async (
  matchId: string,
  messageId: string,
  uid: string,
  emoji: ReactionEmoji | null,
) => {
  await setDoc(
    doc(db, 'matches', matchId, 'reactions', messageId),
    { [uid]: emoji === null ? deleteField() : emoji },
    { merge: true },
  );
};

// S80-B — assina a COLEÇÃO inteira (um doc por mensagem), não um doc único
// como listenPresence/listenTypingStatus. callback recebe messageId -> (uid
// -> emoji), montado a partir de snap.docs (id do doc = messageId).
export const listenReactions = (
  matchId: string,
  callback: (reactions: Record<string, Record<string, ReactionEmoji>>) => void,
) => {
  return onSnapshot(
    collection(db, 'matches', matchId, 'reactions'),
    (snap) => {
      const reactions: Record<string, Record<string, ReactionEmoji>> = {};
      snap.docs.forEach((d) => {
        reactions[d.id] = d.data() as Record<string, ReactionEmoji>;
      });
      callback(reactions);
    },
    () => {
      // Mesmo motivo do listenPresence (S79-C2-B): se o match for desfeito
      // com o chat aberto, a regra de leitura de reactions passa a negar e
      // este onSnapshot estouraria sem este callback de erro. Reporta
      // ausência de reações em vez de propagar o erro pro chamador.
      callback({});
    },
  );
};

// ─── Apagar pra mim (S85-A) ──────────────────────────────────

// "Apagar pra mim": doc por usuário em matches/{matchId}/hidden/{uid}, campo
// messageIds (array) das mensagens que o dono escondeu na própria tela —
// client-side only, não apaga nem sinaliza a mensagem em si (ver
// firestore.rules) e não afeta o que o outro participante vê. Sem prazo, vale
// pra qualquer mensagem, inclusive recebidas; sem desfazer.
export const listenHiddenMessages = (
  matchId: string,
  uid: string,
  callback: (hiddenIds: string[]) => void,
) => {
  return onSnapshot(
    doc(db, 'matches', matchId, 'hidden', uid),
    (snap) => {
      const data = snap.data();
      callback(Array.isArray(data?.messageIds) ? (data.messageIds as string[]) : []);
    },
    () => {
      // Mesmo motivo do listenReactions/listenPresence: se o match for
      // desfeito com o chat aberto, a rule de leitura passa a negar e este
      // onSnapshot estouraria sem este callback. Reporta "nada escondido" em
      // vez de propagar o erro pro chamador.
      callback([]);
    },
  );
};

export const hideMessage = async (matchId: string, uid: string, messageId: string) => {
  await setDoc(
    doc(db, 'matches', matchId, 'hidden', uid),
    { messageIds: arrayUnion(messageId) },
    { merge: true },
  );
};

// ─── Leitura (badge de não lidas, S27) ──────────────────────

// Grava lastReadAt.{uid} no doc do match — cada participante só consegue
// escrever a própria chave (ver firestore.rules). Chamado pelo ChatScreen ao
// montar/focar e quando chega mensagem nova com a tela em foco.
export const markMatchRead = async (matchId: string, uid: string) => {
  await updateDoc(doc(db, 'matches', matchId), { [`lastReadAt.${uid}`]: serverTimestamp() });
};

// ─── Typing indicator ──────────────────────────────────────

// S79-C1 — janela de validade do carimbo de typing, aplicada como timer
// LOCAL no leitor (ver listenTypingStatus abaixo), não como comparação de
// idade contra o carimbo do servidor: comparar Date.now() do device com um
// Timestamp resolvido pelo servidor é sensível a desvio de relógio do
// aparelho, e um device atrasado reproduziria o "digitando..." eterno que
// esta sprint corrige. Um setTimeout local mede decorrido inteiramente no
// relógio do próprio device, então esse desvio deixa de importar.
export const TYPING_STALE_MS = 5000;

export const setTypingStatus = async (matchId: string, uid: string, isTyping: boolean) => {
  await updateDoc(doc(db, 'matches', matchId), {
    [`typing.${uid}`]: isTyping ? serverTimestamp() : deleteField(),
  });
};

export const listenTypingStatus = (
  matchId: string,
  currentUid: string,
  callback: (isTyping: boolean) => void,
) => {
  let lastStampMillis: number | null = null;
  let expireTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearPendingExpiry = () => {
    if (expireTimeout) {
      clearTimeout(expireTimeout);
      expireTimeout = null;
    }
  };

  const unsub = onSnapshot(doc(db, 'matches', matchId), (snap) => {
    const data = snap.data() as Match | undefined;
    const otherUid = data?.users?.find((u) => u !== currentUid);
    const stamp = otherUid ? data?.typing?.[otherUid] : undefined;

    // Checagem TEM que ser falsy (`!stamp`), não `=== undefined`: no
    // snapshot LOCAL de quem escreve, antes da confirmação do servidor,
    // serverTimestamp() resolve como `null` (não `undefined`) na leitura
    // otimista da própria mutação pendente. Trocar por `=== undefined`
    // deixaria esse `null` passar reto até `stamp.toMillis()` logo abaixo e
    // reintroduziria o crash que este guard existe pra evitar.
    if (!stamp) {
      // Chave ausente (nunca digitou, ou o cleanup/expiração já rodou):
      // corta qualquer timer pendente e reporta false na hora.
      lastStampMillis = null;
      clearPendingExpiry();
      callback(false);
      return;
    }

    const stampMillis = stamp.toMillis();

    // S79-C1 — só (re)agenda o timer quando o VALOR do carimbo muda em
    // relação ao snapshot anterior, nunca a cada snapshot. O doc do match
    // também é tocado por lastReadAt (leitura da conversa) e por
    // lastMessage (Cloud Function onMessageCreated a cada mensagem nova) —
    // qualquer um desses dispara este onSnapshot de novo com o MESMO
    // carimbo de typing de antes. Se reagendássemos o timer em todo
    // snapshot, um carimbo velho deixado por um client que morreu sem
    // limpar seria revalidado por qualquer mensagem nova subsequente —
    // "digitando..." eterno de volta, o bug exato que esta sprint corrige.
    if (stampMillis !== lastStampMillis) {
      lastStampMillis = stampMillis;
      clearPendingExpiry();
      callback(true);
      expireTimeout = setTimeout(() => callback(false), TYPING_STALE_MS);
    }
    // Falso positivo aceito: se o listener conecta com um carimbo já velho
    // na base (ex.: reabrir o chat), não há "lastStampMillis" anterior pra
    // comparar — este ramo dispara do mesmo jeito e mostra "digitando" por
    // até TYPING_STALE_MS antes de expirar sozinho. Auto-corrige, não
    // precisa de tratamento especial.
  });

  return () => {
    clearPendingExpiry();
    unsub();
  };
};

// ─── Presence (S79-C2-B) ────────────────────────────────────

export const listenPresence = (userId: string, callback: (lastSeenAt: Date | null) => void) => {
  return onSnapshot(
    doc(db, 'presence', userId),
    (snap) => {
      const data = snap.data() as { lastSeenAt?: Timestamp } | undefined;
      callback(data?.lastSeenAt ? data.lastSeenAt.toDate() : null);
    },
    () => {
      // Se o match for desfeito com o chat aberto, a regra de leitura de
      // presence passa a negar (deixa de existir match entre os dois uids)
      // e este onSnapshot estouraria sem este callback de erro. Reporta
      // ausência de presença em vez de propagar o erro pro chamador.
      callback(null);
    },
  );
};

// ─── Block status (S19) ─────────────────────────────────────

// S86 — reaproveita este onSnapshot em matches/{matchId} (já existente pro
// blockedBy) pra também entregar lastReadAt: doc já está sendo lido aqui,
// não há motivo pra um segundo listener só pra outro campo do mesmo doc.
export const listenMatchBlockStatus = (
  matchId: string,
  callback: (blockedBy: string[], lastReadAt: Record<string, Timestamp>) => void,
) => {
  return onSnapshot(doc(db, 'matches', matchId), (snap) => {
    const data = snap.data() as Match | undefined;
    callback(data?.blockedBy ?? [], data?.lastReadAt ?? {});
  });
};
