// src/screens/AdminListingsScreen.tsx
//
// S168-A — fila de moderação de classificados, molde EXATO de
// AdminVerificationsScreen.tsx (header, FlatList, EmptyState). Diferente da
// fila de verificação, aqui não é preciso buscar perfil/nome legal à parte —
// o próprio doc do anúncio já carrega ownerNickname (S135: nome público é
// sempre nickname).
// S169 — virou Tab.Screen `Classificados` do admin (ver navigation/index.tsx
// MainTabs), mesmo movimento do S95 com Verificações/Chamados; carrega a
// cada foco (useFocusEffect) e mostra o código do Firestore quando a query
// falha.
// S180-B — segmento novo "Pendentes" | "Todos" (SegmentedTabs). Em
// "Pendentes" nada muda visualmente (mesmo card de sempre); em "Todos" o
// card ganha pill de status (STATUS_LABEL/badgeStyleForStatus abaixo —
// CÓPIA, não import, de MyListingsScreen.tsx, por pedido explícito da spec)
// e botão "⋯" com Remover/Excluir.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  Modal,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { adminDeleteContent, adminRemoveListing, listAllListings } from '@/services/adminService';
import { Listing, listPendingListings } from '@/services/listingService';
import { getFirestoreErrorCode } from '@/utils/firestoreError';

type ListingSegment = 'pendentes' | 'todos';

const SEGMENT_OPTIONS: { key: ListingSegment; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'todos', label: 'Todos' },
];

// Cópia de STATUS_LABEL/badgeStyleForStatus (MyListingsScreen.tsx:48-55/
// 161-174) — spec pede CÓPIA, não import de uma tela por outra.
const STATUS_LABEL: Record<Listing['status'], string> = {
  pending: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  sold: 'Vendido',
  removed: 'Removido',
  expired: 'Expirado',
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

export default function AdminListingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [segment, setSegment] = useState<ListingSegment>('pendentes');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setLoadErrorCode(null);
    try {
      setListings(segment === 'pendentes' ? await listPendingListings() : await listAllListings());
    } catch (err) {
      // S169 — sem este catch, uma rejeição de getDocs (índice faltando =
      // failed-precondition, rules = permission-denied, rede = unavailable)
      // deixava `loading` em true pra sempre, sem nenhum sinal. O código
      // vai pro EmptyState abaixo: único canal de diagnóstico em campo.
      console.error('[AdminListingsScreen] falha ao carregar fila:', err);
      setLoadError(true);
      setLoadErrorCode(getFirestoreErrorCode(err));
    } finally {
      setLoading(false);
    }
  }, [segment]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // S180-B — "Remover" reusa o ramo admin JÁ EXISTENTE de listings/{id}
  // (status 'removed', SEM apagar fotos — storage.rules não libera delete
  // pro admin).
  const handleRemove = (listing: Listing) => {
    Alert.alert(
      'Remover anúncio?',
      `"${listing.title}" some do feed de classificados. O dono continua vendo em "Meus anúncios".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await adminRemoveListing(listing.id, user.uid);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível remover o anúncio (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
  };

  // S180-B — "Excluir" apaga doc + fotos (callable, Admin SDK); as
  // conversas do anúncio (listingChats) FICAM, com "Anúncio encerrado"
  // (mesmo comportamento do S176 pro dono).
  const handleDelete = (listing: Listing) => {
    Alert.alert(
      'Excluir anúncio?',
      `As fotos e "${listing.title}" somem de vez. As conversas continuam, com o aviso "Anúncio encerrado".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminDeleteContent('listing', listing.id);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível excluir o anúncio (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
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
          <Text style={styles.headerTitle}>Classificados pendentes</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.segmentWrap}>
          <SegmentedTabs
            options={SEGMENT_OPTIONS}
            value={segment}
            onChange={(key) => setSegment(key)}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : loadError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Não foi possível carregar a fila."
            subtitle={loadErrorCode ? `erro: ${loadErrorCode}` : undefined}
            buttonLabel="Tentar de novo"
            onButtonPress={load}
          />
        ) : listings.length === 0 ? (
          <EmptyState
            icon="pricetags-outline"
            title={segment === 'pendentes' ? 'Nenhum anúncio pendente' : 'Nenhum anúncio'}
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
                  onPress={() =>
                    item.status === 'pending'
                      ? navigation.navigate('AdminListingDetail', { listingId: item.id })
                      : navigation.navigate('ListingDetail', { listingId: item.id })
                  }
                >
                  <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.subLabel}>
                      {item.ownerNickname} ·{' '}
                      {item.createdAt ? dayjs(item.createdAt.toDate()).format('DD/MM/YYYY') : ''}
                    </Text>
                    {segment === 'todos' && (
                      <View style={[styles.badge, badge.box]}>
                        <Text style={[styles.badgeText, badge.text]}>
                          {STATUS_LABEL[item.status]}
                        </Text>
                      </View>
                    )}
                  </View>
                  {segment === 'todos' ? (
                    <AnimatedPressable
                      style={styles.moreBtn}
                      hitSlop={8}
                      onPress={() => setMenuTarget(item)}
                      accessibilityLabel="Mais opções"
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color={theme.colors.textSecondary}
                      />
                    </AnimatedPressable>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
                  )}
                </AnimatedPressable>
              );
            }}
          />
        )}

        {/* S180-B — sheet "⋯" (só em "Todos"), molde MyListingsScreen.tsx
            (S176). */}
        <Modal
          visible={!!menuTarget}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuTarget(null)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setMenuTarget(null)}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {menuTarget?.title}
              </Text>
              {menuTarget && menuTarget.status !== 'removed' && (
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    const target = menuTarget;
                    setMenuTarget(null);
                    if (!target) return;
                    handleRemove(target);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Remover anúncio</Text>
                </AnimatedPressable>
              )}
              {menuTarget && menuTarget.status !== 'removed' && (
                <View style={styles.sheetDivider} />
              )}
              <AnimatedPressable
                style={styles.sheetOption}
                onPress={() => {
                  const target = menuTarget;
                  setMenuTarget(null);
                  if (!target) return;
                  handleDelete(target);
                }}
              >
                <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                <Text style={[styles.sheetOptionText, styles.sheetOptionTextDestructive]}>
                  Excluir anúncio
                </Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.sheetCancel} onPress={() => setMenuTarget(null)}>
                <Text style={styles.sheetCancelText}>Cancelar</Text>
              </AnimatedPressable>
            </View>
          </Pressable>
        </Modal>
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

  // S180-B — seletor Pendentes | Todos, logo abaixo do header.
  segmentWrap: { padding: theme.spacing.md, paddingBottom: 0 },

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
  info: { flex: 1, gap: 2 },
  title: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  subLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  // S180-B — "⋯" do card em "Todos", mirror de moreBtn (MyListingsScreen.tsx).
  moreBtn: { padding: 4 },

  // S180-B — pill de status em "Todos", CÓPIA de MyListingsScreen.tsx:
  // 423-451 (badge/badgeText/badgePending.../badgeExpired...), pedido
  // explícito da spec (copiar, não importar de uma tela pra outra).
  badge: {
    alignSelf: 'flex-start',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
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
  badgeExpired: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeTextExpired: { color: theme.colors.textSecondary },

  // S180-B — sheet do "⋯", molde MyListingsScreen.tsx:483-517.
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    paddingBottom: theme.spacing.sm,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  sheetOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  sheetOptionTextDestructive: { color: theme.colors.error },
  sheetDivider: { height: 0.5, backgroundColor: theme.colors.border },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  sheetCancelText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.nope },
});
