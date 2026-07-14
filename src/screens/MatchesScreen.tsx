// src/screens/MatchesScreen.tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { MatchWithProfile, useActiveMatches } from '@/hooks/useActiveMatches';
import { RootStackParamList } from '@/navigation';
import 'dayjs/locale/pt-br';
dayjs.extend(relativeTime);
dayjs.locale('pt-br');

type MatchesScreenProps = Pick<NativeStackScreenProps<RootStackParamList, 'Main'>, 'navigation'>;

export default function MatchesScreen({ navigation }: MatchesScreenProps) {
  const { profile } = useAuth();
  const { matches: activeMatches, loading } = useActiveMatches();
  const [matches, setMatches] = useState<MatchWithProfile[]>([]);

  useEffect(() => {
    // Sort by most recent message — específico desta tela (o hook
    // compartilhado devolve a ordem "natural" do listener, sem ordenar).
    const sorted = [...activeMatches].sort((a, b) => {
      const ta = a.lastMessageAt?.toMillis() ?? 0;
      const tb = b.lastMessageAt?.toMillis() ?? 0;
      return tb - ta;
    });
    setMatches(sorted);
  }, [activeMatches]);

  // Gate client-side: só evita a navegação e explica o motivo. A garantia
  // real é a rule de create em matches/{matchId}/messages (verified==true) —
  // isso aqui é UX, não segurança (ver ChatScreen.tsx pra defesa em
  // profundidade, caso alguém chegue no Chat por outro caminho).
  const handleOpenChat = (item: MatchWithProfile) => {
    if (!profile?.verified) {
      Alert.alert(
        'Verifique seu perfil para conversar',
        'Você precisa verificar seu perfil antes de enviar mensagens.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Verificar agora', onPress: () => navigation.navigate('Verification') },
        ],
      );
      return;
    }
    navigation.navigate('Chat', {
      matchId: item.id,
      otherUid: item.otherProfile?.uid ?? '',
      otherName: item.otherProfile?.name ?? 'Usuário',
      otherPhoto: item.otherProfile?.photoURL ?? '',
    });
  };

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
              onPress={() => handleOpenChat(item)}
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
