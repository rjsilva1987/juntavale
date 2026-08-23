// src/screens/MatchProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { FounderBadge } from '@/components/FounderBadge';
import { MatchModal } from '@/components/MatchModal';
import { PendingVerificationChip } from '@/components/PendingVerificationChip';
import { PhotoCarousel, type PhotoCarouselHandle } from '@/components/PhotoCarousel';
import { ProfileSections } from '@/components/ProfileSections';
import { ReportModal } from '@/components/ReportModal';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { UF_NAMES } from '@/constants/ufs';
import { VALE_LABELS } from '@/constants/vale';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import {
  castPollVote,
  getMatchById,
  getMyPollVote,
  getPhotoLikes,
  getSwipe,
  getUserProfile,
  likePhoto,
  recordSwipe,
  SwipeContext,
  undoSwipe,
  unlikePhoto,
  UserProfile,
} from '@/services/firestoreService';
import { getDisplayAge } from '@/utils/birthDate';

type MatchProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'MatchProfile'>;

export default function MatchProfileScreen({ route, navigation }: MatchProfileScreenProps) {
  const {
    uid,
    matchId,
    name,
    photoURL,
    fromLikes,
    alreadyLiked: alreadyLikedParam,
    // S67-complemento — bilhete completo da super curtida. Vem só da
    // LikesScreen (aba "Quem curtiu você"), já pronto por param — nunca lido
    // do doc de swipe aqui. Ausente em todos os outros pontos de entrada
    // desta tela (Chat, MatchesGrid, Descobrir, deep link), que continuam
    // funcionando exatamente como antes.
    note,
  } = route.params;
  const isPreview = !matchId;
  const { user, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [matchVisible, setMatchVisible] = useState(false);
  const [photoAreaWidth, setPhotoAreaWidth] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  // S49 — semeado pelo param de navegação (evita flash do botão de curtir
  // enquanto o getDoc abaixo não resolve) e depois confirmado/corrigido pela
  // leitura real do próprio swipe — o param é só um retrato do momento em
  // que a lista de curtidas foi carregada, não a fonte de verdade.
  const [alreadyLiked, setAlreadyLiked] = useState(!!alreadyLikedParam);
  const [isSuperLike, setIsSuperLike] = useState(false);
  // S132 — mesmo padrão do painel expandido do Descobrir (SwipeScreen.tsx,
  // handleVotePoll/getMyPollVote): voto otimista local + confirmação do
  // voto já dado via getMyPollVote.
  const [myPollVote, setMyPollVote] = useState<number | null>(null);
  const [pollVoteResolved, setPollVoteResolved] = useState(false);
  // S123 — curtidas de foto, pós-match apenas (ver useEffect abaixo, que só
  // carrega quando !isPreview). Doc inteiro da subcoleção, pequena (limitada
  // ao nº de matches do dono) — ver getPhotoLikes.
  const [photoLikes, setPhotoLikes] = useState<{ photoUrl: string; likerUid: string }[]>([]);
  // S123 (auditoria) — mesmo padrão de pollVoteResolved acima: só true
  // dentro do .then() de getPhotoLikes, nunca no .catch() (falha fechada —
  // se a leitura falhar, onPress do pill fica undefined em vez de arriscar
  // curtir/descurtir em cima de um estado desatualizado).
  const [photoLikesResolved, setPhotoLikesResolved] = useState(false);
  const carouselRef = useRef<PhotoCarouselHandle>(null);

  // Sem Pan concorrendo aqui (diferente do card da Descobrir) — o tap só
  // precisa ceder pro drag manual do próprio pager quando passa do
  // threshold, o que já é o comportamento padrão de Gesture.Tap.
  const handlePhotoTap = (x: number) => {
    if (photoAreaWidth === 0) return;
    if (x < photoAreaWidth / 2) {
      carouselRef.current?.goToPrevious();
    } else {
      carouselRef.current?.goToNext();
    }
  };
  const photoTapGesture = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(handlePhotoTap)(e.x);
    });

  const loadProfile = useCallback(() => {
    if (!uid) {
      console.error('[MatchProfile] uid ausente nos params');
      setLoading(false);
      setProfile(null);
      return;
    }
    setLoading(true);
    getUserProfile(uid)
      .then((p) => {
        setProfile(p);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[MatchProfile] Erro ao buscar perfil:', err);
        setProfile(null);
        setLoading(false);
      });
  }, [uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // S49 — confirma/corrige alreadyLiked com o swipe real (não confia só no
  // param de navegação): evita reoferecer "Curtir" pra um perfil já curtido,
  // que a rules nega (swipe é imutável, sem allow update). Cancelamento por
  // flag simples (não AbortController — getSwipe não aceita signal) evita
  // setState depois de desmontar caso a tela feche antes do getDoc resolver.
  useEffect(() => {
    if (!user || !uid) return;
    let cancelled = false;
    getSwipe(user.uid, uid)
      .then((swipe) => {
        if (cancelled) return;
        const liked = !!swipe && swipe.direction !== 'nope';
        setAlreadyLiked(liked);
        setIsSuperLike(liked && swipe?.direction === 'superlike');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[MatchProfile] Erro ao checar swipe existente:', err);
        setAlreadyLiked(false);
        setIsSuperLike(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, uid]);

  // S132 — confirma o voto já dado na enquete (se houver), mesmo padrão do
  // getSwipe acima (cancelamento por flag) e do painel expandido do
  // Descobrir (SwipeScreen.tsx, getMyPollVote). Falha fechada: se o
  // getMyPollVote falhar, NÃO marca pollVoteResolved — a UI de voto fica
  // bloqueada (onVotePoll vira undefined mais abaixo) em vez de arriscar
  // mostrar estado errado.
  useEffect(() => {
    if (!profile?.poll || !user) return;
    let cancelled = false;
    getMyPollVote(uid, user.uid)
      .then((vote) => {
        if (cancelled) return;
        setMyPollVote(vote);
        setPollVoteResolved(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[MatchProfile] getMyPollVote falhou:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.poll, user, uid]);

  // S123 — carrega as curtidas de foto só em pós-match (!isPreview): curtir
  // foto não vale no Descobrir/preview. Mesmo padrão de cancelamento por
  // flag dos dois useEffect acima (getSwipe/getMyPollVote).
  useEffect(() => {
    if (isPreview || !user || !uid) return;
    let cancelled = false;
    getPhotoLikes(uid)
      .then((likes) => {
        if (cancelled) return;
        setPhotoLikes(likes);
        setPhotoLikesResolved(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[MatchProfile] getPhotoLikes falhou:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isPreview, user, uid]);

  const handleBlock = () => {
    if (!user) return;
    Alert.alert(
      'Bloquear usuário?',
      isPreview
        ? `Você deixará de ver ${name}. Essa ação pode ser desfeita depois em "Usuários bloqueados".`
        : `Você deixará de ver ${name} e o match será desfeito. Essa ação pode ser desfeita depois em "Usuários bloqueados".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            await blockUser(user.uid, uid);
            if (isPreview) {
              navigation.goBack();
            } else {
              navigation.navigate('Main', { screen: 'Conversas' });
            }
          },
        },
      ],
    );
  };

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user) return;
    await reportUser(user.uid, uid, reason, details);
    setReportVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  const handleSwipeAction = async (direction: 'like' | 'nope') => {
    if (!user || actionPending) return;
    setActionPending(true);
    try {
      const likedPhotoURL = photos[photoIndex] ?? profile?.photoURL ?? photoURL ?? undefined;
      // S45 — mesmo padrão do SwipeScreen: registra o que estava visível no
      // card como referência (nunca a foto em si). Só 'like' porque esta
      // tela não tem botão de superlike.
      const context: SwipeContext | undefined =
        direction === 'like' ? { type: 'photo', photoIndex } : undefined;
      const isMatch = await recordSwipe(user.uid, uid, direction, likedPhotoURL, context);
      if (isMatch) {
        setMatchVisible(true);
      } else {
        navigation.goBack();
      }
    } catch (error) {
      console.error('[MatchProfile] recordSwipe falhou:', error);
      // S49 — permission-denied aqui costuma ser o create/update negado por
      // já existir um swipe meu pra este uid (rules: swipe é imutável, sem
      // allow update). Confirma com uma leitura real antes de alertar: se o
      // swipe já existe, a tela se corrige sozinha (mostra o chip) em vez de
      // dizer "não foi possível" pra uma ação que, na prática, já tinha sido
      // registrada antes.
      const isPermissionDenied =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'permission-denied';
      const existing = isPermissionDenied ? await getSwipe(user.uid, uid).catch(() => null) : null;
      if (existing && existing.direction !== 'nope') {
        setAlreadyLiked(true);
        setIsSuperLike(existing.direction === 'superlike');
        // S131 — antes esse ramo só corrigia o estado em silêncio, sem
        // avisar que a ação pedida (aqui, "não curtir") não foi essa que
        // aconteceu — foi isso que escondeu o bug do X sem efeito por
        // meses. Alert em vez de silêncio, sem virar crash.
        Alert.alert('Ação não registrada', 'Você já tinha dado uma resposta a este perfil antes.');
      } else {
        Alert.alert('Erro', 'Não foi possível registrar sua ação. Tente novamente.');
      }
    } finally {
      setActionPending(false);
    }
  };

  // S131 — X sobre uma curtida já enviada (alreadyLiked=true) desfaz a
  // curtida em vez de tentar gravar um 'nope' (que a rules sempre nega, já
  // que o swipe é imutável — era esse o no-op silencioso de antes).
  const handleUndoLike = () => {
    if (!user || actionPending) return;
    Alert.alert(
      isSuperLike ? 'Desfazer super curtida?' : 'Desfazer curtida?',
      isSuperLike
        ? 'A super curtida enviada será apagada. A cota gasta não será devolvida.'
        : 'A curtida enviada será apagada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: async () => {
            setActionPending(true);
            try {
              // Relido na hora, nunca a partir de param ou estado antigo: a
              // outra pessoa pode ter retribuído dias depois do swipe
              // original, e um match nesse meio-tempo não pode ser apagado
              // por aqui (vira match órfão — swipe some, match fica).
              const matchId = [user.uid, uid].sort().join('_');
              // A rule de matches/{matchId} exige uid em resource.data.users;
              // documento inexistente => resource nulo => a regra quebra e o
              // get() estoura permission-denied sem devolver snapshot —
              // exists() nunca é alcançado. Só permission-denied é "não há
              // match acessível" (segue com o undo); qualquer outro código
              // (unavailable, deadline-exceeded, internal, cancelled, sem
              // code) tem que falhar FECHADO: não desfaz sem saber se há
              // match, e nem toca no Firestore.
              let existingMatch: Awaited<ReturnType<typeof getMatchById>> = null;
              try {
                existingMatch = await getMatchById(matchId);
              } catch (matchError) {
                const isPermissionDenied =
                  typeof matchError === 'object' &&
                  matchError !== null &&
                  'code' in matchError &&
                  (matchError as { code?: unknown }).code === 'permission-denied';
                if (!isPermissionDenied) {
                  console.error(
                    '[MatchProfile] Erro ao verificar match antes do undo:',
                    matchError,
                  );
                  Alert.alert('Erro', 'Não foi possível verificar agora. Tente novamente.');
                  return;
                }
              }
              if (existingMatch) {
                Alert.alert(
                  'Vocês já deram match',
                  'Pra desfazer agora, use a opção de desfazer o match dentro da conversa.',
                );
                return;
              }
              await undoSwipe(user.uid, uid, false);
              setAlreadyLiked(false);
              setIsSuperLike(false);
            } catch (error) {
              console.error('[MatchProfile] undoSwipe falhou:', error);
              Alert.alert('Erro', 'Não foi possível desfazer a curtida. Tente novamente.');
            } finally {
              setActionPending(false);
            }
          },
        },
      ],
    );
  };

  // S132 — votar na enquete a partir de perfis já curtidos/match/"Curtiram
  // você" (mesmo comportamento do handleVotePoll do painel expandido do
  // Descobrir, SwipeScreen.tsx): otimista, marca o voto antes do write
  // terminar.
  const handleVotePoll = async (optionIndex: number) => {
    if (!user) return;
    setMyPollVote(optionIndex);
    try {
      await castPollVote(uid, user.uid, optionIndex);
    } catch (e) {
      // permission-denied = já tinha votado (corrida: outro device/tela ao
      // mesmo tempo) — estado otimista já está correto, não precisa
      // reverter nem alertar. Mesma checagem por `.code` já usada acima em
      // handleSwipeAction.
      const isPermissionDenied =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: unknown }).code === 'permission-denied';
      if (isPermissionDenied) return;
      setMyPollVote(null);
      Alert.alert('Erro', 'Não foi possível registrar seu voto.');
    }
  };

  // S123 — curtir/descurtir a foto atualmente aberta no carrossel, só em
  // pós-match (!isPreview, ver renderização mais abaixo). Otimista: mexe no
  // array em memória ANTES do write terminar; reverte só se o erro não for
  // o permission-denied esperado de corrida (mesma checagem por `.code` já
  // usada em handleSwipeAction/handleVotePoll acima).
  const handleTogglePhotoLike = async () => {
    if (!user) return;
    const currentPhotoUrl = photos[photoIndex];
    if (!currentPhotoUrl) return;
    const alreadyLikedByMe = photoLikes.some(
      (like) => like.photoUrl === currentPhotoUrl && like.likerUid === user.uid,
    );
    if (alreadyLikedByMe) {
      setPhotoLikes((prev) =>
        prev.filter((like) => !(like.photoUrl === currentPhotoUrl && like.likerUid === user.uid)),
      );
      try {
        await unlikePhoto(uid, user.uid, currentPhotoUrl);
      } catch (e) {
        const isPermissionDenied =
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: unknown }).code === 'permission-denied';
        if (isPermissionDenied) return;
        console.error('[MatchProfile] unlikePhoto falhou:', e);
        setPhotoLikes((prev) => [...prev, { photoUrl: currentPhotoUrl, likerUid: user.uid }]);
      }
    } else {
      setPhotoLikes((prev) => [...prev, { photoUrl: currentPhotoUrl, likerUid: user.uid }]);
      try {
        await likePhoto(uid, user.uid, currentPhotoUrl);
      } catch (e) {
        const isPermissionDenied =
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: unknown }).code === 'permission-denied';
        if (isPermissionDenied) {
          // S123 (auditoria) — permission-denied aqui pode significar "eu já
          // tinha curtido essa foto antes" (otimista já está certo) OU que a
          // curtida de fato não foi registrada. Confirma com uma leitura real
          // antes de decidir, mesmo espírito de handleSwipeAction acima.
          const likes = await getPhotoLikes(uid).catch(() => null);
          const stillLiked = likes?.some(
            (like) => like.photoUrl === currentPhotoUrl && like.likerUid === user.uid,
          );
          if (stillLiked) return;
          setPhotoLikes((prev) =>
            prev.filter(
              (like) => !(like.photoUrl === currentPhotoUrl && like.likerUid === user.uid),
            ),
          );
          Alert.alert(
            'Ação não registrada',
            'Não foi possível curtir esta foto agora. Tente novamente.',
          );
          return;
        }
        console.error('[MatchProfile] likePhoto falhou:', e);
        setPhotoLikes((prev) =>
          prev.filter((like) => !(like.photoUrl === currentPhotoUrl && like.likerUid === user.uid)),
        );
      }
    }
  };

  const handleSendMessage = () => {
    if (!user) return;
    const chatMatchId = [user.uid, uid].sort().join('_');
    setMatchVisible(false);
    // replace (não navigate) pra não deixar este preview órfão embaixo do Chat
    // na pilha — voltar do Chat deve cair direto na Descobrir, não num perfil
    // já "usado" com o botão de curtir ainda ativo.
    navigation.replace('Chat', {
      matchId: chatMatchId,
      otherUid: uid,
      otherName: profile?.name ?? name,
      otherPhoto: profile?.photoURL ?? photoURL,
    });
  };

  const handleUseIcebreaker = (message: string) => {
    if (!user) return;
    const chatMatchId = [user.uid, uid].sort().join('_');
    setMatchVisible(false);
    navigation.replace('Chat', {
      matchId: chatMatchId,
      otherUid: uid,
      otherName: profile?.name ?? name,
      otherPhoto: profile?.photoURL ?? photoURL,
      draftMessage: message,
    });
  };

  const handleContinueAfterMatch = () => {
    setMatchVisible(false);
    navigation.goBack();
  };

  const photos = profile?.photos?.length ? profile.photos : photoURL ? [photoURL] : [];

  // S123 — derivado direto do array em memória, sem novo estado: a foto
  // atual do carrossel (photoIndex) e quem a curtiu.
  const currentPhotoUrl = photos[photoIndex];
  const currentPhotoLikes = photoLikes.filter((like) => like.photoUrl === currentPhotoUrl);
  const likedByMe = currentPhotoLikes.some((like) => like.likerUid === user?.uid);
  const photoLikeCount = currentPhotoLikes.length;

  const myInterests = useMemo(() => myProfile?.interests ?? [], [myProfile?.interests]);

  // S76-B2 — idade derivada de birthDate, ver getDisplayAge.
  const displayAge = getDisplayAge(profile);

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.canGoBack() && navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : profile === null ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Não foi possível carregar o perfil"
            subtitle="Verifique sua conexão e tente novamente."
            buttonLabel="Tentar novamente"
            onButtonPress={loadProfile}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View
              style={styles.photosCard}
              onLayout={(e) => setPhotoAreaWidth(e.nativeEvent.layout.width)}
            >
              <GestureDetector gesture={photoTapGesture}>
                <View style={styles.photosCarouselWrap}>
                  <PhotoCarousel
                    ref={carouselRef}
                    photos={photos}
                    style={styles.photosCarousel}
                    onIndexChange={setPhotoIndex}
                  />
                </View>
              </GestureDetector>
              {/* S123 — curtir foto, só pós-match: espelha os botões de
                  swipe like/nope logo abaixo, que só aparecem quando
                  isPreview. Os dots do carrossel ocupam o topo, por isso
                  ancorado bottom+right. Sempre visível quando !isPreview,
                  mesmo com count 0 — não esconde por curtida zero. */}
              {!isPreview && (
                <View style={styles.photoLikePillWrap} pointerEvents="box-none">
                  <AnimatedPressable
                    style={styles.photoLikePill}
                    onPress={photoLikesResolved ? handleTogglePhotoLike : undefined}
                    accessibilityLabel={likedByMe ? 'Descurtir foto' : 'Curtir foto'}
                  >
                    <Ionicons
                      name={likedByMe ? 'heart' : 'heart-outline'}
                      size={16}
                      color={theme.colors.white}
                    />
                    <Text style={styles.photoLikePillText}>{photoLikeCount}</Text>
                  </AnimatedPressable>
                </View>
              )}
            </View>

            <View style={styles.infoCard}>
              <View style={styles.nameRow}>
                <View style={styles.nameAgeGroup}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile?.name ?? name}
                  </Text>
                  {displayAge != null && <Text style={styles.nameAge}>, {displayAge}</Text>}
                </View>
                {profile?.verified ? <VerifiedBadge size={18} /> : <PendingVerificationChip />}
                {profile?.founderNumber != null && <FounderBadge number={profile.founderNumber} />}
              </View>

              {/* S88 — mesma ordem do card do Descobrir (SwipeScreen.tsx:859):
                  vale acima da UF. Espelha styles.ufText com margem própria
                  (mesmo token de tipografia já usado nesta região pra
                  meta-info de identidade — textSecondary/sm/600), sem cor
                  nova; não reaproveita valeText do SwipeScreen porque
                  aquele depende de contexto de card sobre foto (fundo
                  escuro), e aqui o fundo é o infoCard normal da tela. */}
              {!!profile?.vale && <Text style={styles.valeText}>{VALE_LABELS[profile.vale]}</Text>}

              {profile?.uf && (
                <View style={styles.ufRow}>
                  <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.ufText}>{UF_NAMES[profile.uf]}</Text>
                </View>
              )}

              {profile?.lookingFor && (
                <View style={styles.lookingForBadge}>
                  <Text style={styles.lookingForBadgeText}>
                    {LOOKING_FOR_LABELS[profile.lookingFor]}
                  </Text>
                </View>
              )}

              {/* S72-A — bio/interesses/lugares/eventos/bilhete/prompts
                  extraídos pra ProfileSections (mesma ordem, mesmos
                  estilos). uf/lookingFor acima continuam inline aqui —
                  não fazem parte do que foi extraído nesta sprint. */}
              <ProfileSections
                profile={profile}
                myInterests={myInterests}
                note={note}
                poll={profile?.poll}
                myPollVote={myPollVote}
                onVotePoll={pollVoteResolved ? handleVotePoll : undefined}
              />
            </View>

            {isPreview && (
              <View style={styles.swipeActions}>
                <AnimatedPressable
                  style={[styles.swipeBtn, styles.nopeBtn]}
                  onPress={() => (alreadyLiked ? handleUndoLike() : handleSwipeAction('nope'))}
                  disabled={actionPending}
                >
                  <Ionicons name="close" size={28} color={theme.colors.nope} />
                </AnimatedPressable>
                {alreadyLiked ? (
                  <View style={styles.alreadyLikedChip}>
                    {isSuperLike && (
                      <Ionicons name="star" size={14} color={theme.colors.onSecondary} />
                    )}
                    <Text style={styles.alreadyLikedChipText}>Curtida enviada ✓</Text>
                  </View>
                ) : (
                  <AnimatedPressable
                    style={[styles.swipeBtn, styles.likeBtn]}
                    onPress={() => handleSwipeAction('like')}
                    disabled={actionPending}
                    accessibilityLabel={fromLikes ? 'Retribuir like' : 'Curtir'}
                  >
                    <Ionicons name="heart" size={28} color={theme.colors.like} />
                  </AnimatedPressable>
                )}
              </View>
            )}

            <AnimatedPressable style={styles.reportBtn} onPress={() => setReportVisible(true)}>
              <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.reportBtnText}>Denunciar</Text>
            </AnimatedPressable>

            <AnimatedPressable style={styles.blockBtn} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={20} color={theme.colors.error} />
              <Text style={styles.blockBtnText}>Bloquear</Text>
            </AnimatedPressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReport}
      />

      <MatchModal
        visible={matchVisible}
        currentUserPhoto={myProfile?.photoURL}
        matchedUserPhoto={profile?.photoURL ?? photoURL}
        matchedUserName={profile?.name ?? name}
        myProfile={myProfile}
        theirProfile={profile}
        myVerified={myProfile?.verified}
        theirVerified={profile?.verified}
        onSendMessage={handleSendMessage}
        onUseIcebreaker={handleUseIcebreaker}
        onContinue={handleContinueAfterMatch}
      />
    </Animated.View>
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
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { paddingBottom: 40 },

  photosCard: {
    height: 340,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  photosCarousel: { flex: 1 },
  // S123 (auditoria) — o GestureDetector agora envolve só o carrossel, não
  // mais o photoLikePillWrap (ver JSX acima): o pill de curtir precisa
  // ficar fora dessa subárvore pra o Pressable receber o toque em vez do
  // Gesture.Tap do carrossel disputar (e vencer) o mesmo toque.
  photosCarouselWrap: { flex: 1 },
  // S123 — mesmo padrão visual de photoCountBadge/lookingForBadge do
  // SwipeScreen.tsx: rgba(0,0,0,0.55), full radius, padding pequeno. Wrap
  // absolute posiciona o pill sem interferir no layout do carrossel; o pill
  // em si NÃO herda position absolute (só o wrap).
  photoLikePillWrap: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
  },
  photoLikePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoLikePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },

  infoCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  // S134 — nome e idade em Text separados: só o nome trunca (numberOfLines
  // no Text do nome), a idade nunca encolhe/corta.
  nameAgeGroup: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  nameAge: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  ufRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ufText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  // S88 — espelha ufText, mas com margem própria: o respiro de 4px da UF
  // mora no wrapper `ufRow`, e o vale é <Text> solto, sem wrapper — sem
  // isto ele encosta no nome enquanto a UF respira. Mesmo papel do
  // marginBottom do valeText no card do Descobrir.
  valeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  lookingForBadge: {
    alignSelf: 'flex-start',
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

  swipeActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: theme.spacing.lg,
  },
  swipeBtn: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  nopeBtn: { borderColor: theme.colors.nope },
  likeBtn: { borderColor: theme.colors.like },
  alreadyLikedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 56,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  alreadyLikedChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },

  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
  },
  reportBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },

  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: theme.spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.full,
  },
  blockBtnText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '700' },
});
