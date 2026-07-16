// src/screens/MatchesScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { MatchWithProfile, useActiveMatches } from '@/hooks/useActiveMatches';
import { RootStackParamList } from '@/navigation';
import { LastMessage } from '@/services/firestoreService';
import { hasValidLastMessage, isMatchUnread } from '@/utils/matches';

type MatchesScreenProps = Pick<NativeStackScreenProps<RootStackParamList, 'Main'>, 'navigation'>;

type Conversation = MatchWithProfile & { lastMessage: LastMessage };

const firstName = (name?: string) => (name ?? 'Usuário').split(' ')[0];

export default function MatchesScreen({ navigation }: MatchesScreenProps) {
  const { user, profile } = useAuth();
  const { matches: activeMatches, loading } = useActiveMatches();

  // Novos matches (sem mensagem válida ainda) x conversas com preview —
  // padrão Tinder. Legado com lastMessage string antiga cai em newMatches
  // (hasValidLastMessage retorna false), sem crash e sem preview (S27).
  const newMatches = useMemo(() => {
    return activeMatches
      .filter((m) => !hasValidLastMessage(m))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [activeMatches]);

  const conversations = useMemo<Conversation[]>(() => {
    return activeMatches.filter(hasValidLastMessage).sort((a, b) => {
      const ta = a.lastMessage.createdAt?.toMillis() ?? Infinity;
      const tb = b.lastMessage.createdAt?.toMillis() ?? Infinity;
      return tb - ta;
    });
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
              <SkeletonPlaceholder width={56} height={56} borderRadius={28} />
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

  const renderNewMatch = ({ item }: { item: MatchWithProfile }) => (
    <AnimatedPressable
      style={styles.newMatchItem}
      entering={FadeInDown}
      onPress={() => handleOpenChat(item)}
    >
      <View style={styles.newMatchAvatarWrap}>
        {item.otherProfile?.photoURL ? (
          <Image
            source={{ uri: item.otherProfile.photoURL }}
            style={styles.newMatchAvatar}
            contentFit="cover"
            placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
            transition={200}
          />
        ) : (
          <View style={styles.newMatchAvatarPlaceholder}>
            <Text style={styles.avatarEmoji}>😊</Text>
          </View>
        )}
        {item.otherProfile?.verified === true && (
          <View style={styles.newMatchVerifiedBadge}>
            <VerifiedBadge size={12} />
          </View>
        )}
      </View>
      <Text style={styles.newMatchName} numberOfLines={1}>
        {firstName(item.otherProfile?.name)}
      </Text>
    </AnimatedPressable>
  );

  const renderConversation = ({ item }: { item: Conversation }) => {
    const unread = isMatchUnread(item, user?.uid ?? '');
    const isPhoto = item.lastMessage.text === '📷 Foto';
    const youPrefix = item.lastMessage.senderId === user?.uid ? 'Você: ' : '';

    return (
      <AnimatedPressable
        style={styles.matchCard}
        entering={FadeInDown}
        onPress={() => handleOpenChat(item)}
      >
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
          {isPhoto && (
            <View style={styles.photoBadge}>
              <Ionicons name="camera" size={12} color={theme.colors.onSecondary} />
            </View>
          )}
        </View>

        <View style={styles.matchInfo}>
          <View style={styles.matchNameRow}>
            <Text style={styles.matchName} numberOfLines={1}>
              {item.otherProfile?.name ?? 'Usuário'}
            </Text>
            {item.otherProfile?.verified === true && <VerifiedBadge size={14} />}
          </View>
          <Text style={[styles.lastMsg, unread && styles.lastMsgUnread]} numberOfLines={1}>
            {youPrefix}
            {item.lastMessage.text}
          </Text>
        </View>

        {unread && <View style={styles.unreadDot} />}
      </AnimatedPressable>
    );
  };

  const listHeader = (
    <>
      {newMatches.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Novos matches</Text>
          <FlatList
            data={newMatches}
            keyExtractor={(item) => item.id}
            renderItem={renderNewMatch}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.newMatchesList}
          />
        </>
      )}
      {conversations.length > 0 && <Text style={styles.sectionTitle}>Mensagens</Text>}
    </>
  );

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <Text style={styles.title}>Conversas</Text>
      </View>

      {activeMatches.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Nenhum match ainda"
          subtitle="Continue deslizando para encontrar alguém!"
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="Suas conversas aparecerão aqui"
              style={styles.lightEmptyState}
            />
          }
          renderItem={renderConversation}
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

  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },

  newMatchesList: { gap: 14, paddingBottom: theme.spacing.lg },
  newMatchItem: { width: 80, alignItems: 'center', gap: 6 },
  newMatchAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    padding: 2,
  },
  newMatchAvatar: { width: '100%', height: '100%', borderRadius: 34 },
  newMatchVerifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  newMatchAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newMatchName: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.text,
    width: 80,
    textAlign: 'center',
  },

  lightEmptyState: { flex: 0, paddingVertical: theme.spacing.xl },

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
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 28 },
  photoBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },

  matchInfo: { flex: 1 },
  matchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
    flexShrink: 1,
  },
  matchName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    flexShrink: 1,
  },
  lastMsg: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  lastMsgUnread: { fontWeight: '600', color: theme.colors.text },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
});
