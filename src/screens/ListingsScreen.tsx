// src/screens/ListingsScreen.tsx
//
// S168-A — feed de classificados. Exclusivo pra membro verificado (decisão
// fechada da spec): sem `profile.verified`, a tela NÃO consulta Firestore
// nada — só mostra shapes fake (skeleton) por trás de um overlay convidando
// a verificar. Verificado, carrega os aprovados (listApprovedListings) no
// useFocusEffect, com busca por texto (client, normalizeText sobre
// title+description) e filtros de categoria/UF (client).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { UfPicker } from '@/components/UfPicker';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  formatListingPrice,
  Listing,
  LISTING_CATEGORIES,
  listApprovedListings,
  normalizeText,
} from '@/services/listingService';
import { getFirestoreErrorCode } from '@/utils/firestoreError';

const SKELETON_COUNT = 6;
const ALL_CATEGORIES = 'all';
const ALL_UF = 'all';

export default function ListingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const isVerified = profile?.verified === true;

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  // S171: padrão é todo o Brasil; UF é filtro opcional, só em memória da sessão (sem persistir).
  const [uf, setUf] = useState<string>(ALL_UF);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setLoadErrorCode(null);
    try {
      setListings(await listApprovedListings());
    } catch (err) {
      console.error('[ListingsScreen] falha ao carregar classificados:', err);
      setLoadError(true);
      setLoadErrorCode(getFirestoreErrorCode(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isVerified) load();
    }, [isVerified, load]),
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(search.trim());
    return listings.filter((item) => {
      if (category !== ALL_CATEGORIES && item.category !== category) return false;
      if (uf !== ALL_UF && item.uf !== uf) return false;
      if (!normalizedQuery) return true;
      return (
        normalizeText(item.title).includes(normalizedQuery) ||
        normalizeText(item.description).includes(normalizedQuery)
      );
    });
  }, [listings, search, category, uf]);

  const categoryLabel = (key: string) =>
    LISTING_CATEGORIES.find((c) => c.key === key)?.label ?? key;

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
          <Text style={styles.headerTitle}>Classificados</Text>
          {isVerified ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('MyListings')}
              style={styles.backBtn}
              accessibilityLabel="Meus anúncios"
            >
              <Ionicons name="albums-outline" size={22} color={theme.colors.primary} />
            </AnimatedPressable>
          ) : (
            // Placeholder do mesmo tamanho do botão real — mantém o título
            // centralizado sem oferecer "Meus anúncios" a quem não é
            // verificado (a tela nem chega a existir pra esse uid: gate
            // abaixo bloqueia antes de qualquer leitura no Firestore).
            <View style={styles.backBtn} />
          )}
        </View>

        {!isVerified ? (
          <View style={styles.gateWrap}>
            <View style={styles.skeletonList} pointerEvents="none">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={styles.skeletonThumb} />
                  <View style={styles.skeletonTitle} />
                  <View style={styles.skeletonPrice} />
                </View>
              ))}
            </View>
            <View style={styles.gateOverlay}>
              <Ionicons name="lock-closed-outline" size={40} color={theme.colors.primary} />
              <Text style={styles.gateTitle}>
                Os classificados são exclusivos para membros verificados
              </Text>
              <AnimatedPressable
                style={styles.gateButton}
                onPress={() => navigation.navigate('Verification')}
              >
                <Text style={styles.gateButtonText}>Verificar agora</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.filters}>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por título ou descrição"
                placeholderTextColor={theme.colors.textLight}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ key: ALL_CATEGORIES, label: 'Todas' }, ...LISTING_CATEGORIES]}
                keyExtractor={(item) => item.key}
                contentContainerStyle={styles.chipRow}
                renderItem={({ item }) => {
                  const active = category === item.key;
                  return (
                    <AnimatedPressable
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCategory(item.key)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </AnimatedPressable>
                  );
                }}
              />
              <View style={styles.ufField}>
                <UfPicker value={uf} includeAll placeholder="Todos os estados" onChange={setUf} />
              </View>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : loadError ? (
              <EmptyState
                icon="alert-circle-outline"
                title="Não foi possível carregar os classificados."
                subtitle={loadErrorCode ? `erro: ${loadErrorCode}` : undefined}
                buttonLabel="Tentar de novo"
                onButtonPress={load}
              />
            ) : filtered.length === 0 ? (
              <EmptyState icon="pricetags-outline" title="Nenhum anúncio encontrado." />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.columnWrapper}
                contentContainerStyle={styles.listContent}
                onRefresh={load}
                refreshing={loading}
                renderItem={({ item }) => (
                  <AnimatedPressable
                    style={styles.card}
                    onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
                  >
                    {item.photos[0] ? (
                      <Image
                        source={{ uri: item.photos[0] }}
                        style={styles.cardThumb}
                        contentFit="cover"
                        placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
                        <Ionicons
                          name="pricetag-outline"
                          size={28}
                          color={theme.colors.textLight}
                        />
                      </View>
                    )}
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardPrice}>{formatListingPrice(item)}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {categoryLabel(item.category)} · {item.uf}
                    </Text>
                    <Text style={styles.cardOwner} numberOfLines={1}>
                      {item.ownerNickname}
                    </Text>
                  </AnimatedPressable>
                )}
              />
            )}
          </>
        )}

        {isVerified && (
          <AnimatedPressable
            style={styles.fab}
            onPress={() => navigation.navigate('CreateListing')}
          >
            <Ionicons name="add" size={28} color={theme.colors.white} />
          </AnimatedPressable>
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

  filters: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  searchInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
  },
  chipRow: { gap: 8, paddingBottom: theme.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary },
  chipText: { fontSize: theme.fontSize.xs, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.onSecondary },
  ufField: { marginTop: theme.spacing.sm },

  listContent: { padding: theme.spacing.md, gap: 12 },
  columnWrapper: { gap: 12 },

  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: 4,
    ...theme.shadows.light,
  },
  cardThumb: { width: '100%', height: 110, borderRadius: theme.borderRadius.md },
  cardThumbPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: theme.fontSize.sm, fontWeight: '700', color: theme.colors.text },
  cardPrice: { fontSize: theme.fontSize.sm, fontWeight: '700', color: theme.colors.primary },
  cardMeta: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  cardOwner: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },

  fab: {
    position: 'absolute',
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.medium,
  },

  // ─── gate de verificação (skeleton + overlay) ───────────────────────────
  gateWrap: { flex: 1 },
  skeletonList: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: theme.spacing.md,
  },
  skeletonCard: {
    width: '47%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: 8,
  },
  skeletonThumb: {
    width: '100%',
    height: 110,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.border,
  },
  skeletonTitle: {
    width: '80%',
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  skeletonPrice: {
    width: '50%',
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  gateOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
    backgroundColor: 'rgba(249,250,251,0.9)',
  },
  gateTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  gateButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  gateButtonText: { color: theme.colors.white, fontWeight: '700', fontSize: theme.fontSize.md },
});
