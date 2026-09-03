// src/screens/MyListingsScreen.tsx
//
// S168-A — "Meus anúncios": todos os status do dono (exceto removidos, já
// filtrados por listMyListings), com ações de marcar vendido/excluir/editar.
// Mirror de MyTicketsScreen.tsx (header, FlatList com card + badge de
// status).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { LISTING_REJECTION_REASON_LABELS } from '@/constants/listingRejectionReasons';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  formatListingPrice,
  Listing,
  listMyListings,
  markListingSold,
  removeListing,
} from '@/services/listingService';

type MyListingsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyListings'>;

const STATUS_LABEL: Record<Listing['status'], string> = {
  pending: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  sold: 'Vendido',
  removed: 'Removido',
};

export default function MyListingsScreen({ navigation }: MyListingsScreenProps) {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

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

                  <View style={styles.actionsRow}>
                    {item.status === 'approved' && (
                      <AnimatedPressable
                        style={styles.actionBtn}
                        onPress={() => handleMarkSold(item)}
                      >
                        <Text style={styles.actionBtnText}>Marcar vendido</Text>
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

  rejectionReason: { fontSize: theme.fontSize.xs, color: theme.colors.error },

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
});
