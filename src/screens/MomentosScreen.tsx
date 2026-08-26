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
import { useUnreadGroupMessages } from '@/hooks/useUnreadGroupMessages';
import { useUnreadMomentoAuthorMessages } from '@/hooks/useUnreadMomentoAuthorMessages';
import { useUnseenAcceptedEvents } from '@/hooks/useUnseenAcceptedEvents';
import { useUnseenAcceptedGroups } from '@/hooks/useUnseenAcceptedGroups';
import { useUnseenAnsweredMomentoRequests } from '@/hooks/useUnseenAnsweredMomentoRequests';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  deleteMyMomento,
  listenActiveMomentos,
  listenMyMomento,
  MomentoWithId,
} from '@/services/momentoService';
import { getDisplayName } from '@/utils/profile';

// S147/S152 — mesmo card visual pros dois casos (momento próprio e dos
// demais autores): a divergência de JSX entre os dois branches foi a causa
// raiz do bug da S147 (card do dono virava barra azul vazia). Componente só,
// reusado no branch do card próprio e no renderItem do FlatList abaixo,
// elimina a chance de os dois voltarem a divergir — nenhum tratamento visual
// especial pro dono, incluindo o selo de tempo restante que existia antes
// (o card dos outros nunca mostrou esse selo).
function MomentoFeedCard({
  item,
  author,
  onPress,
}: {
  item: MomentoWithId;
  author: UserProfile | null | undefined;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={styles.feedCard} onPress={onPress}>
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
  // S150 — badge "mensagem nova": card "Grupos" acende também com mensagem
  // nova em grupo que participo; card "Momentos" acende também com mensagem
  // nova em conversa de Momento onde sou autor. Eventos ficam de fora
  // (decisão de produto — sem chat, S125 decisão 10).
  const unreadGroupMessages = useUnreadGroupMessages();
  const unreadMomentoAuthorMessages = useUnreadMomentoAuthorMessages();
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
  // S152 — só pra forçar re-render a cada tick (ver useEffect abaixo); o
  // valor em si nunca é lido.
  const [, forceTick] = useState(0);
  // S153 correção pós-auditoria — onSnapshot morre permanentemente após um
  // erro de allow→deny (mesmo padrão já em listenPresence,
  // firestoreService.ts:1425-1440) — a rule de momentos/{uid} tem condição
  // de tempo que pode negar a leitura (doc inexistente/expirado/apagado).
  // A maioria das sessões começa sem momento ativo, então o listener já
  // morre no mount (doc inexistente nega `allow get`) e nunca ressuscita
  // sozinho. `listenGeneration` força o useEffect abaixo a recriar a
  // assinatura a cada publish bem-sucedido — o momento exato em que a
  // condição da rule volta a valer.
  const [listenGeneration, setListenGeneration] = useState(0);

  const refreshMyMomento = () => {
    if (!user) return;
    setListenGeneration((g) => g + 1);
  };

  useEffect(() => {
    if (!user) return;
    const unsub = listenMyMomento(user.uid, setMyMomento);
    return unsub;
  }, [user, listenGeneration]);

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

  // S152 — mesma razão do tick de useSuperLikeQuota.ts:86-97: onSnapshot
  // (feed) e getDoc (myMomento) não reavaliam sozinhos pela passagem do
  // tempo, só quando chega um evento novo do listener/fetch. Existe uma
  // janela de até 59min entre expiresAt vencer e a próxima rodada da
  // Cloud Function expireMomentos (roda de hora em hora) — sem um tick
  // próprio, os filtros de Date.now() abaixo (visibleFeed) e o de
  // myMomento expirado (ver ListHeaderComponent) só reavaliariam quando
  // outro motivo forçasse um re-render. setTimeout recursivo (não
  // setInterval — fora da allowlist de globals do eslint.config.js), ciclo
  // de 60s.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        forceTick((t) => t + 1);
        scheduleNext();
      }, 60 * 1000);
    };
    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, []);

  // Cinturão-e-suspensório: onSnapshot não reavalia sozinho por tempo, então
  // um momento que expirou entre dois eventos do listener ficaria
  // visualmente "pendurado" sem esse filtro redundante no render — o tick
  // de 60s acima garante que esse filtro também se reavalia sozinho pela
  // passagem do tempo, não só quando o listener empurra uma escrita nova.
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
                  {(pendingGroupJoinRequests > 0 ||
                    unseenAcceptedGroups > 0 ||
                    unreadGroupMessages > 0) && <View style={styles.pendingDot} />}
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
                  {(pendingMomentoRequests > 0 ||
                    unseenAnsweredMomentoRequests > 0 ||
                    unreadMomentoAuthorMessages > 0) && <View style={styles.pendingDot} />}
                </AnimatedPressable>
              </View>

              <View style={styles.mySection}>
                {myMomento === undefined ? (
                  <ActivityIndicator color={theme.colors.primary} style={styles.myLoading} />
                ) : // S152 — myMomento vem de um getDoc único (sem listener), então uma
                // vez que expiresAt vence não há nada reavaliando isso sozinho; sem
                // essa checagem o card ficaria pendurado/clicável indefinidamente até
                // refreshMyMomento ser chamado de novo (só acontece ao publicar um
                // novo momento). Trata como "sem momento" só pra fins de RENDER — não
                // apaga o state nem chama Firestore. Se beneficia do tick de 60s
                // acima pra se reavaliar sozinho pela passagem do tempo.
                myMomento === null || myMomento.expiresAt.toMillis() <= Date.now() ? (
                  <AnimatedPressable
                    style={styles.createBtn}
                    onPress={() => setComposerVisible(true)}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                    <Text style={styles.createBtnText}>Criar momento</Text>
                  </AnimatedPressable>
                ) : (
                  <MomentoFeedCard
                    item={myMomento}
                    author={user ? authorProfiles[user.uid] : undefined}
                    onPress={openMine}
                  />
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
          renderItem={({ item }) => (
            <MomentoFeedCard
              item={item}
              author={authorProfiles[item.authorId]}
              onPress={() => openFeedItem(item)}
            />
          )}
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
