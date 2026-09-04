// src/screens/ListingChatsScreen.tsx
//
// S168-B — lista de conversas de classificados, mirror estrutural de
// MomentoRequestsScreen.tsx. Sem param: TODAS as conversas do uid logado
// (dono e interessado), header "Classificados". Com {listingId,
// listingTitle}: só as conversas DAQUELE anúncio em que o uid é DONO
// (entrada por MyListingsScreen, linha "N conversas"), header = listingTitle.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  isListingChatUnread,
  ListingChat,
  listenMyListingChats,
} from '@/services/listingChatService';
import { getDisplayName } from '@/utils/profile';

type ListingChatsScreenProps = NativeStackScreenProps<RootStackParamList, 'ListingChats'>;

export default function ListingChatsScreen({ route, navigation }: ListingChatsScreenProps) {
  const { user, profile } = useAuth();
  const filterListingId = route.params?.listingId;
  const [chats, setChats] = useState<ListingChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [otherProfiles, setOtherProfiles] = useState<Record<string, UserProfile | null>>({});
  const requestedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || profile?.verified !== true) {
      setChats([]);
      setLoading(false);
      return;
    }
    const unsub = listenMyListingChats(user.uid, (data) => {
      setChats(data);
      setLoading(false);
    });
    return unsub;
  }, [user, profile?.verified]);

  const rows = filterListingId
    ? chats.filter((c) => c.listingId === filterListingId && c.ownerId === user?.uid)
    : chats;

  // Mesmo padrão de dedup de MomentoRequestsScreen.tsx (requestedUidsRef) —
  // nome/avatar da OUTRA parte de cada conversa, buscado sob demanda por uid
  // novo.
  useEffect(() => {
    if (!user) return;
    const missing = rows
      .map((c) => (c.ownerId === user.uid ? c.interestedId : c.ownerId))
      .filter((uid) => !requestedUidsRef.current.has(uid));
    [...new Set(missing)].forEach((uid) => {
      requestedUidsRef.current.add(uid);
      getUserProfile(uid)
        .then((p) => setOtherProfiles((prev) => ({ ...prev, [uid]: p })))
        .catch(() => {});
    });
  }, [rows, user]);

  const headerTitle = filterListingId ? (route.params?.listingTitle ?? 'Anúncio') : 'Classificados';

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState icon="chatbubbles-outline" title="Nenhuma conversa ainda" />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            renderItem={({ item }) => {
              const otherUid = item.ownerId === user?.uid ? item.interestedId : item.ownerId;
              const otherProfile = otherProfiles[otherUid];
              const unread = user ? isListingChatUnread(item, user.uid) : false;
              const prefix = item.lastMessage.senderId === user?.uid ? 'Você: ' : '';
              return (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() =>
                    navigation.navigate('ListingChat', {
                      listingId: item.listingId,
                      ownerId: item.ownerId,
                      interestedId: item.interestedId,
                      listingTitle: item.listingTitle,
                    })
                  }
                >
                  {otherProfile?.photoURL ? (
                    <Image
                      source={{ uri: otherProfile.photoURL }}
                      style={styles.avatar}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>😊</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.otherName} numberOfLines={1}>
                        {getDisplayName(otherProfile)}
                      </Text>
                      {unread && <View style={styles.unreadDot} />}
                    </View>
                    {!filterListingId && (
                      <Text style={styles.listingTitleText} numberOfLines={1}>
                        {item.listingTitle}
                      </Text>
                    )}
                    <Text
                      style={[styles.preview, unread && styles.previewUnread]}
                      numberOfLines={1}
                    >
                      {prefix}
                      {item.lastMessage.text}
                    </Text>
                  </View>
                  <Text style={styles.time}>
                    {item.lastMessageAt
                      ? dayjs(item.lastMessageAt.toDate()).format('DD/MM HH:mm')
                      : ''}
                  </Text>
                </AnimatedPressable>
              );
            }}
          />
        )}
      </SafeAreaView>
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
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 12,
    ...theme.shadows.medium,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },

  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  otherName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  // Mesmo valor exato de unreadDot (MomentoRequestsScreen.tsx) — cada tela
  // guarda sua própria cópia (nenhum StyleSheet compartilhado no projeto).
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.error },
  listingTitleText: { fontSize: theme.fontSize.xs, color: theme.colors.primary, fontWeight: '600' },
  preview: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  previewUnread: { fontWeight: '600', color: theme.colors.text },

  time: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },
});
