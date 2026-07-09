// src/screens/MatchProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { MatchModal } from '@/components/MatchModal';
import { PhotoCarousel, type PhotoCarouselHandle } from '@/components/PhotoCarousel';
import { ReportModal } from '@/components/ReportModal';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import { getUserProfile, recordSwipe, UserProfile } from '@/services/firestoreService';

type MatchProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'MatchProfile'>;

export default function MatchProfileScreen({ route, navigation }: MatchProfileScreenProps) {
  const { uid, matchId, name, photoURL } = route.params;
  const isPreview = !matchId;
  const { user, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [matchVisible, setMatchVisible] = useState(false);
  const [photoAreaWidth, setPhotoAreaWidth] = useState(0);
  const carouselRef = useRef<PhotoCarouselHandle>(null);

  // Sem Pan concorrendo aqui (diferente do card da Descobrir) — o tap só
  // precisa ceder pro drag manual do próprio pager quando passa do
  // threshold, o que já é o comportamento padrão de Gesture.Tap.
  const handlePhotoTap = (x: number) => {
    if (photoAreaWidth === 0) return;
    if (x < photoAreaWidth / 2) {
      carouselRef.current?.goToPrevious();
    } else {
      carouselRef.current?.goToNext();
    }
  };
  const photoTapGesture = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(handlePhotoTap)(e.x);
    });

  useEffect(() => {
    getUserProfile(uid).then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, [uid]);

  const handleBlock = () => {
    if (!user) return;
    Alert.alert(
      'Bloquear usuário?',
      isPreview
        ? `Você deixará de ver ${name}. Essa ação pode ser desfeita depois em "Usuários bloqueados".`
        : `Você deixará de ver ${name} e o match será desfeito. Essa ação pode ser desfeita depois em "Usuários bloqueados".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            await blockUser(user.uid, uid);
            if (isPreview) {
              navigation.goBack();
            } else {
              navigation.navigate('Main', { screen: 'Conversas' });
            }
          },
        },
      ],
    );
  };

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user) return;
    await reportUser(user.uid, uid, reason, details);
    setReportVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  const handleSwipeAction = async (direction: 'like' | 'nope') => {
    if (!user || actionPending) return;
    setActionPending(true);
    try {
      const isMatch = await recordSwipe(user.uid, uid, direction);
      if (isMatch) {
        setMatchVisible(true);
      } else {
        navigation.goBack();
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar sua ação. Tente novamente.');
    } finally {
      setActionPending(false);
    }
  };

  const handleSendMessage = () => {
    if (!user) return;
    const chatMatchId = [user.uid, uid].sort().join('_');
    setMatchVisible(false);
    // replace (não navigate) pra não deixar este preview órfão embaixo do Chat
    // na pilha — voltar do Chat deve cair direto na Descobrir, não num perfil
    // já "usado" com o botão de curtir ainda ativo.
    navigation.replace('Chat', {
      matchId: chatMatchId,
      otherUid: uid,
      otherName: profile?.name ?? name,
      otherPhoto: profile?.photoURL ?? photoURL,
    });
  };

  const handleContinueAfterMatch = () => {
    setMatchVisible(false);
    navigation.goBack();
  };

  const photos = profile?.photos?.length ? profile.photos : photoURL ? [photoURL] : [];

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.canGoBack() && navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <GestureDetector gesture={photoTapGesture}>
              <View
                style={styles.photosCard}
                onLayout={(e) => setPhotoAreaWidth(e.nativeEvent.layout.width)}
              >
                <PhotoCarousel ref={carouselRef} photos={photos} style={styles.photosCarousel} />
              </View>
            </GestureDetector>

            <View style={styles.infoCard}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>
                  {profile?.name ?? name}
                  {profile?.age ? `, ${profile.age}` : ''}
                </Text>
                {profile?.verified && <VerifiedBadge size={18} />}
              </View>

              {!!profile?.bio && (
                <>
                  <Text style={styles.sectionTitle}>Sobre</Text>
                  <Text style={styles.bio}>{profile.bio}</Text>
                </>
              )}

              {(profile?.interests?.length ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Interesses</Text>
                  <View style={styles.tags}>
                    {profile?.interests?.map((item) => (
                      <View key={item} style={styles.tag}>
                        <Text style={styles.tagText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>

            {isPreview && (
              <View style={styles.swipeActions}>
                <AnimatedPressable
                  style={[styles.swipeBtn, styles.nopeBtn]}
                  onPress={() => handleSwipeAction('nope')}
                  disabled={actionPending}
                >
                  <Ionicons name="close" size={28} color={theme.colors.nope} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.swipeBtn, styles.likeBtn]}
                  onPress={() => handleSwipeAction('like')}
                  disabled={actionPending}
                >
                  <Ionicons name="heart" size={28} color={theme.colors.like} />
                </AnimatedPressable>
              </View>
            )}

            <AnimatedPressable style={styles.reportBtn} onPress={() => setReportVisible(true)}>
              <Ionicons name="flag-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.reportBtnText}>Denunciar</Text>
            </AnimatedPressable>

            <AnimatedPressable style={styles.blockBtn} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={20} color={theme.colors.error} />
              <Text style={styles.blockBtnText}>Bloquear</Text>
            </AnimatedPressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReport}
      />

      <MatchModal
        visible={matchVisible}
        currentUserPhoto={myProfile?.photoURL}
        matchedUserPhoto={profile?.photoURL ?? photoURL}
        matchedUserName={profile?.name ?? name}
        onSendMessage={handleSendMessage}
        onContinue={handleContinueAfterMatch}
      />
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { paddingBottom: 40 },

  photosCard: {
    height: 340,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  photosCarousel: { flex: 1 },

  infoCard: {
    backgroundColor: theme.colors.white,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bio: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagText: { fontSize: theme.fontSize.sm, color: theme.colors.white, fontWeight: '600' },

  swipeActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: theme.spacing.lg,
  },
  swipeBtn: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  nopeBtn: { borderColor: theme.colors.nope },
  likeBtn: { borderColor: theme.colors.like },

  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
  },
  reportBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },

  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: theme.spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.full,
  },
  blockBtnText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '700' },
});
