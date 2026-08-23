// src/screens/MyReportsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
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
import { getUserProfile } from '@/services/firestoreService';
import { listenMyReports, Report } from '@/services/reportService';
import { getDisplayName } from '@/utils/profile';

type MyReportsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyReports'>;

// S114 (correção por auditoria) — três ramos, não dois: undefined cobre
// "ainda não buscado" E "busca falhou" (o cache nunca grava em erro de rede,
// ver useEffect abaixo — mentir "Conta excluída" por causa de um timeout
// seria pior que só repetir o motivo). null = perfil não encontrado de fato
// (conta excluída, denúncias sobrevivem à exclusão de propósito, mesmo
// raciocínio de partyLabel em AdminReportsScreen.tsx, mas sem o fallback pro
// uid que a tela do admin tem). Nome vazio/só espaço (dado legado) cai no
// mesmo "só motivo" — nunca um "·" solto.
function reportedTitle(reason: Report['reason'], name: string | null | undefined): string {
  const label = REPORT_REASON_LABELS[reason];
  if (name === null) return `${label} · Conta excluída`;
  if (name && name.trim().length > 0) return `${label} · ${name}`;
  return label;
}

export default function MyReportsScreen({ navigation }: MyReportsScreenProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportedNames, setReportedNames] = useState<Record<string, string | null>>({});
  // S114 (correção por auditoria) — Set de uids JÁ PEDIDOS, não só os já
  // resolvidos. Ref de propósito: marcar aqui não deve provocar render nem
  // entrar em deps do efeito abaixo (isso é o que evitava rastrear "em voo"
  // e causava pedido duplicado quando dois uids novos resolviam em tempos
  // diferentes).
  const requestedUidsRef = useRef<Set<string>>(new Set());
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

  // S114 (correção por auditoria) — nome do denunciado, buscado sob demanda
  // por uid novo visto na lista. `requestedUidsRef` (não `reportedNames`) é
  // quem decide o que falta pedir, por isso o efeito só depende de `reports`
  // — a chegada de uma resposta não reroda o efeito e não pode disparar
  // pedido duplicado pra outro uid do mesmo lote ainda pendente.
  useEffect(() => {
    let cancelled = false;
    const missing = [...new Set(reports.map((r) => r.reportedId))].filter(
      (uid) => !requestedUidsRef.current.has(uid),
    );
    missing.forEach((uid) => {
      // Marcado ANTES da chamada: mesmo se a promise nunca resolver (unmount)
      // ou rejeitar (ver .catch), o uid não volta pra fila.
      requestedUidsRef.current.add(uid);
      getUserProfile(uid)
        .then((profile) => {
          if (cancelled) return;
          // S135 — fora de escopo mostrar o nome real aqui: getDisplayName
          // (nickname), NUNCA legalName — mesma decisão de AdminReportsScreen.tsx.
          setReportedNames((prev) => ({
            ...prev,
            [uid]: profile ? getDisplayName(profile) : null,
          }));
        })
        .catch(() => {
          // Sem retry (uid já está em requestedUidsRef) e sem gravar no
          // cache: `null` significa "conta excluída" e afirmar isso por
          // causa de uma falha de rede seria mentira na tela. `reportedTitle`
          // trata a ausência da chave igual a "ainda não buscado".
        });
    });
    return () => {
      cancelled = true;
    };
  }, [reports]);

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
                      {reportedTitle(item.reason, reportedNames[item.reportedId])}
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
