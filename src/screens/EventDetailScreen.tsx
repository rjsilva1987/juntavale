// src/screens/EventDetailScreen.tsx
//
// S125 — mirror de GroupDetailScreen.tsx SEM as camadas de enquete/presença/
// selo de fundador da S124-B (fora de escopo desta sprint). 4 estados
// (spec, adaptado do molde de 5 estados de grupo — evento não tem "sair
// sempre visível pro criador" nem chat):
// (a) não-participante sem pedido -> "Pedir pra participar", local oculto;
// (b) não-participante com pedido pendente -> "Pedido enviado" + "Cancelar
//     pedido", local oculto;
// (c) participante aprovado não-criador -> local visível + "Sair do
//     evento";
// (d) criador -> local visível + lista de joinRequests pendentes
//     (aprovar/rejeitar) + lista de participantes, sem botão de sair.
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
import {
  approveJoinRequest,
  cancelJoinRequest,
  Event,
  EventJoinRequest,
  EventLocation,
  EventParticipant,
  getEventLocation,
  getMyEventJoinRequest,
  getMyParticipation,
  leaveEvent,
  listenEvent,
  listenJoinRequests,
  listEventParticipants,
  markEventParticipationSeen,
  rejectJoinRequest,
  requestToJoinEvent,
} from '@/services/eventService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { getDisplayName } from '@/utils/profile';

type EventDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

export default function EventDetailScreen({ route, navigation }: EventDetailScreenProps) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null | undefined>(undefined);
  const [participation, setParticipation] = useState<EventParticipant | null>(null);
  const [joinRequest, setJoinRequest] = useState<EventJoinRequest | null>(null);
  const [participationLoaded, setParticipationLoaded] = useState(false);
  const [location, setLocation] = useState<EventLocation | null>(null);
  const [pendingRequests, setPendingRequests] = useState<EventJoinRequest[]>([]);
  const [requesterProfiles, setRequesterProfiles] = useState<Record<string, UserProfile | null>>(
    {},
  );
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [participantProfiles, setParticipantProfiles] = useState<
    Record<string, UserProfile | null>
  >({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // permission-denied (evento expirou/foi apagado) já vira `null` dentro de
  // listenEvent — ver eventService.ts.
  useEffect(() => {
    const unsubscribe = listenEvent(eventId, setEvent);
    return unsubscribe;
  }, [eventId]);

  // Mesmo tratamento de try/catch/finally de GroupDetailScreen
  // (S124-A-fix): sem isto, uma falha aqui deixava a tela presa no
  // spinner de `renderActions` pra sempre.
  const refreshParticipation = useCallback(async () => {
    if (!user) return;
    try {
      const [p, r] = await Promise.all([
        getMyParticipation(eventId, user.uid),
        getMyEventJoinRequest(eventId, user.uid),
      ]);
      setParticipation(p);
      setJoinRequest(r);
    } catch (err) {
      console.error('[EventDetailScreen] falha ao carregar participação:', err);
      Alert.alert('Erro', 'Não foi possível carregar sua participação neste evento.');
    } finally {
      setParticipationLoaded(true);
    }
  }, [eventId, user]);

  useEffect(() => {
    refreshParticipation();
  }, [refreshParticipation]);

  const isCreator = !!user && event?.creatorId === user.uid;
  const isApproved = !!participation;

  // S146 — mirror EXATO do efeito de GroupDetailScreen.tsx — badge
  // "aceite→solicitante": marca o próprio doc de participação como visto
  // quando o usuário logado é participante NÃO-criador e ainda não tem
  // `seenAt`.
  useEffect(() => {
    if (!user || !participation || isCreator) return;
    if (participation.seenAt) return;
    markEventParticipationSeen(eventId, user.uid).catch(() => {});
  }, [user, participation, isCreator, eventId]);

  // Local só é buscado depois de saber que sou criador/participante
  // aprovado — permission-denied é ESPERADO pra quem só vê o evento na
  // lista geral (getEventLocation já trata isso como null, mas não faz
  // sentido nem tentar antes de participationLoaded resolver).
  useEffect(() => {
    if (!participationLoaded || !isApproved) {
      setLocation(null);
      return;
    }
    let cancelled = false;
    getEventLocation(eventId)
      .then((loc) => {
        if (!cancelled) setLocation(loc);
      })
      .catch((err) => {
        console.error('[EventDetailScreen] falha ao carregar local:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, participationLoaded, isApproved]);

  // Lista de pedidos pendentes: só o criador precisa (ninguém mais lê isso
  // — firestore.rules restringe read a próprio requerente + criador).
  useEffect(() => {
    if (!isCreator) {
      setPendingRequests([]);
      return;
    }
    const unsubscribe = listenJoinRequests(eventId, setPendingRequests);
    return unsubscribe;
  }, [eventId, isCreator]);

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

  // Lista de participantes aprovados: só o criador vê (spec: "se sou
  // criador... lista de participantes"). Sem listener em tempo real —
  // recarrega a cada aprovação bem-sucedida (handleApprove abaixo), mesmo
  // padrão de "recarrega no ponto de mudança" já usado em EventsScreen.
  const refreshParticipants = useCallback(async () => {
    if (!isCreator) {
      setParticipants([]);
      return;
    }
    try {
      const list = await listEventParticipants(eventId);
      setParticipants(list);
    } catch (err) {
      console.error('[EventDetailScreen] falha ao carregar participantes:', err);
    }
  }, [eventId, isCreator]);

  useEffect(() => {
    refreshParticipants();
  }, [refreshParticipants]);

  useEffect(() => {
    if (!isCreator || participants.length === 0) return;
    const missing = participants.filter((p) => !(p.uid in participantProfiles));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (p) => [p.uid, await getUserProfile(p.uid)] as const),
      );
      setParticipantProfiles((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, profile]) => {
          next[uid] = profile;
        });
        return next;
      });
    })();
  }, [isCreator, participants, participantProfiles]);

  const handleRequestToJoin = async () => {
    if (!user) return;
    setActionBusy(true);
    try {
      await requestToJoinEvent(eventId, user.uid);
      await refreshParticipation();
    } catch (err) {
      console.error('[EventDetailScreen] falha ao pedir participação:', err);
      Alert.alert('Erro', 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelRequest = () => {
    if (!user) return;
    Alert.alert('Cancelar pedido?', 'Você pode pedir pra participar de novo depois.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar pedido',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            await cancelJoinRequest(eventId, user.uid);
            await refreshParticipation();
          } catch (err) {
            console.error('[EventDetailScreen] falha ao cancelar pedido:', err);
            Alert.alert('Erro', 'Não foi possível cancelar o pedido. Tente novamente.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleLeaveEvent = () => {
    if (!user || !event) return;
    Alert.alert('Sair do evento?', 'Você pode precisar pedir participação de novo depois.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            await leaveEvent(eventId, user.uid);
            await refreshParticipation();
          } catch (err) {
            console.error('[EventDetailScreen] falha ao sair do evento:', err);
            Alert.alert('Erro', 'Não foi possível sair do evento. Tente novamente.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleApprove = async (requesterUid: string) => {
    if (!event) return;
    setBusyUid(requesterUid);
    try {
      await approveJoinRequest(eventId, requesterUid);
      await refreshParticipants();
    } catch (err) {
      console.error('[EventDetailScreen] falha ao aprovar pedido:', err);
      Alert.alert('Erro', 'Não foi possível aprovar o pedido.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = (requesterUid: string, requesterName: string) => {
    Alert.alert('Rejeitar pedido?', `${requesterName} não vai participar do evento.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Rejeitar',
        style: 'destructive',
        onPress: async () => {
          setBusyUid(requesterUid);
          try {
            await rejectJoinRequest(eventId, requesterUid);
          } catch (err) {
            console.error('[EventDetailScreen] falha ao rejeitar pedido:', err);
            Alert.alert('Erro', 'Não foi possível rejeitar o pedido. Tente novamente.');
          } finally {
            setBusyUid(null);
          }
        },
      },
    ]);
  };

  // reportedId é SEMPRE o creatorId do evento (decisão 8 — nunca um
  // participante específico), mesmo mecanismo de handleReport em
  // GroupDetailScreen.tsx.
  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user || !event) return;
    try {
      await reportUser(
        user.uid,
        event.creatorId,
        reason,
        details,
        undefined,
        undefined,
        undefined,
        { eventId: event.id, eventName: event.title },
      );
      setReportVisible(false);
      Alert.alert('Denúncia enviada', 'Nossa equipe vai analisar.');
    } catch (err) {
      console.error('[EventDetailScreen] falha ao denunciar evento:', err);
      Alert.alert('Erro', 'Não foi possível enviar a denúncia.');
    }
  };

  const renderActions = () => {
    if (!event || !participationLoaded) {
      return <ActivityIndicator color={theme.colors.primary} />;
    }
    if (isApproved) {
      if (isCreator) return null;
      return (
        <AnimatedPressable
          style={styles.destructiveBtn}
          onPress={handleLeaveEvent}
          disabled={actionBusy}
        >
          {actionBusy ? (
            <ActivityIndicator color={theme.colors.nope} />
          ) : (
            <Text style={styles.destructiveBtnText}>Sair do evento</Text>
          )}
        </AnimatedPressable>
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
            <Text style={styles.primaryBtnText}>Pedir pra participar</Text>
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
            {event?.title ?? 'Evento'}
          </Text>
          {event && !isCreator ? (
            <AnimatedPressable onPress={() => setReportVisible(true)} style={styles.backBtn}>
              <Ionicons name="flag-outline" size={22} color={theme.colors.textSecondary} />
            </AnimatedPressable>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>

        {event === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : event === null ? (
          <View style={styles.center}>
            <Text style={styles.notFound}>Este evento não existe mais.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.card}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              {!!event.description && (
                <Text style={styles.eventDescription}>{event.description}</Text>
              )}
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.metaText}>
                  {event.participantCount}{' '}
                  {event.participantCount === 1 ? 'participante' : 'participantes'}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.metaText}>
                  {dayjs(event.startsAt.toDate()).format('DD/MM/YYYY [às] HH:mm')}
                </Text>
              </View>
              {/* Local: só visível pra criador/participante aprovado
                  (getEventLocation já resolve isso — permission-denied vira
                  null pra quem só vê o evento na lista geral). */}
              {isApproved && (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.metaText}>{location ? location.text : '…'}</Text>
                </View>
              )}
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

            {isCreator && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Participantes</Text>
                {participants.length === 0 ? (
                  <Text style={styles.emptyRequests}>Nenhum participante ainda.</Text>
                ) : (
                  participants.map((p) => {
                    const profile = participantProfiles[p.uid];
                    const name = profile === undefined ? '…' : getDisplayName(profile);
                    return (
                      <View key={p.uid} style={styles.requestRow}>
                        <Text style={styles.requestName} numberOfLines={1}>
                          {name}
                          {p.role === 'creator' ? ' (criador)' : ''}
                        </Text>
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
        title="Denunciar evento"
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
  eventTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  eventDescription: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },
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
