// src/screens/SwipeScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert } from 'react-native';
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
import { InterestChips } from '@/components/InterestChips';
import { MatchModal } from '@/components/MatchModal';
import { PendingVerificationChip } from '@/components/PendingVerificationChip';
import { PhotoCarousel, type PhotoCarouselHandle } from '@/components/PhotoCarousel';
import { PromptCard } from '@/components/PromptCard';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_FILTERS, useFilters } from '@/hooks/useFilters';
import { useSuperLikeQuota } from '@/hooks/useSuperLikeQuota';
import { RootStackParamList } from '@/navigation';
import {
  getDiscoverProfiles,
  recordSwipe,
  undoSwipe,
  SuperLikeQuotaExceededError,
  SwipeContext,
  UserProfile,
} from '@/services/firestoreService';
import { EMPTY_INTEREST_SET, getSharedInterestSet } from '@/utils/interests';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
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
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchedProfile, setMatchedProfile] = useState<UserProfile | null>(null);
  const [lastSwipedProfile, setLastSwipedProfile] = useState<LastSwipedProfile | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Interesses do usuário logado, memoizados pra não recalcular a cada
  // render — só muda quando o profile (e portanto profile.interests) muda.
  const myInterests = useMemo(() => profile?.interests ?? [], [profile?.interests]);

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
    .maxDuration(250)
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(handlePhotoTap)(e.x);
    });

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
  }, [user, profile?.uf, profile?.blockedUsers, filters, translateX, translateY]);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles]),
  );

  const completeSwipe = (dir: 'left' | 'right' | 'super') => {
    const target = profilesRef.current[currentIndexRef.current];
    const swipedIndex = currentIndexRef.current;
    const targetPhotos = target?.photos?.length
      ? target.photos
      : target?.photoURL
        ? [target.photoURL]
        : [];
    const visibleContext = visibleContextRef.current;
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

  const handleSuperLikePress = () => {
    if (superLikesRemaining === 0) {
      showSuperLikeQuotaAlert();
      return;
    }
    swipeCard('super');
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

  const swipeCard = (dir: 'left' | 'right' | 'super') => {
    if (!user || currentIndex >= profiles.length) return;
    const toX = dir === 'left' ? -SCREEN_W * 1.5 : SCREEN_W * 1.5;
    const toY = dir === 'super' ? -SCREEN_H : 0;

    translateY.value = withTiming(toY, { duration: 300 });
    translateX.value = withTiming(toX, { duration: 300 }, (finished) => {
      if (finished) runOnJS(completeSwipe)(dir);
    });
  };

  const gesture = Gesture.Pan()
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
                  myInterests={myInterests}
                />
              </View>
            )}

            {/* Current card (swipeable) */}
            <GestureDetector gesture={gesture}>
              <Animated.View collapsable={false} style={[styles.card, cardStyle]}>
                <ProfileCard
                  key={currentProfile.uid}
                  profile={currentProfile}
                  myInterests={myInterests}
                  pagerNativeGesture={pagerNativeGesture}
                  tapGesture={tapGesture}
                  carouselRef={carouselRef}
                  onPhotoIndexChange={handlePhotoIndexChange}
                  onInfoPress={() =>
                    navigation.navigate('MatchProfile', {
                      uid: currentProfile.uid,
                      name: currentProfile.name,
                      photoURL: currentProfile.photoURL,
                    })
                  }
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
            dimmed={superLikesRemaining === 0}
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
    </View>
  );
}

// ─── ProfileCard ──────────────────────────────────────────
interface ProfileCardProps {
  profile: UserProfile;
  myInterests?: string[];
  pagerNativeGesture?: ReturnType<typeof Gesture.Native>;
  tapGesture?: ReturnType<typeof Gesture.Tap>;
  carouselRef?: React.RefObject<PhotoCarouselHandle | null>;
  onPhotoIndexChange?: (index: number) => void;
  onInfoPress?: () => void;
}

function ProfileCard({
  profile,
  myInterests,
  pagerNativeGesture,
  tapGesture,
  carouselRef,
  onPhotoIndexChange,
  onInfoPress,
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
  // Lista de interesses é pequena — calcular o conjunto compartilhado por
  // card a cada render é mais barato que memoizar por perfil.
  const sharedInterests = getSharedInterestSet(myInterests, profile.interests);
  // S48 — places e events juntos, places primeiro, no máximo 3 no total (sem
  // matching entre perfis nesta versão, por isso reaproveita InterestChips
  // com EMPTY_INTEREST_SET em vez de sharedInterests).
  const placesAndEvents = [...(profile.places ?? []), ...(profile.events ?? [])].slice(0, 3);
  const firstPrompt = profile.prompts?.[0];
  // Com prompt no card, o overlay (chips + pergunta/resposta) fica alto
  // demais com os 6 chips de antes — reduz pra 4 só quando há prompt pra
  // mostrar junto, mantendo 6 no caso comum (sem prompt).
  const chipsMaxVisible = firstPrompt ? 4 : 6;

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
              {profile.name}, {profile.age}
            </Text>
            {profile.verified ? <VerifiedBadge size={18} /> : <PendingVerificationChip />}
            {photos.length > 1 && (
              <View style={pcStyles.photoCountBadge} pointerEvents="none">
                <Ionicons name="camera" size={13} color={theme.colors.white} />
                <Text style={pcStyles.photoCountText}>
                  {photoIndex + 1}/{photos.length}
                </Text>
              </View>
            )}
          </View>
          {onInfoPress && (
            <TouchableOpacity
              style={pcStyles.infoBtn}
              onPress={onInfoPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle" size={28} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>
        {profile.uf && (
          <View style={pcStyles.ufRow} pointerEvents="none">
            <Ionicons name="location-outline" size={14} color={theme.colors.white} />
            <Text style={pcStyles.ufText}>{profile.uf}</Text>
          </View>
        )}
        <Text style={pcStyles.bio} numberOfLines={2}>
          {profile.bio || 'Sem bio ainda…'}
        </Text>
        {profile.lookingFor && (
          <View style={pcStyles.lookingForBadge}>
            <Text style={pcStyles.lookingForBadgeText}>
              {LOOKING_FOR_LABELS[profile.lookingFor]}
            </Text>
          </View>
        )}
        {(!!profile.interests?.length || firstPrompt) && (
          // pointerEvents="none" pra não interceptar as tap zones do
          // PhotoCarousel nem o gesto de swipe do card.
          <View pointerEvents="none">
            {!!profile.interests?.length && (
              <>
                <View style={pcStyles.interestsLabelRow}>
                  <Ionicons name="pricetags" size={14} color={theme.colors.white} />
                  <Text style={pcStyles.interestsLabel}>Interesses</Text>
                </View>
                <InterestChips
                  interests={profile.interests}
                  sharedSet={sharedInterests}
                  maxVisible={chipsMaxVisible}
                />
              </>
            )}
            {firstPrompt && (
              <View style={pcStyles.promptWrap}>
                <PromptCard
                  promptId={firstPrompt.id}
                  answer={firstPrompt.answer}
                  variant="overlay"
                />
              </View>
            )}
          </View>
        )}
        {placesAndEvents.length > 0 && (
          <View style={pcStyles.placesEventsWrap} pointerEvents="none">
            <InterestChips
              interests={placesAndEvents}
              sharedSet={EMPTY_INTEREST_SET}
              maxVisible={3}
            />
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
    height: CARD_W * 1.35,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.medium,
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
    backgroundColor: theme.colors.white,
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
  ufRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  ufText: { fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  bio: { fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  lookingForBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  lookingForBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.white,
    fontWeight: '700',
  },
  interestsLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  interestsLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.white },
  promptWrap: { marginTop: 8 },
  placesEventsWrap: { marginTop: 8 },
});
