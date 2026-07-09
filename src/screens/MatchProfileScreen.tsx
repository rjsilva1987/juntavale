// src/screens/MatchProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ReportModal } from '@/components/ReportModal';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

type MatchProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'MatchProfile'>;

export default function MatchProfileScreen({ route, navigation }: MatchProfileScreenProps) {
  const { uid, name, photoURL } = route.params;
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);

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
      `Você deixará de ver ${name} e o match será desfeito. Essa ação pode ser desfeita depois em "Usuários bloqueados".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            await blockUser(user.uid, uid);
            navigation.navigate('Main', { screen: 'Conversas' });
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
            <View style={styles.photosCard}>
              <PhotoCarousel photos={photos} style={styles.photosCarousel} />
            </View>

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
