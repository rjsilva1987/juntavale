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
import { GroupFounderTag } from '@/components/GroupFounderTag';
import { PollEditModal } from '@/components/PollEditModal';
import { ReportModal } from '@/components/ReportModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { reportUser, ReportReason } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  approveJoinRequest,
  cancelJoinRequest,
  castGroupPollVote,
  getGroupActiveNowCount,
  getMyGroupPollVote,
  getMyJoinRequest,
  getMyMembership,
  Group,
  GroupJoinRequest,
  GroupMember,
  leaveGroup,
  listenGroup,
  listenJoinRequests,
  markGroupMembershipSeen,
  rejectJoinRequest,
  removeGroupPoll,
  requestToJoinGroup,
  setGroupPoll,
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

  // S124-B (camada 3 — Selo de fundador do grupo) — resolve o profile do
  // creatorId pra exibir "Criado por X" (nickname público, S135 — nunca
  // nome real). undefined = ainda carregando, null = perfil não encontrado
  // (conta apagada).
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null | undefined>(undefined);

  // S124-B (camada 1 — Enquete de grupo) — mesmo molde do painel de enquete
  // do SwipeScreen/ProfileScreen (S126): pollModalVisible/pollSaving pro
  // modal de criar/editar (só o criador), myPollVote/pollVoteResolved pro
  // voto do usuário atual. `resolved` distingue "ainda não veio a resposta"
  // de "de fato não votou" (myPollVote === null é ambíguo pros dois casos).
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [pollSaving, setPollSaving] = useState(false);
  const [myPollVote, setMyPollVote] = useState<number | null>(null);
  const [pollVoteResolved, setPollVoteResolved] = useState(false);

  // S124-B (camada 2 — Gente ativa agora) — null enquanto não carregou (ou
  // enquanto o usuário ainda não é membro, ver useEffect abaixo).
  const [activeNowCount, setActiveNowCount] = useState<number | null>(null);

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

  // S146 — badge "aceite→solicitante": marca o próprio doc de membership
  // como visto (fire-and-forget, mesmo padrão de markMatchRead em
  // ChatScreen.tsx) quando o usuário logado é membro NÃO-criador e ainda
  // não tem `seenAt` — dono nunca marca (o dot dele é outro, "solicitação→
  // dono", some ao ver os pedidos pendentes, não a própria participação).
  useEffect(() => {
    if (!user || !membership || isCreator) return;
    if (membership.seenAt) return;
    markGroupMembershipSeen(groupId, user.uid).catch(() => {});
  }, [user, membership, isCreator, groupId]);

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

  // S124-B (camada 3) — resolve o nome de quem criou pra linha "Criado por
  // X". Roda de novo só se creatorId mudar (não muda na prática, mas o
  // listener de group pode reemitir o mesmo doc).
  useEffect(() => {
    if (!group?.creatorId) return;
    let cancelled = false;
    getUserProfile(group.creatorId)
      .then((p) => {
        if (!cancelled) setCreatorProfile(p);
      })
      .catch((err) => {
        console.error('[GroupDetailScreen] falha ao carregar perfil do criador:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [group?.creatorId]);

  // S124-B (camada 1, S124-B-fix) — carrega o voto já dado (se houver) toda
  // vez que o CONTEÚDO da enquete muda (question, options, qualquer campo —
  // mesmo critério de JSON.stringify(poll) que onGroupPollChanged usa pra
  // decidir se reseta pollVotes/pollCounts; deps por question sozinha
  // deixava a tela achando que o voto antigo ainda valia quando só as
  // opções mudavam) ou quando o grupo deixa de ter enquete. Sem enquete,
  // não há nada a resolver — pollVoteResolved fica true e myPollVote null
  // (estado inerte, os botões de voto nunca renderizam sem group.poll).
  useEffect(() => {
    if (!group?.poll || !user) {
      setMyPollVote(null);
      setPollVoteResolved(!group?.poll);
      return;
    }
    let cancelled = false;
    setPollVoteResolved(false);
    getMyGroupPollVote(groupId, user.uid)
      .then((vote) => {
        if (!cancelled) setMyPollVote(vote);
      })
      .catch((err) => {
        console.error('[GroupDetailScreen] falha ao carregar voto da enquete:', err);
      })
      .finally(() => {
        if (!cancelled) setPollVoteResolved(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, JSON.stringify(group?.poll ?? null), user?.uid]);

  // S124-B (camada 2) — sem polling automático nesta sprint: só recarrega
  // no MOUNT (esta tela não usa useFocusEffect/navigation.addListener em
  // nenhum outro ponto, ao contrário de GroupsScreen — spec autoriza cair
  // pro mount quando não há esse padrão já em uso aqui). Só chama pra quem
  // já é membro: a callable nega quem não é (permission-denied), e o
  // número não faz sentido pra quem ainda nem entrou.
  useEffect(() => {
    if (!membership) return;
    let cancelled = false;
    getGroupActiveNowCount(groupId)
      .then((count) => {
        if (!cancelled) setActiveNowCount(count);
      })
      .catch((err) => {
        console.error('[GroupDetailScreen] falha ao carregar contador de ativos:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, membership]);

  const handleSavePoll = async (question: string, options: string[]) => {
    setPollSaving(true);
    try {
      await setGroupPoll(groupId, question, options);
      setPollModalVisible(false);
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao salvar enquete:', err);
      Alert.alert('Erro', 'Não foi possível salvar a enquete.');
    } finally {
      setPollSaving(false);
    }
  };

  // Não apaga `pollCounts`/pollVotes aqui — isso é responsabilidade da
  // Cloud Function onGroupPollChanged, que reage à mudança do campo `poll`
  // (deleteField() conta como mudança), mesmo padrão de handleRemovePoll no
  // perfil (firestoreService.ts).
  const handleRemovePoll = async () => {
    setPollSaving(true);
    try {
      await removeGroupPoll(groupId);
      setPollModalVisible(false);
    } catch (err) {
      console.error('[GroupDetailScreen] falha ao remover enquete:', err);
      Alert.alert('Erro', 'Não foi possível remover a enquete.');
    } finally {
      setPollSaving(false);
    }
  };

  // Otimista, mesmo padrão de handleVotePoll (SwipeScreen, S126):
  // permission-denied aqui significa "já tinha votado" (corrida — outro
  // device/tela ao mesmo tempo), não erro genérico.
  const handleVotePoll = async (optionIndex: number) => {
    if (!user) return;
    setMyPollVote(optionIndex);
    try {
      await castGroupPollVote(groupId, user.uid, optionIndex);
    } catch (e) {
      const isPermissionDenied =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: unknown }).code === 'permission-denied';
      if (isPermissionDenied) return;
      setMyPollVote(null);
      Alert.alert('Erro', 'Não foi possível registrar seu voto.');
    }
  };

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
              {/* S124-B (camada 3 — Selo de fundador do grupo): reusa
                  getDisplayName (S135 — nickname público, nunca nome real).
                  O badge aqui é sempre "verdadeiro" por construção (a pessoa
                  citada é sempre o creatorId) — mesmo vocabulário visual do
                  FounderBadge, mas condicionado a group.creatorId, não a
                  founderNumber. */}
              <View style={styles.metaRow}>
                <Ionicons
                  name="person-circle-outline"
                  size={16}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.metaText}>
                  Criado por{' '}
                  {creatorProfile === undefined
                    ? '…'
                    : creatorProfile
                      ? getDisplayName(creatorProfile)
                      : 'alguém que apagou a conta'}
                </Text>
                <GroupFounderTag />
              </View>
              {/* S124-B (camada 2 — Gente ativa agora): sem ícone/selo novo
                  (spec), texto simples. Só aparece pra quem já é membro —
                  ver useEffect que carrega activeNowCount. */}
              {activeNowCount != null && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {activeNowCount} {activeNowCount === 1 ? 'ativo' : 'ativos'} agora
                  </Text>
                </View>
              )}
            </View>

            {/* S124-B (camada 1 — Enquete de grupo): reusa PollEditModal
                (genérico, não amarrado a users/{uid} — só recebe callbacks)
                pra criar/editar. Card só aparece pra quem já é membro: só
                membro pode votar (rules exigem exists(members/{voterUid})),
                e mostrar pergunta+botões de voto pra quem nem entrou não faz
                sentido de produto. */}
            {membership && !!group.poll && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Enquete</Text>
                <Text style={styles.pollQuestionText}>{group.poll.question}</Text>
                {!pollVoteResolved ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : myPollVote != null ? (
                  <>
                    {group.poll.options.map((option, index) => (
                      <View key={index} style={styles.pollCountRow}>
                        <Text style={styles.pollCountOptionText} numberOfLines={1}>
                          {option}
                        </Text>
                        <Text style={styles.pollCountValue}>{group.pollCounts?.[index] ?? 0}</Text>
                      </View>
                    ))}
                    <Text style={styles.pollTotalText}>
                      {Object.values(group.pollCounts ?? {}).reduce((sum, n) => sum + n, 0)} voto(s)
                      no total
                    </Text>
                  </>
                ) : (
                  group.poll.options.map((option, index) => (
                    <AnimatedPressable
                      key={index}
                      style={styles.pollOption}
                      onPress={() => handleVotePoll(index)}
                    >
                      <Text style={styles.pollOptionText}>{option}</Text>
                    </AnimatedPressable>
                  ))
                )}
                {isCreator && (
                  <AnimatedPressable
                    style={styles.addPromptBtn}
                    onPress={() => setPollModalVisible(true)}
                  >
                    <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.addPromptText}>Editar</Text>
                  </AnimatedPressable>
                )}
              </View>
            )}
            {membership && !group.poll && isCreator && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Enquete</Text>
                <AnimatedPressable
                  style={styles.addPromptBtn}
                  onPress={() => setPollModalVisible(true)}
                >
                  <Ionicons name="add" size={18} color={theme.colors.primary} />
                  <Text style={styles.addPromptText}>Criar enquete</Text>
                </AnimatedPressable>
              </View>
            )}

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

      <PollEditModal
        visible={pollModalVisible}
        initialQuestion={group?.poll?.question}
        initialOptions={group?.poll?.options}
        onSave={handleSavePoll}
        onRemove={group?.poll ? handleRemovePoll : undefined}
        onClose={() => setPollModalVisible(false)}
        saving={pollSaving}
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

  // S124-B (camada 1 — Enquete de grupo) — mesmo vocabulário visual da
  // enquete de perfil: pollQuestionText/pollCountRow/pollCountOptionText/
  // pollCountValue/pollTotalText mirroram ProfileScreen.tsx (agregado);
  // pollOption/pollOptionText mirroram ProfileSections.tsx (voto);
  // addPromptBtn/addPromptText mirroram o botão "Criar"/"Editar" de
  // ProfileScreen.tsx.
  pollQuestionText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  pollCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  pollCountOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text, flex: 1 },
  pollCountValue: { fontSize: theme.fontSize.md, color: theme.colors.primary, fontWeight: '700' },
  pollTotalText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  pollOption: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: theme.colors.background,
  },
  pollOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  addPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    marginTop: 4,
  },
  addPromptText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '700' },
});
