// src/screens/LoginScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { getAuthErrorMessage } from '@/constants/authErrors';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      // S62 — mensagem em português via catálogo (nunca e.message cru).
      // Contexto 'login': erro de credencial vira mensagem genérica de
      // propósito (proteção contra enumeração de e-mail) — ver authErrors.ts.
      Alert.alert('Não foi possível entrar', getAuthErrorMessage(e, 'login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <Ionicons name="flame" size={34} color={theme.colors.secondary} />
              <Text style={styles.appName}>JuntaVale</Text>
            </View>
            <Text style={styles.tagline}>Conecte-se com quem tem a ver com você</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              placeholder="seu@email.com"
              placeholderTextColor={theme.colors.textLight}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <AnimatedPressable style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={theme.colors.onSecondary} />
              ) : (
                <Text style={styles.btnPrimaryText}>Entrar</Text>
              )}
            </AnimatedPressable>

            <AnimatedPressable onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkText}>
                Ainda não tem conta? <Text style={styles.linkBold}>Cadastre-se</Text>
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.lg },

  header: { alignItems: 'center', marginBottom: theme.spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appName: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    ...theme.shadows.medium,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },

  btnPrimary: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    padding: 15,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    ...theme.shadows.light,
  },
  btnPrimaryText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },

  linkText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.md,
  },
  linkBold: { color: theme.colors.primary, fontWeight: '700' },
});
