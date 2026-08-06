// src/screens/MyReportsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAlert } from '@/contexts/ReportAlertContext';
import { RootStackParamList } from '@/navigation';
import { REPORT_REASON_LABELS } from '@/services/blockService';
import { listenMyReports, Report } from '@/services/reportService';

type MyReportsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyReports'>;

export default function MyReportsScreen({ navigation }: MyReportsScreenProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert, markSeen } = useReportAlert();

  // Diferente de MyTicketsScreen (getMyTickets, um getDocs só): reportService
  // não expõe fetch único, só o listener (listenMyReports, mesmo usado pelo
  // ReportAlertContext) — a lista já chega em tempo real, sem precisar de
  // onRefresh manual.
  useEffect(() => {
    if (!user) return;
    const unsub = listenMyReports(user.uid, (data) => {
      // Sem orderBy no server (where('reporterId', ...) sozinho evita índice
      // composto, mesmo raciocínio de getMyTickets em supportService.ts) —
      // ordenação por atividade mais recente é client-side, com fallback pra
      // createdAt em denúncias sem lastMessageAt ainda.
      const sorted = [...data].sort((a, b) => {
        const aTime = (a.lastMessageAt ?? a.createdAt)?.toMillis() ?? 0;
        const bTime = (b.lastMessageAt ?? b.createdAt)?.toMillis() ?? 0;
        return bTime - aTime;
      });
      setReports(sorted);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // S84 — mesmo padrão de MyTicketsScreen/SupportThreadScreen: marcar como
  // visto é condicional a showAlert, não um disparo único.
  useEffect(() => {
    if (showAlert) markSeen();
  }, [showAlert, markSeen]);

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
          <Text style={styles.headerTitle}>Minhas denúncias</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : reports.length === 0 ? (
          <EmptyState icon="flag-outline" title="Você ainda não fez nenhuma denúncia" />
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            renderItem={({ item }) => (
              <AnimatedPressable
                style={styles.card}
                onPress={() => navigation.navigate('ReportThread', { reportId: item.id })}
              >
                <View style={styles.info}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.reason} numberOfLines={1}>
                      {REPORT_REASON_LABELS[item.reason]}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'resolved' ? styles.badgeResolved : styles.badgeOpen,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          item.status === 'resolved'
                            ? styles.badgeTextResolved
                            : styles.badgeTextOpen,
                        ]}
                      >
                        {item.status === 'resolved' ? 'Resolvido' : 'Aberto'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.message} numberOfLines={2}>
                    {item.details}
                  </Text>
                  <Text style={styles.date}>
                    {item.createdAt ? dayjs(item.createdAt.toDate()).format('DD/MM') : ''}
                  </Text>
                </View>
              </AnimatedPressable>
            )}
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
    ...theme.shadows.medium,
  },
  info: { gap: 4 },
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
  message: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
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
