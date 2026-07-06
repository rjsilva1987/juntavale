// src/screens/LikesScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { collection, query, where, getDocs } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

export default function LikesScreen() {
  const { user } = useAuth();
  const [likers, setLikers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLikes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // People who liked me but I haven't swiped yet
      const q = query(
        collection(db, 'swipes'),
        where('to', '==', user.uid),
        where('direction', 'in', ['like', 'superlike']),
      );
      const snap = await getDocs(q);

      // Check I haven't swiped them back
      const mySwipesSnap = await getDocs(
        query(collection(db, 'swipes'), where('from', '==', user.uid)),
      );
      const swipedByMe = new Set(mySwipesSnap.docs.map((d) => d.data().to));

      const uids = snap.docs
        .map((d) => d.data().from as string)
        .filter((uid) => !swipedByMe.has(uid));

      const profiles = await Promise.all(uids.map((uid) => getUserProfile(uid)));
      setLikers(profiles.filter(Boolean) as UserProfile[]);
    } catch (_) {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadLikes();
  }, [user, loadLikes]);

  if (loading) {
    return (
      <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <Text style={styles.title}>Quem curtiu você</Text>
        </View>
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonPlaceholder
              key={i}
              width="48%"
              height={180}
              borderRadius={theme.borderRadius.lg}
            />
          ))}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <Text style={styles.title}>Quem curtiu você</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{likers.length}</Text>
        </View>
      </View>

      {likers.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title="Ninguém curtiu ainda"
          subtitle="Continue completando seu perfil para atrair mais pessoas!"
        />
      ) : (
        <FlatList
          data={likers}
          keyExtractor={(item) => item.uid}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <Animated.View style={styles.likerCard} entering={FadeInDown}>
              {item.photoURL ? (
                <Image
                  source={{ uri: item.photoURL }}
                  style={styles.likerPhoto}
                  contentFit="cover"
                  placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  transition={200}
                />
              ) : (
                <View style={styles.likerPhotoPlaceholder}>
                  <Text style={{ fontSize: 40 }}>😊</Text>
                </View>
              )}
              {/* Blurred info — premium feature teaser */}
              <View style={styles.likerInfo}>
                <Text style={styles.likerName}>
                  {item.name}, {item.age}
                </Text>
              </View>
              <View style={styles.heartBadge}>
                <Ionicons name="heart" size={16} color={theme.colors.onSecondary} />
              </View>
            </Animated.View>
          )}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.primary },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    gap: 12,
  },
  badge: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: theme.fontSize.sm, fontWeight: '700', color: theme.colors.onSecondary },

  grid: { padding: theme.spacing.md, gap: 12 },
  likerCard: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
    position: 'relative',
  },
  likerPhoto: { width: '100%', aspectRatio: 0.8 },
  likerPhotoPlaceholder: {
    width: '100%',
    aspectRatio: 0.8,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likerInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 10,
  },
  likerName: { color: theme.colors.white, fontWeight: '600', fontSize: theme.fontSize.sm },
  heartBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
