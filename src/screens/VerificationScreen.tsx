// src/screens/VerificationScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  getVerificationStatus,
  submitVerification,
  Verification,
} from '@/services/verificationService';

type VerificationScreenProps = NativeStackScreenProps<RootStackParamList, 'Verification'>;

export default function VerificationScreen({ navigation }: VerificationScreenProps) {
  const { user, refreshProfile } = useAuth();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const v = await getVerificationStatus(user.uid);
    setVerification(v);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTakeSelfie = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setSubmitting(true);
    try {
      await submitVerification(user.uid, result.assets[0].uri);
      await Promise.all([load(), refreshProfile()]);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a selfie. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Verificação de perfil</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <View style={styles.content}>
            {!verification || verification.status === 'rejected' ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={48} color={theme.colors.secondary} />
                </View>
                <Text style={styles.title}>
                  {verification?.status === 'rejected'
                    ? 'Sua última selfie não foi aprovada'
                    : 'Verifique seu perfil'}
                </Text>
                <Text style={styles.description}>
                  Tire uma selfie simples, sem gestos ou filtros, com boa iluminação e o rosto
                  visível. Nossa equipe compara com suas fotos de perfil e aprova manualmente —
                  isso costuma levar até 48h. A selfie nunca fica pública.
                </Text>
                <AnimatedPressable
                  style={styles.actionBtn}
                  onPress={handleTakeSelfie}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.onSecondary} />
                  ) : (
                    <Text style={styles.actionBtnText}>
                      {verification?.status === 'rejected' ? 'Reenviar selfie' : 'Tirar selfie'}
                    </Text>
                  )}
                </AnimatedPressable>
              </>
            ) : verification.status === 'pending' ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name="time-outline" size={48} color={theme.colors.secondary} />
                </View>
                <Text style={styles.title}>Em análise</Text>
                <Text style={styles.description}>
                  Recebemos sua selfie e nossa equipe vai revisar em breve. Você não precisa fazer
                  mais nada por enquanto.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.iconWrap}>
                  <VerifiedBadge size={48} />
                </View>
                <Text style={styles.title}>Perfil verificado!</Text>
                <Text style={styles.description}>
                  Seu selo de verificação já aparece no seu perfil e no card de Descobrir.
                </Text>
              </>
            )}
          </View>
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

  content: { flex: 1, alignItems: 'center', padding: theme.spacing.lg, paddingTop: theme.spacing.xl },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },

  actionBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    minWidth: 200,
  },
  actionBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onSecondary },
});
