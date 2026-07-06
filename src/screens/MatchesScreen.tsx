// src/screens/MatchesScreen.tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getMatches, getUserProfile, Match, UserProfile } from '@/services/firestoreService';
import 'dayjs/locale/pt-br';
dayjs.extend(relativeTime);
dayjs.locale('pt-br');

interface MatchWithProfile extends Match {
  otherProfile?: UserProfile;
}

type MatchesScreenProps = Pick<NativeStackScreenProps<RootStackParamList, 'Main'>, 'navigation'>;

export default function MatchesScreen({ navigation }: MatchesScreenProps) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = getMatches(user.uid, async (rawMatches) => {
      const enriched = await Promise.all(
        rawMatches.map(async (m) => {
          const otherId = m.users.find((u) => u !== user.uid);
          if (!otherId) return { ...m, otherProfile: undefined };
          const otherProfile = await getUserProfile(otherId);
          return { ...m, otherProfile: otherProfile ?? undefined };
        }),
      );
      // Sort by most recent message
      enriched.sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis() ?? 0;
        const tb = b.lastMessageAt?.toMillis() ?? 0;
        return tb - ta;
      });
      setMatches(enriched);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  if (loading) {
    return (
      <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <Text style={styles.title}>Conversas</Text>
        </View>
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.matchCard}>
              <SkeletonPlaceholder width={58} height={58} borderRadius={29} />
              <View style={styles.matchInfo}>
                <SkeletonPlaceholder
                  width={140}
                  height={16}
                  borderRadius={theme.borderRadius.sm}
                  style={{ marginBottom: 6 }}
                />
                <SkeletonPlaceholder width={200} height={13} borderRadius={theme.borderRadius.sm} />
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <Text style={styles.title}>Conversas</Text>
      </View>

      {matches.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Nenhum match ainda"
          subtitle="Continue deslizando para encontrar alguém!"
        />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
          renderItem={({ item }) => (
            <AnimatedPressable
              style={styles.matchCard}
              entering={FadeInDown}
              onPress={() =>
                navigation.navigate('Chat', {
                  matchId: item.id,
                  otherName: item.otherProfile?.name ?? 'Usuário',
                  otherPhoto: item.otherProfile?.photoURL ?? '',
                })
              }
            >
              {/* Avatar */}
              <View style={styles.avatarWrap}>
                {item.otherProfile?.photoURL ? (
                  <Image
                    source={{ uri: item.otherProfile.photoURL }}
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
                <View style={styles.onlineDot} />
              </View>

              {/* Info */}
              <View style={styles.matchInfo}>
                <Text style={styles.matchName}>{item.otherProfile?.name ?? 'Usuário'}</Text>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.lastMessage || 'Digam olá um ao outro! 👋'}
                </Text>
              </View>

              {/* Time */}
              {item.lastMessageAt && (
                <Text style={styles.time}>{dayjs(item.lastMessageAt.toDate()).fromNow(true)}</Text>
              )}
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.primary },

  skeletonList: { padding: theme.spacing.md, gap: 12 },

  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 14,
    ...theme.shadows.medium,
  },

  avatarWrap: { position: 'relative' },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 28 },
  onlineDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: theme.colors.like,
    borderWidth: 2,
    borderColor: theme.colors.white,
    position: 'absolute',
    bottom: 1,
    right: 1,
  },

  matchInfo: { flex: 1 },
  matchName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 3,
  },
  lastMsg: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

  time: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },
});
