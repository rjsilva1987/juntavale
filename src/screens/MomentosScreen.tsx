// src/screens/MomentosScreen.tsx
//
// S121 — aba "Explorar": momentos (story de 24h) da base inteira, mais o
// momento do próprio usuário no topo.
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { MomentoComposerModal } from '@/components/MomentoComposerModal';
import { MomentoViewerModal } from '@/components/MomentoViewerModal';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingEventJoinRequests } from '@/hooks/usePendingEventJoinRequests';
import { usePendingGroupJoinRequests } from '@/hooks/usePendingGroupJoinRequests';
import { usePendingMomentoRequests } from '@/hooks/usePendingMomentoRequests';
import { useUnseenAcceptedEvents } from '@/hooks/useUnseenAcceptedEvents';
import { useUnseenAcceptedGroups } from '@/hooks/useUnseenAcceptedGroups';
import { useUnseenAnsweredMomentoRequests } from '@/hooks/useUnseenAnsweredMomentoRequests';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  deleteMyMomento,
  getMyMomento,
  listenActiveMomentos,
  MomentoWithId,
} from '@/services/momentoService';
import { getDisplayName } from '@/utils/profile';

// Sem dayjs/relativeTime plugin novo (nenhum outro ponto do projeto já
// configura dayjs.extend(relativeTime)) — cálculo manual a partir da
// diferença em ms, mesmo raciocínio de "não adicionar dependência nova sem
// necessidade" do resto da sprint.
function formatTimeRemaining(expiresAt: MomentoWithId['expiresAt']): string {
  const diffMs = expiresAt.toMillis() - Date.now();
  if (diffMs <= 0) return 'Expirando…';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h restantes`;
  const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  return `${minutes}min restantes`;
}

export default function MomentosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  // S145 — Grupos/Eventos/Pedidos de conversa passam a ter entrada aqui
  // (fileira nova acima de mySection, ver ListHeaderComponent abaixo), antes
  // eram itens de menu na ProfileScreen. Mesmo hook do badge da própria aba
  // (navigation/index.tsx) e do ponto de aviso que sobrou na ProfileScreen
  // (agora só admin).
  const pendingMomentoRequests = usePendingMomentoRequests();
  // S146 — badges "solicitação→dono" (pedidos de entrada pendentes nos meus
  // grupos/eventos) e "aceite→solicitante" (fui aceito e ainda não vi) dos
  // cards Grupos/Eventos/Pedidos abaixo.
  const pendingGroupJoinRequests = usePendingGroupJoinRequests();
  const pendingEventJoinRequests = usePendingEventJoinRequests();
  const unseenAcceptedGroups = useUnseenAcceptedGroups();
  const unseenAcceptedEvents = useUnseenAcceptedEvents();
  const unseenAnsweredMomentoRequests = useUnseenAnsweredMomentoRequests();
  // undefined = ainda carregando, null = sem momento ativo.
  const [myMomento, setMyMomento] = useState<MomentoWithId | null | undefined>(undefined);
  const [feed, setFeed] = useState<MomentoWithId[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [composerVisible, setComposerVisible] = useState(false);
  // S141 — fila + índice em vez de item único: permite o avanço automático
  // (MomentoViewerModal chama onAdvance ao terminar o timer de 5s) percorrer
  // o restante do feed sem fechar o modal a cada item.
  const [viewerQueue, setViewerQueue] = useState<MomentoWithId[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerIsOwn, setViewerIsOwn] = useState(false);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, UserProfile | null>>({});
  const requestedUidsRef = useRef<Set<string>>(new Set());

  const refreshMyMomento = () => {
    if (!user) return;
    getMyMomento(user.uid)
      .then(setMyMomento)
      .catch(() => setMyMomento(null));
  };

  useEffect(() => {
    if (!user) return;
    getMyMomento(user.uid)
      .then(setMyMomento)
      .catch(() => setMyMomento(null));
  }, [user]);

  useEffect(() => {
    const unsub = listenActiveMomentos((momentos) => {
      setFeed(momentos);
      setFeedLoading(false);
    });
    return unsub;
  }, []);

  // Nomes/fotos dos autores do feed, buscados sob demanda por uid novo —
  // mesmo padrão de dedup de MyReportsScreen.tsx (requestedUidsRef).
  useEffect(() => {
    let cancelled = false;
    const missing = [...new Set(feed.map((m) => m.authorId))].filter(
      (uid) => !requestedUidsRef.current.has(uid),
    );
    missing.forEach((uid) => {
      requestedUidsRef.current.add(uid);
      getUserProfile(uid)
        .then((profile) => {
          if (cancelled) return;
          setAuthorProfiles((prev) => ({ ...prev, [uid]: profile }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [feed]);

  // Cinturão-e-suspensório: onSnapshot não reavalia sozinho por tempo, então
  // um momento que expirou entre dois eventos do listener ficaria
  // visualmente "pendurado" sem esse filtro redundante no render.
  const visibleFeed = feed.filter(
    (m) => m.authorId !== user?.uid && m.expiresAt.toMillis() > Date.now(),
  );

  const openMine = () => {
    if (!myMomento) return;
    setViewerIsOwn(true);
    setViewerQueue([myMomento]);
    setViewerIndex(0);
  };

  const openFeedItem = (item: MomentoWithId) => {
    setViewerIsOwn(false);
    setViewerQueue(visibleFeed);
    const index = visibleFeed.findIndex((m) => m.id === item.id);
    setViewerIndex(index === -1 ? 0 : index);
  };

  const closeViewer = () => {
    setViewerQueue([]);
    setViewerIndex(0);
  };

  // S141 — chamado pelo MomentoViewerModal quando o timer de exibição
  // termina naturalmente (ou o pause/resume termina). Fila de UM item
  // (openMine) já fecha corretamente aqui, sem caso especial: o próximo
  // índice sempre estoura viewerQueue.length quando não há mais itens.
  const advanceViewer = () => {
    const nextIndex = viewerIndex + 1;
    if (nextIndex >= viewerQueue.length) {
      closeViewer();
      return;
    }
    setViewerIndex(nextIndex);
  };

  // S143-A — espelha advanceViewer, mas pra trás. Início da fila é no-op
  // (não fecha o modal), mesmo precedente de PhotoCarousel.goToPrevious.
  const retreatViewer = () => {
    if (viewerIndex <= 0) return;
    setViewerIndex(viewerIndex - 1);
  };

  const handleDeleteOwn = () => {
    if (!user || !myMomento) return;
    Alert.alert('Apagar momento', 'Tem certeza que quer apagar seu momento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMyMomento(user.uid, myMomento.photoUrl);
            closeViewer();
            setMyMomento(null);
          } catch {
            Alert.alert('Erro', 'Não foi possível apagar o momento.');
          }
        },
      },
    ]);
  };

  const currentViewerMomento = viewerQueue[viewerIndex] ?? null;

  const viewerAuthorProfile = viewerIsOwn
    ? undefined
    : currentViewerMomento
      ? authorProfiles[currentViewerMomento.authorId]
      : undefined;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Explorar</Text>
        </View>

        <FlatList
          data={visibleFeed}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* S145 — Grupos/Eventos/Pedidos de conversa: mesmo vocabulário
                  visual (ícone/cor) dos itens equivalentes que existiam na
                  ProfileScreen (agora removidos de lá, exceto Pedidos que
                  ficou só pro admin), aqui em formato de card compacto
                  lado a lado, já que são 3 entradas. */}
              <View style={styles.exploreRow}>
                <AnimatedPressable
                  style={styles.exploreCard}
                  onPress={() => navigation.navigate('Groups')}
                >
                  <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.exploreCardText}>Grupos</Text>
                  {(pendingGroupJoinRequests > 0 || unseenAcceptedGroups > 0) && (
                    <View style={styles.pendingDot} />
                  )}
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.exploreCard}
                  onPress={() => navigation.navigate('Events')}
                >
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.exploreCardText}>Eventos</Text>
                  {(pendingEventJoinRequests > 0 || unseenAcceptedEvents > 0) && (
                    <View style={styles.pendingDot} />
                  )}
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.exploreCard}
                  onPress={() => navigation.navigate('MomentoRequests')}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.exploreCardText}>Momentos</Text>
                  {(pendingMomentoRequests > 0 || unseenAnsweredMomentoRequests > 0) && (
                    <View style={styles.pendingDot} />
                  )}
                </AnimatedPressable>
              </View>

              <View style={styles.mySection}>
                {myMomento === undefined ? (
                  <ActivityIndicator color={theme.colors.primary} style={styles.myLoading} />
                ) : myMomento === null ? (
                  <AnimatedPressable
                    style={styles.createBtn}
                    onPress={() => setComposerVisible(true)}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                    <Text style={styles.createBtnText}>Criar momento</Text>
                  </AnimatedPressable>
                ) : (
                  <AnimatedPressable style={styles.myCard} onPress={openMine}>
                    {myMomento.type === 'photo' && myMomento.photoUrl ? (
                      <View style={styles.myCardPhotoWrap}>
                        <Image
                          source={{ uri: myMomento.photoUrl }}
                          style={styles.myCardImage}
                          contentFit="cover"
                          placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                        />
                        <Text style={styles.myCardTimeOverlay}>
                          {formatTimeRemaining(myMomento.expiresAt)}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.myCardText} numberOfLines={3}>
                          {myMomento.text}
                        </Text>
                        <Text style={styles.myCardTime}>
                          {formatTimeRemaining(myMomento.expiresAt)}
                        </Text>
                      </>
                    )}
                  </AnimatedPressable>
                )}
              </View>
            </>
          }
          ListEmptyComponent={
            feedLoading ? null : (
              <EmptyState
                icon="compass-outline"
                title="Nenhum momento por perto"
                subtitle="Quando alguém publicar, aparece aqui."
                style={styles.emptyState}
              />
            )
          }
          renderItem={({ item }) => {
            const author = authorProfiles[item.authorId];
            return (
              <AnimatedPressable style={styles.feedCard} onPress={() => openFeedItem(item)}>
                {item.type === 'photo' && item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={styles.feedCardImage}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  />
                ) : (
                  <View style={styles.feedCardTextWrap}>
                    <Text style={styles.feedCardText} numberOfLines={5}>
                      {item.text}
                    </Text>
                  </View>
                )}
                <View style={styles.feedCardFooter}>
                  {author?.photoURL ? (
                    <Image
                      source={{ uri: author.photoURL }}
                      style={styles.feedCardAvatar}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    />
                  ) : null}
                  <Text style={styles.feedCardName} numberOfLines={1}>
                    {getDisplayName(author)}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          }}
        />
      </SafeAreaView>

      <MomentoComposerModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onPublished={refreshMyMomento}
        existingPhotoUrl={myMomento?.photoUrl}
      />

      <MomentoViewerModal
        momento={currentViewerMomento}
        authorProfile={viewerAuthorProfile}
        visible={!!currentViewerMomento}
        onClose={closeViewer}
        isOwnMomento={viewerIsOwn}
        onDeleteOwn={viewerIsOwn ? handleDeleteOwn : undefined}
        onAdvance={advanceViewer}
        onRetreat={retreatViewer}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  listContent: { padding: theme.spacing.md, gap: 12 },
  columnWrapper: { gap: 12 },

  // S145 — fileira Grupos/Eventos/Pedidos de conversa, mesmos tokens já
  // usados no resto do arquivo (surface/border/lg em feedCard acima) — sem
  // amarelo (secondary) de fundo, regra de ouro do tema.
  exploreRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  exploreCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
  },
  exploreCardText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  // Mesmo valor exato do verificationAlertDot de ProfileScreen.tsx (não
  // compartilham StyleSheet neste projeto).
  pendingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.error },

  mySection: { marginBottom: 12 },
  myLoading: { marginVertical: theme.spacing.md },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 16,
  },
  createBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.primary },
  myCard: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryDark,
    padding: theme.spacing.md,
    minHeight: 96,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  myCardPhotoWrap: {
    position: 'relative',
    width: '100%',
    height: 110,
  },
  myCardImage: { width: '100%', height: '100%' },
  myCardText: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.white },
  myCardTime: {
    alignSelf: 'flex-start',
    fontSize: theme.fontSize.xs,
    color: theme.colors.white,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },
  myCardTimeOverlay: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    fontSize: theme.fontSize.xs,
    color: theme.colors.white,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },

  feedCard: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    minHeight: 160,
    ...theme.shadows.light,
  },
  feedCardImage: { width: '100%', height: 110 },
  feedCardTextWrap: {
    height: 110,
    padding: theme.spacing.sm,
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight,
  },
  feedCardText: { fontSize: theme.fontSize.sm, color: theme.colors.text },
  feedCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: theme.spacing.sm,
  },
  feedCardAvatar: { width: 22, height: 22, borderRadius: 11 },
  feedCardName: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, flexShrink: 1 },

  emptyState: { flex: 0, paddingVertical: theme.spacing.xl },
});
