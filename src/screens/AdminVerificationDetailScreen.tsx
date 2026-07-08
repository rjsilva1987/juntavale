// src/screens/AdminVerificationDetailScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  getVerificationStatus,
  reviewVerification,
  Verification,
} from '@/services/verificationService';

type AdminVerificationDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AdminVerificationDetail'
>;

export default function AdminVerificationDetailScreen({
  route,
  navigation,
}: AdminVerificationDetailScreenProps) {
  const { uid } = route.params;
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    Promise.all([getUserProfile(uid), getVerificationStatus(uid)]).then(([p, v]) => {
      setProfile(p);
      setVerification(v);
      setLoading(false);
    });
  }, [uid]);

  const handleDecide = (status: 'approved' | 'rejected') => {
    if (!user) return;
    Alert.alert(
      status === 'approved' ? 'Aprovar verificação?' : 'Rejeitar verificação?',
      status === 'approved'
        ? `${profile?.name ?? 'Este usuário'} vai receber o selo de verificado.`
        : `${profile?.name ?? 'Este usuário'} vai poder reenviar uma nova selfie.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: status === 'approved' ? 'Aprovar' : 'Rejeitar',
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            setDeciding(true);
            try {
              await reviewVerification(uid, status, user.uid);
              navigation.goBack();
            } catch {
              Alert.alert('Erro', 'Não foi possível registrar a decisão.');
            } finally {
              setDeciding(false);
            }
          },
        },
      ],
    );
  };

  const photos = profile?.photos?.length
    ? profile.photos
    : profile?.photoURL
      ? [profile.photoURL]
      : [];

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Revisar verificação</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Selfie enviada</Text>
            {verification?.selfieUrl ? (
              <Image
                source={{ uri: verification.selfieUrl }}
                style={styles.selfie}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                transition={200}
              />
            ) : (
              <View style={[styles.selfie, styles.selfiePlaceholder]}>
                <Text style={{ fontSize: 40 }}>😊</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Fotos do perfil</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {photos.length === 0 ? (
                <Text style={styles.emptyPhotos}>Sem fotos de perfil.</Text>
              ) : (
                photos.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={styles.photoThumb}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    transition={200}
                  />
                ))
              )}
            </ScrollView>

            <View style={styles.infoCard}>
              <Text style={styles.name}>
                {profile?.name ?? 'Usuário'}
                {profile?.age ? `, ${profile.age}` : ''}
              </Text>
              {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            </View>

            <View style={styles.actionsRow}>
              <AnimatedPressable
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleDecide('rejected')}
                disabled={deciding}
              >
                <Ionicons name="close" size={20} color={theme.colors.error} />
                <Text style={styles.rejectBtnText}>Rejeitar</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleDecide('approved')}
                disabled={deciding}
              >
                {deciding ? (
                  <ActivityIndicator color={theme.colors.onSecondary} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={theme.colors.onSecondary} />
                    <Text style={styles.approveBtnText}>Aprovar</Text>
                  </>
                )}
              </AnimatedPressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
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

  content: { padding: theme.spacing.md, paddingBottom: 40 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  selfie: {
    width: '100%',
    height: 320,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.medium,
  },
  selfiePlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoRow: { flexDirection: 'row' },
  photoThumb: {
    width: 120,
    height: 160,
    borderRadius: theme.borderRadius.md,
    marginRight: 10,
  },
  emptyPhotos: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },

  infoCard: {
    backgroundColor: theme.colors.white,
    marginTop: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  name: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  bio: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22, marginTop: 8 },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.full,
  },
  rejectBtn: { borderWidth: 1.5, borderColor: theme.colors.error },
  rejectBtnText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '700' },
  approveBtn: { backgroundColor: theme.colors.secondary },
  approveBtnText: {
    color: theme.colors.onSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
});
