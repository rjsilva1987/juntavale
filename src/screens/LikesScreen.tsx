// src/screens/LikesScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable, Alert } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { ReportModal } from '@/components/ReportModal';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLikers } from '@/hooks/useLikers';
import { useMyLikes } from '@/hooks/useMyLikes';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import { UserProfile } from '@/services/firestoreService';

type Tab = 'received' | 'sent';

interface LikeCardProps {
  profile: UserProfile;
  isSuperLike: boolean;
  likedPhotoURL?: string;
  // S67 — bilhete da super curtida. Card é compartilhado pelas duas abas;
  // controle de exibição é por prop — só a aba "Quem curtiu você" passa
  // esse valor adiante (useMyLikes não expõe note, ver hook).
  note?: string;
  onPress: () => void;
  onMenuPress: () => void;
}

// Compartilhado pelas duas abas — mesmo visual do grid original (borda
// amarela + badge estrela pra superlike, badge coração sempre visível).
function LikeCard({
  profile,
  isSuperLike,
  likedPhotoURL,
  note,
  onPress,
  onMenuPress,
}: LikeCardProps) {
  // Se a foto curtida falhar ao carregar (ex: deletada do Storage), some
  // com a faixa inteira em vez de mostrar um quadrado quebrado (S35).
  const [likedPhotoFailed, setLikedPhotoFailed] = useState(false);
  const showLikedPhotoContext = !!likedPhotoURL && !likedPhotoFailed;

  return (
    <AnimatedPressable
      style={[styles.likerCard, isSuperLike && styles.likerCardSuperLike]}
      entering={FadeInDown}
      onPress={onPress}
    >
      {profile.photoURL ? (
        <Image
          source={{ uri: profile.photoURL }}
          style={styles.likerPhoto}
          contentFit="cover"
          placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
          transition={200}
        />
      ) : (
        <View style={styles.likerPhotoPlaceholder}>
          <Text style={{ fontSize: 40 }}>😊</Text>
        </View>
      )}
      <View style={styles.likerInfo}>
        <View style={styles.likerTopRow}>
          <View style={styles.likerNameRow}>
            <Text style={styles.likerName} numberOfLines={1}>
              {profile.name}, {profile.age}
            </Text>
            {profile.verified === true && <VerifiedBadge size={14} />}
          </View>
          <AnimatedPressable style={styles.menuBtn} onPress={onMenuPress} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.white} />
          </AnimatedPressable>
        </View>
        {showLikedPhotoContext && (
          <View style={styles.likedPhotoRow}>
            <Image
              source={{ uri: likedPhotoURL }}
              style={styles.likedPhotoThumb}
              contentFit="cover"
              onError={() => setLikedPhotoFailed(true)}
            />
            <Text style={styles.likedPhotoLabel} numberOfLines={1}>
              Curtiu sua foto
            </Text>
          </View>
        )}
        {!!note && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText} numberOfLines={3}>
              “{note}”
            </Text>
          </View>
        )}
      </View>
      {isSuperLike && (
        <View style={styles.superLikeBadge}>
          <Ionicons name="star" size={16} color={theme.colors.onSecondary} />
        </View>
      )}
      <View style={styles.heartBadge}>
        <Ionicons name="heart" size={16} color={theme.colors.onSecondary} />
      </View>
    </AnimatedPressable>
  );
}

export default function LikesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('received');
  const { likers, loading: loadingReceived, reload: reloadReceived } = useLikers();
  const { profiles: myLikes, loading: loadingSent, reload: reloadSent } = useMyLikes();

  // Menu (denunciar/bloquear) do card — compartilhado pelas duas abas porque
  // o LikeCard também é compartilhado (ver comentário acima do componente).
  const [menuTarget, setMenuTarget] = useState<UserProfile | null>(null);
  const [reportTarget, setReportTarget] = useState<UserProfile | null>(null);

  const openMenu = (profile: UserProfile) => setMenuTarget(profile);
  const closeMenu = () => setMenuTarget(null);

  const reloadAll = useCallback(() => {
    reloadReceived();
    reloadSent();
  }, [reloadReceived, reloadSent]);

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user || !reportTarget) return;
    await reportUser(user.uid, reportTarget.uid, reason, details);
    setReportTarget(null);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
    reloadAll();
  };

  const handleBlock = () => {
    if (!user || !menuTarget) return;
    const target = menuTarget;
    closeMenu();
    Alert.alert(
      'Bloquear usuário?',
      `Você deixará de ver ${target.name}. Essa ação pode ser desfeita depois em "Usuários bloqueados".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            await blockUser(user.uid, target.uid);
            reloadAll();
          },
        },
      ],
    );
  };

  // useLikers/useMyLikes fazem fetch único (getDocs), não onSnapshot — sem
  // isso, quem foi retribuído/dispensado/bloqueado no preview continuaria
  // aparecendo aqui até um remount da tela. Recarrega as duas abas juntas
  // (mais simples do que só a ativa, e o custo de mais uma leitura por
  // focus é aceitável aqui). Mesmo reloadAll usado depois de denunciar/
  // bloquear pelo menu do card.
  useFocusEffect(
    useCallback(() => {
      reloadAll();
    }, [reloadAll]),
  );

  const goToProfile = (profile: UserProfile, alreadyLiked?: boolean, note?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('MatchProfile', {
      uid: profile.uid,
      name: profile.name,
      photoURL: profile.photoURL,
      fromLikes: true,
      ...(alreadyLiked ? { alreadyLiked: true } : {}),
      // S67-complemento — só a aba "Quem curtiu você" chama goToProfile com
      // um 3º argumento; a aba "Suas curtidas" (useMyLikes, sem note) nunca
      // passa nada aqui, então o param simplesmente não existe pra ela.
      ...(note ? { note } : {}),
    });
  };

  const loading = tab === 'received' ? loadingReceived : loadingSent;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <View style={styles.header}>
        <Text style={styles.title}>Curtidas</Text>
      </View>

      <View style={styles.tabs}>
        <AnimatedPressable
          style={[styles.tabButton, tab === 'received' && styles.tabButtonActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabLabel, tab === 'received' && styles.tabLabelActive]}>
            Curtiram você{!loadingReceived ? ` (${likers.length})` : ''}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tabButton, tab === 'sent' && styles.tabButtonActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabLabel, tab === 'sent' && styles.tabLabelActive]}>
            Suas curtidas{!loadingSent ? ` (${myLikes.length})` : ''}
          </Text>
        </AnimatedPressable>
      </View>

      {loading ? (
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonPlaceholder
              key={i}
              width="48%"
              height={180}
              borderRadius={theme.borderRadius.lg}
            />
          ))}
        </View>
      ) : tab === 'received' ? (
        likers.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="Ninguém curtiu ainda"
            subtitle="Continue completando seu perfil para atrair mais pessoas!"
          />
        ) : (
          <>
            <View style={styles.launchBanner}>
              <Text style={styles.launchBannerText}>
                🎉 Período de lançamento: veja quem te curtiu de graça!
              </Text>
            </View>
            <FlatList
              data={likers}
              keyExtractor={(item) => item.profile.uid}
              numColumns={2}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <LikeCard
                  profile={item.profile}
                  isSuperLike={item.isSuperLike}
                  likedPhotoURL={item.likedPhotoURL}
                  note={item.note}
                  onPress={() => goToProfile(item.profile, undefined, item.note)}
                  onMenuPress={() => openMenu(item.profile)}
                />
              )}
            />
          </>
        )
      ) : myLikes.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Você ainda não curtiu ninguém"
          subtitle="Os perfis que você curtir aparecem aqui até virarem match"
        />
      ) : (
        <FlatList
          data={myLikes}
          keyExtractor={(item) => item.profile.uid}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <LikeCard
              profile={item.profile}
              isSuperLike={item.isSuperLike}
              onPress={() => goToProfile(item.profile, true)}
              onMenuPress={() => openMenu(item.profile)}
            />
          )}
        />
      )}

      {/* Menu do card (denunciar/bloquear) — mesmo padrão visual do options
          action sheet do ChatScreen. */}
      <Modal visible={!!menuTarget} transparent animationType="slide" onRequestClose={closeMenu}>
        <Pressable style={styles.sheetBackdrop} onPress={closeMenu}>
          <View style={styles.sheet}>
            <AnimatedPressable
              style={styles.sheetOption}
              onPress={() => {
                const target = menuTarget;
                closeMenu();
                if (target) setReportTarget(target);
              }}
            >
              <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Denunciar</Text>
            </AnimatedPressable>
            <View style={styles.sheetDivider} />
            <AnimatedPressable style={styles.sheetOption} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={22} color={theme.colors.nope} />
              <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>Bloquear</Text>
            </AnimatedPressable>
            <View style={styles.sheetGap} />
            <AnimatedPressable style={styles.sheetCancel} onPress={closeMenu}>
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Modal>

      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmit={handleReport}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.primary },

  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabLabelActive: {
    color: theme.colors.white,
  },

  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    gap: 12,
  },

  launchBanner: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  launchBannerText: {
    color: theme.colors.onSecondary,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },

  grid: { padding: theme.spacing.md, gap: 12 },
  likerCard: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
    position: 'relative',
  },
  likerCardSuperLike: {
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  likerPhoto: { width: '100%', aspectRatio: 0.8 },
  likerPhotoPlaceholder: {
    width: '100%',
    aspectRatio: 0.8,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likerInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 10,
  },
  likerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  likerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  likerName: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  menuBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  likedPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  likedPhotoThumb: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.sm,
  },
  likedPhotoLabel: {
    flexShrink: 1,
    color: theme.colors.white,
    fontSize: theme.fontSize.xs,
  },
  // S67 — bilhete da super curtida, estilo de citação (borda à esquerda +
  // itálico). Nunca amarelo (theme.colors.secondary) com texto branco —
  // regra do projeto (CLAUDE.md) — por isso o acento usa primaryLight.
  noteBox: {
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryLight,
  },
  noteText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
  },
  heartBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  superLikeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  sheetOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  sheetDivider: { height: 0.5, backgroundColor: theme.colors.border },
  sheetGap: { height: 8 },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  sheetCancelText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.nope },
});
