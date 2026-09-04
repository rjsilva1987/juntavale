// src/screens/ListingDetailScreen.tsx
//
// S168-A — detalhe de um anúncio de classificados. Dono vê botão "Editar".
// S168-B — quem NÃO é dono, está verificado e o anúncio segue aprovado e não
// expirado vê "Tenho interesse" no mesmo lugar (mutuamente exclusivo com
// "Editar anúncio" — ver ownerId no ternário abaixo).
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  formatListingPrice,
  getListing,
  Listing,
  LISTING_CATEGORIES,
} from '@/services/listingService';

type ListingDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListingDetail'>;

const PHOTO_WIDTH = Dimensions.get('window').width;

export default function ListingDetailScreen({ route, navigation }: ListingDetailScreenProps) {
  const { listingId } = route.params;
  const { user, profile } = useAuth();
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getListing(listingId).then((result) => {
      if (!cancelled) setListing(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            Anúncio
          </Text>
          <View style={styles.backBtn} />
        </View>

        {listing === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : listing === null ? (
          <EmptyState icon="alert-circle-outline" title="Anúncio indisponível." />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {listing.photos.length > 0 ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {listing.photos.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={styles.photo}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    transition={200}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Ionicons name="pricetag-outline" size={48} color={theme.colors.textLight} />
              </View>
            )}

            <View style={styles.body}>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.price}>{formatListingPrice(listing)}</Text>
              <Text style={styles.meta}>
                {categoryLabel} · {listing.uf}
              </Text>
              <Text style={styles.owner}>Anunciado por {listing.ownerNickname}</Text>
              <Text style={styles.date}>
                Publicado em {dayjs(listing.createdAt.toDate()).format('DD/MM/YYYY')}
              </Text>

              <Text style={styles.sectionTitle}>Descrição</Text>
              <Text style={styles.description}>{listing.description}</Text>

              {listing.ownerId === user?.uid && (
                <AnimatedPressable
                  style={styles.editBtn}
                  onPress={() => navigation.navigate('CreateListing', { listingId })}
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.editBtnText}>Editar anúncio</Text>
                </AnimatedPressable>
              )}

              {/* S168-B — "Tenho interesse": só pra quem não é dono, já está
                  verificado e o anúncio segue aprovado e dentro do prazo.
                  Nenhum getDoc/exists antes de navegar — a tela de chat
                  resolve "existe ou não" (chatId é determinístico). */}
              {!!user &&
                listing.ownerId !== user.uid &&
                profile?.verified === true &&
                listing.status === 'approved' &&
                listing.expiresAt.toMillis() > Date.now() && (
                  <AnimatedPressable
                    style={styles.interestBtn}
                    onPress={() =>
                      navigation.navigate('ListingChat', {
                        listingId,
                        ownerId: listing.ownerId,
                        interestedId: user.uid,
                        listingTitle: listing.title,
                      })
                    }
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={18}
                      color={theme.colors.onPrimary}
                    />
                    <Text style={styles.interestBtnText}>Tenho interesse</Text>
                  </AnimatedPressable>
                )}
            </View>
          </ScrollView>
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

  content: { paddingBottom: 40 },
  photo: { width: PHOTO_WIDTH, height: 280 },
  photoPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { padding: theme.spacing.md, gap: 6 },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  price: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.primary },
  meta: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  owner: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, marginBottom: 8 },

  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    lineHeight: 22,
    marginTop: 4,
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    marginTop: theme.spacing.lg,
  },
  editBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: '700' },

  // S168-B — mesmo raio/padding de editBtn acima, preenchido (primary) em
  // vez de contorno — REGRA DE OURO: onPrimary, nunca texto branco sobre
  // secondary.
  interestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    marginTop: theme.spacing.lg,
  },
  interestBtnText: {
    color: theme.colors.onPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
});
