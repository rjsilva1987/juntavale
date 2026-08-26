// src/screens/MomentoRequestsScreen.tsx
//
// S143-B — lista de pedidos de conversa sem match (decisão 2): recebidos
// (você é o autor do momento comentado) e enviados (você comentou um
// momento de outra pessoa sem match), num só lugar, mesmo molde de
// MyReportsScreen.tsx. Pendente-recebido ganha ação de responder/recusar
// (leva pra MomentoRequestChatScreen, que trata os dois); os demais
// (enviado-pendente, recusado, respondido) são só informativos ou abrem a
// thread já respondida.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getUserProfile } from '@/services/firestoreService';
import {
  listenReceivedMomentoRequests,
  listenSentMomentoRequests,
  MomentoRequest,
} from '@/services/momentoRequestService';
import { getDisplayName } from '@/utils/profile';

type MomentoRequestsScreenProps = NativeStackScreenProps<RootStackParamList, 'MomentoRequests'>;

interface RequestRow extends MomentoRequest {
  // true == você é o autor (pedido RECEBIDO); false == você é o remetente
  // (pedido ENVIADO). Decide o rótulo/ação exibidos por item.
  isReceived: boolean;
}

const STATUS_LABELS: Record<MomentoRequest['status'], string> = {
  pending: 'Pendente',
  answered: 'Respondido',
  declined: 'Recusado',
};

export default function MomentoRequestsScreen({ navigation }: MomentoRequestsScreenProps) {
  const { user } = useAuth();
  const [received, setReceived] = useState<MomentoRequest[]>([]);
  const [sent, setSent] = useState<MomentoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [otherNames, setOtherNames] = useState<Record<string, string | null>>({});
  const requestedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const unsub = listenReceivedMomentoRequests(user.uid, (data) => {
      setReceived(data);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenSentMomentoRequests(user.uid, setSent);
    return unsub;
  }, [user]);

  // Mesmo padrão de dedup de MyReportsScreen.tsx (requestedUidsRef) — nome
  // da OUTRA parte de cada pedido, buscado sob demanda por uid novo.
  useEffect(() => {
    if (!user) return;
    const allOtherUids = [
      ...received.map((r) => r.senderId),
      ...sent.map((r) => r.authorId),
    ].filter((uid) => uid !== user.uid);
    const missing = [...new Set(allOtherUids)].filter((uid) => !requestedUidsRef.current.has(uid));
    missing.forEach((uid) => {
      requestedUidsRef.current.add(uid);
      getUserProfile(uid)
        .then((profile) => {
          setOtherNames((prev) => ({ ...prev, [uid]: profile ? getDisplayName(profile) : null }));
        })
        .catch(() => {});
    });
  }, [received, sent, user]);

  const rows: RequestRow[] = [
    ...received.map((r) => ({ ...r, isReceived: true })),
    ...sent.map((r) => ({ ...r, isReceived: false })),
  ].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  const rowSubtitle = (item: RequestRow): string => {
    if (item.status === 'answered') return 'Conversa liberada — toque pra abrir';
    if (item.status === 'declined') return 'Pedido recusado';
    return item.isReceived ? 'Toque pra responder ou recusar' : 'Aguardando resposta';
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
          <Text style={styles.headerTitle}>Momentos</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Nenhum pedido de conversa"
            subtitle="Comentários e conversas de momentos aparecem aqui."
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            renderItem={({ item }) => {
              const otherUid = item.isReceived ? item.senderId : item.authorId;
              const otherName = otherNames[otherUid] ?? '…';
              return (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() => navigation.navigate('MomentoRequestChat', { requestId: item.id })}
                >
                  <View style={styles.cardTopRow}>
                    <Text style={styles.otherName} numberOfLines={1}>
                      {item.isReceived ? `${otherName} comentou` : `Você comentou em ${otherName}`}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'answered'
                          ? styles.badgeAnswered
                          : item.status === 'declined'
                            ? styles.badgeDeclined
                            : styles.badgePending,
                      ]}
                    >
                      <Text
                        style={
                          item.status === 'answered'
                            ? styles.badgeTextAnswered
                            : item.status === 'declined'
                              ? styles.badgeTextDeclined
                              : styles.badgeTextPending
                        }
                      >
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.commentText} numberOfLines={2}>
                    {item.text}
                  </Text>
                  <Text style={styles.subtitle}>{rowSubtitle(item)}</Text>
                  <Text style={styles.date}>
                    {item.createdAt ? dayjs(item.createdAt.toDate()).format('DD/MM HH:mm') : ''}
                  </Text>
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
    gap: 4,
    ...theme.shadows.medium,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  otherName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  commentText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  subtitle: { fontSize: theme.fontSize.xs, color: theme.colors.primary, fontWeight: '600' },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },

  badge: { borderRadius: theme.borderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgePending: { backgroundColor: theme.colors.secondary },
  badgeAnswered: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  badgeDeclined: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // REGRA DE OURO (CLAUDE.md): nunca texto branco sobre secondary (#FBBF24)
  // — badgePending usa onSecondary, mesmo par já usado em MyReportsScreen.tsx
  // pro badge "Aberto"; badgeAnswered/Declined têm fundo claro (surface), com
  // cor de texto própria (success/textSecondary) — nenhum dos três combina
  // texto branco com fundo amarelo.
  badgeTextPending: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  badgeTextAnswered: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.success,
  },
  badgeTextDeclined: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
