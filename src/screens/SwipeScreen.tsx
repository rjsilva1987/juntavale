// src/screens/SwipeScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { MatchModal } from '@/components/MatchModal';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_FILTERS, useFilters } from '@/hooks/useFilters';
import { RootStackParamList } from '@/navigation';
import {
  getDiscoverProfiles,
  recordSwipe,
  undoSwipe,
  UserProfile,
} from '@/services/firestoreService';

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
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchedProfile, setMatchedProfile] = useState<UserProfile | null>(null);
  const [lastSwipedProfile, setLastSwipedProfile] = useState<LastSwipedProfile | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

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

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Lets the PhotoCarousel's internal pager handle horizontal drags on the
  // photo itself, instead of the card's own pan gesture stealing them.
  const pagerNativeGesture = Gesture.Native();

  const loadProfiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let currentLocation = profile?.location;
      if (!currentLocation) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        }
      }

      const data = await getDiscoverProfiles(user.uid, filters, currentLocation, profile?.blockedUsers);
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
  }, [user, profile?.location, profile?.blockedUsers, filters, translateX, translateY]);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles]),
  );

  const completeSwipe = (dir: 'left' | 'right' | 'super') => {
    const target = profilesRef.current[currentIndexRef.current];
    const swipedIndex = currentIndexRef.current;
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
      .catch(() => {});
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
    .simultaneousWithExternalGesture(pagerNativeGesture)
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
                <ProfileCard profile={profiles[currentIndex + 1]} />
              </View>
            )}

            {/* Current card (swipeable) */}
            <GestureDetector gesture={gesture}>
              <Animated.View collapsable={false} style={[styles.card, cardStyle]}>
                <ProfileCard
                  profile={currentProfile}
                  pagerNativeGesture={pagerNativeGesture}
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
            onPress={() => swipeCard('super')}
            iconColor={theme.colors.onSecondary}
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
  pagerNativeGesture?: ReturnType<typeof Gesture.Native>;
  onInfoPress?: () => void;
}

function ProfileCard({ profile, pagerNativeGesture, onInfoPress }: ProfileCardProps) {
  const photos = profile.photos?.length
    ? profile.photos
    : profile.photoURL
      ? [profile.photoURL]
      : [];
  const carousel = <PhotoCarousel photos={photos} />;

  return (
    <View style={pcStyles.container}>
      {pagerNativeGesture ? (
        <GestureDetector gesture={pagerNativeGesture}>
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
            {profile.verified && <VerifiedBadge size={18} />}
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
        <Text style={pcStyles.bio} numberOfLines={2}>
          {profile.bio || 'Sem bio ainda…'}
        </Text>
        <View style={pcStyles.tags}>
          {profile.interests?.slice(0, 3).map((t) => (
            <View key={t} style={pcStyles.tag}>
              <Text style={pcStyles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
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
}

function ActionButton({ icon, color, size, onPress, iconColor, disabled }: ActionButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { width: size, height: size, borderColor: color },
        disabled && styles.actionBtnDisabled,
      ]}
      onPress={handlePress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={size * 0.45} color={iconColor || color} />
    </TouchableOpacity>
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
  },
  bio: { fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tagText: { fontSize: theme.fontSize.xs, fontWeight: '600', color: theme.colors.onSecondary },
});
