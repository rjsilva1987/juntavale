// src/screens/AdminSupportScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SUPPORT_CATEGORY_LABELS } from '@/constants/supportCategories';
import { theme } from '@/constants/theme';
import { RootStackParamList } from '@/navigation';
import { getSupportTickets, SupportTicket } from '@/services/supportService';

type AdminSupportScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminSupport'>;

// União pra caber header de seção e ticket numa FlatList só (sem seção
// vazia — "Abertos"/"Resolvidos" só entram no array se tiverem >=1 item).
type ListRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'ticket'; key: string; ticket: SupportTicket };

// Categoria pode ter sido gravada com um valor fora do catálogo atual (ex:
// removida numa versão futura) — cai pro texto cru em vez de esconder o
// ticket ou quebrar a tela.
function categoryLabel(category: string): string {
  return (SUPPORT_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

export default function AdminSupportScreen({ navigation }: AdminSupportScreenProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setTickets(await getSupportTickets());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // getSupportTickets já vem ordenado por createdAt desc (query server-side
  // por um único campo — não exige índice composto). Aqui só particiona por
  // status, sem reordenar, então cada seção mantém "mais recente primeiro".
  const rows = useMemo<ListRow[]>(() => {
    const open = tickets.filter((t) => t.status === 'open');
    const resolved = tickets.filter((t) => t.status === 'resolved');
    const result: ListRow[] = [];
    if (open.length > 0) {
      result.push({ kind: 'header', key: 'header-open', label: 'Abertos' });
      open.forEach((t) => result.push({ kind: 'ticket', key: t.id, ticket: t }));
    }
    if (resolved.length > 0) {
      result.push({ kind: 'header', key: 'header-resolved', label: 'Resolvidos' });
      resolved.forEach((t) => result.push({ kind: 'ticket', key: t.id, ticket: t }));
    }
    return result;
  }, [tickets]);

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
          <Text style={styles.headerTitle}>Suporte</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState icon="chatbox-ellipses-outline" title="Nenhum ticket por aqui 🎉" />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            onRefresh={load}
            refreshing={loading}
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <Text style={styles.sectionTitle}>{item.label}</Text>
              ) : (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() =>
                    navigation.navigate('AdminSupportDetail', { ticketId: item.ticket.id })
                  }
                >
                  <View style={styles.info}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.category} numberOfLines={1}>
                        {categoryLabel(item.ticket.category)}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          item.ticket.status === 'open' ? styles.badgeOpen : styles.badgeResolved,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            item.ticket.status === 'open'
                              ? styles.badgeTextOpen
                              : styles.badgeTextResolved,
                          ]}
                        >
                          {item.ticket.status === 'open' ? 'Aberto' : 'Resolvido'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.message} numberOfLines={2}>
                      {item.ticket.message}
                    </Text>
                    <Text style={styles.date}>
                      {item.ticket.createdAt
                        ? dayjs(item.ticket.createdAt.toDate()).format('DD/MM HH:mm')
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
                </AnimatedPressable>
              )
            }
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
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
  category: {
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
