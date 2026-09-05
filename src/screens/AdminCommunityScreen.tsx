// src/screens/AdminCommunityScreen.tsx
//
// S180-B — 6ª aba do admin: "Comunidade", com seletor de segmento Grupos |
// Eventos (SegmentedTabs). Molde EXATO de AdminListingsScreen.tsx (header,
// FlatList, EmptyState, useFocusEffect recarregando a cada foco). Cards NÃO
// navegam pra GroupChat/EventDetail (decisão fechada da spec) — só o botão
// "⋯" abre um sheet com as ações de moderação (molde S176, MyListingsScreen).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
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
import {
  adminCancelEvent,
  adminCloseGroup,
  adminDeleteContent,
  listAllEvents,
  listAllGroups,
} from '@/services/adminService';
import { Event } from '@/services/eventService';
import { Group } from '@/services/groupService';
import { getFirestoreErrorCode } from '@/utils/firestoreError';

type CommunitySegment = 'grupos' | 'eventos';
type MenuTarget = { kind: 'group'; item: Group } | { kind: 'event'; item: Event };

const SEGMENT_OPTIONS: { key: CommunitySegment; label: string }[] = [
  { key: 'grupos', label: 'Grupos' },
  { key: 'eventos', label: 'Eventos' },
];

// Evento futuro e não cancelado: só nesse caso o sheet oferece "Cancelar
// evento" — mirror do estado que já gate a a "Passado" (abaixo).
const isFutureNotCancelled = (event: Event): boolean =>
  event.status !== 'cancelled' && event.startsAt.toMillis() > Date.now();

export default function AdminCommunityScreen() {
  const { user } = useAuth();
  const [segment, setSegment] = useState<CommunitySegment>('grupos');
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setLoadErrorCode(null);
    try {
      if (segment === 'grupos') {
        setGroups(await listAllGroups());
      } else {
        setEvents(await listAllEvents());
      }
    } catch (err) {
      console.error('[AdminCommunityScreen] falha ao carregar:', err);
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

  const handleCloseGroup = (group: Group) => {
    Alert.alert(
      'Encerrar grupo?',
      `"${group.name}" some do Explorar e quem já é membro passa a ver só as mensagens antigas, sem enviar novas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await adminCloseGroup(group.id, user.uid);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível encerrar o grupo (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteGroup = (group: Group) => {
    Alert.alert(
      'Excluir grupo?',
      `As mensagens e as fotos de "${group.name}" somem de vez pra todos. Não dá pra desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminDeleteContent('group', group.id);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível excluir o grupo (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
  };

  const handleCancelEvent = (event: Event) => {
    Alert.alert(
      'Cancelar evento?',
      `"${event.title}" some do Explorar e quem já confirmou presença vê o aviso "Evento cancelado".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cancelar evento',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await adminCancelEvent(event.id, user.uid);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível cancelar o evento (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteEvent = (event: Event) => {
    Alert.alert(
      'Excluir evento?',
      `"${event.title}" e a lista de participantes somem de vez. Não dá pra desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminDeleteContent('event', event.id);
              load();
            } catch (err) {
              const code = (err as { code?: string })?.code;
              Alert.alert(
                'Erro',
                `Não foi possível excluir o evento (erro: ${code ?? 'desconhecido'})`,
              );
            }
          },
        },
      ],
    );
  };

  const renderGroupCard = (item: Group) => {
    const closed = item.status === 'removed';
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.memberCount} {item.memberCount === 1 ? 'membro' : 'membros'}
            {item.createdAt ? ` · criado em ${dayjs(item.createdAt.toDate()).format('DD/MM')}` : ''}
            {' · '}
            {item.expiresAt
              ? `expira ${dayjs(item.expiresAt.toDate()).format('DD/MM')}`
              : 'sem prazo'}
          </Text>
          {closed && (
            <View style={styles.pill}>
              <Text style={[styles.pillText, styles.pillTextClosed]}>Encerrado</Text>
            </View>
          )}
        </View>
        <AnimatedPressable
          style={styles.moreBtn}
          hitSlop={8}
          onPress={() => setMenuTarget({ kind: 'group', item })}
          accessibilityLabel="Mais opções"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
        </AnimatedPressable>
      </View>
    );
  };

  const renderEventCard = (item: Event) => {
    const cancelled = item.status === 'cancelled';
    const past = !cancelled && item.startsAt.toMillis() <= Date.now();
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.participantCount} {item.participantCount === 1 ? 'participante' : 'participantes'}
            {' · '}
            {dayjs(item.startsAt.toDate()).format('DD/MM [às] HH:mm')}
          </Text>
          {(cancelled || past) && (
            <View style={styles.pill}>
              <Text
                style={[styles.pillText, cancelled ? styles.pillTextClosed : styles.pillTextPast]}
              >
                {cancelled ? 'Cancelado' : 'Passado'}
              </Text>
            </View>
          )}
        </View>
        <AnimatedPressable
          style={styles.moreBtn}
          hitSlop={8}
          onPress={() => setMenuTarget({ kind: 'event', item })}
          accessibilityLabel="Mais opções"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
        </AnimatedPressable>
      </View>
    );
  };

  // Narrowed uma vez só aqui — evita depender de o TypeScript propagar a
  // narrowing do discriminante `kind` pra dentro de closures/JSX aninhado
  // mais abaixo (sheet do "⋯").
  const groupTarget = menuTarget?.kind === 'group' ? menuTarget.item : null;
  const eventTarget = menuTarget?.kind === 'event' ? menuTarget.item : null;
  const groupMenuOpen = !!groupTarget && groupTarget.status !== 'removed';
  const eventMenuOpen = !!eventTarget && isFutureNotCancelled(eventTarget);

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comunidade</Text>
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
            title="Não foi possível carregar."
            subtitle={loadErrorCode ? `erro: ${loadErrorCode}` : undefined}
            buttonLabel="Tentar de novo"
            onButtonPress={load}
          />
        ) : segment === 'grupos' ? (
          groups.length === 0 ? (
            <EmptyState icon="people-outline" title="Nenhum grupo" />
          ) : (
            <FlatList
              data={groups}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
              onRefresh={load}
              refreshing={loading}
              renderItem={({ item }) => renderGroupCard(item)}
            />
          )
        ) : events.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nenhum evento" />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            onRefresh={load}
            refreshing={loading}
            renderItem={({ item }) => renderEventCard(item)}
          />
        )}

        {/* Sheet "⋯" do card, molde MyListingsScreen.tsx (S176). */}
        <Modal
          visible={!!menuTarget}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuTarget(null)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setMenuTarget(null)}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {groupTarget?.name ?? eventTarget?.title ?? ''}
              </Text>

              {groupMenuOpen && (
                <>
                  <AnimatedPressable
                    style={styles.sheetOption}
                    onPress={() => {
                      if (!groupTarget) return;
                      setMenuTarget(null);
                      handleCloseGroup(groupTarget);
                    }}
                  >
                    <Ionicons name="lock-closed-outline" size={22} color={theme.colors.text} />
                    <Text style={styles.sheetOptionText}>Encerrar grupo</Text>
                  </AnimatedPressable>
                  <View style={styles.sheetDivider} />
                </>
              )}
              {groupTarget && (
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    if (!groupTarget) return;
                    setMenuTarget(null);
                    handleDeleteGroup(groupTarget);
                  }}
                >
                  <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                  <Text style={[styles.sheetOptionText, styles.sheetOptionTextDestructive]}>
                    Excluir grupo
                  </Text>
                </AnimatedPressable>
              )}

              {eventMenuOpen && (
                <>
                  <AnimatedPressable
                    style={styles.sheetOption}
                    onPress={() => {
                      if (!eventTarget) return;
                      setMenuTarget(null);
                      handleCancelEvent(eventTarget);
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={theme.colors.text} />
                    <Text style={styles.sheetOptionText}>Cancelar evento</Text>
                  </AnimatedPressable>
                  <View style={styles.sheetDivider} />
                </>
              )}
              {eventTarget && (
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    if (!eventTarget) return;
                    setMenuTarget(null);
                    handleDeleteEvent(eventTarget);
                  }}
                >
                  <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                  <Text style={[styles.sheetOptionText, styles.sheetOptionTextDestructive]}>
                    Excluir evento
                  </Text>
                </AnimatedPressable>
              )}

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
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

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
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  cardSubtitle: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  moreBtn: { padding: 4 },

  pill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { fontSize: theme.fontSize.xs, fontWeight: '700' },
  pillTextClosed: { color: theme.colors.error },
  pillTextPast: { color: theme.colors.textSecondary },

  // Sheet do "⋯", molde MyListingsScreen.tsx:483-517.
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
