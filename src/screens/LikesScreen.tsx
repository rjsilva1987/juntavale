// src/screens/LikesScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useLikers } from '@/hooks/useLikers';
import { RootStackParamList } from '@/navigation';

export default function LikesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { likers, loading, reload } = useLikers();

  // useLikers faz fetch único (getDocs), não onSnapshot — sem isso, quem foi
  // retribuído/dispensado no preview continuaria aparecendo aqui até um
  // remount da tela.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

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
          keyExtractor={(item) => item.profile.uid}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <AnimatedPressable
              style={[styles.likerCard, item.isSuperLike && styles.likerCardSuperLike]}
              entering={FadeInDown}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('MatchProfile', {
                  uid: item.profile.uid,
                  name: item.profile.name,
                  photoURL: item.profile.photoURL,
                  fromLikes: true,
                });
              }}
            >
              {item.profile.photoURL ? (
                <Image
                  source={{ uri: item.profile.photoURL }}
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
              <View style={styles.likerInfo}>
                <Text style={styles.likerName}>
                  {item.profile.name}, {item.profile.age}
                </Text>
              </View>
              {item.isSuperLike && (
                <View style={styles.superLikeBadge}>
                  <Ionicons name="star" size={16} color={theme.colors.onSecondary} />
                </View>
              )}
              <View style={styles.heartBadge}>
                <Ionicons name="heart" size={16} color={theme.colors.onSecondary} />
              </View>
            </AnimatedPressable>
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
  likerCardSuperLike: {
    borderWidth: 2,
    borderColor: theme.colors.secondary,
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
  superLikeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
