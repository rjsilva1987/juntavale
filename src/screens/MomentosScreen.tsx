// src/screens/MomentosScreen.tsx
//
// S121 — aba "Explorar": momentos (story de 24h) da base inteira, mais o
// momento do próprio usuário no topo.
import { Ionicons } from '@expo/vector-icons';
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
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  deleteMyMomento,
  getMyMomento,
  listenActiveMomentos,
  MomentoWithId,
} from '@/services/momentoService';

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
  const { user } = useAuth();
  // undefined = ainda carregando, null = sem momento ativo.
  const [myMomento, setMyMomento] = useState<MomentoWithId | null | undefined>(undefined);
  const [feed, setFeed] = useState<MomentoWithId[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [composerVisible, setComposerVisible] = useState(false);
  const [viewerMomento, setViewerMomento] = useState<MomentoWithId | null>(null);
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
    setViewerMomento(myMomento);
  };

  const openFeedItem = (item: MomentoWithId) => {
    setViewerIsOwn(false);
    setViewerMomento(item);
  };

  const closeViewer = () => setViewerMomento(null);

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

  const viewerAuthorProfile = viewerIsOwn
    ? undefined
    : viewerMomento
      ? authorProfiles[viewerMomento.authorId]
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
                    <Image
                      source={{ uri: myMomento.photoUrl }}
                      style={styles.myCardImage}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    />
                  ) : (
                    <Text style={styles.myCardText} numberOfLines={3}>
                      {myMomento.text}
                    </Text>
                  )}
                  <Text style={styles.myCardTime}>{formatTimeRemaining(myMomento.expiresAt)}</Text>
                </AnimatedPressable>
              )}
            </View>
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
                    {author?.name ?? ''}
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
        momento={viewerMomento}
        authorProfile={viewerAuthorProfile}
        visible={!!viewerMomento}
        onClose={closeViewer}
        isOwnMomento={viewerIsOwn}
        onDeleteOwn={viewerIsOwn ? handleDeleteOwn : undefined}
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
  myCardImage: { ...StyleSheet.absoluteFillObject },
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
