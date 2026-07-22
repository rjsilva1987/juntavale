// src/screens/VerificationScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { CHAVEF_REGEX } from '@/constants/chaveF';
import { REJECTION_REASON_LABELS } from '@/constants/rejectionReasons';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getRegistrationPrivate, submitRegistrationPrivate } from '@/services/firestoreService';
import {
  getVerificationStatus,
  submitVerification,
  Verification,
} from '@/services/verificationService';

type VerificationScreenProps = NativeStackScreenProps<RootStackParamList, 'Verification'>;

export default function VerificationScreen({ navigation }: VerificationScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [verification, setVerification] = useState<Verification | null>(null);
  // null enquanto ainda não sabemos (mesma janela de `loading` abaixo) — true
  // pra contas antigas que já tinham ChaveF gravado no cadastro, false pra
  // quem nunca gravou (cadastro atual não pede mais ChaveF), caso em que o
  // campo abaixo aparece e passa a ser exigido aqui, na hora de verificar.
  const [registrationExists, setRegistrationExists] = useState<boolean | null>(null);
  const [chaveF, setChaveF] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [v, reg] = await Promise.all([
      getVerificationStatus(user.uid),
      getRegistrationPrivate(user.uid),
    ]);
    setVerification(v);
    setRegistrationExists(reg != null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Aprovação vem de profile.verified (realtime, via onSnapshot no useAuth)
  // em vez de verification.status — este último é buscado uma única vez em
  // load() e ficaria "Em análise" preso até reabrir a tela após o admin
  // aprovar.
  const isApproved = profile?.verified === true;
  const needsChaveF = registrationExists === false;

  const handleTakeSelfie = async () => {
    if (!user) return;
    if (needsChaveF && !CHAVEF_REGEX.test(chaveF)) {
      Alert.alert(
        'Chave F inválida',
        'A Chave F deve ter o formato F seguido de 7 dígitos (ex: F1234567).',
      );
      return;
    }
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
      // Grava o ChaveF ANTES da selfie: users/{uid}/private/registration é
      // create-only nas rules, então isso precisa acontecer só uma vez, e
      // antes é mais seguro que depois — se a selfie falhar, o usuário só
      // tenta reenviar (branch 'rejected'/sem pedido), sem precisar
      // redigitar o ChaveF, já que na próxima carga `registrationExists`
      // já estará true.
      if (needsChaveF) {
        await submitRegistrationPrivate(user.uid, chaveF);
      }
      await submitVerification(user.uid, result.assets[0].uri);
      await Promise.all([load(), refreshProfile()]);
    } catch (error) {
      // TEMPORÁRIO — DIAGNÓSTICO
      const err = error as { code?: string; message?: string };
      console.error(
        '[VerificationScreen] handleTakeSelfie falhou:',
        error,
        err?.code,
        err?.message,
      );
      Alert.alert('Erro', 'Não foi possível enviar a selfie. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.backBtn}>
            <AnimatedPressable onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
            </AnimatedPressable>
          </View>
          <Text style={styles.headerTitle}>Verificação de perfil</Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.content}>
              {isApproved ? (
                <>
                  <View style={styles.iconWrap}>
                    <VerifiedBadge size={48} />
                  </View>
                  <Text style={styles.title}>Perfil verificado!</Text>
                  <Text style={styles.description}>
                    Seu selo de verificação já aparece no seu perfil e no card de Descobrir.
                  </Text>
                </>
              ) : !verification || verification.status === 'rejected' ? (
                <>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={48}
                      color={theme.colors.secondary}
                    />
                  </View>
                  <Text style={styles.title}>
                    {verification?.status === 'rejected'
                      ? 'Sua última selfie não foi aprovada'
                      : 'Aqui, todo mundo é quem diz ser'}
                  </Text>
                  {/* S58 — motivo em destaque, tom acolhedor (fundo
                      secondaryLight, não error): rejeições de antes desta
                      sprint não têm rejectionReason gravado, então este
                      bloco some silenciosamente e sobra só o texto genérico
                      de sempre (verification.rejectionReason abaixo cobre
                      esse caso, já que undefined é falsy). */}
                  {verification?.status === 'rejected' && verification.rejectionReason && (
                    <View style={styles.reasonCard}>
                      <View style={styles.reasonHeader}>
                        <Ionicons
                          name="information-circle"
                          size={18}
                          color={theme.colors.secondaryDark}
                        />
                        <Text style={styles.reasonLabel}>Motivo</Text>
                      </View>
                      <Text style={styles.reasonText}>
                        {REJECTION_REASON_LABELS[verification.rejectionReason]}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.description}>
                    {verification?.status === 'rejected'
                      ? 'Tire uma selfie simples, sem gestos ou filtros, com boa iluminação e o rosto visível. Nossa equipe compara com suas fotos de perfil e aprova manualmente — isso costuma levar até 48h. A selfie nunca fica pública.'
                      : 'No JuntaVale, só perfis verificados podem conversar. Cada selfie é revisada individualmente pela nossa equipe — nada de robô aprovando fake. A sua verificação protege você e todo mundo que cruzar seu caminho.'}
                  </Text>
                  {needsChaveF && (
                    <View style={styles.chaveFWrap}>
                      <Text style={styles.chaveFLabel}>Chave F</Text>
                      <TextInput
                        style={styles.chaveFInput}
                        placeholder="F1234567"
                        placeholderTextColor={theme.colors.textLight}
                        value={chaveF}
                        onChangeText={(t) => setChaveF(t.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={8}
                        editable={!submitting}
                      />
                    </View>
                  )}
                  <Text style={styles.supportLine}>
                    Leva menos de um minuto. Seu selo ✓ aparece pra quem te vê.
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
              ) : (
                // Só sobra 'pending' aqui: 'rejected'/sem pedido já caiu no
                // branch acima, 'approved' já caiu em isApproved.
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
              )}
            </View>
          )}
        </KeyboardAvoidingView>
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

  content: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
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

  reasonCard: {
    width: '100%',
    backgroundColor: theme.colors.secondaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reasonLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.secondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 21,
  },

  supportLine: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },

  chaveFWrap: { width: '100%', maxWidth: 260, marginBottom: theme.spacing.lg },
  chaveFLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
  },
  chaveFInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    textAlign: 'center',
  },

  actionBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    minWidth: 200,
  },
  actionBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
});
