// src/screens/RegisterScreen.tsx
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
import { UfPicker } from '@/components/UfPicker';
import { getAuthErrorMessage } from '@/constants/authErrors';
import { LookingFor, LOOKING_FOR_OPTIONS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { UF } from '@/constants/ufs';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';

const INTERESTS = [
  'Investimentos',
  'Poupança',
  'Viagens',
  'Gastronomia',
  'Esportes',
  'Tecnologia',
  'Arte',
  'Música',
  'Cinema',
  'Leitura',
  'Pets',
  'Fitness',
];

type RegisterScreenProps = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [uf, setUf] = useState<UF | undefined>(undefined);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<LookingFor | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (item: string) => {
    setSelectedInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (!lookingFor) {
      Alert.alert('Busca obrigatória', 'Selecione o que você está buscando no app.');
      return;
    }
    if (!uf) {
      Alert.alert('Estado obrigatório', 'Selecione o estado onde você mora.');
      return;
    }
    const ageNum = Number(age);
    if (!age.trim() || !Number.isFinite(ageNum) || ageNum < 18 || ageNum > 100) {
      Alert.alert('Idade inválida', 'Informe uma idade entre 18 e 100 anos.');
      return;
    }
    setLoading(true);
    try {
      await register(
        email.trim(),
        password,
        name.trim(),
        ageNum,
        bio.trim(),
        selectedInterests,
        lookingFor,
        uf,
      );
    } catch (e) {
      // S62 — mensagem em português via catálogo (nunca e.message cru).
      // Contexto 'register': aqui pode ser específico (ex.: e-mail já em
      // uso), diferente do login — ver authErrors.ts.
      Alert.alert('Não foi possível criar a conta', getAuthErrorMessage(e, 'register'));
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
          {/* Top bar */}
          <View style={styles.topBar}>
            {step > 1 && (
              <AnimatedPressable onPress={() => setStep(step - 1)}>
                <Text style={styles.back}>← Voltar</Text>
              </AnimatedPressable>
            )}
            <View style={styles.steps}>
              {[1, 2, 3].map((s) => (
                <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
              ))}
            </View>
          </View>

          {/* Step 1 — Dados básicos */}
          {step === 1 && (
            <View style={styles.card}>
              <Text style={styles.title}>Criar conta</Text>
              <Text style={styles.subtitle}>Vamos começar com seus dados</Text>

              <Text style={styles.label}>Nome completo</Text>
              <TextInput
                style={styles.input}
                placeholder="João Silva"
                placeholderTextColor={theme.colors.textLight}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={styles.input}
                placeholder="joao@email.com"
                placeholderTextColor={theme.colors.textLight}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.label}>Senha</Text>
              <TextInput
                style={styles.input}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={theme.colors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <AnimatedPressable
                style={styles.btnPrimary}
                onPress={() => {
                  if (!name || !email || !password)
                    return Alert.alert('Atenção', 'Preencha todos os campos.');
                  if (password.length < 6)
                    return Alert.alert('Atenção', 'Senha deve ter ao menos 6 caracteres.');
                  setStep(2);
                }}
              >
                <Text style={styles.btnPrimaryText}>Continuar</Text>
              </AnimatedPressable>

              <AnimatedPressable onPress={() => navigation.canGoBack() && navigation.goBack()}>
                <Text style={styles.linkText}>Já tenho conta</Text>
              </AnimatedPressable>
            </View>
          )}

          {/* Step 2 — Perfil */}
          {step === 2 && (
            <View style={styles.card}>
              <Text style={styles.title}>Seu perfil</Text>
              <Text style={styles.subtitle}>Conte um pouco sobre você</Text>

              <Text style={styles.label}>Idade</Text>
              <TextInput
                style={styles.input}
                placeholder="25"
                placeholderTextColor={theme.colors.textLight}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                maxLength={2}
              />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                placeholder="Fale algo sobre você…"
                placeholderTextColor={theme.colors.textLight}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={160}
              />
              <Text style={styles.charCount}>{bio.length}/160</Text>

              <Text style={styles.label}>Estado onde você mora</Text>
              <UfPicker value={uf ?? null} onChange={(item) => setUf(item as UF)} />

              <AnimatedPressable
                style={[styles.btnPrimary, !uf && { opacity: 0.7 }]}
                disabled={!uf}
                onPress={() => {
                  const ageNum = Number(age);
                  if (!age.trim() || !Number.isFinite(ageNum) || ageNum < 18 || ageNum > 100) {
                    return Alert.alert('Idade inválida', 'Informe uma idade entre 18 e 100 anos.');
                  }
                  setStep(3);
                }}
              >
                <Text style={styles.btnPrimaryText}>Continuar</Text>
              </AnimatedPressable>
            </View>
          )}

          {/* Step 3 — Busca + Interesses */}
          {step === 3 && (
            <View style={styles.card}>
              <Text style={styles.title}>O que você busca?</Text>
              <Text style={styles.subtitle}>Obrigatório — escolha uma opção</Text>

              <View style={styles.lookingForGrid}>
                {LOOKING_FOR_OPTIONS.map((option) => {
                  const active = lookingFor === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.lookingForOption, active && styles.lookingForOptionActive]}
                      onPress={() => setLookingFor(option.value)}
                    >
                      <Text style={[styles.lookingForText, active && styles.lookingForTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <Text style={[styles.title, { marginTop: theme.spacing.lg }]}>Seus interesses</Text>
              <Text style={styles.subtitle}>Escolha até 5 que te representam</Text>

              <View style={styles.tags}>
                {INTERESTS.map((item) => {
                  const active = selectedInterests.includes(item);
                  return (
                    <AnimatedPressable
                      key={item}
                      style={[styles.tag, active && styles.tagActive]}
                      onPress={() => {
                        if (!active && selectedInterests.length >= 5) return;
                        toggleInterest(item);
                      }}
                    >
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>{item}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <AnimatedPressable
                style={[styles.btnPrimary, (loading || !lookingFor) && { opacity: 0.7 }]}
                onPress={handleRegister}
                disabled={loading || !lookingFor}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onSecondary} />
                ) : (
                  <Text style={styles.btnPrimaryText}>Criar conta 🎉</Text>
                )}
              </AnimatedPressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  scroll: { flexGrow: 1, padding: theme.spacing.lg, paddingTop: theme.spacing.xl },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  back: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  steps: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  stepDotActive: { backgroundColor: theme.colors.secondary, width: 20 },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
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
  charCount: {
    textAlign: 'right',
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: 4,
  },

  btnPrimary: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    padding: 15,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
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

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tagText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  tagTextActive: { color: theme.colors.white, fontWeight: '600' },

  lookingForGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  lookingForOption: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  lookingForOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  lookingForText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  lookingForTextActive: { color: theme.colors.onPrimary },
});
