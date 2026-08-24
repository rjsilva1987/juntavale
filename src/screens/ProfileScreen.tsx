// src/screens/ProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { deleteField } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Switch,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AboutPicker } from '@/components/AboutPicker';
import { AboutRow } from '@/components/AboutRow';
import { AboutVisibilityModal } from '@/components/AboutVisibilityModal';
import { AchievementsCard } from '@/components/AchievementsCard';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { FounderBadge } from '@/components/FounderBadge';
import { PollEditModal } from '@/components/PollEditModal';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { UfPicker } from '@/components/UfPicker';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { isAdminUid } from '@/config/admin';
import { LOOKING_FOR_LABELS, LOOKING_FOR_OPTIONS, LookingFor } from '@/constants/lookingFor';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import {
  ABOUT_FIELDS,
  ABOUT_GROUPS,
  ABOUT_GROUP_LABELS,
  coerceAboutValue,
  formatAboutFieldValue,
  getAboutField,
  type AboutFieldId,
  type AboutFieldMulti,
  type AboutValues,
} from '@/constants/profileAbout';
import {
  PROMPTS_CATALOG,
  MAX_PROMPTS,
  MAX_ANSWER_LENGTH,
  getPromptText,
  getWeeklyPrompt,
  type PromptId,
  type WeeklyPromptId,
} from '@/constants/prompts';
import { theme } from '@/constants/theme';
import { UF } from '@/constants/ufs';
import { VALE_LABELS } from '@/constants/vale';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAlert } from '@/contexts/ReportAlertContext';
import { useSupportAlert } from '@/contexts/SupportAlertContext';
import { useVerificationAlert } from '@/contexts/VerificationAlertContext';
import { useActiveMatches, MatchWithProfile } from '@/hooks/useActiveMatches';
import { useLikers } from '@/hooks/useLikers';
import { RootStackParamList } from '@/navigation';
import {
  updateUserProfile,
  addProfilePhoto,
  createLegalName,
  getLegalName,
  mergeAboutValues,
  removeProfilePhoto,
  removeWeeklyPromptAnswer,
  setPrincipalPhoto,
  updateLegalName,
  uploadProfilePhoto,
  LegalName,
  MAX_PROFILE_PHOTOS,
  Gender,
} from '@/services/firestoreService';
import { getDisplayAge } from '@/utils/birthDate';
import { getDisplayName } from '@/utils/profile';
import { countCodePoints } from '@/utils/text';

// Ambas contam o mesmo array de matches visíveis hoje (todo match é uma
// conversa no modelo atual), mas ficam como funções separadas de propósito:
// se "Conversas" um dia passar a significar só conversas com mensagem real
// (fora o placeholder inicial "Digam olá"), o filtro entra só aqui, sem
// mexer em countActiveMatches nem no card "Matches".
const countActiveMatches = (matches: MatchWithProfile[]): number => matches.length;
const countActiveConversations = (matches: MatchWithProfile[]): number => matches.length;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Masculino', value: 'masculino' },
  { label: 'Feminino', value: 'feminino' },
  { label: 'Outro', value: 'outro' },
];

const INTERESTS = [
  'Investimentos',
  'Poupança',
  'Viagens',
  'Gastronomia',
  'Esportes',
  'Tecnologia',
  'Arte',
  'Música',
  'Cinema',
  'Leitura',
  'Pets',
  'Fitness',
];

// S48 — "Meus lugares" e "No meu radar": texto livre, sem catálogo (ver
// TagEditor abaixo). Limites batem com firestore.rules (isValidProfile):
// tamanho de lista validado no servidor, tamanho de cada tag só no client.
const MAX_PLACES = 5;
const MAX_EVENTS = 3;
const MAX_PLACE_LENGTH = 40;
const MAX_EVENT_LENGTH = 60;
const MIN_TAG_LENGTH = 2;

// S77 — nome/bio nunca tiveram teto no client (só nas rules, isValidProfile:
// name<=60, bio<=500) — bug separado achado na recon, corrigido aqui. Os
// números batem com o que as rules JÁ exigiam antes desta sprint (agora
// viram só o "guarda de abuso" 4x maior — ver firestore.rules).
const MAX_NAME_LENGTH = 60;
const MAX_BIO_LENGTH = 500;
// S135 — cap curto de propósito: nickname é o nome público exibido em
// card/cabeçalho, e é justamente o campo que a S134 corrigiu pra não
// truncar — um teto generoso feito reintroduziria o mesmo problema. Nome
// completo (legalName) segue com o teto herdado de MAX_NAME_LENGTH acima.
const MAX_NICKNAME_LENGTH = 30;

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, profile, logout, refreshProfile } = useAuth();
  const isAdmin = isAdminUid(user?.uid);
  // S78 — mesmo hook do badge da tab bar (navigation/index.tsx); aqui vira
  // o pontinho na linha de verificação, não o badge da aba.
  const { showAlert: showVerificationAlert } = useVerificationAlert();
  const { showAlert: showSupportAlert } = useSupportAlert();
  const { showAlert: showReportAlert } = useReportAlert();
  const [editing, setEditing] = useState(false);
  // S135 — "como quer ser chamado", nome público exibido em card/cabeçalho.
  // Fallback pro `name` legado: conta que ainda não passou pela migração
  // (functions/scripts/migrateNicknames.js) não tem nickname no doc ainda.
  const [nickname, setNickname] = useState(profile?.nickname ?? profile?.name ?? '');
  // S135 — nome real/completo, agora privado (users/{uid}/private/
  // legalName). Não vem no profile (doc público) — busca própria via
  // getLegalName, disparada pelo useEffect abaixo. null enquanto ainda não
  // carregou OU quando a conta é legada e ainda não tem o subdocumento.
  const [legalName, setLegalName] = useState<LegalName | null>(null);
  const [legalNameInput, setLegalNameInput] = useState('');
  useEffect(() => {
    if (!user) return;
    getLegalName(user.uid)
      .then((result) => {
        setLegalName(result);
        setLegalNameInput(result?.name ?? '');
      })
      .catch((err) => {
        // S135 (correção pós-auditoria) — falha aqui (offline/erro
        // transitório) não pode deixar o campo "Nome completo" indistinguível
        // de conta sem legalName: loga e mantém legalName null, mesmo estado
        // de antes da tentativa — handleSave trata null como "ainda não
        // existe" (createLegalName), que é o comportamento seguro.
        console.error('[ProfileScreen] getLegalName falhou:', err);
      });
  }, [user]);
  // S76-B2 — a idade não é mais digitada: sai do birthDate via helper.
  const displayAge = getDisplayAge(profile);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [places, setPlaces] = useState<string[]>(profile?.places ?? []);
  const [events, setEvents] = useState<string[]>(profile?.events ?? []);
  const [gender, setGender] = useState<Gender | undefined>(profile?.gender);
  // S44 — contas legadas sem uf conseguem definir pela 1ª vez aqui; uma vez
  // setado, não há botão de "limpar" (só troca entre as 27), então nunca
  // fica vazio de novo depois de definido.
  const [uf, setUf] = useState<UF | undefined>(profile?.uf);
  // S56 — mesmo padrão de uf acima: contas legadas sem lookingFor conseguem
  // definir pela 1ª vez aqui; uma vez setado, só troca entre as 4 opções
  // (rules não permitem remover depois de definido).
  const [lookingFor, setLookingFor] = useState<LookingFor | undefined>(profile?.lookingFor);
  // S104/S105 — piloto do perfil estruturado: mapa `about`, catálogo em
  // src/constants/profileAbout.ts (ABOUT_FIELDS). UM estado com os valores
  // de todos os campos do catálogo (values) e UM com o id do campo aberto
  // no seletor (openField) — nenhum estado por campo, pra um campo novo no
  // catálogo não exigir estado novo aqui. Salvos junto no mesmo handleSave,
  // mas o payload final passa por mergeAboutValues antes de gravar (ver
  // abaixo), porque updateUserProfile é updateDoc puro e substituiria o
  // mapa `about` inteiro se mandássemos só os campos tocados nesta edição.
  // S112 — hidratação passa por coerceAboutValue campo a campo: um doc que
  // gravou `about.pets` como STRING (de quando o campo era `single`) tem
  // que virar `[string]` aqui, senão o campo aparenta estar vazio pro
  // resto da tela (achado do recon S112). Mesmo cast de mergeAboutValues
  // (firestoreService.ts) pro TS aceitar escrever um valor cujo tipo só se
  // sabe por campo, não pelo union `AboutFieldId` genérico do laço.
  const [aboutValues, setAboutValues] = useState<AboutValues>(() => {
    const raw = profile?.about;
    const initial: AboutValues = {};
    ABOUT_FIELDS.forEach((field) => {
      const value = coerceAboutValue(field, raw?.[field.id]);
      if (value !== undefined) {
        (initial as Record<AboutFieldId, NonNullable<AboutValues[AboutFieldId]>>)[field.id] =
          value as NonNullable<AboutValues[AboutFieldId]>;
      }
    });
    return initial;
  });
  const [openAboutField, setOpenAboutField] = useState<AboutFieldId | null>(null);
  // S109 — visibilidade por campo do `about`: snapshot completo (não merge
  // por chave como aboutValues acima) — cada save grava a lista inteira de
  // escondidos, então não precisa reconciliar com o profile atual como
  // mergeAboutValues faz. Editado só pelo AboutVisibilityModal (ver render).
  const [aboutHidden, setAboutHidden] = useState<AboutFieldId[]>(profile?.aboutHidden ?? []);
  const [visibilityModalVisible, setVisibilityModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoActionPending, setPhotoActionPending] = useState(false);
  const [reengagementSaving, setReengagementSaving] = useState(false);
  const [pausedSaving, setPausedSaving] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // Prompts (S33) — editados via modais próprios, fora do form de
  // nome/idade/bio/gênero/interesses acima. Sempre grava o array completo
  // (substituição, não merge por item), reaproveitando updateUserProfile.
  const userPrompts = profile?.prompts ?? [];
  const [catalogModalVisible, setCatalogModalVisible] = useState(false);
  const [answerModalVisible, setAnswerModalVisible] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<PromptId | WeeklyPromptId | null>(null);
  // S59 — distingue os dois caminhos de escrita/remoção do mesmo modal:
  // true ⇒ editingPromptId se refere ao slot único weeklyPromptAnswer; false
  // ⇒ se refere a um item de prompts[] (catálogo normal OU, no caso de
  // contas legadas, um wXX que ficou preso no array de antes do S59 — esse
  // continua tratado como item comum do array, nunca do campo novo).
  const [editingWeeklySlot, setEditingWeeklySlot] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  // S126 — Enquete no perfil: modal próprio (PollEditModal), independente do
  // fluxo de catálogo/resposta de prompts acima (é uma única enquete, não
  // uma lista com catálogo).
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [pollSaving, setPollSaving] = useState(false);

  // Prompt da semana (S59) — campo próprio `weeklyPromptAnswer`, fora de
  // prompts[]. weeklyPromptEntry só existe quando o id salvo bate com o da
  // semana vigente (getWeeklyPrompt) — usado pro bloco "responder/editar
  // esta semana" (topo do card) e pra prefill do modal em openWeeklyPrompt;
  // nos dois casos o significado "é a resposta da semana vigente" continua
  // correto, porque o modal só é aberto a partir desse bloco (nunca a partir
  // do bloco de resposta expirada abaixo — ver 2.3 no relatório do S61).
  const currentWeeklyPrompt = getWeeklyPrompt(new Date());
  const weeklyPromptEntry =
    profile?.weeklyPromptAnswer?.id === currentWeeklyPrompt.id
      ? profile.weeklyPromptAnswer
      : undefined;
  // S61 — resposta guardada de uma semana ANTERIOR à vigente. Continua
  // pública (SwipeScreen/MatchProfileScreen exibem normalmente, sem mudança
  // nenhuma nelas — ver relatório): antes desta sprint, o dono via essa
  // situação como "não respondido" e perdia o botão de remover assim que a
  // semana virava, sem conseguir nem ver nem apagar o que os outros viam.
  // Exibida à parte no card (bloco próprio, somente leitura + remover — não
  // abre o modal de edição, que só entende o slot da semana vigente).
  const staleWeeklyAnswer =
    profile?.weeklyPromptAnswer && profile.weeklyPromptAnswer.id !== currentWeeklyPrompt.id
      ? profile.weeklyPromptAnswer
      : undefined;

  // Card "Curtidas" — mesma query de LikesScreen, via hook compartilhado.
  const { likers, loading: likersLoading } = useLikers();

  // Cards "Matches" e "Conversas" — mesmo hook usado em MatchesScreen, só
  // que aqui só usamos as contagens, não a lista.
  const { matches: activeMatches, loading: matchesLoading } = useActiveMatches();
  const matchesCount = countActiveMatches(activeMatches);
  const conversasCount = countActiveConversations(activeMatches);

  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item)
        ? prev.filter((i) => i !== item)
        : prev.length < 5
          ? [...prev, item]
          : prev,
    );
  };

  const handleSave = async () => {
    if (!user) return;
    if (!gender) {
      Alert.alert('Gênero obrigatório', 'Selecione uma opção de gênero antes de salvar.');
      return;
    }
    // S77 — nome/bio nunca tiveram teto no client (bug separado, ver
    // recon); sem isso, um texto que passasse do teto das rules só falhava
    // no save com erro genérico, sem dizer o motivo.
    // S135 — dois campos, dois tetos: nickname (público, curto de propósito)
    // e legalName/nome completo (privado, mesmo teto que `name` já tinha).
    if (countCodePoints(nickname) > MAX_NICKNAME_LENGTH) {
      Alert.alert(
        'Apelido muito longo',
        `O apelido pode ter no máximo ${MAX_NICKNAME_LENGTH} caracteres.`,
      );
      return;
    }
    if (countCodePoints(legalNameInput) > MAX_NAME_LENGTH) {
      Alert.alert('Nome muito longo', `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.`);
      return;
    }
    if (countCodePoints(bio) > MAX_BIO_LENGTH) {
      Alert.alert('Bio muito longa', `A bio pode ter no máximo ${MAX_BIO_LENGTH} caracteres.`);
      return;
    }
    setSaving(true);
    try {
      // S104/S105 — merge em memória com o `about` atual do profile antes
      // de gravar (mergeAboutValues), nunca `{ about: aboutValues }`
      // direto: updateUserProfile é updateDoc puro, substituiria o mapa
      // inteiro e apagaria qualquer chave que um catálogo futuro já tenha
      // gravado ali. aboutValues já tem o formato Partial<AboutValues> que
      // mergeAboutValues espera — nenhum campo listado à mão aqui.
      const mergedAbout = mergeAboutValues(profile?.about, aboutValues);
      // S109 (correção, simétrica ao aboutHidden logo abaixo) — mapa vazio
      // (todo campo do `about` zerado nesta edição) NÃO pode ser omitido do
      // payload: updateUserProfile é updateDoc puro, só toca chaves
      // presentes — omitir preservaria o mapa antigo no Firestore pra
      // sempre (mesmo mecanismo do bug do aboutHidden, achado por
      // rastreamento no relatório da correção anterior). deleteField()
      // apaga a chave de vez; mesmo padrão de removeWeeklyPromptAnswer
      // (firestoreService.ts). Perfil que nunca teve `about` continua sem
      // ruído: deleteField() numa chave que já não existe no doc é no-op.
      const aboutPatch = Object.keys(mergedAbout).length > 0 ? mergedAbout : deleteField();
      // S109 (correção) — array vazio (nada escondido) NÃO pode ser
      // omitido do payload, mesmo mecanismo e mesma correção do about
      // acima: deleteField() no lugar da chave ausente. Snapshot completo,
      // não merge — aboutHidden é só editado pelo AboutVisibilityModal,
      // nunca pelos AboutRow acima.
      const aboutHiddenPatch = aboutHidden.length > 0 ? aboutHidden : deleteField();
      await updateUserProfile(user.uid, {
        nickname,
        // S76-B2 — grava a idade DERIVADA, não um número digitado. Salvar o
        // perfil assim reconcilia de quebra o `age` armazenado, que o build
        // antigo ainda lê direto. O fallback existe pra conta sem birthDate:
        // nesse caso getDisplayAge devolve o próprio age gravado e a
        // gravação é um no-op, em vez de mandar undefined e quebrar o
        // isValidProfile.
        age: displayAge ?? profile?.age ?? 0,
        bio,
        interests,
        places,
        events,
        gender,
        // Omitido quando ainda indefinido (conta legada que não escolheu um
        // estado nesta edição) — Firestore rejeita valor `undefined` num
        // update, e as rules toleram a chave ausente igual antes.
        ...(uf ? { uf } : {}),
        ...(lookingFor ? { lookingFor } : {}),
        about: aboutPatch,
        aboutHidden: aboutHiddenPatch,
      });
      // S135 — nome real mora em subdocumento próprio, fora de
      // updateUserProfile (que só escreve o doc público). Campo só é
      // editável quando !profile?.verified (ver Field abaixo), então só
      // chega aqui alterado nesse caso. Sem write se o valor não mudou —
      // evita update vazio a cada save do resto do perfil.
      if (legalNameInput !== (legalName?.name ?? '')) {
        if (legalName === null) {
          await createLegalName(user.uid, legalNameInput);
        } else {
          await updateLegalName(user.uid, legalNameInput);
        }
        // S135 (correção pós-auditoria) — sem isto, `legalName` fica null
        // pra sempre na sessão (o useEffect acima só roda no mount, e a tela
        // fica sempre montada por ser Tab.Screen): o PRÓXIMO save cairia de
        // novo no ramo createLegalName sobre um doc que já existe, e as
        // rules negam esse write (affectedKeys além de 'name'). Preserva
        // createdAt existente (updateLegalName não o toca); undefined no
        // caso de create (doc novo) não é lido em lugar nenhum do app.
        setLegalName({ name: legalNameInput, createdAt: legalName?.createdAt });
      }
      await refreshProfile();
      setEditing(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const photos = profile?.photos ?? [];

  const handleAddPhoto = async () => {
    if (!user) return;
    if (photos.length >= MAX_PROFILE_PHOTOS) {
      Alert.alert('Limite atingido', `Você pode ter no máximo ${MAX_PROFILE_PHOTOS} fotos.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setPhotoActionPending(true);
    try {
      const url = await uploadProfilePhoto(user.uid, result.assets[0].uri);
      await addProfilePhoto(user.uid, photos, url);
      await refreshProfile();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
      Alert.alert('Erro', 'Não foi possível salvar a foto: ' + errorMsg);
    } finally {
      setPhotoActionPending(false);
    }
  };

  const handleSetPrincipalPhoto = async (url: string) => {
    if (!user) return;
    setPhotoActionPending(true);
    try {
      await setPrincipalPhoto(user.uid, photos, url);
      await refreshProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível definir a foto principal.');
    } finally {
      setPhotoActionPending(false);
    }
  };

  const handleRemovePhoto = (url: string) => {
    if (!user) return;
    Alert.alert('Remover foto?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setPhotoActionPending(true);
          try {
            await removeProfilePhoto(user.uid, photos, url);
            await refreshProfile();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a foto.');
          } finally {
            setPhotoActionPending(false);
          }
        },
      },
    ]);
  };

  // Lembretes e sugestões (S44c) — opt-OUT do re-engajamento por push (S44b,
  // ainda não existe). O Switch NÃO reflete local otimista: value vem
  // sempre de profile?.reengagementOptOut, então se o write falhar o
  // Switch nunca chegou a se mover — mesmo padrão de "aguardar o write"
  // usado no resto desta tela (handleSetPrincipalPhoto, handleRemovePhoto).
  const handleToggleReengagement = async (value: boolean) => {
    if (!user) return;
    setReengagementSaving(true);
    try {
      await updateUserProfile(user.uid, { reengagementOptOut: !value });
      await refreshProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar essa preferência.');
    } finally {
      setReengagementSaving(false);
    }
  };

  // S97 — "Pausar meu perfil". Diferente do Switch de Lembretes acima, aqui
  // o valor do Switch É o próprio campo (paused), sem opt-out invertido —
  // ligado = pausado. Mesmo padrão de "aguardar o write": value sempre vem
  // de profile?.paused, nunca otimista. paused é filtro de VISIBILIDADE no
  // client (getDiscoverProfiles/useLikers/useMyLikes) — não impede leitura
  // do doc por quem já tem acesso a ele (matches/conversas existentes
  // continuam, de propósito — ver useActiveMatches, intocado nesta sprint).
  const handleTogglePaused = async (value: boolean) => {
    if (!user) return;
    setPausedSaving(true);
    try {
      await updateUserProfile(user.uid, { paused: value });
      await refreshProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar essa preferência.');
    } finally {
      setPausedSaving(false);
    }
  };

  const openAddPrompt = () => {
    if (userPrompts.length >= MAX_PROMPTS) return;
    setCatalogModalVisible(true);
  };

  const handlePickPrompt = (id: PromptId) => {
    setEditingPromptId(id);
    setEditingWeeklySlot(false);
    setAnswerDraft('');
    setCatalogModalVisible(false);
    setAnswerModalVisible(true);
  };

  const handleOpenExistingPrompt = (item: { id: string; answer: string }) => {
    setEditingPromptId(item.id as PromptId | WeeklyPromptId);
    setEditingWeeklySlot(false);
    setAnswerDraft(item.answer);
    setAnswerModalVisible(true);
  };

  // Prompt da semana (S59) — mesmo modal de handleOpenExistingPrompt acima,
  // mas grava em weeklyPromptAnswer (editingWeeklySlot = true), nunca em
  // prompts[]. Sem checar MAX_PROMPTS: o slot semanal é independente do cap
  // das 4 perguntas normais. Aceita o caso "ainda não respondido nesta
  // semana" (weeklyPromptEntry undefined ⇒ draft vazio).
  const openWeeklyPrompt = () => {
    setEditingPromptId(currentWeeklyPrompt.id);
    setEditingWeeklySlot(true);
    setAnswerDraft(weeklyPromptEntry?.answer ?? '');
    setAnswerModalVisible(true);
  };

  const closeAnswerModal = () => {
    setAnswerModalVisible(false);
    setEditingPromptId(null);
    setEditingWeeklySlot(false);
    setAnswerDraft('');
  };

  const handleSavePromptAnswer = async () => {
    if (!user || !editingPromptId) return;
    const trimmed = answerDraft.trim();
    const trimmedLength = countCodePoints(trimmed);
    if (trimmedLength < 1 || trimmedLength > MAX_ANSWER_LENGTH) return;
    setPromptSaving(true);
    try {
      if (editingWeeklySlot) {
        // S59 — slot único: a resposta nova SOBRESCREVE inteira a anterior,
        // nunca acumula em prompts[] (ao contrário do fluxo abaixo).
        await updateUserProfile(user.uid, {
          weeklyPromptAnswer: { id: editingPromptId, answer: trimmed },
        });
      } else {
        const existingIndex = userPrompts.findIndex((p) => p.id === editingPromptId);
        const nextPrompts =
          existingIndex >= 0
            ? userPrompts.map((p, i) =>
                i === existingIndex ? { id: editingPromptId, answer: trimmed } : p,
              )
            : [...userPrompts, { id: editingPromptId, answer: trimmed }];
        await updateUserProfile(user.uid, { prompts: nextPrompts });
      }
      await refreshProfile();
      closeAnswerModal();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a resposta.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleRemovePrompt = async () => {
    if (!user || !editingPromptId) return;
    setPromptSaving(true);
    try {
      if (editingWeeklySlot) {
        await removeWeeklyPromptAnswer(user.uid);
      } else {
        const nextPrompts = userPrompts.filter((p) => p.id !== editingPromptId);
        await updateUserProfile(user.uid, { prompts: nextPrompts });
      }
      await refreshProfile();
      closeAnswerModal();
    } catch {
      Alert.alert('Erro', 'Não foi possível remover o prompt.');
    } finally {
      setPromptSaving(false);
    }
  };

  // S61 — remove a resposta de uma semana anterior direto do card, sem passar
  // pelo modal de edição (handleRemovePrompt acima depende de editingPromptId/
  // editingWeeklySlot, que só existem depois de abrir o modal — aqui não
  // abrimos nada, então usa o mesmo removeWeeklyPromptAnswer isoladamente).
  // Depois de remover, staleWeeklyAnswer e weeklyPromptEntry ficam undefined
  // (profile.weeklyPromptAnswer sumiu de vez), então o card acima volta
  // sozinho ao estado "responder a pergunta desta semana", sem código extra.
  //
  // Confirmação antes de apagar (mesmo padrão de handleRemovePhoto acima):
  // este botão fica solto no card, sem passar pelo modal — diferente do
  // "Remover prompt" (que já exige abrir o modal antes, então não ganhou
  // confirmação extra aqui). Cancelar não chama removeWeeklyPromptAnswer.
  const handleRemoveStaleWeeklyAnswer = () => {
    if (!user) return;
    Alert.alert('Remover resposta?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setPromptSaving(true);
          try {
            await removeWeeklyPromptAnswer(user.uid);
            await refreshProfile();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a resposta.');
          } finally {
            setPromptSaving(false);
          }
        },
      },
    ]);
  };

  // S126 — Enquete no perfil. handleSavePoll grava o mapa {question,
  // options} completo (substituição, sem merge — PollEditModal já entrega
  // question/options prontos e validados). O agregado (pollCounts) nunca é
  // tocado por aqui: quem escreve é a Cloud Function onPollVoteCreated
  // (Admin SDK); a rule de update de users/{userId} nem libera o client pra
  // gravar essa chave.
  const handleSavePoll = async (question: string, options: string[]) => {
    if (!user) return;
    setPollSaving(true);
    try {
      await updateUserProfile(user.uid, { poll: { question, options } });
      await refreshProfile();
      setPollModalVisible(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a enquete.');
    } finally {
      setPollSaving(false);
    }
  };

  // Não apaga `pollCounts` aqui — isso é responsabilidade da Cloud Function
  // onPollChanged, que reage à mudança do campo `poll` (deleteField() conta
  // como mudança, dispara o reset e a limpeza de pollVotes/* do lado do
  // servidor).
  const handleRemovePoll = async () => {
    if (!user) return;
    setPollSaving(true);
    try {
      await updateUserProfile(user.uid, { poll: deleteField() });
      await refreshProfile();
      setPollModalVisible(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível remover a enquete.');
    } finally {
      setPollSaving(false);
    }
  };

  if (!profile) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Meu Perfil</Text>
        </View>
        <View style={styles.avatarSection}>
          <SkeletonPlaceholder
            width={100}
            height={100}
            borderRadius={50}
            style={{ marginBottom: 12 }}
          />
          <SkeletonPlaceholder
            width={140}
            height={20}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 8 }}
          />
          <SkeletonPlaceholder width={80} height={14} borderRadius={theme.borderRadius.sm} />
        </View>
        <View style={styles.card}>
          <SkeletonPlaceholder
            width={100}
            height={14}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 12 }}
          />
          <SkeletonPlaceholder
            width="100%"
            height={16}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 8 }}
          />
          <SkeletonPlaceholder width="80%" height={16} borderRadius={theme.borderRadius.sm} />
        </View>
      </ScrollView>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Meu Perfil</Text>
          {!isAdmin && (
            <AnimatedPressable onPress={() => setEditing(!editing)}>
              <Ionicons
                name={editing ? 'close' : 'create-outline'}
                size={24}
                color={theme.colors.primary}
              />
            </AnimatedPressable>
          )}
        </View>

        {/* Avatar — só exibe a principal (photos[0]/photoURL); edição de
            fotos acontece só na grade abaixo, um único caminho de edição. */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {profile?.photoURL ? (
              <Image
                source={{ uri: profile.photoURL }}
                style={styles.avatar}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                transition={200}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarEmoji}>😊</Text>
              </View>
            )}
          </View>
          {!editing && (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{getDisplayName(profile)}</Text>
                {profile?.verified && <VerifiedBadge size={18} />}
                {profile?.founderNumber != null && <FounderBadge number={profile.founderNumber} />}
              </View>
              <Text style={styles.profileAge}>{displayAge} anos</Text>
              {profile?.lookingFor && (
                <View style={styles.lookingForBadge}>
                  <Text style={styles.lookingForBadgeText}>
                    {LOOKING_FOR_LABELS[profile.lookingFor]}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Stats — S95: números de Curtidas/Conversas não fazem sentido pro
            admin (não usa esse produto), então o bloco inteiro some pra ele. */}
        {!editing && !isAdmin && (
          <View style={styles.statsRow}>
            <StatCard
              label="Curtidas"
              value={likers.length}
              loading={likersLoading}
              icon="heart"
              onPress={() => navigation.navigate('Main', { screen: 'Curtidas' })}
            />
            <StatCard
              label="Matches"
              value={matchesCount}
              loading={matchesLoading}
              icon="people"
              onPress={() => navigation.navigate('MatchesGrid')}
            />
            <StatCard
              label="Conversas"
              value={conversasCount}
              loading={matchesLoading}
              icon="chatbubble"
              onPress={() => navigation.navigate('Main', { screen: 'Conversas' })}
            />
          </View>
        )}

        {/* Photos — grade 2x2: única superfície de edição (adicionar, definir
            principal, remover). photos[0] é sempre a principal. */}
        {!editing && !isAdmin && (
          <View style={styles.photosGrid}>
            {Array.from({ length: MAX_PROFILE_PHOTOS }).map((_, index) => {
              const url = photos[index];
              if (!url) {
                return (
                  <AnimatedPressable
                    key={`empty-${index}`}
                    style={styles.photoTileEmpty}
                    onPress={handleAddPhoto}
                    disabled={photoActionPending}
                  >
                    <Ionicons name="add" size={32} color={theme.colors.primary} />
                  </AnimatedPressable>
                );
              }
              const isPrincipal = index === 0;
              return (
                <View key={url} style={styles.photoTile}>
                  <Image
                    source={{ uri: url }}
                    style={styles.photoTileImage}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    transition={200}
                  />
                  {isPrincipal && (
                    <View style={styles.principalBadge}>
                      <Text style={styles.principalBadgeText}>Principal</Text>
                    </View>
                  )}
                  <View style={styles.photoTileActions}>
                    {!isPrincipal && (
                      <AnimatedPressable
                        style={[
                          styles.photoTileActionBtn,
                          photoActionPending && styles.photoTileActionBtnDisabled,
                        ]}
                        onPress={() => handleSetPrincipalPhoto(url)}
                        disabled={photoActionPending}
                      >
                        <Ionicons name="star" size={16} color={theme.colors.white} />
                      </AnimatedPressable>
                    )}
                    <AnimatedPressable
                      style={[
                        styles.photoTileActionBtn,
                        photoActionPending && styles.photoTileActionBtnDisabled,
                      ]}
                      onPress={() => handleRemovePhoto(url)}
                      disabled={photoActionPending}
                    >
                      <Ionicons name="close" size={16} color={theme.colors.white} />
                    </AnimatedPressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Edit form */}
        {!isAdmin &&
          (editing ? (
            <View style={styles.card}>
              <Field
                label="Como quer ser chamado"
                value={nickname}
                onChange={setNickname}
                maxLength={MAX_NICKNAME_LENGTH}
              />
              <Field
                label="Nome completo"
                value={legalNameInput}
                onChange={setLegalNameInput}
                maxLength={MAX_NAME_LENGTH}
                locked={!!profile?.verified}
                lockedHint={
                  profile?.verified
                    ? 'Não é possível alterar o nome depois que o perfil é verificado. Precisa corrigir? Fale com o suporte.'
                    : 'Visível só pra você e pro time de verificação.'
                }
              />
              <Field
                label="Idade"
                value={displayAge != null ? String(displayAge) : ''}
                locked
                lockedHint="A idade é calculada a partir da sua data de nascimento."
              />
              <Field
                label="Bio"
                value={bio}
                onChange={setBio}
                multiline
                maxLength={MAX_BIO_LENGTH}
              />

              <Text style={styles.fieldLabel}>Gênero</Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((option) => {
                  const active = gender === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.genderOption, active && styles.genderOptionActive]}
                      onPress={() => setGender(option.value)}
                    >
                      <Text style={[styles.genderText, active && styles.genderTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              {!!profile?.vale && (
                <Field
                  label="Vale"
                  value={VALE_LABELS[profile.vale]}
                  locked
                  lockedHint="O vale é definido no cadastro e não pode ser alterado."
                />
              )}

              <Text style={styles.fieldLabel}>Estado onde você mora</Text>
              <UfPicker value={uf ?? null} onChange={(item) => setUf(item as UF)} />

              <Text style={styles.fieldLabel}>O que você busca?</Text>
              <View style={styles.lookingForGrid}>
                {LOOKING_FOR_OPTIONS.map((option) => {
                  const active = lookingFor === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.lookingForOption, active && styles.lookingForOptionActive]}
                      onPress={() => setLookingFor(option.value)}
                    >
                      <Text style={[styles.lookingForText, active && styles.lookingForTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Interesses (máx. 5)</Text>
              <View style={styles.tags}>
                {INTERESTS.map((item) => {
                  const active = interests.includes(item);
                  return (
                    <AnimatedPressable
                      key={item}
                      style={[styles.tag, active && styles.tagActive]}
                      onPress={() => toggleInterest(item)}
                    >
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>{item}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <TagEditor
                label="Meus lugares"
                values={places}
                maxItems={MAX_PLACES}
                maxLength={MAX_PLACE_LENGTH}
                placeholder="Ex: Praia do Forte"
                onAdd={(value) => setPlaces((prev) => [...prev, value])}
                onRemove={(value) => setPlaces((prev) => prev.filter((p) => p !== value))}
              />

              <TagEditor
                label="No meu radar"
                values={events}
                maxItems={MAX_EVENTS}
                maxLength={MAX_EVENT_LENGTH}
                placeholder="Ex: Show do Jorge & Mateus"
                onAdd={(value) => setEvents((prev) => [...prev, value])}
                onRemove={(value) => setEvents((prev) => prev.filter((e) => e !== value))}
              />

              {/* S104/S105 — piloto do perfil estruturado (mapa `about`),
                  renderizado a partir do catálogo (ABOUT_FIELDS): um
                  cabeçalho por grupo, um AboutRow por campo do grupo.
                  Exibir isso pra outros usuários é a S108 — aqui é só a
                  edição do próprio perfil, mesma guarda !isAdmin do form
                  inteiro. */}
              {ABOUT_GROUPS.map((group) => (
                <React.Fragment key={group}>
                  <Text style={styles.fieldLabel}>{ABOUT_GROUP_LABELS[group]}</Text>
                  {ABOUT_FIELDS.filter((field) => field.group === group).map((field) => (
                    <AboutRow
                      key={field.id}
                      icon={field.icon}
                      label={field.label}
                      value={formatAboutFieldValue(field, aboutValues[field.id])}
                      onPress={() => setOpenAboutField(field.id)}
                    />
                  ))}
                </React.Fragment>
              ))}

              {/* S109 — ponto de entrada logo após os grupos do catálogo
                  (about/lifestyle) que ela controla, antes do botão
                  principal "Salvar alterações" — não compete visualmente
                  com o CTA de salvar o form inteiro, mas fica colada na
                  seção a que se refere, em vez de solta lá embaixo perto de
                  Sair/Excluir conta (ações de conta, não de conteúdo do
                  perfil). */}
              <AnimatedPressable
                style={styles.visibilityLink}
                onPress={() => setVisibilityModalVisible(true)}
              >
                <Ionicons name="eye-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.visibilityLinkText}>Editar visibilidade</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.saveBtn, !gender && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || !gender}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.onSecondary} />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar alterações</Text>
                )}
              </AnimatedPressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Sobre mim</Text>
              <Text style={styles.bioText}>
                {profile?.bio || 'Nenhuma bio ainda. Toque em editar!'}
              </Text>

              {(profile?.interests?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Interesses</Text>
                  <View style={styles.tags}>
                    {profile?.interests?.map((item) => (
                      <View key={item} style={styles.tagActive}>
                        <Text style={styles.tagTextActive}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {(profile?.places?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Meus lugares</Text>
                  <View style={styles.tags}>
                    {profile?.places?.map((item) => (
                      <View key={item} style={styles.tagActive}>
                        <Text style={styles.tagTextActive}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {(profile?.events?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>No meu radar</Text>
                  <View style={styles.tags}>
                    {profile?.events?.map((item) => (
                      <View key={item} style={styles.tagActive}>
                        <Text style={styles.tagTextActive}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          ))}

        {/* S126 — Enquete no perfil: dono só vê o agregado (contagem por
            opção, via profile.pollCounts — escrito só pela Cloud Function
            onPollVoteCreated), NUNCA quem votou o quê (reforçado nas rules,
            não só escondido aqui). S132 — sobe acima do "Prompt da semana"/
            "Perguntas" (antes vinha depois). */}
        {!editing && !isAdmin && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Enquete</Text>
            {profile?.poll ? (
              <>
                <Text style={styles.pollQuestionText}>{profile.poll.question}</Text>
                {profile.poll.options.map((option, index) => (
                  <View key={index} style={styles.pollCountRow}>
                    <Text style={styles.pollCountOptionText} numberOfLines={1}>
                      {option}
                    </Text>
                    <Text style={styles.pollCountValue}>{profile.pollCounts?.[index] ?? 0}</Text>
                  </View>
                ))}
                <Text style={styles.pollTotalText}>
                  {Object.values(profile.pollCounts ?? {}).reduce((sum, n) => sum + n, 0)} voto(s)
                  no total
                </Text>
                <AnimatedPressable
                  style={styles.addPromptBtn}
                  onPress={() => setPollModalVisible(true)}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.addPromptText}>Editar</Text>
                </AnimatedPressable>
              </>
            ) : (
              <AnimatedPressable
                style={styles.addPromptBtn}
                onPress={() => setPollModalVisible(true)}
              >
                <Ionicons name="add" size={18} color={theme.colors.primary} />
                <Text style={styles.addPromptText}>Criar enquete</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Prompt da semana (S59) — rotação automática por data, destacada no
            topo da área de prompts. Resposta grava no campo próprio
            `weeklyPromptAnswer` (fora de `prompts[]`/MAX_PROMPTS, decisão
            fechada): slot único, a resposta de uma semana nova SOBRESCREVE a
            anterior, não acumula. Por isso este card nunca aparece de novo
            na lista "Perguntas" abaixo — as duas seções leem campos
            diferentes do perfil. */}
        {!editing && !isAdmin && (
          <View style={[styles.card, styles.weeklyPromptCard]}>
            <View style={styles.weeklyPromptHeader}>
              <Ionicons name="calendar-outline" size={14} color={theme.colors.onSecondary} />
              <Text style={styles.weeklyPromptLabel}>Prompt da semana</Text>
            </View>
            <Text style={styles.weeklyPromptQuestion}>{currentWeeklyPrompt.text}</Text>

            {weeklyPromptEntry ? (
              <AnimatedPressable style={styles.weeklyPromptAnswerBox} onPress={openWeeklyPrompt}>
                <Text style={styles.promptAnswer}>{weeklyPromptEntry.answer}</Text>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable style={styles.weeklyPromptCta} onPress={openWeeklyPrompt}>
                <Text style={styles.weeklyPromptCtaText}>Responder</Text>
              </AnimatedPressable>
            )}

            {/* S61 — resposta de uma semana anterior: continua pública (quem
                vê o perfil pelo Descobrir/Match enxerga normalmente, sem
                mudança nessas telas), mas até esta sprint o dono não via nem
                conseguia apagar depois que a semana virava. Bloco só leitura
                + remover — nunca abre o modal de edição (handleOpenExisting/
                openWeeklyPrompt não são chamados aqui), porque resposta
                expirada não é editável, só removível (decisão fechada). */}
            {staleWeeklyAnswer && (
              <View style={styles.weeklyPromptStaleBlock}>
                <Text style={styles.weeklyPromptStaleLabel}>Resposta de uma semana anterior</Text>
                <Text style={styles.promptQuestion}>{getPromptText(staleWeeklyAnswer.id)}</Text>
                <Text style={styles.promptAnswer}>{staleWeeklyAnswer.answer}</Text>
                <AnimatedPressable
                  style={styles.removePromptBtn}
                  onPress={handleRemoveStaleWeeklyAnswer}
                  disabled={promptSaving}
                >
                  <Text style={styles.removePromptText}>Remover resposta</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>
        )}

        {/* S127 — Marcos e selos: card "Conquistas", mesma condição de
            visibilidade dos cards de Enquete/Prompt da semana acima (só no
            próprio perfil, fora do modo de edição). Posicionado APÓS as duas
            seções acima, de propósito — não reabrir a ordem fechada na
            S132. */}
        {!editing && !isAdmin && <AchievementsCard />}

        {/* Prompts (S33) — edição via modais próprios, independente do form
            de nome/idade/bio/gênero/interesses acima (mesmo padrão da grade
            de fotos: só visível fora do modo de edição). */}
        {!editing && !isAdmin && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Perguntas</Text>
            <Text style={styles.promptsSubtitle}>Escolha até 4 perguntas para o seu perfil</Text>

            {userPrompts.map((item) => (
              <AnimatedPressable
                key={item.id}
                style={styles.promptCard}
                onPress={() => handleOpenExistingPrompt(item)}
              >
                <View style={styles.promptCardText}>
                  <Text style={styles.promptQuestion}>{getPromptText(item.id)}</Text>
                  <Text style={styles.promptAnswer}>{item.answer}</Text>
                </View>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
              </AnimatedPressable>
            ))}

            {userPrompts.length < MAX_PROMPTS && (
              <AnimatedPressable style={styles.addPromptBtn} onPress={openAddPrompt}>
                <Ionicons name="add" size={18} color={theme.colors.primary} />
                <Text style={styles.addPromptText}>Adicionar</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Verificação de perfil — ponto de entrada permanente: 'Verification'
            existe no grupo "app" independente de `verified`, então navega
            sempre, mesmo já verificado (a própria tela mostra o estado
            "Perfil verificado!" nesse caso). */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('Verification')}
          >
            <Ionicons
              name={profile?.verified ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={20}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.blockedUsersText}>
              {profile?.verified ? 'Perfil verificado' : 'Verificar perfil'}
            </Text>
            {showVerificationAlert && <View style={styles.verificationAlertDot} />}
          </AnimatedPressable>
        )}

        {/* S124-A — grupos: mesmo componente/estilo de "Usuários
            bloqueados" logo abaixo, dentro da guarda !isAdmin (grupos é
            feature de usuário comum). Sem aba nova na tab bar. */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('Groups')}
          >
            <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.blockedUsersText}>Grupos</Text>
          </AnimatedPressable>
        )}

        {/* Usuários bloqueados */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('BlockedUsers')}
          >
            <Ionicons name="ban-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.blockedUsersText}>Usuários bloqueados</Text>
          </AnimatedPressable>
        )}

        {/* Pausar meu perfil (S97) — modo invisível. Diferente do Switch de
            Lembretes logo abaixo, este fica DENTRO da guarda !isAdmin: a
            conta admin não tem perfil "descoberto" por ninguém (já some do
            Descobrir via ADMIN_UID em getDiscoverProfiles), então pausar
            não faz sentido pra ela. */}
        {!isAdmin && (
          <View style={styles.reengagementCard}>
            <View style={styles.reengagementLabelRow}>
              <Ionicons name="eye-off-outline" size={20} color={theme.colors.primary} />
              <View style={styles.reengagementTexts}>
                <Text style={styles.reengagementLabel}>Pausar meu perfil</Text>
                <Text style={styles.reengagementSubtitle}>
                  Some do Descobrir e das curtidas de todo mundo; conversas continuam
                </Text>
              </View>
            </View>
            <Switch
              value={profile?.paused ?? false}
              onValueChange={handleTogglePaused}
              disabled={pausedSaving}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
              ios_backgroundColor={theme.colors.border}
            />
          </View>
        )}

        {/* Lembretes e sugestões (S44c) — opt-OUT do re-engajamento por push
            (S44b, ainda não existe). Campo salvo é opt-OUT, mas o Switch
            mostra a semântica positiva: ligado = recebe lembretes (padrão,
            inclusive pra quem não tem o campo ainda). */}
        <View style={styles.reengagementCard}>
          <View style={styles.reengagementLabelRow}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
            <View style={styles.reengagementTexts}>
              <Text style={styles.reengagementLabel}>Lembretes e sugestões</Text>
              <Text style={styles.reengagementSubtitle}>
                Avisos de curtidas e conversas paradas quando você ficar um tempo sem entrar
              </Text>
            </View>
          </View>
          <Switch
            value={!(profile?.reengagementOptOut ?? false)}
            onValueChange={handleToggleReengagement}
            disabled={reengagementSaving}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={theme.colors.white}
            ios_backgroundColor={theme.colors.border}
          />
        </View>

        {/* Ajuda / Fale Conosco (S36) */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('Support')}
          >
            <Ionicons name="help-circle-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.blockedUsersText}>Ajuda</Text>
          </AnimatedPressable>
        )}

        {/* S84-B — "Meus chamados" promovido a linha de acao do Perfil (antes
            so existia como link discreto dentro da tela Ajuda). O ponto de
            aviso reusa verificationAlertDot e acende com showSupportAlert. */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('MyTickets')}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.blockedUsersText}>Meus chamados</Text>
            {showSupportAlert && <View style={styles.verificationAlertDot} />}
          </AnimatedPressable>
        )}

        {/* S96-C — "Minhas denúncias", mesmo padrão de "Meus chamados" acima
            (ponto próprio, reusa verificationAlertDot, acende com
            showReportAlert). Fica dentro da guarda !isAdmin do S95-B: o
            admin não denuncia ninguém. */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.blockedUsersBtn}
            onPress={() => navigation.navigate('MyReports')}
          >
            <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.blockedUsersText}>Minhas denúncias</Text>
            {showReportAlert && <View style={styles.verificationAlertDot} />}
          </AnimatedPressable>
        )}

        {/* S95 — Painel Admin removido: Verificações/Suporte viraram abas
            próprias do admin (ver navigation/index.tsx MainTabs), os botões
            apontariam pra rotas que não existem mais no Stack. */}

        {/* Logout */}
        <AnimatedPressable style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.nope} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </AnimatedPressable>

        {/* Exclusão de conta (S53) — exigência da Play Store. Deliberadamente
            discreta (sem borda/card, fonte menor) e separada do botão de
            logout: é uma ação destrutiva e irreversível, não deve competir
            visualmente com "Sair da conta". */}
        {!isAdmin && (
          <AnimatedPressable
            style={styles.deleteAccountBtn}
            onPress={() => setDeleteModalVisible(true)}
          >
            <Text style={styles.deleteAccountText}>Excluir minha conta</Text>
          </AnimatedPressable>
        )}
      </ScrollView>

      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
      />

      {/* S104/S105/S106 — piloto do perfil estruturado, ver catálogo
          renderizado acima no form de edição. UM AboutPicker por tipo
          (number/single/multi), resolvido a partir de openAboutField via
          getAboutField — abrir um campo novo do catálogo não pede um
          AboutPicker novo aqui. */}
      {(() => {
        const openField = openAboutField ? getAboutField(openAboutField) : null;
        const numberField = openField?.type === 'number' ? openField : null;
        const singleField = openField?.type === 'single' ? openField : null;
        // S112 — dois campos `multi` agora no catálogo (`languages` com
        // `maxSelected` sem `exclusiveGroup`, `pets` com `exclusiveGroup` sem
        // `maxSelected`): a união literal dos dois NÃO tem as mesmas chaves,
        // então acessar `.maxSelected`/`.exclusiveGroup` direto quebra o tsc
        // (nenhuma delas existe nos DOIS ao mesmo tempo). `multiFieldRaw`
        // mantém a união exata pra derivar V (o domínio de values do campo
        // aberto); o cast pra `AboutFieldMulti<V>` widening é seguro porque
        // toda entrada `multi` do catálogo já satisfaz essa interface
        // estruturalmente (as duas chaves são opcionais nela).
        const multiFieldRaw = openField?.type === 'multi' ? openField : null;
        type MultiFieldValue = NonNullable<typeof multiFieldRaw>['options'][number]['value'];
        const multiField: AboutFieldMulti<MultiFieldValue> | null = multiFieldRaw;
        const openValue = openAboutField ? aboutValues[openAboutField] : undefined;
        const handleOpenFieldChange = (value: AboutValues[AboutFieldId]) => {
          if (!openAboutField) return;
          // S106/Parte C.f — array vazio (a pessoa desmarcou tudo no multi)
          // vira undefined aqui, nunca `[]`: mergeAboutValues (ver
          // firestoreService.ts) só remove a chave do mapa gravado quando o
          // patch traz undefined; `[]` seria gravado do jeito que está e o
          // `about` acumularia ruído (mesmo achado da auditoria da S104
          // com `about: {}`).
          const normalized = Array.isArray(value) && value.length === 0 ? undefined : value;
          setAboutValues((prev) => ({ ...prev, [openAboutField]: normalized }));
        };
        return (
          <>
            <AboutPicker
              type="number"
              visible={!!numberField}
              onClose={() => setOpenAboutField(null)}
              title={numberField?.label ?? ''}
              value={typeof openValue === 'number' ? openValue : null}
              onChange={handleOpenFieldChange}
              min={numberField?.min ?? 0}
              max={numberField?.max ?? 100}
              suffix={numberField?.suffix}
            />
            <AboutPicker<NonNullable<typeof singleField>['options'][number]['value']>
              type="single"
              visible={!!singleField}
              onClose={() => setOpenAboutField(null)}
              title={singleField?.label ?? ''}
              value={typeof openValue === 'string' ? openValue : null}
              onChange={handleOpenFieldChange}
              options={singleField?.options ?? []}
            />
            <AboutPicker<MultiFieldValue>
              type="multi"
              visible={!!multiField}
              onClose={() => setOpenAboutField(null)}
              title={multiField?.label ?? ''}
              value={Array.isArray(openValue) ? openValue : null}
              // S112 — cast pontual: com DOIS campos `multi` agora (antes só
              // `languages`), `MultiFieldValue[]` (pets ∪ languages, domínio
              // combinado) deixou de bater estruturalmente com
              // `AboutValues[AboutFieldId]` — arrays não se achatam por
              // união como escalares (LanguageValue[] e PetsValue[] ficam
              // membros SEPARADOS do union grande, `handleOpenFieldChange`
              // não aceita o array combinado). Mesmo quirk que o comentário
              // de AboutPicker.tsx:15-28 já documenta pra singleField/
              // multiField: quem garante o valor certo pro campo certo é o
              // componente (só lista as `options` recebidas por prop), não o
              // tipo. Sem isso o tsc quebra; não muda comportamento.
              onChange={handleOpenFieldChange as (value: MultiFieldValue[]) => void}
              options={multiField?.options ?? []}
              maxSelected={multiField?.maxSelected}
              exclusiveGroup={multiField?.exclusiveGroup}
            />
          </>
        );
      })()}

      {/* S109 — modal próprio, mesmo contrato de rascunho+confirmação do
          AboutPicker multi (fechar pelo backdrop descarta). Controla
          aboutHidden, que só é gravado no handleSave geral do form, junto
          com o resto — o Switch aqui não escreve no Firestore sozinho. */}
      <AboutVisibilityModal
        visible={visibilityModalVisible}
        onClose={() => setVisibilityModalVisible(false)}
        hiddenFields={aboutHidden}
        onSave={setAboutHidden}
      />

      {/* Catálogo de prompts — só exibido pra adicionar um novo (prompts já
          usados ficam desabilitados/acinzentados). Editar um já respondido
          abre handleOpenExistingPrompt diretamente, sem passar por aqui. */}
      <Modal
        visible={catalogModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCatalogModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Escolha uma pergunta</Text>
              <AnimatedPressable onPress={() => setCatalogModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </AnimatedPressable>
            </View>
            <ScrollView>
              {PROMPTS_CATALOG.map((item) => {
                const used = userPrompts.some((p) => p.id === item.id);
                return (
                  <AnimatedPressable
                    key={item.id}
                    style={[styles.catalogItem, used && styles.catalogItemDisabled]}
                    onPress={() => !used && handlePickPrompt(item.id)}
                    disabled={used}
                  >
                    <Text style={[styles.catalogItemText, used && styles.catalogItemTextDisabled]}>
                      {item.text}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edição da resposta — usada tanto pra um prompt novo (vindo do
          catálogo acima) quanto pra editar/remover um já respondido. */}
      <Modal
        visible={answerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeAnswerModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.answerScrollContent}
              >
                <Text style={styles.modalTitle}>
                  {editingPromptId ? getPromptText(editingPromptId) : ''}
                </Text>
                <TextInput
                  style={styles.promptInput}
                  value={answerDraft}
                  onChangeText={setAnswerDraft}
                  multiline
                  maxLength={MAX_ANSWER_LENGTH}
                  placeholder="Sua resposta..."
                  placeholderTextColor={theme.colors.textLight}
                />
                <Text
                  style={[
                    styles.promptCounter,
                    countCodePoints(answerDraft.trim()) === 0 && styles.promptCounterError,
                  ]}
                >
                  {countCodePoints(answerDraft)}/{MAX_ANSWER_LENGTH}
                </Text>

                <AnimatedPressable
                  style={[
                    styles.saveBtn,
                    (promptSaving || countCodePoints(answerDraft.trim()) === 0) &&
                      styles.saveBtnDisabled,
                  ]}
                  onPress={handleSavePromptAnswer}
                  disabled={promptSaving || countCodePoints(answerDraft.trim()) === 0}
                >
                  {promptSaving ? (
                    <ActivityIndicator color={theme.colors.onSecondary} />
                  ) : (
                    <Text style={styles.saveBtnText}>Salvar</Text>
                  )}
                </AnimatedPressable>

                {editingPromptId &&
                  (editingWeeklySlot
                    ? !!weeklyPromptEntry
                    : userPrompts.some((p) => p.id === editingPromptId)) && (
                    <AnimatedPressable
                      style={styles.removePromptBtn}
                      onPress={handleRemovePrompt}
                      disabled={promptSaving}
                    >
                      <Text style={styles.removePromptText}>Remover prompt</Text>
                    </AnimatedPressable>
                  )}

                <AnimatedPressable
                  style={styles.cancelPromptBtn}
                  onPress={closeAnswerModal}
                  disabled={promptSaving}
                >
                  <Text style={styles.cancelPromptText}>Cancelar</Text>
                </AnimatedPressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PollEditModal
        visible={pollModalVisible}
        initialQuestion={profile?.poll?.question}
        initialOptions={profile?.poll?.options}
        onSave={handleSavePoll}
        onRemove={profile?.poll ? handleRemovePoll : undefined}
        onClose={() => setPollModalVisible(false)}
        saving={pollSaving}
      />
    </Animated.View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  // Opcional: um campo `locked` não tem estado pra atualizar, então a
  // omissão só é válida junto de `locked`.
  onChange?: (text: string) => void;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  // S77 — opcional: só Nome/Bio passam isso hoje. Quando presente, mostra o
  // contador por code point abaixo do input (mesmo padrão de TagEditor e do
  // modal de resposta de prompt) — Idade não passa, então continua sem
  // contador, igual antes.
  maxLength?: number;
  // S76-B1 — primeiro campo permanentemente travado por regra de negócio do
  // projeto (todo `editable=` anterior é transitório, tipo !submitting). O
  // padrão visual que nasce aqui vai ser reusado pela idade no S76-B2:
  // fundo esmaecido, texto secundário, contador suprimido e a explicação
  // logo abaixo — travar sem dizer por quê vira "o app está com bug".
  locked?: boolean;
  lockedHint?: string;
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
  maxLength,
  locked,
  lockedHint,
}: FieldProps) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && { height: 80, textAlignVertical: 'top' },
          locked && styles.inputLocked,
        ]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={!locked}
        placeholderTextColor={theme.colors.textLight}
      />
      {!locked && maxLength !== undefined && (
        <Text style={styles.promptCounter}>
          {countCodePoints(value)}/{maxLength}
        </Text>
      )}
      {!!lockedHint && <Text style={styles.fieldHint}>{lockedHint}</Text>}
    </>
  );
}

// S48 — editor de tags de texto livre (sem catálogo), reaproveitado pelas
// duas seções novas ("Meus lugares" e "No meu radar"): cada instância guarda
// seu próprio rascunho, o pai só recebe onAdd/onRemove já com a tag
// aparada (trim). Mesmo padrão visual dos chips de Interesses (tag/tagActive)
// + contador de chars igual ao dos prompts (promptCounter/promptCounterError).
interface TagEditorProps {
  label: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}

function TagEditor({
  label,
  values,
  maxItems,
  maxLength,
  placeholder,
  onAdd,
  onRemove,
}: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const trimmedLength = countCodePoints(trimmed);
  const canAdd =
    values.length < maxItems && trimmedLength >= MIN_TAG_LENGTH && trimmedLength <= maxLength;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <>
      <Text style={styles.fieldLabel}>
        {label} ({values.length}/{maxItems})
      </Text>
      {values.length > 0 && (
        <View style={styles.tags}>
          {values.map((item) => (
            <AnimatedPressable key={item} style={styles.tagActive} onPress={() => onRemove(item)}>
              <Text style={styles.tagTextActive}>{item} ✕</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
      {values.length < maxItems && (
        <>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.tagInput]}
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textLight}
              maxLength={maxLength}
              onSubmitEditing={handleAdd}
            />
            <AnimatedPressable
              style={[styles.tagAddBtn, !canAdd && styles.tagAddBtnDisabled]}
              onPress={handleAdd}
              disabled={!canAdd}
            >
              <Ionicons name="add" size={20} color={theme.colors.white} />
            </AnimatedPressable>
          </View>
          <Text
            style={[
              styles.promptCounter,
              trimmedLength > 0 && trimmedLength < MIN_TAG_LENGTH && styles.promptCounterError,
            ]}
          >
            {countCodePoints(draft)}/{maxLength}
          </Text>
        </>
      )}
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  loading?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

function StatCard({ label, value, loading, icon, onPress }: StatCardProps) {
  return (
    <AnimatedPressable style={styles.statCard} onPress={onPress}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      {loading ? (
        <SkeletonPlaceholder
          width={24}
          height={theme.fontSize.lg}
          borderRadius={theme.borderRadius.sm}
          style={{ marginTop: 4 }}
        />
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 40 },

  header: {
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 16,
  },
  title: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarEmoji: { fontSize: 44 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  profileAge: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  lookingForBadge: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  lookingForBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    paddingVertical: 14,
    ...theme.shadows.medium,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 4,
  },
  statLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },

  card: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  photoTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoTileImage: { width: '100%', height: '100%' },
  photoTileEmpty: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  principalBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  principalBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  photoTileActions: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    gap: 6,
  },
  photoTileActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTileActionBtnDisabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },

  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  inputLocked: {
    backgroundColor: theme.colors.background,
    color: theme.colors.textSecondary,
  },
  fieldHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },

  genderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 8,
  },
  genderOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  genderText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  genderTextActive: { color: theme.colors.onPrimary },

  lookingForGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  lookingForOption: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  lookingForOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  lookingForText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  lookingForTextActive: { color: theme.colors.onPrimary },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagActive: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  tagTextActive: { fontSize: theme.fontSize.sm, color: theme.colors.white, fontWeight: '600' },

  tagInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  tagInput: { flex: 1 },
  tagAddBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddBtnDisabled: { opacity: 0.4 },

  saveBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onSecondary },

  blockedUsersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
  },
  blockedUsersText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  // S78 — mesma forma do unreadDot em MatchesScreen.tsx (10x10,
  // borderRadius 5), cor theme.colors.error em vez de primary.
  verificationAlertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.error,
  },

  reengagementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  reengagementLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    flex: 1,
  },
  reengagementTexts: { flex: 1 },
  reengagementLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  reengagementSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: theme.spacing.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.nope,
    borderRadius: theme.borderRadius.full,
  },
  logoutText: { color: theme.colors.nope, fontSize: theme.fontSize.md, fontWeight: '600' },

  deleteAccountBtn: {
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingVertical: 8,
  },
  deleteAccountText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },

  visibilityLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  visibilityLinkText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },

  weeklyPromptCard: {
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.secondaryLight,
  },
  weeklyPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  weeklyPromptLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  weeklyPromptQuestion: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  weeklyPromptAnswerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  weeklyPromptCta: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  weeklyPromptCtaText: {
    color: theme.colors.onSecondary,
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
  weeklyPromptStaleBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  weeklyPromptStaleLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 6,
  },

  promptsSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: -4,
    marginBottom: 12,
  },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  promptCardText: { flex: 1 },
  promptQuestion: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  promptAnswer: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    marginTop: 4,
    fontWeight: '600',
  },
  addPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    marginTop: 4,
  },
  addPromptText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '700' },

  // S126 — Enquete no perfil: agregado só pro dono (contagem por opção).
  pollQuestionText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  pollCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  pollCountOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text, flex: 1 },
  pollCountValue: { fontSize: theme.fontSize.md, color: theme.colors.primary, fontWeight: '700' },
  pollTotalText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    maxHeight: '80%',
  },
  answerScrollContent: {
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },

  catalogItem: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 8,
  },
  catalogItemDisabled: { opacity: 0.4 },
  catalogItemText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  catalogItemTextDisabled: { color: theme.colors.textLight },

  promptInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 100,
    textAlignVertical: 'top',
    marginTop: 12,
  },
  promptCounter: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  promptCounterError: { color: theme.colors.error },

  removePromptBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  removePromptText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '600' },

  cancelPromptBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelPromptText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
});
