// src/screens/MyTicketsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SUPPORT_CATEGORY_LABELS } from '@/constants/supportCategories';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getMyTickets, SupportTicket } from '@/services/supportService';

type MyTicketsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyTickets'>;

// Categoria pode ter sido gravada com um valor fora do catálogo atual — cai
// pro texto cru em vez de esconder o ticket (mesmo padrão de
// AdminSupportScreen/AdminSupportDetailScreen).
function categoryLabel(category: string): string {
  return (SUPPORT_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

export default function MyTicketsScreen({ navigation }: MyTicketsScreenProps) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setTickets(await getMyTickets(user.uid));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

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
          <Text style={styles.headerTitle}>Meus chamados</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="chatbox-ellipses-outline"
            title="Você ainda não abriu nenhum chamado"
            buttonLabel="Falar com a gente"
            onButtonPress={() => navigation.navigate('Support')}
          />
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            onRefresh={load}
            refreshing={loading}
            renderItem={({ item }) => (
              <AnimatedPressable
                style={styles.card}
                onPress={() => navigation.navigate('SupportThread', { ticketId: item.id })}
              >
                <View style={styles.info}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.category} numberOfLines={1}>
                      {categoryLabel(item.category)}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'open' ? styles.badgeOpen : styles.badgeResolved,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          item.status === 'open' ? styles.badgeTextOpen : styles.badgeTextResolved,
                        ]}
                      >
                        {item.status === 'open' ? 'Aberto' : 'Resolvido'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.message} numberOfLines={2}>
                    {item.message}
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  card: {
    backgroundColor: theme.colors.white,
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
