// src/screens/AdminReportsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { theme } from '@/constants/theme';
import { RootStackParamList } from '@/navigation';
import { REPORT_REASON_LABELS } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { listenReports, Report } from '@/services/reportService';
import { getDisplayName } from '@/utils/profile';

// Denúncia criada antes da S96-A não tem o campo `status` (client antigo do
// reportUser não mandava) — ausente conta como pendente, mesma leitura do
// campo opcional em reportService.ts e do contador em AdminAlertContext.
function isPending(report: Report): boolean {
  return report.status === undefined || report.status === 'open';
}

// Conta denunciada/denunciante pode não existir mais — a function de apagar
// conta não apaga `reports` de propósito. null == perfil não encontrado.
//
// S135 — fora de escopo mostrar o nome real aqui: getDisplayName
// (nickname), NUNCA legalName — mesma decisão de AdminReportDetailScreen.tsx.
function partyLabel(uid: string, profile: UserProfile | null | undefined): string {
  if (profile === null) return 'Conta removida';
  return profile ? getDisplayName(profile) : uid;
}

export default function AdminReportsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile | null>>({});
  const [loading, setLoading] = useState(true);

  // S96-B — listenReports em vez de getDocs+useFocusEffect (molde do
  // AdminSupportScreen): a tela vira Tab.Screen igual as outras 3 abas do
  // admin e listenReports já existe como listener real-time (S96-A), então
  // não há motivo pra recarregar manualmente a cada foco.
  useEffect(() => {
    const unsub = listenReports((next) => {
      setReports(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Nomes de quem denunciou/foi denunciado, buscados sob demanda por uid
  // novo visto na lista. Cache em `profiles` evita refetch a cada snapshot
  // — listenReports reemite a lista inteira a cada mudança, não só o diff.
  useEffect(() => {
    const uids = new Set<string>();
    reports.forEach((r) => {
      uids.add(r.reporterId);
      uids.add(r.reportedId);
    });
    const missing = [...uids].filter((uid) => !(uid in profiles));
    if (missing.length === 0) return;
    missing.forEach((uid) => {
      getUserProfile(uid).then((profile) => {
        setProfiles((prev) => (uid in prev ? prev : { ...prev, [uid]: profile }));
      });
    });
  }, [reports, profiles]);

  // Pendentes primeiro; dentro de cada grupo mantém a ordem de listenReports
  // (createdAt desc, ver reportService.ts) — Array.sort é stable no motor JS
  // usado pelo RN/Hermes.
  const sorted = useMemo(
    () => [...reports].sort((a, b) => Number(isPending(b)) - Number(isPending(a))),
    [reports],
  );

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
          <Text style={styles.headerTitle}>Denúncias</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState icon="flag-outline" title="Nenhuma denúncia por aqui 🎉" />
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            renderItem={({ item }) => {
              const pending = isPending(item);
              return (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() => navigation.navigate('AdminReportDetail', { reportId: item.id })}
                >
                  <View style={styles.info}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.reason} numberOfLines={1}>
                        {REPORT_REASON_LABELS[item.reason]}
                      </Text>
                      <View
                        style={[styles.badge, pending ? styles.badgeOpen : styles.badgeResolved]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            pending ? styles.badgeTextOpen : styles.badgeTextResolved,
                          ]}
                        >
                          {pending ? 'Pendente' : 'Resolvida'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.parties} numberOfLines={1}>
                      {partyLabel(item.reporterId, profiles[item.reporterId])} denunciou{' '}
                      {partyLabel(item.reportedId, profiles[item.reportedId])}
                    </Text>
                    <Text style={styles.date}>
                      {item.createdAt ? dayjs(item.createdAt.toDate()).format('DD/MM HH:mm') : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
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
  info: { flex: 1, gap: 4 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reason: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  parties: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },

  badge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeOpen: { backgroundColor: theme.colors.secondary },
  badgeResolved: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: '700' },
  badgeTextOpen: { color: theme.colors.onSecondary },
  badgeTextResolved: { color: theme.colors.textSecondary },
});
