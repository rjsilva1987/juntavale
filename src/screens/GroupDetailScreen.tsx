// src/screens/GroupDetailScreen.tsx
//
// S124-A — nome/descrição/prazo/contagem de membros. 5 estados (spec):
// (a) não-membro sem pedido -> "Pedir pra entrar";
// (b) não-membro com pedido pendente -> "Pedido enviado" + "Cancelar pedido";
// (c) membro (inclui criador) -> "Abrir chat";
// (d) membro não-criador -> "Sair do grupo" (some com (c) acima);
// (e) criador -> lista de joinRequests pendentes com aprovar/rejeitar.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ReportModal } from '@/components/ReportModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { reportUser, ReportReason } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  approveJoinRequest,
  cancelJoinRequest,
  Group,
  GroupJoinRequest,
  GroupMember,
  getMyJoinRequest,
  getMyMembership,
  leaveGroup,
  listenGroup,
  listenJoinRequests,
  rejectJoinRequest,
  requestToJoinGroup,
} from '@/services/groupService';
import { getDisplayName } from '@/utils/profile';

type GroupDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen({ route, navigation }: GroupDetailScreenProps) {
  const { groupId } = route.params;
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [membership, setMembership] = useState<GroupMember | null>(null);
  const [joinRequest, setJoinRequest] = useState<GroupJoinRequest | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<GroupJoinRequest[]>([]);
  const [requesterProfiles, setRequesterProfiles] = useState<Record<string, UserProfile | null>>(
    {},
  );
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // permission-denied (grupo expirou/foi apagado) já vira `null` dentro de
  // listenGroup — ver groupService.ts.
  useEffect(() => {
    const unsubscribe = listenGroup(groupId, setGroup);
    return unsubscribe;
  }, [groupId]);

  // S124-A-fix (correção pós-auditoria) — try/catch/finally: sem isto, uma
  // falha aqui (ex.: rede) deixava a tela presa no spinner de
  // `renderActions` pra sempre, porque `membershipLoaded` nunca virava
  // true e nenhum dos 5 estados da spec era alcançado. `finally` garante
  // que a tela sempre sai do loading, mesmo em erro — membership/joinRequest
  // ficam null (mesmo estado de "não-membro sem pedido"), e o Alert avisa
  // que pode estar desatualizado, sem travar a UI.
  const refreshMembership = useCallback(async () => {
    if (!user) return;
    try {
      const [m, r] = await Promise.all([
        getMyMembership(groupId, user.uid),
        getMyJoinRequest(groupId, user.uid),
      ]);
      setMembership(m);
      setJoinRequest(r);
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao carregar participação:', err);
      Alert.alert('Erro', 'Não foi possível carregar sua participação neste grupo.');
    } finally {
      setMembershipLoaded(true);
    }
  }, [groupId, user]);

  useEffect(() => {
    refreshMembership();
  }, [refreshMembership]);

  const isCreator = !!user && group?.creatorId === user.uid;

  // Lista de pedidos pendentes: só o criador precisa (ninguém mais lê isso —
  // firestore.rules restringe read a próprio requerente + criador).
  useEffect(() => {
    if (!isCreator) {
      setPendingRequests([]);
      return;
    }
    const unsubscribe = listenJoinRequests(groupId, setPendingRequests);
    return unsubscribe;
  }, [groupId, isCreator]);

  useEffect(() => {
    if (!isCreator || pendingRequests.length === 0) return;
    const missing = pendingRequests.filter((r) => !(r.uid in requesterProfiles));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (r) => [r.uid, await getUserProfile(r.uid)] as const),
      );
      setRequesterProfiles((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, profile]) => {
          next[uid] = profile;
        });
        return next;
      });
    })();
  }, [isCreator, pendingRequests, requesterProfiles]);

  const handleRequestToJoin = async () => {
    if (!user) return;
    setActionBusy(true);
    try {
      await requestToJoinGroup(groupId, user.uid);
      await refreshMembership();
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao pedir entrada:', err);
      Alert.alert('Erro', 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelRequest = () => {
    if (!user) return;
    Alert.alert('Cancelar pedido?', 'Você pode pedir pra entrar de novo depois.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar pedido',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            await cancelJoinRequest(groupId, user.uid);
            await refreshMembership();
          } catch (err) {
            console.error('[GroupDetailScreen] falha ao cancelar pedido:', err);
            Alert.alert('Erro', 'Não foi possível cancelar o pedido. Tente novamente.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleLeaveGroup = () => {
    if (!user || !group) return;
    Alert.alert('Sair do grupo?', 'Você pode precisar pedir entrada de novo depois.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            await leaveGroup(groupId, user.uid);
            await refreshMembership();
          } catch (err) {
            console.error('[GroupDetailScreen] falha ao sair do grupo:', err);
            // S124-A-fix (correção pós-auditoria) — sem este Alert, uma
            // falha aqui fazia o usuário achar que saiu do grupo quando na
            // verdade não saiu (nenhum feedback visível de erro).
            Alert.alert('Erro', 'Não foi possível sair do grupo. Tente novamente.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleApprove = async (requesterUid: string) => {
    if (!group) return;
    setBusyUid(requesterUid);
    try {
      await approveJoinRequest(groupId, requesterUid);
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao aprovar pedido:', err);
      Alert.alert('Erro', 'Não foi possível aprovar o pedido.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = (requesterUid: string, requesterName: string) => {
    Alert.alert('Rejeitar pedido?', `${requesterName} não vai entrar no grupo.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Rejeitar',
        style: 'destructive',
        onPress: async () => {
          setBusyUid(requesterUid);
          try {
            await rejectJoinRequest(groupId, requesterUid);
          } catch (err) {
            console.error('[GroupDetailScreen] falha ao rejeitar pedido:', err);
            Alert.alert('Erro', 'Não foi possível rejeitar o pedido. Tente novamente.');
          } finally {
            setBusyUid(null);
          }
        },
      },
    ]);
  };

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user || !group) return;
    try {
      await reportUser(user.uid, group.creatorId, reason, details, undefined, undefined, {
        groupId: group.id,
        groupName: group.name,
      });
      setReportVisible(false);
      Alert.alert('Denúncia enviada', 'Nossa equipe vai analisar.');
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao denunciar grupo:', err);
      Alert.alert('Erro', 'Não foi possível enviar a denúncia.');
    }
  };

  const renderActions = () => {
    if (!group || !membershipLoaded) {
      return <ActivityIndicator color={theme.colors.primary} />;
    }
    if (membership) {
      return (
        <>
          <AnimatedPressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('GroupChat', { groupId, groupName: group.name })}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={theme.colors.white} />
            <Text style={styles.primaryBtnText}>Abrir chat</Text>
          </AnimatedPressable>
          {membership.role !== 'creator' && (
            <AnimatedPressable
              style={styles.destructiveBtn}
              onPress={handleLeaveGroup}
              disabled={actionBusy}
            >
              {actionBusy ? (
                <ActivityIndicator color={theme.colors.nope} />
              ) : (
                <Text style={styles.destructiveBtnText}>Sair do grupo</Text>
              )}
            </AnimatedPressable>
          )}
        </>
      );
    }
    if (joinRequest) {
      return (
        <>
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.pendingBadgeText}>Pedido enviado</Text>
          </View>
          <AnimatedPressable
            style={styles.destructiveBtn}
            onPress={handleCancelRequest}
            disabled={actionBusy}
          >
            {actionBusy ? (
              <ActivityIndicator color={theme.colors.nope} />
            ) : (
              <Text style={styles.destructiveBtnText}>Cancelar pedido</Text>
            )}
          </AnimatedPressable>
        </>
      );
    }
    return (
      <AnimatedPressable
        style={styles.primaryBtn}
        onPress={handleRequestToJoin}
        disabled={actionBusy}
      >
        {actionBusy ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <>
            <Ionicons name="person-add-outline" size={18} color={theme.colors.white} />
            <Text style={styles.primaryBtnText}>Pedir pra entrar</Text>
          </>
        )}
      </AnimatedPressable>
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group?.name ?? 'Grupo'}
          </Text>
          {group && !isCreator ? (
            <AnimatedPressable onPress={() => setReportVisible(true)} style={styles.backBtn}>
              <Ionicons name="flag-outline" size={22} color={theme.colors.textSecondary} />
            </AnimatedPressable>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>

        {group === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : group === null ? (
          <View style={styles.center}>
            <Text style={styles.notFound}>Este grupo não existe mais.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.card}>
              <Text style={styles.groupName}>{group.name}</Text>
              {!!group.description && (
                <Text style={styles.groupDescription}>{group.description}</Text>
              )}
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.metaText}>
                  {group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.metaText}>
                  Encerra em {dayjs(group.expiresAt.toDate()).format('DD/MM/YYYY [às] HH:mm')}
                </Text>
              </View>
            </View>

            <View style={styles.actionsWrap}>{renderActions()}</View>

            {isCreator && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pedidos pendentes</Text>
                {pendingRequests.length === 0 ? (
                  <Text style={styles.emptyRequests}>Nenhum pedido pendente.</Text>
                ) : (
                  pendingRequests.map((req) => {
                    const profile = requesterProfiles[req.uid];
                    const name = profile === undefined ? '…' : getDisplayName(profile);
                    const isBusy = busyUid === req.uid;
                    return (
                      <View key={req.uid} style={styles.requestRow}>
                        <Text style={styles.requestName} numberOfLines={1}>
                          {name}
                        </Text>
                        <View style={styles.requestActions}>
                          <AnimatedPressable
                            style={styles.approveBtn}
                            onPress={() => handleApprove(req.uid)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color={theme.colors.white} />
                            ) : (
                              <Ionicons name="checkmark" size={18} color={theme.colors.white} />
                            )}
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.rejectBtn}
                            onPress={() => handleReject(req.uid, name)}
                            disabled={isBusy}
                          >
                            <Ionicons name="close" size={18} color={theme.colors.nope} />
                          </AnimatedPressable>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReport}
        title="Denunciar grupo"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },

  content: { padding: theme.spacing.md, gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 8,
    ...theme.shadows.medium,
  },
  groupName: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  groupDescription: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

  actionsWrap: { gap: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
  },
  primaryBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
  destructiveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.nope,
    borderRadius: theme.borderRadius.full,
    padding: 13,
  },
  destructiveBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.nope },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  pendingBadgeText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

  sectionTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  emptyRequests: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  requestName: { flex: 1, fontSize: theme.fontSize.md, color: theme.colors.text },
  requestActions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.nope,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
