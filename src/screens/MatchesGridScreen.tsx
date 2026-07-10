// src/screens/MatchesGridScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useActiveMatches } from '@/hooks/useActiveMatches';
import { RootStackParamList } from '@/navigation';

type MatchesGridScreenProps = NativeStackScreenProps<RootStackParamList, 'MatchesGrid'>;

// Grade só de perfis que deram match, sem a UI de conversa (diferente da
// aba "Conversas"/MatchesScreen, que já mostra lastMessage e vai direto pro
// Chat). Toque num card abre MatchProfileScreen COM matchId preenchido —
// isso já ativa o modo não-preview do componente (isPreview = !matchId),
// que esconde os botões de curtir/passar e mostra só Denunciar/Bloquear.
export default function MatchesGridScreen({ navigation }: MatchesGridScreenProps) {
  const { matches, loading } = useActiveMatches();

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Matches</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
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
      ) : matches.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Nenhum match ainda"
          subtitle="Continue deslizando para encontrar alguém!"
        />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => {
            const other = item.otherProfile;
            return (
              <AnimatedPressable
                style={styles.matchCard}
                onPress={() =>
                  other &&
                  navigation.navigate('MatchProfile', {
                    uid: other.uid,
                    matchId: item.id,
                    name: other.name,
                    photoURL: other.photoURL,
                  })
                }
              >
                <Animated.View style={styles.matchCardInner} entering={FadeInDown}>
                  {other?.photoURL ? (
                    <Image
                      source={{ uri: other.photoURL }}
                      style={styles.matchPhoto}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                      transition={200}
                    />
                  ) : (
                    <View style={styles.matchPhotoPlaceholder}>
                      <Text style={{ fontSize: 40 }}>😊</Text>
                    </View>
                  )}
                  <View style={styles.matchInfo}>
                    <Text style={styles.matchName}>
                      {other?.name ?? 'Usuário'}
                      {other?.age ? `, ${other.age}` : ''}
                    </Text>
                  </View>
                  <View style={styles.matchBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.colors.onSecondary} />
                  </View>
                </Animated.View>
              </AnimatedPressable>
            );
          }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 14,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },

  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    gap: 12,
  },

  grid: { padding: theme.spacing.md, gap: 12 },
  matchCard: { flex: 1 },
  matchCardInner: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
    position: 'relative',
  },
  matchPhoto: { width: '100%', aspectRatio: 0.8 },
  matchPhotoPlaceholder: {
    width: '100%',
    aspectRatio: 0.8,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 10,
  },
  matchName: { color: theme.colors.white, fontWeight: '600', fontSize: theme.fontSize.sm },
  matchBadge: {
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
