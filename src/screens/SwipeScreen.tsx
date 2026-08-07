// src/screens/SwipeScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  BackHandler,
  Pressable,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { FilterModal } from '@/components/FilterModal';
import { FounderBadge } from '@/components/FounderBadge';
import { MatchModal } from '@/components/MatchModal';
import { PendingVerificationChip } from '@/components/PendingVerificationChip';
import { PhotoCarousel, type PhotoCarouselHandle } from '@/components/PhotoCarousel';
import { ProfileSheet } from '@/components/ProfileSheet';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { SuperLikeNoteModal } from '@/components/SuperLikeNoteModal';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LOOKING_FOR_EMOJI, LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { VALE_LABELS } from '@/constants/vale';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_FILTERS, useFilters } from '@/hooks/useFilters';
import { useReplyQuota } from '@/hooks/useReplyQuota';
import { useSuperLikeQuota } from '@/hooks/useSuperLikeQuota';
import { RootStackParamList } from '@/navigation';
import {
  getDiscoverProfiles,
  getSessionSwipedUids,
  recordSwipe,
  undoSwipe,
  ReplyQuotaExceededError,
  SuperLikeQuotaExceededError,
  SwipeContext,
  UserProfile,
} from '@/services/firestoreService';
import { getVerificationStatus } from '@/services/verificationService';
import { getDisplayAge } from '@/utils/birthDate';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
const CARD_H = CARD_W * 1.35;
// S72-B1 — painel de perfil sem arrasto: 85% da altura do card, deixando uma
// faixa de foto exposta no topo (ver ProfileSheet e o Pressable de fechar).
const SHEET_HEIGHT = CARD_H * 0.85;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

interface LastSwipedProfile {
  profile: UserProfile;
  index: number;
  isMatch: boolean;
}

export default function SwipeScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { filters, saveFilters, clearFilters } = useFilters();
  const { remaining: superLikesRemaining, limit: superLikeLimit } = useSuperLikeQuota();
  // S74-B — quota própria de "Responder", contador separado do super like.
  const { remaining: replyRemaining } = useReplyQuota();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchedProfile, setMatchedProfile] = useState<UserProfile | null>(null);
  const [lastSwipedProfile, setLastSwipedProfile] = useState<LastSwipedProfile | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  // S67 — bilhete opcional na super curtida: só perfil verificado vê o modal
  // (item 4.2); fechar pelo backdrop/botão de fechar cancela a super curtida
  // inteira (nada é gravado, ver handleCancelSuperLikeNote).
  const [superLikeNoteModalVisible, setSuperLikeNoteModalVisible] = useState(false);
  // S73 — modo "Responder" reusa o mesmo SuperLikeNoteModal; não-null diz
  // que o modal está aberto respondendo a ESTE prompt (guarda o id pra
  // montar o context {type:'prompt', promptId} no envio).
  const [replyPromptId, setReplyPromptId] = useState<string | null>(null);
  // S72-B1 — painel de perfil (ProfileSheet) sem arrasto: abre/fecha só por
  // toque. Fecha sozinho quando o card muda, quando a tela perde foco e no
  // botão físico de voltar do Android (efeitos mais abaixo).
  const [sheetOpen, setSheetOpen] = useState(false);

  // Interesses do usuário logado, memoizados pra não recalcular a cada
  // render — só muda quando o profile (e portanto profile.interests) muda.
  const myInterests = useMemo(() => profile?.interests ?? [], [profile?.interests]);

  // S57 — ARMADILHA: profile vem de um onSnapshot (AuthContext), que entrega
  // um objeto (e um array blockedUsers) NOVO a cada emissão, mesmo quando o
  // conteúdo não mudou (ex.: lastActiveAt sendo tocado por outro hook). Usar
  // profile?.blockedUsers direto como dependência do loadProfiles abaixo
  // faria esse useCallback (e o useEffect que o dispara) recriar a cada
  // snapshot, virando um loop de recarga. Reduzir a um primitivo (string)
  // resolve: strings são comparadas por valor, não por referência.
  const blockedUsersKey = useMemo(
    () => (profile?.blockedUsers ?? []).join(','),
    [profile?.blockedUsers],
  );

  // Refs mirroring state so the JS-thread callback fired from a worklet
  // (via runOnJS) always reads the latest profile, not a stale closure.
  const profilesRef = useRef<UserProfile[]>([]);
  const currentIndexRef = useRef(0);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // O que está visível no card atual (S35-A) — usado só na hora do swipe,
  // não precisa de state/render. Reseta a cada card novo pra não vazar o
  // contexto do card anterior. Prompts (S34) são renderizados numa seção
  // fixa fora do carrossel nesta tela (não como página do PagerView), então
  // eles não geram contexto aqui — só o índice de foto visível.
  const visibleContextRef = useRef<SwipeContext>({ type: 'photo', photoIndex: 0 });
  useEffect(() => {
    visibleContextRef.current = { type: 'photo', photoIndex: 0 };
  }, [currentIndex]);
  // S72-B1 — qualquer troca de card (like/nope/superlike/undo) fecha o
  // painel, que só faz sentido pro card que estava no topo quando foi aberto.
  useEffect(() => {
    setSheetOpen(false);
  }, [currentIndex]);
  const handlePhotoIndexChange = (index: number) => {
    visibleContextRef.current = { type: 'photo', photoIndex: index };
  };

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Lets the PhotoCarousel's internal pager handle horizontal drags on the
  // photo itself, instead of the card's own pan gesture stealing them.
  const pagerNativeGesture = Gesture.Native();

  // ℹ️-preview-style tap zones: left half = previous photo, right half =
  // next. Ref lives here (not inside ProfileCard) so this same gesture —
  // created once, at the same flat level as pagerNativeGesture above — can
  // be registered on the outer Pan below, instead of nesting a 3rd
  // GestureDetector layer inside the one that already wraps the carousel.
  const carouselRef = useRef<PhotoCarouselHandle>(null);
  const handlePhotoTap = (x: number) => {
    if (x < CARD_W / 2) {
      carouselRef.current?.goToPrevious();
    } else {
      carouselRef.current?.goToNext();
    }
  };
  const tapGesture = Gesture.Tap()
    .enabled(!sheetOpen)
    .maxDuration(250)
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(handlePhotoTap)(e.x);
    });

  // Guarda de reentrância pra showVerificationRequiredAlert (S70): a leitura
  // do status é async, então toques repetidos no botão antes dela resolver
  // não devem empilhar múltiplos Alerts. Marcado antes da leitura, desmarcado
  // em finally pra uma falha não deixar o botão travado pra sempre.
  const verificationAlertInFlightRef = useRef(false);

  const loadProfiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getDiscoverProfiles(user.uid, filters, profile?.uf, profile?.blockedUsers);
      setProfiles(data);
      setCurrentIndex(0);
      setLastSwipedProfile(null);
      translateX.value = 0;
      translateY.value = 0;
    } catch (_) {
      Alert.alert('Erro', 'Não foi possível carregar perfis.');
    } finally {
      setLoading(false);
    }
    // blockedUsersKey (string) no lugar de profile?.blockedUsers (array) —
    // ver comentário da ARMADILHA acima, na definição de blockedUsersKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.uf, blockedUsersKey, filters, translateX, translateY]);

  // S57 — carga completa (com reembaralhamento) só no mount e quando uma
  // dependência REAL muda (usuário, UF, filtros, blockedUsers) — não mais a
  // cada foco da tela. O botão "Atualizar" do EmptyState (mais abaixo,
  // onButtonPress={loadProfiles}) continua sendo o caminho manual de recarga
  // completa.
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // S57 — reconciliação LOCAL ao reganhar foco: sem rede, sem reembaralhar.
  // O card do topo só muda se ELE MESMO foi decidido (like/nope/superlike)
  // em outra tela (MatchProfileScreen) durante a ausência; só abrir o "i" e
  // voltar sem decidir nada não deve alterar nada, nem re-renderizar à toa.
  useFocusEffect(
    useCallback(() => {
      const swiped = getSessionSwipedUids();
      if (swiped.size === 0) return;

      const currentProfiles = profilesRef.current;
      const hasAnySwiped = currentProfiles.some((p) => swiped.has(p.uid));
      if (!hasAnySwiped) return;

      const activeProfile = currentProfiles[currentIndexRef.current];
      const remaining = currentProfiles.filter((p) => !swiped.has(p.uid));

      let nextIndex: number;
      if (!activeProfile) {
        // Deck já tinha acabado antes desta reconciliação rodar.
        nextIndex = remaining.length;
      } else if (!swiped.has(activeProfile.uid)) {
        // O card do topo continua elegível — ele PERMANECE no topo.
        nextIndex = remaining.findIndex((p) => p.uid === activeProfile.uid);
      } else {
        // O card do topo foi decidido em outra tela: conta quantos perfis
        // elegíveis existiam ANTES dele na ordem original — é essa contagem
        // que diz quem assume o topo agora.
        nextIndex = currentProfiles
          .slice(0, currentIndexRef.current)
          .filter((p) => !swiped.has(p.uid)).length;
      }

      setProfiles(remaining);
      setCurrentIndex(Math.max(0, Math.min(nextIndex, remaining.length)));
      // S57 — algum perfil foi de fato removido aqui (só chegamos até este
      // ponto porque hasAnySwiped é true, ou seja, remaining é mais curto que
      // currentProfiles). lastSwipedProfile guarda um índice/perfil da forma
      // ANTIGA do array; sem limpar, "desfazer" reaplicaria esse índice
      // desatualizado sobre o array já reconciliado, restaurando/afetando o
      // perfil errado.
      setLastSwipedProfile(null);
    }, []),
  );

  // S72-B1 — perder foco (troca de aba) fecha o painel; reusa o mesmo
  // useFocusEffect já importado/usado acima, só que aqui via cleanup (disparado
  // no blur, não no focus).
  useFocusEffect(
    useCallback(() => {
      return () => setSheetOpen(false);
    }, []),
  );

  // S72-B1 — não existia nenhum BackHandler no projeto; API atual do RN
  // (0.81): addEventListener devolve uma subscription com .remove(), em vez
  // do antigo BackHandler.removeEventListener.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!sheetOpen) return false;
      setSheetOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [sheetOpen]);

  const completeSwipe = (
    dir: 'left' | 'right' | 'super',
    note?: string,
    // S73 — "Responder" grava context {type:'prompt', promptId} no lugar do
    // visibleContextRef (foto) de sempre; todo outro caminho de swipe
    // continua sem passar isto, então visibleContextRef.current permanece o
    // default inalterado.
    contextOverride?: SwipeContext,
  ) => {
    const target = profilesRef.current[currentIndexRef.current];
    const swipedIndex = currentIndexRef.current;
    const targetPhotos = target?.photos?.length
      ? target.photos
      : target?.photoURL
        ? [target.photoURL]
        : [];
    const visibleContext = contextOverride ?? visibleContextRef.current;
    const photoIndex = visibleContext.type === 'photo' ? visibleContext.photoIndex : 0;
    const likedPhotoURL = targetPhotos[photoIndex] ?? target?.photoURL ?? undefined;
    translateX.value = 0;
    translateY.value = 0;
    setCurrentIndex((i) => i + 1);
    if (!user || !target) return;

    if (dir === 'left') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setLastSwipedProfile({ profile: target, index: swipedIndex, isMatch: false });

    recordSwipe(
      user.uid,
      target.uid,
      dir === 'right' ? 'like' : dir === 'super' ? 'superlike' : 'nope',
      likedPhotoURL,
      dir !== 'left' ? visibleContext : undefined,
      note,
    )
      .then((isMatch) => {
        if (isMatch) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMatchedProfile(target);
          setLastSwipedProfile((prev) =>
            prev && prev.profile.uid === target.uid ? { ...prev, isMatch: true } : prev,
          );
        }
      })
      .catch((error) => {
        // Corrida rara: a cota acabou em outro device entre o tap aqui e o
        // commit do batch no servidor. Nada foi gravado (rules rejeitaram o
        // create do swipe) — só desfaz visualmente, sem chamar undoSwipe().
        if (error instanceof SuperLikeQuotaExceededError) {
          setCurrentIndex(swipedIndex);
          setLastSwipedProfile(null);
          showSuperLikeQuotaAlert();
        } else if (error instanceof ReplyQuotaExceededError) {
          // S74-B — mesmo tratamento da corrida do superlike acima, agora
          // pro contador de "Responder": nada foi gravado (rules rejeitaram
          // o create do swipe), só desfaz visualmente.
          setCurrentIndex(swipedIndex);
          setLastSwipedProfile(null);
          showReplyQuotaAlert();
        } else {
          // S49 — o deck não deve interromper o usuário com um Alert por um
          // swipe que falhou em background (ele já viu o card sair da tela);
          // só para de esconder o erro, que antes era engolido em silêncio.
          console.error('[SwipeScreen] recordSwipe falhou:', error);
        }
      });
  };

  const showSuperLikeQuotaAlert = () => {
    Alert.alert(
      'Super Likes esgotados ⭐',
      'Seus 3 Super Likes do mês acabaram. Eles renovam no dia 1º. Em breve você poderá conseguir Super Likes extras!',
    );
  };

  // S74-B — mesmo padrão do showSuperLikeQuotaAlert acima: Alert.alert com
  // só título/corpo já resulta num único botão OK padrão, sem navegação.
  const showReplyQuotaAlert = () => {
    Alert.alert('Respostas esgotadas', 'Suas 3 respostas do mês acabaram. Elas renovam no dia 1º.');
  };

  // S70 — super curtida passou a exigir perfil verificado (antes só o
  // bilhete exigia). Lê o status uma única vez no toque, em vez de manter
  // mais um listener em tempo real só pra este Alert; leitura falhou ou o
  // doc verifications/{uid} não existe (getVerificationStatus retorna null
  // nos dois casos) → trata como "nunca enviada", o caminho mais seguro
  // (convida a verificar em vez de dizer "em análise" por engano).
  const showVerificationRequiredAlert = async () => {
    if (!user) return;
    if (verificationAlertInFlightRef.current) return;
    verificationAlertInFlightRef.current = true;
    let verification: Awaited<ReturnType<typeof getVerificationStatus>> = null;
    try {
      verification = await getVerificationStatus(user.uid).catch(() => null);
    } finally {
      verificationAlertInFlightRef.current = false;
    }

    if (verification?.status === 'pending') {
      Alert.alert(
        'Verificação em análise ⭐',
        'Assim que seu perfil for aprovado, seus Super Likes com bilhete são liberados.',
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Ver status', onPress: () => navigation.navigate('Verification') },
        ],
      );
      return;
    }

    if (verification?.status === 'rejected') {
      Alert.alert(
        'Sua verificação não foi aprovada',
        'Veja o motivo e envie uma nova selfie para liberar os Super Likes com bilhete.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ver motivo', onPress: () => navigation.navigate('Verification') },
        ],
      );
      return;
    }

    Alert.alert(
      'Super Like é para perfis verificados ⭐',
      'Verifique seu perfil para enviar Super Likes com bilhete. É rápido: uma selfie e a gente confere.',
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Verificar agora', onPress: () => navigation.navigate('Verification') },
      ],
    );
  };

  const handleSuperLikePress = () => {
    // S70 — verificado vem ANTES da quota: uma conta não verificada que já
    // tinha gastado superlikes antes desta mudança (remaining pode ser 0)
    // precisa ver o convite pra verificar, não o alerta de quota esgotada.
    if (!profile?.verified) {
      showVerificationRequiredAlert();
      return;
    }
    if (superLikesRemaining === 0) {
      showSuperLikeQuotaAlert();
      return;
    }
    setSuperLikeNoteModalVisible(true);
  };

  const handleSendSuperLikeWithoutNote = () => {
    setSuperLikeNoteModalVisible(false);
    swipeCard('super');
  };

  const handleSendSuperLikeWithNote = (note: string) => {
    setSuperLikeNoteModalVisible(false);
    swipeCard('super', note);
  };

  // Fechar o modal pelo backdrop ou botão de fechar cancela a super curtida
  // inteira (item 4.4): swipeCard nunca é chamado, então nenhum swipe é
  // gravado e nenhuma cota mensal é gasta.
  const handleCancelSuperLikeNote = () => {
    setSuperLikeNoteModalVisible(false);
  };

  // S73 — "Responder" (bilhete em curtida normal, a partir de um prompt do
  // painel do Descobrir). Mesmo gate de verificado do superlike (S70),
  // reusando o mesmo Alert — não verificado nunca chega a abrir o modal.
  const handleReplyPress = (promptId: string) => {
    // S74-B — verificado PRIMEIRO, quota DEPOIS (mesma ordem do
    // handleSuperLikePress/S70): com quota zerada, Alert e nenhum modal.
    if (!profile?.verified) {
      showVerificationRequiredAlert();
      return;
    }
    if (replyRemaining === 0) {
      showReplyQuotaAlert();
      return;
    }
    setReplyPromptId(promptId);
  };

  const handleSendReply = (note: string) => {
    const promptId = replyPromptId;
    setReplyPromptId(null);
    if (!promptId) return;
    // S73 — curtida normal (não superlike), com o context do prompt no
    // lugar do visibleContext de foto; swipeCard('right', ...) fecha o
    // painel sozinho (useEffect de currentIndex, S72-B1) e avança o deck
    // como em qualquer curtida.
    swipeCard('right', note, { type: 'prompt', promptId });
  };

  // Fechar pelo backdrop/botão de fechar cancela a resposta inteira — nenhum
  // swipe é gravado, igual ao cancelamento da super curtida acima.
  const handleCancelReply = () => {
    setReplyPromptId(null);
  };

  const handleUndo = async () => {
    if (!user || !lastSwipedProfile) return;
    const { profile: target, index, isMatch } = lastSwipedProfile;
    setCurrentIndex(index);
    setLastSwipedProfile(null);
    try {
      await undoSwipe(user.uid, target.uid, isMatch);
    } catch (_) {
      Alert.alert('Erro', 'Não foi possível desfazer o swipe.');
    }
  };

  const swipeCard = (
    dir: 'left' | 'right' | 'super',
    note?: string,
    contextOverride?: SwipeContext,
  ) => {
    if (!user || currentIndex >= profiles.length) return;
    const toX = dir === 'left' ? -SCREEN_W * 1.5 : SCREEN_W * 1.5;
    const toY = dir === 'super' ? -SCREEN_H : 0;

    translateY.value = withTiming(toY, { duration: 300 });
    translateX.value = withTiming(toX, { duration: 300 }, (finished) => {
      if (finished) runOnJS(completeSwipe)(dir, note, contextOverride);
    });
  };

  const gesture = Gesture.Pan()
    .enabled(!sheetOpen)
    .simultaneousWithExternalGesture(pagerNativeGesture, tapGesture)
    .onBegin(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_W * 1.5, { duration: 300 }, (finished) => {
          if (finished) runOnJS(completeSwipe)('right');
        });
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_W * 1.5, { duration: 300 }, (finished) => {
          if (finished) runOnJS(completeSwipe)('left');
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_W / 2, 0, SCREEN_W / 2],
      [-8, 0, 8],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ] as any,
    };
  });

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 90], [0, 1], Extrapolation.CLAMP),
  }));
  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-90, 0], [1, 0], Extrapolation.CLAMP),
  }));

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Ionicons name="flame" size={26} color={theme.colors.secondary} />
            <Text style={styles.appTitle}>JuntaVale</Text>
          </View>
        </View>
        <View style={styles.cardArea}>
          <View style={styles.card}>
            <SkeletonPlaceholder width="100%" height="100%" borderRadius={0} />
            <View style={styles.skeletonInfo}>
              <SkeletonPlaceholder
                width={180}
                height={22}
                borderRadius={theme.borderRadius.sm}
                style={{ marginBottom: 8 }}
              />
              <SkeletonPlaceholder width={240} height={14} borderRadius={theme.borderRadius.sm} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // S97 — perfil pausado não vê ninguém no Descobrir. Estado dedicado, não
  // reusa o EmptyState de "Sem perfis por perto" (currentIndex >= profiles.length
  // abaixo): lista vazia por pausa é intencional, não "acabaram os perfis" —
  // mostrar o mesmo texto pareceria bug e não daria caminho pra despausar.
  if (profile?.paused) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Ionicons name="flame" size={26} color={theme.colors.secondary} />
            <Text style={styles.appTitle}>JuntaVale</Text>
          </View>
        </View>
        <View style={styles.cardArea}>
          <EmptyState
            icon="eye-off-outline"
            title="Seu perfil está pausado"
            subtitle="Enquanto pausado, você não aparece no Descobrir nem nas curtidas de ninguém. Suas conversas continuam normalmente."
            buttonLabel="Ir para meu perfil"
            onButtonPress={() => navigation.navigate('Profile')}
          />
        </View>
      </View>
    );
  }

  const currentProfile = profiles[currentIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Ionicons name="flame" size={26} color={theme.colors.secondary} />
          <Text style={styles.appTitle}>JuntaVale</Text>
        </View>
        <TouchableOpacity onPress={() => setFilterModalVisible(true)}>
          <Ionicons name="options-outline" size={26} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Cards */}
      <View style={styles.cardArea}>
        {currentIndex >= profiles.length ? (
          <EmptyState
            icon="search-outline"
            title="Sem perfis por perto"
            subtitle="Volte mais tarde ou atualize para ver novos perfis."
            buttonLabel="Atualizar"
            onButtonPress={loadProfiles}
          />
        ) : (
          <>
            {/* Next card (behind) */}
            {profiles[currentIndex + 1] && (
              <View style={[styles.card, styles.cardBehind]}>
                <ProfileCard
                  key={profiles[currentIndex + 1].uid}
                  profile={profiles[currentIndex + 1]}
                />
              </View>
            )}

            {/* Current card (swipeable) */}
            <GestureDetector gesture={gesture}>
              <Animated.View collapsable={false} style={[styles.card, cardStyle]}>
                <ProfileCard
                  key={currentProfile.uid}
                  profile={currentProfile}
                  pagerNativeGesture={pagerNativeGesture}
                  tapGesture={tapGesture}
                  carouselRef={carouselRef}
                  onPhotoIndexChange={handlePhotoIndexChange}
                  onExpandPress={() => setSheetOpen(true)}
                />

                {/* LIKE stamp */}
                <Animated.View style={[styles.stamp, styles.stampLike, likeStampStyle]}>
                  <Ionicons name="heart" size={48} color={theme.colors.like} />
                </Animated.View>

                {/* NOPE stamp */}
                <Animated.View style={[styles.stamp, styles.stampNope, nopeStampStyle]}>
                  <Ionicons name="close" size={48} color={theme.colors.nope} />
                </Animated.View>
              </Animated.View>
            </GestureDetector>

            {/* S72-B1 — wrapper com a MESMA geometria do card (mesma
                centralização herdada de cardArea), clipando o painel e o
                Pressable de fechar em vez de ancorá-los direto em cardArea
                (que é maior que o card). Sempre renderizado — quem controla
                visibilidade é o ProfileSheet, via seu próprio pointerEvents. */}
            <View style={styles.sheetWrapper} pointerEvents="box-none">
              {/* Faixa de foto exposta acima do painel: tocar nela fecha, em
                  vez de avançar a foto (tapGesture já fica .enabled(false)
                  enquanto o painel está aberto). */}
              {sheetOpen && (
                <Pressable style={styles.exposedPhotoOverlay} onPress={() => setSheetOpen(false)} />
              )}

              <ProfileSheet
                visible={sheetOpen}
                profile={currentProfile}
                myInterests={myInterests}
                onClose={() => setSheetOpen(false)}
                cardWidth={CARD_W}
                sheetHeight={SHEET_HEIGHT}
                onReply={handleReplyPress}
                replyQuotaRemaining={replyRemaining}
              />
            </View>
          </>
        )}
      </View>

      {/* Action buttons */}
      {currentIndex < profiles.length && (
        <View style={styles.actions}>
          <ActionButton
            icon="arrow-undo"
            color={theme.colors.textSecondary}
            size={44}
            onPress={handleUndo}
            disabled={!lastSwipedProfile}
          />
          <ActionButton
            icon="close"
            color={theme.colors.nope}
            size={56}
            onPress={() => swipeCard('left')}
          />
          <ActionButton
            icon="star"
            color={theme.colors.secondary}
            size={48}
            onPress={handleSuperLikePress}
            iconColor={theme.colors.onSecondary}
            dimmed={superLikesRemaining === 0 || !profile?.verified}
            badge={`${superLikesRemaining}/${superLikeLimit}`}
          />
          <ActionButton
            icon="heart"
            color={theme.colors.like}
            size={56}
            onPress={() => swipeCard('right')}
          />
        </View>
      )}

      {/* Match Modal */}
      <MatchModal
        visible={!!matchedProfile}
        currentUserPhoto={profile?.photoURL}
        matchedUserPhoto={matchedProfile?.photoURL}
        matchedUserName={matchedProfile?.name ?? ''}
        myProfile={profile}
        theirProfile={matchedProfile}
        myVerified={profile?.verified}
        theirVerified={matchedProfile?.verified}
        onSendMessage={() => {
          if (user && matchedProfile) {
            const matchId = [user.uid, matchedProfile.uid].sort().join('_');
            setMatchedProfile(null);
            navigation.navigate('Chat', {
              matchId,
              otherUid: matchedProfile.uid,
              otherName: matchedProfile.name,
              otherPhoto: matchedProfile.photoURL,
            });
          }
        }}
        onUseIcebreaker={(message) => {
          if (user && matchedProfile) {
            const matchId = [user.uid, matchedProfile.uid].sort().join('_');
            setMatchedProfile(null);
            navigation.navigate('Chat', {
              matchId,
              otherUid: matchedProfile.uid,
              otherName: matchedProfile.name,
              otherPhoto: matchedProfile.photoURL,
              draftMessage: message,
            });
          }
        }}
        onContinue={() => setMatchedProfile(null)}
      />

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalVisible}
        filters={filters}
        defaultFilters={DEFAULT_FILTERS}
        onApply={(next) => {
          setFilterModalVisible(false);
          saveFilters(next);
        }}
        onClear={() => {
          setFilterModalVisible(false);
          clearFilters();
        }}
        onClose={() => setFilterModalVisible(false)}
      />

      {/* Bilhete opcional da Super Curtida (S67) — só abre pra perfil
          verificado com cota disponível, ver handleSuperLikePress. S73
          reusa o mesmo modal em modo "Responder" (replyPromptId != null);
          os dois modos nunca ficam visible ao mesmo tempo (handleReplyPress
          e handleSuperLikePress são os únicos que abrem, cada um só liga o
          próprio state). */}
      <SuperLikeNoteModal
        visible={superLikeNoteModalVisible || replyPromptId !== null}
        onClose={replyPromptId !== null ? handleCancelReply : handleCancelSuperLikeNote}
        onSendWithoutNote={handleSendSuperLikeWithoutNote}
        onSendWithNote={replyPromptId !== null ? handleSendReply : handleSendSuperLikeWithNote}
        title={replyPromptId !== null ? 'Responder' : undefined}
        hideSendWithoutNote={replyPromptId !== null}
      />
    </View>
  );
}

// ─── ProfileCard ──────────────────────────────────────────
interface ProfileCardProps {
  profile: UserProfile;
  pagerNativeGesture?: ReturnType<typeof Gesture.Native>;
  tapGesture?: ReturnType<typeof Gesture.Tap>;
  carouselRef?: React.RefObject<PhotoCarouselHandle | null>;
  onPhotoIndexChange?: (index: number) => void;
  onExpandPress?: () => void;
}

function ProfileCard({
  profile,
  pagerNativeGesture,
  tapGesture,
  carouselRef,
  onPhotoIndexChange,
  onExpandPress,
}: ProfileCardProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = profile.photos?.length
    ? profile.photos
    : profile.photoURL
      ? [profile.photoURL]
      : [];
  const handleIndexChange = (index: number) => {
    setPhotoIndex(index);
    onPhotoIndexChange?.(index);
  };
  const carousel = (
    <PhotoCarousel ref={carouselRef} photos={photos} onIndexChange={handleIndexChange} />
  );
  // S76-B2 — idade derivada de birthDate, ver getDisplayAge.
  const displayAge = getDisplayAge(profile);

  return (
    <View style={pcStyles.container}>
      {pagerNativeGesture && tapGesture ? (
        <GestureDetector gesture={Gesture.Simultaneous(pagerNativeGesture, tapGesture)}>
          <View collapsable={false} style={{ flex: 1 }}>
            {carousel}
          </View>
        </GestureDetector>
      ) : (
        carousel
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={pcStyles.gradient} />
      <View style={pcStyles.info}>
        <View style={pcStyles.nameRow}>
          <View style={pcStyles.nameTextGroup}>
            <Text style={pcStyles.name} numberOfLines={1}>
              {profile.name}, {displayAge}
            </Text>
            {profile.verified ? <VerifiedBadge size={18} /> : <PendingVerificationChip />}
            {profile.founderNumber != null && <FounderBadge number={profile.founderNumber} />}
            {photos.length > 1 && (
              <View style={pcStyles.photoCountBadge} pointerEvents="none">
                <Ionicons name="camera" size={13} color={theme.colors.white} />
                <Text style={pcStyles.photoCountText}>
                  {photoIndex + 1}/{photos.length}
                </Text>
              </View>
            )}
          </View>
          {onExpandPress && (
            <TouchableOpacity
              style={pcStyles.infoBtn}
              onPress={onExpandPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-up-circle" size={28} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>
        {/* S107 — logo abaixo do nameRow, mesmo padrão de pill escuro do
            photoCountBadge acima (rgba(0,0,0,0.55), full radius). Perfil
            legado sem lookingFor não renderiza nada aqui, mesmo padrão do
            vale abaixo. */}
        {profile.lookingFor && (
          <View style={pcStyles.lookingForBadge} pointerEvents="none">
            <Text style={pcStyles.lookingForBadgeText}>
              {LOOKING_FOR_EMOJI[profile.lookingFor]} {LOOKING_FOR_LABELS[profile.lookingFor]}
            </Text>
          </View>
        )}
        {/* S83-B — abaixo do nome, acima da UF. Perfil SEM vale não
            renderiza nada aqui (nem rótulo vazio, nem "não informado", nem
            espaço reservado) — durante a migração manual, vários perfis vão
            estar sem o campo, e um placeholder chamaria atenção pro que
            falta em vez de simplesmente não aparecer. Rótulo de
            VALE_LABELS, nunca o value cru. */}
        {profile.vale && <Text style={pcStyles.valeText}>{VALE_LABELS[profile.vale]}</Text>}
        {profile.uf && (
          <View style={pcStyles.ufRow} pointerEvents="none">
            <Ionicons name="location-outline" size={14} color={theme.colors.white} />
            <Text style={pcStyles.ufText}>{profile.uf}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── ActionButton ─────────────────────────────────────────
interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  onPress: () => void;
  iconColor?: string;
  disabled?: boolean;
  // Opacidade reduzida SEM bloquear o toque (diferente de `disabled`, que
  // usa o `disabled` nativo do TouchableOpacity) — usado pelo superlike
  // esgotado, que precisa continuar tocável só pra mostrar o Alert.
  dimmed?: boolean;
  badge?: string;
}

function ActionButton({
  icon,
  color,
  size,
  onPress,
  iconColor,
  disabled,
  dimmed,
  badge,
}: ActionButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.actionBtn,
          { width: size, height: size, borderColor: color },
          (disabled || dimmed) && styles.actionBtnDisabled,
        ]}
        onPress={handlePress}
        disabled={disabled}
      >
        <Ionicons name={icon} size={size * 0.45} color={iconColor || color} />
      </TouchableOpacity>
      {badge && (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appTitle: { fontSize: theme.fontSize.lg, fontWeight: '800', color: theme.colors.text },

  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },

  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  // S72-B1 — mesma geometria do `card` acima, sem shadow: clipa o painel e o
  // Pressable de fechar (que sozinhos, ancorados direto em cardArea, ficavam
  // maiores que o card de verdade). zIndex/elevation concentrados só aqui —
  // removidos do ProfileSheet e do exposedPhotoOverlay, que ficariam
  // redundantes com o wrapper já clipando e reordenando os dois.
  sheetWrapper: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 20,
  },
  exposedPhotoOverlay: {
    position: 'absolute',
    top: 0,
    bottom: SHEET_HEIGHT,
    width: CARD_W,
  },
  skeletonInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  cardBehind: {
    transform: [{ scale: 0.95 }],
    top: 8,
  },

  stamp: {
    position: 'absolute',
    top: 40,
    borderWidth: 4,
    borderRadius: theme.borderRadius.lg,
    padding: 10,
  },
  stampLike: { left: 24, borderColor: theme.colors.like, transform: [{ rotate: '-20deg' }] },
  stampNope: { right: 24, borderColor: theme.colors.nope, transform: [{ rotate: '20deg' }] },

  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 20,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  actionBtn: {
    borderRadius: theme.borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  actionBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
});

const pcStyles = StyleSheet.create({
  container: { flex: 1 },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  nameTextGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  infoBtn: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: theme.borderRadius.full,
    padding: 4,
    marginLeft: 8,
  },
  name: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.white,
    flexShrink: 1,
  },
  photoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  lookingForBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  lookingForBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  valeText: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginBottom: 4,
  },
  ufRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  ufText: { fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
});
