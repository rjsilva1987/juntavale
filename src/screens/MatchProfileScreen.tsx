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
import { InterestChips } from '@/components/InterestChips';
import { MatchModal } from '@/components/MatchModal';
import { PendingVerificationChip } from '@/components/PendingVerificationChip';
import { PhotoCarousel, type PhotoCarouselHandle } from '@/components/PhotoCarousel';
import { PromptCard } from '@/components/PromptCard';
import { ReportModal } from '@/components/ReportModal';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { UF_NAMES } from '@/constants/ufs';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import {
  getSwipe,
  getUserProfile,
  recordSwipe,
  SwipeContext,
  UserProfile,
} from '@/services/firestoreService';
import { EMPTY_INTEREST_SET, getSharedInterestSet } from '@/utils/interests';

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
      } else {
        Alert.alert('Erro', 'Não foi possível registrar sua ação. Tente novamente.');
      }
    } finally {
      setActionPending(false);
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

  const myInterests = useMemo(() => myProfile?.interests ?? [], [myProfile?.interests]);
  const sharedInterestSet = useMemo(
    () => getSharedInterestSet(myInterests, profile?.interests),
    [myInterests, profile?.interests],
  );

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
            <GestureDetector gesture={photoTapGesture}>
              <View
                style={styles.photosCard}
                onLayout={(e) => setPhotoAreaWidth(e.nativeEvent.layout.width)}
              >
                <PhotoCarousel
                  ref={carouselRef}
                  photos={photos}
                  style={styles.photosCarousel}
                  onIndexChange={setPhotoIndex}
                />
              </View>
            </GestureDetector>

            <View style={styles.infoCard}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {profile?.name ?? name}
                  {profile?.age ? `, ${profile.age}` : ''}
                </Text>
                {profile?.verified ? <VerifiedBadge size={18} /> : <PendingVerificationChip />}
                {profile?.founderNumber != null && <FounderBadge number={profile.founderNumber} />}
              </View>

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

              {!!profile?.bio && (
                <>
                  <Text style={styles.sectionTitle}>Sobre</Text>
                  <Text style={styles.bio}>{profile.bio}</Text>
                </>
              )}

              {(profile?.interests?.length ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Interesses</Text>
                  <InterestChips
                    interests={profile?.interests ?? []}
                    sharedSet={sharedInterestSet}
                    maxVisible={100}
                    variant="surface"
                  />
                </>
              )}

              {(profile?.places?.length ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Meus lugares</Text>
                  <InterestChips
                    interests={profile?.places ?? []}
                    sharedSet={EMPTY_INTEREST_SET}
                    maxVisible={100}
                    variant="surface"
                  />
                </>
              )}

              {(profile?.events?.length ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>No meu radar</Text>
                  <InterestChips
                    interests={profile?.events ?? []}
                    sharedSet={EMPTY_INTEREST_SET}
                    maxVisible={100}
                    variant="surface"
                  />
                </>
              )}

              {/* S67-complemento — bilhete completo da super curtida (sem
                  numberOfLines, ao contrário do preview truncado em 3 linhas
                  do card na LikesScreen — aquele truncamento continua
                  correto lá, este texto aqui é a versão completa). Só existe
                  quando o param `note` vem presente (aba "Quem curtiu você"
                  da LikesScreen); em todo outro ponto de entrada desta tela
                  o bloco inteiro simplesmente não renderiza. Posicionado
                  acima de "Perguntas" — é a informação mais relevante pra
                  decisão de curtir de volta. */}
              {!!note && (
                <>
                  <Text style={styles.sectionTitle}>Bilhete</Text>
                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>“{note}”</Text>
                  </View>
                </>
              )}

              {((profile?.prompts?.length ?? 0) > 0 || profile?.weeklyPromptAnswer) && (
                <>
                  <Text style={styles.sectionTitle}>Perguntas</Text>
                  {/* S59 — prompt da semana em destaque primeiro (mesmo
                      PromptCard dos demais, sem componente novo), seguido dos
                      itens de prompts[]. Perfis de teste anteriores ao S59
                      podem ter um item com id wXX preso dentro de prompts[]
                      — continua renderizando normalmente aqui (getPromptText
                      já resolve id de WEEKLY_PROMPTS), sem tratamento
                      especial nem deduplicação com weeklyPromptAnswer. */}
                  {profile?.weeklyPromptAnswer && (
                    <PromptCard
                      key={`weekly-${profile.weeklyPromptAnswer.id}`}
                      promptId={profile.weeklyPromptAnswer.id}
                      answer={profile.weeklyPromptAnswer.answer}
                      variant="surface"
                    />
                  )}
                  {profile?.prompts?.map((item, index) => (
                    <PromptCard
                      key={`${item.id}-${index}`}
                      promptId={item.id}
                      answer={item.answer}
                      variant="surface"
                    />
                  ))}
                </>
              )}
            </View>

            {isPreview && (
              <View style={styles.swipeActions}>
                <AnimatedPressable
                  style={[styles.swipeBtn, styles.nopeBtn]}
                  onPress={() => handleSwipeAction('nope')}
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
    backgroundColor: theme.colors.white,
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

  infoCard: {
    backgroundColor: theme.colors.white,
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
  ufRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ufText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
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
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bio: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },
  // S67-complemento — mesma linguagem visual de citação do LikeCard
  // (LikesScreen: borda à esquerda em primaryLight + itálico), adaptada pro
  // fundo claro do infoCard aqui (texto escuro em vez de branco — nunca
  // amarelo com texto branco, regra do projeto).
  noteBox: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryLight,
  },
  noteText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    fontStyle: 'italic',
    lineHeight: 22,
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
    backgroundColor: theme.colors.white,
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
