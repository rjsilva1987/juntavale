// src/screens/MyListingsScreen.tsx
//
// S168-A — "Meus anúncios": todos os status do dono (exceto removidos, já
// filtrados por listMyListings), com ações de marcar vendido/excluir/editar.
// Mirror de MyTicketsScreen.tsx (header, FlatList com card + badge de
// status).
// S168-B — cada card ganha a contagem de conversas de contato daquele
// anúncio ("N conversas"), toque leva pra ListingChatsScreen filtrada.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { LISTING_REJECTION_REASON_LABELS } from '@/constants/listingRejectionReasons';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { listenMyListingChats } from '@/services/listingChatService';
import {
  formatListingPrice,
  Listing,
  listMyListings,
  markListingSold,
  removeListing,
  renewListing,
} from '@/services/listingService';

type MyListingsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyListings'>;

const STATUS_LABEL: Record<Listing['status'], string> = {
  pending: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  sold: 'Vendido',
  removed: 'Removido',
  expired: 'Expirado',
};

export default function MyListingsScreen({ navigation }: MyListingsScreenProps) {
  const { user, profile } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  // S168-B — contagem de conversas por anúncio (só as em que o uid logado é
  // DONO — um dono nunca aparece como interessado no próprio anúncio, mas o
  // filtro aqui é defensivo, mesmo raciocínio do filtro em ListingChatsScreen).
  const [chatCounts, setChatCounts] = useState<Record<string, number>>({});
  // S172 — evita duplo toque em "Renovar" enquanto a chamada está em voo.
  const [renewingId, setRenewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || profile?.verified !== true) {
      setChatCounts({});
      return;
    }
    const uid = user.uid;
    const unsub = listenMyListingChats(uid, (chats) => {
      const counts: Record<string, number> = {};
      chats.forEach((chat) => {
        if (chat.ownerId !== uid) return;
        counts[chat.listingId] = (counts[chat.listingId] ?? 0) + 1;
      });
      setChatCounts(counts);
    });
    return unsub;
  }, [user, profile?.verified]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setListings(await listMyListings(user.uid));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleMarkSold = (listing: Listing) => {
    Alert.alert('Marcar como vendido?', `"${listing.title}" some do feed de classificados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Marcar vendido',
        onPress: async () => {
          await markListingSold(listing.id);
          load();
        },
      },
    ]);
  };

  // S172 — renovação em 1 toque: sem Alert de confirmação (é "1 toque" por
  // definição da spec).
  const handleRenew = async (listing: Listing) => {
    setRenewingId(listing.id);
    try {
      await renewListing(listing.id);
      load();
    } catch (err) {
      console.error('[MyListingsScreen] falha ao renovar anúncio:', err);
      Alert.alert('Erro', 'Não foi possível renovar o anúncio.');
    } finally {
      setRenewingId(null);
    }
  };

  const handleRemove = (listing: Listing) => {
    Alert.alert('Excluir anúncio?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await removeListing(listing.id);
          load();
        },
      },
    ]);
  };

  const badgeStyleForStatus = (status: Listing['status']) => {
    switch (status) {
      case 'pending':
        return { box: styles.badgePending, text: styles.badgeTextPending };
      case 'approved':
        return { box: styles.badgeApproved, text: styles.badgeTextApproved };
      case 'rejected':
        return { box: styles.badgeRejected, text: styles.badgeTextRejected };
      case 'expired':
        return { box: styles.badgeExpired, text: styles.badgeTextExpired };
      default:
        return { box: styles.badgeNeutral, text: styles.badgeTextNeutral };
    }
  };

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
          <Text style={styles.headerTitle}>Meus anúncios</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : listings.length === 0 ? (
          <EmptyState
            icon="pricetags-outline"
            title="Você ainda não publicou nenhum anúncio."
            buttonLabel="Anunciar"
            onButtonPress={() => navigation.navigate('CreateListing')}
          />
        ) : (
          <FlatList
            data={listings}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            onRefresh={load}
            refreshing={loading}
            renderItem={({ item }) => {
              const badge = badgeStyleForStatus(item.status);
              return (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
                >
                  <View style={styles.cardTopRow}>
                    {item.photos[0] ? (
                      <Image
                        source={{ uri: item.photos[0] }}
                        style={styles.thumb}
                        contentFit="cover"
                        placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Ionicons
                          name="pricetag-outline"
                          size={20}
                          color={theme.colors.textLight}
                        />
                      </View>
                    )}
                    <View style={styles.info}>
                      <Text style={styles.title} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.price}>{formatListingPrice(item)}</Text>
                      <Text style={styles.date}>
                        {item.createdAt ? dayjs(item.createdAt.toDate()).format('DD/MM/YYYY') : ''}
                      </Text>
                    </View>
                    <View style={[styles.badge, badge.box]}>
                      <Text style={[styles.badgeText, badge.text]}>
                        {STATUS_LABEL[item.status]}
                      </Text>
                    </View>
                  </View>

                  {item.status === 'rejected' && item.rejectionReason && (
                    <Text style={styles.rejectionReason}>
                      Motivo: {LISTING_REJECTION_REASON_LABELS[item.rejectionReason]}
                    </Text>
                  )}

                  {/* S172 — expirado: dica de quando venceu + convite pra
                      renovar (o botão "Renovar" fica na actionsRow abaixo). */}
                  {item.status === 'expired' && (
                    <Text style={styles.expiredHint}>
                      Expirou em {dayjs(item.expiresAt.toDate()).format('DD/MM')}. Renove para
                      voltar ao feed.
                    </Text>
                  )}

                  {/* S168-B — "N conversas": Pressable PRÓPRIO (não
                      AnimatedPressable, mesmo componente do card) pra não
                      propagar o toque pro onPress do card; só navega quando
                      N > 0. */}
                  <Pressable
                    style={styles.chatRow}
                    disabled={!chatCounts[item.id]}
                    onPress={() =>
                      navigation.navigate('ListingChats', {
                        listingId: item.id,
                        listingTitle: item.title,
                      })
                    }
                  >
                    <Ionicons
                      name="chatbubbles-outline"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <Text style={styles.chatRowText}>
                      {chatCounts[item.id] ?? 0}{' '}
                      {(chatCounts[item.id] ?? 0) === 1 ? 'conversa' : 'conversas'}
                    </Text>
                  </Pressable>

                  <View style={styles.actionsRow}>
                    {item.status === 'approved' && (
                      <AnimatedPressable
                        style={styles.actionBtn}
                        onPress={() => handleMarkSold(item)}
                      >
                        <Text style={styles.actionBtnText}>Marcar vendido</Text>
                      </AnimatedPressable>
                    )}
                    {item.status === 'expired' && (
                      <AnimatedPressable
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
                        onPress={() => handleRenew(item)}
                        disabled={renewingId === item.id}
                      >
                        <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                          Renovar
                        </Text>
                      </AnimatedPressable>
                    )}
                    <AnimatedPressable
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('CreateListing', { listingId: item.id })}
                    >
                      <Text style={styles.actionBtnText}>Editar</Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.actionBtn} onPress={() => handleRemove(item)}>
                      <Text style={[styles.actionBtnText, styles.actionBtnTextDestructive]}>
                        Excluir
                      </Text>
                    </AnimatedPressable>
                  </View>
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
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 8,
    ...theme.shadows.medium,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: theme.borderRadius.md },
  thumbPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  title: { fontSize: theme.fontSize.sm, fontWeight: '700', color: theme.colors.text },
  price: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.primary },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },

  badge: { borderRadius: theme.borderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: '700' },
  badgePending: { backgroundColor: theme.colors.secondary },
  badgeTextPending: { color: theme.colors.onSecondary },
  badgeApproved: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  badgeTextApproved: { color: theme.colors.success },
  badgeRejected: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  badgeTextRejected: { color: theme.colors.error },
  badgeNeutral: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeTextNeutral: { color: theme.colors.textSecondary },
  // S172 — badge de 'expired', mesmo formato dos badges vizinhos.
  badgeExpired: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeTextExpired: { color: theme.colors.textSecondary },

  rejectionReason: { fontSize: theme.fontSize.xs, color: theme.colors.error },
  // S172 — dica de expiração, mesmo tom do rejectionReason mas neutro.
  expiredHint: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },

  // S168-B — linha "N conversas", entre o motivo de rejeição e as ações.
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatRowText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },

  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  actionBtnTextDestructive: { color: theme.colors.error },
  // S172 — "Renovar" (1 toque, expired → approved), estilo cheio pra se
  // destacar dos demais botões de contorno neutro.
  actionBtnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  actionBtnTextPrimary: { color: theme.colors.onPrimary },
});
