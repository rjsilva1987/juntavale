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
  limit,
  limitToLast,
  startAfter,
  startAt,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  arrayUnion,
  type DocumentData,
  type FieldValue,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { ADMIN_UIDS } from '@/config/admin';
import { LookingFor } from '@/constants/lookingFor';
import { AboutFieldId, AboutValues } from '@/constants/profileAbout';
import { REPLY_LIMIT } from '@/constants/reply';
import { SUPER_LIKE_LIMIT } from '@/constants/superLike';
import { UF } from '@/constants/ufs';
import { VALES, Vale } from '@/constants/vale';
import { db, functions, storage } from '@/services/firebase';
import { getDisplayAge } from '@/utils/birthDate';

// ─── Types ───────────────────────────────────────────────

export type Gender = 'masculino' | 'feminino' | 'outro';

export interface DiscoverFilters {
  ageMin: number;
  ageMax: number;
  uf: UF | 'all';
  gender: Gender[];
  lookingFor: LookingFor[];
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
  // S97 — "pausar perfil"/modo invisível. Ausente ou false = visível
  // (default, nenhum dos docs existentes tem o campo); true = some do
  // Descobrir e das curtidas (getDiscoverProfiles/useLikers/useMyLikes),
  // mas matches e conversas continuam normalmente (useActiveMatches não
  // filtra por isto). Filtro de VISIBILIDADE no client, não fronteira de
  // leitura — ver firestore.rules.
  paused?: boolean;
  // S104 — piloto do perfil estruturado: mapa livre, catálogo em
  // src/constants/profileAbout.ts (ABOUT_FIELDS). Ausente = perfil sem
  // nenhum campo do "Sobre mim" preenchido ainda (todo doc existente cai
  // aqui). Chaves de dentro do mapa NÃO são validadas nas rules de
  // propósito — ver firestore.rules (S104). Grava-se sempre o mapa
  // completo (updateDoc substitui o valor da chave `about` inteiro); usar
  // mergeAboutValues abaixo pra não apagar chaves não tocadas pelo save
  // atual. Só entra no hasOnly de UPDATE — conta nova nasce sem o campo.
  about?: AboutValues;
  // S109 — visibilidade por campo do `about`: ids (AboutFieldId) escondidos
  // do perfil público, os 13 campos do catálogo são igualmente escondíveis
  // (sem exceção — não existe `alwaysVisible`). Ausente ou [] = nada
  // escondido (default = tudo visível, doc legado já está correto sem
  // migração). Só entra no hasOnly de UPDATE, igual about — ver
  // firestore.rules (S109). Gravado como snapshot completo a cada save
  // (não é merge por chave como about — ver handleSave em ProfileScreen).
  aboutHidden?: AboutFieldId[];
  // S126 — Enquete no perfil: pergunta fixa + 2 a 4 opções de texto livre,
  // gravada pelo DONO via updateUserProfile (ver firestore.rules — só entra
  // no hasOnly do UPDATE, cadastro nunca nasce com enquete). Ausente = perfil
  // sem enquete. Ver src/constants/poll.ts pros tetos.
  poll?: { question: string; options: string[] };
  // S126 — mapa esparso de contagem por opção (chave = índice como string).
  // Escrito SÓ pela Cloud Function onPollVoteCreated (Admin SDK) — o client,
  // inclusive o dono, NUNCA grava este campo (ver firestore.rules: não entra
  // em hasOnly nenhum). Chave ausente = contagem zero pra aquela opção.
  pollCounts?: Record<string, number>;
  // S127 — Marcos e selos: contador de matches, incrementado SÓ pela Cloud
  // Function onMatchCreated (Admin SDK) — mesmo padrão Cloud-Function-only
  // de founderNumber/pollCounts acima; o client nunca escreve este campo
  // (ver firestore.rules: não entra em hasOnly nenhum). Ausente = 0 matches.
  // Usado só pra decidir o desbloqueio de achievements/firstMatch
  // (users/{uid}/achievements — ver functions/src/index.ts).
  matchesCount?: number;
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
// citação pula pra mensagem original (S129-A reverteu a decisão do S79).
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
  editedAt?: Timestamp; // S92 — presente só em mensagem editada
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

// S109 (correção, estreitada por auditoria) — Partial<UserProfile> puro
// barrava deleteField() em about/aboutHidden (FieldValue não é atribuível a
// AboutValues | AboutFieldId[]). UpdateData<UserProfile> (tentativa
// anterior) resolvia isso mas alargava TODA chave, inclusive obrigatórias
// como `name` — deleteField() num campo obrigatório passaria pelo tsc sem
// acusar nada. UserProfileUpdate alarga só as duas chaves que a sprint
// apaga; as outras continuam com o tipo estrito de Partial<UserProfile>.
// S126 — `poll` entra na mesma exceção de about/aboutHidden acima:
// handleRemovePoll (ProfileScreen) precisa gravar deleteField() nele.
type UserProfileUpdate = Partial<Omit<UserProfile, 'about' | 'aboutHidden' | 'poll'>> & {
  about?: AboutValues | FieldValue;
  aboutHidden?: AboutFieldId[] | FieldValue;
  poll?: { question: string; options: string[] } | FieldValue;
};

export const updateUserProfile = async (uid: string, data: UserProfileUpdate) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// S104 — updateUserProfile acima é updateDoc puro: gravar { about: { height:
// 180 } } SUBSTITUI o mapa `about` inteiro, apagando qualquer outra chave já
// salva (signo, e o que mais o catálogo ganhar nas próximas sprints). Molde
// do merge em memória: useFilters.ts:31-34/52-56 (mesmo problema, mesma
// solução, lá pro campo `filters`). Quem for salvar `about` PRECISA montar o
// patch com mergeAboutValues(profile?.about, novosValores) antes de chamar
// updateUserProfile — nunca gravar `{ about: novosValores }` direto.
// Limpar um campo = passar `undefined` pra chave dele no patch; o resultado
// OMITE a chave (nunca grava null/undefined em nenhuma chave do mapa).
export const mergeAboutValues = (
  current: AboutValues | undefined,
  patch: Partial<AboutValues>,
): AboutValues => {
  const merged: AboutValues = { ...(current ?? {}) };
  (Object.keys(patch) as AboutFieldId[]).forEach((key) => {
    const value = patch[key];
    if (value === undefined) {
      delete merged[key];
    } else {
      (merged as Record<AboutFieldId, NonNullable<AboutValues[AboutFieldId]>>)[key] = value;
    }
  });
  return merged;
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
  // S115 — nenhum dos admins (ADMIN_UIDS) aparece no Descobrir, mesmo sem
  // bloqueio/swipe prévio.
  swipedIds.push(currentUid, ...ADMIN_UIDS, ...(blockedUsers ?? []));

  // Fetch all users not yet swiped (Firestore doesn't support NOT IN > 10 easily,
  // so for production use a Cloud Function or pagination). Age/gender/UF
  // filters are applied client-side here for the same reason — descoberta
  // agora é nacional (S44), sem geo-query.
  const usersSnap = await getDocs(collection(db, 'users'));
  const profiles: UserProfile[] = [];
  usersSnap.forEach((d) => {
    if (swipedIds.includes(d.id)) return;
    const candidate = d.data() as UserProfile;

    // S97 — perfil pausado nunca aparece no Descobrir. Mesmo molde dos
    // filtros em memória abaixo (não o do ADMIN_UID via swipedIds, que é
    // por uid fixo) — roda incondicionalmente, mesmo sem `filters`.
    if (candidate.paused) return;

    if (filters) {
      // S76-B2 — idade derivada, não o campo gravado: o filtro roda em
      // MEMÓRIA (getDocs sem where, ver comentário acima), então dá pra
      // calcular aqui mesmo. Candidato sem idade calculável é EXCLUÍDO
      // quando há filtro, seguindo o precedente de `uf` logo abaixo.
      const candidateAge = getDisplayAge(candidate);
      if (candidateAge == null || candidateAge < filters.ageMin || candidateAge > filters.ageMax)
        return;
      // S90 — multi-selecao: inerte quando nada esta marcado (= todos). Nao
      // precisa do "< total" do vale porque genero nao tem o problema de
      // "todos marcados = ninguem" que o vale tinha: aqui lista vazia ja
      // significa todos, e marcar todos os generos da no mesmo. Candidato sem
      // genero (undefined) NAO casa nenhum includes, entao so aparece com a
      // lista vazia — comportamento aceito (as contas sem genero sao dado a
      // limpar, nao bug do filtro).
      if (filters.gender.length > 0 && !filters.gender.includes(candidate.gender)) return;
      if (filters.lookingFor.length > 0 && !filters.lookingFor.includes(candidate.lookingFor))
        return;
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

// S128 — data (UTC) do último grant diário grátis consumido. Doc irmão do
// SuperLikeUsage acima (mesma coleção, outro id): se não existe, ou a data
// guardada é diferente de hoje, o grant de hoje ainda não foi usado. Não tem
// contador — é só a data, comparada em recordSwipe (client) e nas rules
// (getAfter/get, mesmo padrão do usage).
interface SuperLikeDailyGrant {
  year: number;
  month: number;
  day: number;
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
    // S128 — grant diário grátis (users/{uid}/superLikes/dailyGrant), doc
    // irmão do usage acima: lido em paralelo, mesmo padrão de leitura.
    const dailyGrantRef = doc(db, 'users', fromUid, 'superLikes', 'dailyGrant');
    const [usageSnap, dailyGrantSnap] = await Promise.all([
      getDoc(usageRef),
      getDoc(dailyGrantRef),
    ]);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    const dailyGrant = dailyGrantSnap.exists()
      ? (dailyGrantSnap.data() as SuperLikeDailyGrant)
      : null;
    const isGrantUsedToday =
      dailyGrant != null &&
      dailyGrant.year === year &&
      dailyGrant.month === month &&
      dailyGrant.day === day;

    const batch = writeBatch(db);

    if (!isGrantUsedToday) {
      // Primeira super curtida do dia UTC: consome o grant grátis, NÃO
      // toca em usageRef — não conta pra cota mensal.
      batch.set(dailyGrantRef, { year, month, day });
      batch.set(swipeRef, swipeData);
      await batch.commit();
    } else {
      // Grant de hoje já usado: comportamento mensal existente, inalterado.
      const usage = usageSnap.exists() ? (usageSnap.data() as SuperLikeUsage) : null;
      const isSameMonth = usage != null && usage.year === year && usage.month === month;

      if (isSameMonth && usage.count >= SUPER_LIKE_LIMIT) {
        throw new SuperLikeQuotaExceededError();
      }

      const nextCount = isSameMonth ? usage.count + 1 : 1;

      batch.set(usageRef, { year, month, count: nextCount });
      batch.set(swipeRef, swipeData);
      await batch.commit();
    }
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

// ─── Enquete no perfil (S126) ─────────────────────────────
//
// Pipeline independente de swipes/matches: responder à enquete não exige
// curtida, não toca em `swipes/`, `recordSwipe` nem no pipeline de match.
// Um voto por par dono/visitante, em users/{ownerUid}/pollVotes/{voterUid},
// create-only (rules negam update) — ver firestore.rules.

export const getMyPollVote = async (ownerUid: string, voterUid: string): Promise<number | null> => {
  const snap = await getDoc(doc(db, 'users', ownerUid, 'pollVotes', voterUid));
  return snap.exists() ? (snap.data().optionIndex as number) : null;
};

// setDoc sem merge: se o doc já existir (corrida — voto em outro
// aparelho/tela ao mesmo tempo), as rules negam o update (allow update: if
// false) e a Promise rejeita com permission-denied. Isso é ESPERADO, não é
// bug — o chamador (SwipeScreen.handleVotePoll) trata como "já votou", nunca
// como Alert genérico de erro (mesmo espírito da armadilha do
// permission-denied em match apagado, S102-B).
export const castPollVote = async (
  ownerUid: string,
  voterUid: string,
  optionIndex: number,
): Promise<void> => {
  await setDoc(doc(db, 'users', ownerUid, 'pollVotes', voterUid), {
    optionIndex,
    createdAt: serverTimestamp(),
  });
};

// ─── Curtir foto (S123) ─────────────────────────────────────
//
// Pós-match apenas (MatchProfileScreen, !isPreview) — a UI decide isso, não
// este service. Chave da foto é a própria URL (NÃO migra o schema
// `photos: string[]` do perfil). Toggle: users/{ownerUid}/photoLikes/{likeId},
// likeId determinístico via photoLikeId abaixo — permite setDoc/deleteDoc
// diretos, sem query prévia. Ver firestore.rules pro create/delete.

const photoLikeId = (likerUid: string, photoUrl: string): string =>
  `${likerUid}_${encodeURIComponent(photoUrl)}`;

// setDoc sem merge: se o doc já existir (corrida — like em outro
// aparelho/tela ao mesmo tempo), as rules negam o create (ele não é um
// "recreate", é sempre create do ponto de vista das rules) e a Promise
// rejeita com permission-denied. Isso é ESPERADO, não é bug — mesmo espírito
// do comentário em castPollVote acima (a decisão de tratar isso na UI fica
// pro chamador, MatchProfileScreen.handleTogglePhotoLike).
export const likePhoto = async (
  ownerUid: string,
  likerUid: string,
  photoUrl: string,
): Promise<void> => {
  await setDoc(doc(db, 'users', ownerUid, 'photoLikes', photoLikeId(likerUid, photoUrl)), {
    photoUrl,
    likerUid,
    createdAt: serverTimestamp(),
  });
};

export const unlikePhoto = async (
  ownerUid: string,
  likerUid: string,
  photoUrl: string,
): Promise<void> => {
  await deleteDoc(doc(db, 'users', ownerUid, 'photoLikes', photoLikeId(likerUid, photoUrl)));
};

export const getPhotoLikes = async (
  ownerUid: string,
): Promise<{ photoUrl: string; likerUid: string }[]> => {
  const snap = await getDocs(collection(db, 'users', ownerUid, 'photoLikes'));
  return snap.docs.map((d) => ({
    photoUrl: d.data().photoUrl as string,
    likerUid: d.data().likerUid as string,
  }));
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

// S102-B — desfaz um match definitivamente (Cloud Function apaga o doc, as
// subcoleções e as imagens de chat no Storage; ver functions/src/index.ts).
export const unmatch = async (matchId: string): Promise<void> => {
  const call = httpsCallable(functions, 'unmatch');
  await call({ matchId });
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
//
// S85-C1 — imageUrl opcional: quando a mensagem apagada é foto, apaga o
// arquivo no Storage DEPOIS do updateDoc, nunca antes. updateDoc primeiro:
// se a rule negar o update (fora do prazo, não é o autor, já apagada), o
// arquivo tem que continuar existindo — a mensagem sobrevive intacta e não
// pode passar a apontar pra um arquivo inexistente (imagem quebrada nos
// dois aparelhos). imageUrl aqui é só o PARÂMETRO em memória, não o campo do
// doc: o deleteField() no updateDoc não afeta essa variável local, não há
// referência que se perca por rodar depois. Pior caso com a ordem
// atual: updateDoc funciona e o deleteObject falha — arquivo órfão no
// Storage, mesmo custo (só armazenamento) que o comentário do removePhoto
// já registra, nunca um doc apontando pro nada.
export const deleteMessageForEveryone = async (
  matchId: string,
  messageId: string,
  imageUrl?: string,
) => {
  await updateDoc(doc(db, 'matches', matchId, 'messages', messageId), {
    text: deleteField(),
    imageUrl: deleteField(),
    location: deleteField(),
    replyTo: deleteField(),
    // S92 — remove editedAt se a mensagem já foi editada; sem isso o
    // hasOnly do ramo de edição da rule quebra pra toda mensagem que já
    // tenha sido editada (tentaria gravar deletedAt + editedAt no resultado).
    editedAt: deleteField(),
    deletedAt: serverTimestamp(),
  });
  if (imageUrl) {
    await deleteObject(ref(storage, imageUrl)).catch(() => {});
  }
};

export const editMessage = async (matchId: string, messageId: string, text: string) => {
  await updateDoc(doc(db, 'matches', matchId, 'messages', messageId), {
    text,
    editedAt: serverTimestamp(),
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

// ─── Paginação de mensagens (S101) ──────────────────────────

// Tamanho de página do chat (decisão de produto do S101): a janela inicial
// carrega 30 mensagens — e MAIS que isso quando há mais de 30 não lidas (30 é
// piso, não teto; ver getInitialMessageWindow). "Carregar mais" traz 30 por
// toque.
export const MESSAGE_PAGE_SIZE = 30;

// Cursor de paginação: o DocumentSnapshot cru da mensagem mais ANTIGA já
// carregada (startAfter precisa do snapshot, não do id/valor). Exportado como
// alias pra ChatScreen guardar isso em estado sem importar nada de
// 'firebase/firestore'.
export type MessageCursor = QueryDocumentSnapshot<DocumentData>;

// Janela inicial do chat: `cursor` é a mensagem mais antiga dessa janela — é
// ELE (o snapshot) que abre o onSnapshot em tempo real (startAt, ver
// buildMessagesQuery) e também o ponto de partida do "carregar mais";
// `hasMore` diz se existe algo antes dele. `since` é o createdAt desse mesmo
// doc, usado só internamente por getInitialMessageWindow pra comparar os dois
// candidatos a corte (página recente x não lida mais antiga) — NÃO é filtro do
// listener.
export interface MessageWindow {
  since: Timestamp | null;
  cursor: MessageCursor | null;
  hasMore: boolean;
}

// Página avulsa de histórico antigo (getDocs, SEM tempo real).
export interface MessagePage {
  messages: Message[];
  cursor: MessageCursor | null;
  hasMore: boolean;
}

const messagesCollection = (matchId: string) => collection(db, 'matches', matchId, 'messages');

const toMessage = (d: QueryDocumentSnapshot<DocumentData>): Message =>
  ({ id: d.id, ...d.data() }) as Message;

// createdAt vem null enquanto o serverTimestamp() da mensagem recém-enviada
// não resolveu no servidor (mesmo caso tratado em isMatchUnread/utils/matches).
// Um doc assim nunca serve de corte/cursor — daí o null explícito.
const messageCreatedAt = (d: QueryDocumentSnapshot<DocumentData>): Timestamp | null => {
  const value = d.data().createdAt;
  return value instanceof Timestamp ? value : null;
};

// Lê lastReadAt.{uid} do doc do match SEM escrever nada (markMatchRead é o
// único ponto de escrita e não muda nesta sprint).
//
// serverTimestamps: 'previous' é obrigatório aqui: o useFocusEffect do
// ChatScreen dispara markMatchRead() na montagem, ANTES deste getDoc resolver,
// e a mutação local pendente sobrepõe lastReadAt.{uid} com um serverTimestamp
// não resolvido — com o default ('none') este read devolveria null e a janela
// inicial perderia as não lidas. 'previous' devolve justamente o último valor
// confirmado do campo, que é a âncora que queremos.
export const getMatchLastReadAt = async (
  matchId: string,
  uid: string,
): Promise<Timestamp | null> => {
  const snap = await getDoc(doc(db, 'matches', matchId));
  const data = snap.data({ serverTimestamps: 'previous' }) as Match | undefined;
  const value = data?.lastReadAt?.[uid];
  return value instanceof Timestamp ? value : null;
};

// Descobre o corte da janela inicial sem baixar o histórico inteiro:
//   1) as MESSAGE_PAGE_SIZE mensagens mais recentes (desc + limit), +1 doc só
//      pra saber se existe algo mais antigo;
//   2) se há lastReadAt, a mensagem NÃO LIDA mais antiga (createdAt >
//      lastReadAt, asc, limit 1 — desigualdade em campo único, indexado
//      automaticamente; nada de filtro por senderId, que exigiria índice
//      composto).
// Se a não lida mais antiga for anterior à página recente, o corte desce até
// ela: a primeira carga cobre TODAS as não lidas mesmo que sejam 45+.
//
// lastReadAt ausente (chat nunca aberto, sem âncora) não estica a janela —
// sem valor pra comparar não existe a query de não lidas, e esticar até o
// começo seria exatamente o "fetch do histórico inteiro" que o S101 remove.
export const getInitialMessageWindow = async (
  matchId: string,
  lastReadAt?: Timestamp | null,
): Promise<MessageWindow> => {
  const col = messagesCollection(matchId);
  const recentSnap = await getDocs(
    query(col, orderBy('createdAt', 'desc'), limit(MESSAGE_PAGE_SIZE + 1)),
  );
  const recentDocs = recentSnap.docs.slice(0, MESSAGE_PAGE_SIZE);
  const oldestRecent = recentDocs[recentDocs.length - 1];
  const oldestRecentAt = oldestRecent ? messageCreatedAt(oldestRecent) : null;
  // Chat vazio (ou só com mensagem local ainda sem createdAt): sem corte, o
  // listener assina a coleção inteira — que é vazia ou quase.
  if (!oldestRecent || !oldestRecentAt) return { since: null, cursor: null, hasMore: false };

  let cursor = oldestRecent;
  let since = oldestRecentAt;
  let hasMore = recentSnap.size > MESSAGE_PAGE_SIZE;

  if (lastReadAt) {
    const unreadSnap = await getDocs(
      query(col, where('createdAt', '>', lastReadAt), orderBy('createdAt', 'asc'), limit(1)),
    );
    const oldestUnread = unreadSnap.docs[0];
    const oldestUnreadAt = oldestUnread ? messageCreatedAt(oldestUnread) : null;
    if (oldestUnread && oldestUnreadAt && oldestUnreadAt.toMillis() < since.toMillis()) {
      cursor = oldestUnread;
      since = oldestUnreadAt;
      // A checagem de "existe algo mais antigo" da página recente não vale
      // mais pro corte esticado: 1 doc de leitura resolve.
      const olderSnap = await getDocs(
        query(col, where('createdAt', '<', since), orderBy('createdAt', 'desc'), limit(1)),
      );
      hasMore = !olderSnap.empty;
    }
  }

  return { since, cursor, hasMore };
};

// Query da janela em tempo real. DOIS ramos mutuamente exclusivos — nunca
// startAt + limitToLast na mesma query, e orderBy('createdAt','asc') nos dois
// (limitToLast SEM orderBy lança em runtime; o tsc não pega isso):
//
//   1) COM cursor: startAt(snapshot), cursor de paginação — NUNCA
//      where('createdAt','>=',...). O where usa FieldFilter.matches, que exige
//      o mesmo typeOrder do valor; uma mensagem recém-enviada tem
//      serverTimestamp() PENDENTE (typeOrder 4) e não casa com um Timestamp
//      concreto (typeOrder 3), então o eco otimista do próprio envio sumiria
//      da lista até o ack do servidor (e nunca apareceria offline). Cursor usa
//      Bound/valueCompare, que compara typeOrder numericamente: o doc pendente
//      ordena DEPOIS do cursor e entra normalmente no fim da lista ascendente.
//   2) SEM cursor (chat nunca aberto, ou falha/offline ao montar a janela
//      inicial): limitToLast(MESSAGE_PAGE_SIZE) — as 30 mais recentes. Nunca
//      sem limite algum, que é justamente o que o S101 existe pra remover.
const buildMessagesQuery = (
  col: ReturnType<typeof messagesCollection>,
  cursor?: MessageCursor | null,
) =>
  cursor
    ? query(col, orderBy('createdAt', 'asc'), startAt(cursor))
    : query(col, orderBy('createdAt', 'asc'), limitToLast(MESSAGE_PAGE_SIZE));

// Tempo real APENAS na janela final. O corte é o CURSOR (o QueryDocumentSnapshot
// da mensagem mais antiga da janela, produzido por getInitialMessageWindow /
// loadOlderMessages), não um Timestamp isolado — ver buildMessagesQuery.
export const listenMessages = (
  matchId: string,
  callback: (messages: Message[]) => void,
  cursor?: MessageCursor | null,
) => {
  const q = buildMessagesQuery(messagesCollection(matchId), cursor);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(toMessage));
  });
};

// Página anterior sob demanda: getDocs + startAfter(cursor), SEM listener (o
// histórico antigo não precisa de tempo real). Devolve em ordem crescente,
// pronta pra ser prefixada na lista. O +1 no limit é só pra saber se ainda há
// página seguinte sem gastar um toque do usuário pra descobrir.
export const loadOlderMessages = async (
  matchId: string,
  cursor: MessageCursor,
): Promise<MessagePage> => {
  const snap = await getDocs(
    query(
      messagesCollection(matchId),
      orderBy('createdAt', 'desc'),
      startAfter(cursor),
      limit(MESSAGE_PAGE_SIZE + 1),
    ),
  );
  const docs = snap.docs.slice(0, MESSAGE_PAGE_SIZE);
  return {
    messages: docs.map(toMessage).reverse(),
    cursor: docs[docs.length - 1] ?? null,
    hasMore: snap.size > MESSAGE_PAGE_SIZE,
  };
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
