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
import { useAnsweredMomentoRequests } from '@/hooks/useAnsweredMomentoRequests';
import { RootStackParamList } from '@/navigation';
import { LastMessage, UserProfile } from '@/services/firestoreService';
import { hasValidLastMessage, isMatchUnread } from '@/utils/matches';
import { getDisplayName } from '@/utils/profile';

type MatchesScreenProps = Pick<NativeStackScreenProps<RootStackParamList, 'Main'>, 'navigation'>;

// S143-C (revisão pós-teste de aparelho) — linha da lista "Mensagens":
// conversa de match (kind 'match', preview + unread reais) OU conversa de
// Momento JÁ respondida (kind 'momento', etiqueta "via Momento", SEPARADA
// do chat do match mesmo quando as duas pessoas têm match — decisão de
// produto, useAnsweredMomentoRequests.ts). As duas entram na MESMA lista,
// ordenadas juntas pela última mensagem (ver `rows` abaixo).
type ConversationRow =
  | {
      kind: 'match';
      id: string;
      matchId: string;
      otherProfile?: UserProfile;
      lastMessage: LastMessage;
      unread: boolean;
    }
  | {
      kind: 'momento';
      id: string;
      requestId: string;
      otherProfile?: UserProfile;
      lastMessage: LastMessage;
    };

// firstName() foi removido na S135: nickname já nasce curto de propósito
// (cap de 30 chars, ver MAX_NICKNAME_LENGTH em ProfileScreen.tsx), então
// truncar em .split(' ')[0] reintroduziria o mesmo problema de truncamento
// que a S135 existe pra resolver (ver S134/raiz do card).

export default function MatchesScreen({ navigation }: MatchesScreenProps) {
  const { user, profile } = useAuth();
  const { matches: activeMatches, loading: matchesLoading } = useActiveMatches();
  // S143-C (revisão pós-teste de aparelho) — conversas de Momento
  // 'answered', SEPARADAS do chat de match (decisão de produto). Mesclado
  // com activeMatches abaixo, ordenado junto pela última mensagem.
  const { conversations: momentoConversations, loading: momentoLoading } =
    useAnsweredMomentoRequests();
  const loading = matchesLoading || momentoLoading;

  // Novos matches (sem mensagem válida ainda) x conversas com preview —
  // padrão Tinder. Legado com lastMessage string antiga cai em newMatches
  // (hasValidLastMessage retorna false), sem crash e sem preview (S27).
  const newMatches = useMemo(() => {
    return activeMatches
      .filter((m) => !hasValidLastMessage(m))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [activeMatches]);

  // Mescla conversas de match (com preview) + conversas de Momento
  // respondidas numa lista só, ordenada pela última mensagem — mesmo
  // critério de "createdAt ausente vira Infinity" (mensagem ainda
  // resolvendo o serverTimestamp local não deve saltar pro fim da lista).
  const rows = useMemo<ConversationRow[]>(() => {
    const matchRows: ConversationRow[] = activeMatches.filter(hasValidLastMessage).map((m) => ({
      kind: 'match',
      id: `match:${m.id}`,
      matchId: m.id,
      otherProfile: m.otherProfile,
      lastMessage: m.lastMessage,
      unread: isMatchUnread(m, user?.uid ?? ''),
    }));
    const momentoRows: ConversationRow[] = momentoConversations.map((c) => ({
      kind: 'momento',
      id: `momento:${c.requestId}`,
      requestId: c.requestId,
      otherProfile: c.otherProfile,
      lastMessage: c.lastMessage,
    }));
    return [...matchRows, ...momentoRows].sort((a, b) => {
      const ta = a.lastMessage.createdAt?.toMillis() ?? Infinity;
      const tb = b.lastMessage.createdAt?.toMillis() ?? Infinity;
      return tb - ta;
    });
  }, [activeMatches, momentoConversations, user]);

  // Gate client-side: só evita a navegação e explica o motivo. A garantia
  // real é a rule de create em matches/{matchId}/messages (verified==true) —
  // isso aqui é UX, não segurança (ver ChatScreen.tsx pra defesa em
  // profundidade, caso alguém chegue no Chat por outro caminho).
  const handleOpenChat = (matchId: string, otherProfile?: UserProfile) => {
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
      matchId,
      otherUid: otherProfile?.uid ?? '',
      otherName: getDisplayName(otherProfile),
      otherPhoto: otherProfile?.photoURL ?? '',
    });
  };

  // S143-C (revisão pós-teste de aparelho) — reusa a MomentoRequestChatScreen
  // já existente (S143-B) como tela da conversa; nenhum gate de `verified`
  // aqui, mesmo comportamento que ela já tinha antes desta revisão.
  const handleOpenRow = (row: ConversationRow) => {
    if (row.kind === 'match') {
      handleOpenChat(row.matchId, row.otherProfile);
    } else {
      navigation.navigate('MomentoRequestChat', { requestId: row.requestId });
    }
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
      onPress={() => handleOpenChat(item.id, item.otherProfile)}
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
        {getDisplayName(item.otherProfile)}
      </Text>
    </AnimatedPressable>
  );

  const renderConversation = ({ item }: { item: ConversationRow }) => {
    const unread = item.kind === 'match' && item.unread;
    const isPhoto = item.lastMessage.text === '📷 Foto';
    const youPrefix = item.lastMessage.senderId === user?.uid ? 'Você: ' : '';

    return (
      <AnimatedPressable
        style={styles.matchCard}
        entering={FadeInDown}
        onPress={() => handleOpenRow(item)}
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
              {getDisplayName(item.otherProfile)}
            </Text>
            {item.otherProfile?.verified === true && <VerifiedBadge size={14} />}
            {/* S143-C (revisão pós-teste de aparelho) — etiqueta "via Momento":
                conversa SEPARADA do chat de match, mesmo quando as duas
                pessoas têm match (decisão de produto). */}
            {item.kind === 'momento' && (
              <View style={styles.momentoTag}>
                <Ionicons name="sparkles" size={10} color={theme.colors.primary} />
                <Text style={styles.momentoTagText}>via Momento</Text>
              </View>
            )}
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
      {rows.length > 0 && <Text style={styles.sectionTitle}>Mensagens</Text>}
    </>
  );

  // S143-C (revisão pós-teste de aparelho) — o gate "nada ainda" agora
  // considera as duas fontes: uma conta sem NENHUM match mas com uma
  // conversa de Momento respondida não pode cair no "Nenhum match ainda"
  // (teria conteúdo real escondido atrás do empty state errado).
  const hasNothing = activeMatches.length === 0 && momentoConversations.length === 0;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <Text style={styles.title}>Conversas</Text>
      </View>

      {hasNothing ? (
        <EmptyState
          icon="heart-outline"
          title="Nenhum match ainda"
          subtitle="Continue deslizando para encontrar alguém!"
        />
      ) : (
        <FlatList
          data={rows}
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
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
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
  // S143-C (revisão pós-teste de aparelho) — etiqueta "via Momento": fundo
  // primaryLight + texto/ícone primary (REGRA DE OURO do CLAUDE.md: nunca
  // texto branco sobre secondary/#FBBF24 — este par não usa secondary,
  // então nem se aproxima do problema).
  momentoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  momentoTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
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
