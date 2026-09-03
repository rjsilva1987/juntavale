// src/screens/AdminListingDetailScreen.tsx
//
// S168-A — revisão de um anúncio de classificados, molde EXATO de
// AdminVerificationDetailScreen.tsx (aprovar via Alert de confirmação,
// recusar via modal de motivo — RejectListingModal, mirror de
// RejectVerificationModal).
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { RejectListingModal } from '@/components/RejectListingModal';
import { ListingRejectionReason } from '@/constants/listingRejectionReasons';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  formatListingPrice,
  getListing,
  Listing,
  LISTING_CATEGORIES,
  reviewListing,
} from '@/services/listingService';

type AdminListingDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AdminListingDetail'
>;

export default function AdminListingDetailScreen({
  route,
  navigation,
}: AdminListingDetailScreenProps) {
  const { listingId } = route.params;
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);

  useEffect(() => {
    getListing(listingId).then((result) => {
      setListing(result);
      setLoading(false);
    });
  }, [listingId]);

  const handleApprove = () => {
    if (!user || !listing) return;
    Alert.alert(
      'Aprovar anúncio?',
      `"${listing.title}" vai ficar visível no feed de classificados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprovar',
          onPress: async () => {
            setDeciding(true);
            try {
              await reviewListing(listingId, { status: 'approved' }, user.uid);
              if (navigation.canGoBack()) navigation.goBack();
            } catch (err) {
              console.error('[AdminListingDetailScreen] falha ao aprovar anúncio:', err);
              Alert.alert('Erro', 'Não foi possível registrar a decisão.');
            } finally {
              setDeciding(false);
            }
          },
        },
      ],
    );
  };

  const handleConfirmReject = async (reason: ListingRejectionReason) => {
    if (!user) return;
    setDeciding(true);
    try {
      await reviewListing(listingId, { status: 'rejected', rejectionReason: reason }, user.uid);
      setRejectModalVisible(false);
      if (navigation.canGoBack()) navigation.goBack();
    } catch (err) {
      console.error('[AdminListingDetailScreen] falha ao recusar anúncio:', err);
      Alert.alert('Erro', 'Não foi possível registrar a decisão.');
    } finally {
      setDeciding(false);
    }
  };

  const categoryLabel = listing
    ? (LISTING_CATEGORIES.find((c) => c.key === listing.category)?.label ?? listing.category)
    : '';

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
          <Text style={styles.headerTitle}>Revisar anúncio</Text>
          <View style={styles.backBtn} />
        </View>

        {loading || !listing ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Fotos</Text>
            {listing.photos.length === 0 ? (
              <Text style={styles.emptyPhotos}>Sem fotos.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                {listing.photos.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={styles.photoThumb}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    transition={200}
                  />
                ))}
              </ScrollView>
            )}

            <View style={styles.infoCard}>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.price}>{formatListingPrice(listing)}</Text>
              <Text style={styles.meta}>
                {categoryLabel} · {listing.uf}
              </Text>
              <Text style={styles.owner}>Anunciado por {listing.ownerNickname}</Text>
              <Text style={styles.date}>
                Publicado em {dayjs(listing.createdAt.toDate()).format('DD/MM/YYYY')}
              </Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>

            <View style={styles.actionsRow}>
              <AnimatedPressable
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => setRejectModalVisible(true)}
                disabled={deciding}
              >
                <Ionicons name="close" size={20} color={theme.colors.error} />
                <Text style={styles.rejectBtnText}>Recusar</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={handleApprove}
                disabled={deciding}
              >
                {deciding ? (
                  <ActivityIndicator color={theme.colors.onSecondary} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={theme.colors.onSecondary} />
                    <Text style={styles.approveBtnText}>Aprovar</Text>
                  </>
                )}
              </AnimatedPressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <RejectListingModal
        visible={rejectModalVisible}
        onClose={() => setRejectModalVisible(false)}
        onSubmit={handleConfirmReject}
      />
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

  content: { padding: theme.spacing.md, paddingBottom: 40 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  photoRow: { flexDirection: 'row' },
  photoThumb: { width: 160, height: 160, borderRadius: theme.borderRadius.md, marginRight: 10 },
  emptyPhotos: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },

  infoCard: {
    backgroundColor: theme.colors.surface,
    marginTop: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: 4,
    ...theme.shadows.medium,
  },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  price: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.primary },
  meta: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  owner: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, marginBottom: 6 },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    lineHeight: 22,
    marginTop: 4,
  },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.full,
  },
  rejectBtn: { borderWidth: 1.5, borderColor: theme.colors.error },
  rejectBtnText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '700' },
  approveBtn: { backgroundColor: theme.colors.secondary },
  approveBtnText: {
    color: theme.colors.onSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
});
