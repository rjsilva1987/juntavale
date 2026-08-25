// src/screens/RegisterScreen.tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
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
import { Vale, VALE_OPTIONS } from '@/constants/vale';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { Gender } from '@/services/firestoreService';
import { BirthParseReason, parseBirthInput } from '@/utils/birthDate';
import { pickFromCamera, pickFromGallery } from '@/utils/pickPhoto';
import { countCodePoints } from '@/utils/text';

// S77 — alinhado com MAX_BIO_LENGTH do ProfileScreen (mesma edição de bio,
// mesmo teto dos dois lados — bug separado achado na recon, o cadastro
// tinha 160 e a edição de perfil não tinha nenhum).
const MAX_BIO_LENGTH = 500;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Masculino', value: 'masculino' },
  { label: 'Feminino', value: 'feminino' },
  { label: 'Outro', value: 'outro' },
];

// Máscara incremental DD/MM/AAAA: mantém só dígitos e reconstrói as barras a
// partir da posição, então funciona tanto digitando pra frente quanto
// apagando (backspace) sem deixar barra solta. Sem regex de propósito — a
// tela não faz nenhuma checagem sobre a data em si, só formata o texto (a
// decisão de validade é toda de parseBirthInput, em birthDate.ts).
function formatBirthDateInput(text: string): string {
  let digits = '';
  for (const char of text) {
    if (char >= '0' && char <= '9') digits += char;
    if (digits.length === 8) break;
  }
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('/');
}

// Mapa único reason -> mensagem, usado nos dois pontos onde a data é
// validada (botão Continuar do Step 2 e handleRegister) — nenhum dos dois
// reimplementa a checagem, só traduzem o `reason` que parseBirthInput já deu.
const BIRTH_ERROR_MESSAGES: Record<BirthParseReason, string> = {
  incomplete: 'Data incompleta. Use o formato DD/MM/AAAA.',
  invalid: 'Data inválida. Confira o dia e o mês.',
  underage: 'É preciso ter pelo menos 18 anos.',
  overage: 'Confira o ano de nascimento.',
};

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
  // S135 — "como quer ser chamado", nome público exibido no app inteiro.
  // Separado do "Nome completo" (`name` acima, que vira privado — só o
  // dono e o time de verificação enxergam).
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDateText, setBirthDateText] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [uf, setUf] = useState<UF | undefined>(undefined);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<LookingFor | undefined>(undefined);
  const [vale, setVale] = useState<Vale | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (item: string) => {
    setSelectedInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  };

  const handlePickSelfie = async () => {
    const pick = await pickFromCamera();
    if (pick.uri) setPhotoUri(pick.uri);
  };

  const handlePickGallery = async () => {
    const pick = await pickFromGallery();
    if (pick.uri) setPhotoUri(pick.uri);
  };

  const handleRegister = async () => {
    if (!name || !nickname || !email || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (!lookingFor) {
      Alert.alert('Busca obrigatória', 'Selecione o que você está buscando no app.');
      return;
    }
    if (!vale) {
      Alert.alert('Vale obrigatório', 'Selecione qual é o seu vale.');
      return;
    }
    if (!uf) {
      Alert.alert('Estado obrigatório', 'Selecione o estado onde você mora.');
      return;
    }
    if (!gender) {
      Alert.alert('Gênero obrigatório', 'Selecione seu gênero.');
      return;
    }
    if (!photoUri) {
      Alert.alert('Foto obrigatória', 'Adicione uma foto pra continuar.');
      return;
    }
    const birthResult = parseBirthInput(birthDateText);
    if (birthResult.ok === false) {
      Alert.alert('Data de nascimento', BIRTH_ERROR_MESSAGES[birthResult.reason]);
      return;
    }
    setLoading(true);
    try {
      await register(
        email.trim(),
        password,
        name.trim(),
        nickname.trim(),
        birthResult.date,
        bio.trim(),
        selectedInterests,
        lookingFor,
        uf,
        vale,
        gender,
        photoUri,
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              {[1, 2, 3, 4].map((s) => (
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

              <Text style={styles.label}>Como quer ser chamado</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Rapha"
                placeholderTextColor={theme.colors.textLight}
                value={nickname}
                onChangeText={setNickname}
              />

              {/* S138 — nome completo e apelido ficam imutáveis assim que
                  definidos aqui no cadastro; a única forma de corrigir depois
                  é abrindo um chamado no suporte. */}
              <Text style={styles.immutableHint}>
                Depois de criada a conta, nome completo e apelido só podem ser corrigidos através do
                suporte.
              </Text>

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

              <Text style={styles.label}>Confirmar senha</Text>
              <TextInput
                style={styles.input}
                placeholder="Digite a senha novamente"
                placeholderTextColor={theme.colors.textLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <AnimatedPressable
                style={styles.btnPrimary}
                onPress={() => {
                  if (!name || !nickname || !email || !password || !confirmPassword)
                    return Alert.alert('Atenção', 'Preencha todos os campos.');
                  if (password.length < 6)
                    return Alert.alert('Atenção', 'Senha deve ter ao menos 6 caracteres.');
                  if (password !== confirmPassword)
                    return Alert.alert(
                      'Atenção',
                      'As senhas não são iguais. Confira e tente de novo.',
                    );
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

              <Text style={styles.label}>Data de nascimento</Text>
              <TextInput
                style={styles.input}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={theme.colors.textLight}
                value={birthDateText}
                onChangeText={(text) => setBirthDateText(formatBirthDateInput(text))}
                keyboardType="number-pad"
                maxLength={10}
              />

              <Text style={styles.label}>Gênero</Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((option) => {
                  const active = gender === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.genderOption, active && styles.genderOptionActive]}
                      onPress={() => setGender(option.value)}
                    >
                      <Text style={[styles.genderText, active && styles.genderTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                placeholder="Fale algo sobre você…"
                placeholderTextColor={theme.colors.textLight}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={MAX_BIO_LENGTH}
              />
              <Text style={styles.charCount}>
                {countCodePoints(bio)}/{MAX_BIO_LENGTH}
              </Text>

              <Text style={styles.label}>Estado onde você mora</Text>
              <UfPicker value={uf ?? null} onChange={(item) => setUf(item as UF)} />

              <AnimatedPressable
                style={[styles.btnPrimary, !(uf && gender) && { opacity: 0.7 }]}
                disabled={!uf || !gender}
                onPress={() => {
                  const birthResult = parseBirthInput(birthDateText);
                  if (birthResult.ok === false) {
                    return Alert.alert(
                      'Data de nascimento',
                      BIRTH_ERROR_MESSAGES[birthResult.reason],
                    );
                  }
                  if (!gender) {
                    return Alert.alert('Gênero obrigatório', 'Selecione seu gênero.');
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

              {/* S83-A — mesmo componente visual do "O que você busca?"
                  acima: reusa lookingForGrid/lookingForOption/lookingForText
                  (grade curta de opções fixas), sem duplicar estilo — Vale
                  tem o mesmo formato de escolha que lookingFor, diferente de
                  UF (27 opções, precisa de busca, por isso UfPicker). */}
              <Text style={[styles.title, { marginTop: theme.spacing.lg }]}>Qual seu vale?</Text>
              <Text style={styles.subtitle}>Obrigatório — escolha uma opção</Text>

              <View style={styles.lookingForGrid}>
                {VALE_OPTIONS.map((option) => {
                  const active = vale === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.lookingForOption, active && styles.lookingForOptionActive]}
                      onPress={() => setVale(option.value)}
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
                style={[styles.btnPrimary, !(lookingFor && vale) && { opacity: 0.7 }]}
                disabled={!lookingFor || !vale}
                onPress={() => setStep(4)}
              >
                <Text style={styles.btnPrimaryText}>Continuar</Text>
              </AnimatedPressable>
            </View>
          )}

          {/* Step 4 — Foto de perfil */}
          {step === 4 && (
            <View style={styles.card}>
              <Text style={styles.title}>Sua foto</Text>
              <Text style={styles.subtitle}>Obrigatória — pelo menos 1 foto pra continuar</Text>

              {photoUri ? (
                <View style={styles.photoPreviewWrap}>
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoPreview}
                    contentFit="cover"
                  />
                  <AnimatedPressable onPress={() => setPhotoUri(null)}>
                    <Text style={styles.linkText}>Trocar foto</Text>
                  </AnimatedPressable>
                </View>
              ) : (
                <View style={styles.photoButtonsRow}>
                  <AnimatedPressable style={styles.photoOptionBtn} onPress={handlePickSelfie}>
                    <Text style={styles.photoOptionText}>Tirar selfie</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.photoOptionBtn} onPress={handlePickGallery}>
                    <Text style={styles.photoOptionText}>Escolher da galeria</Text>
                  </AnimatedPressable>
                </View>
              )}

              <AnimatedPressable
                style={[styles.btnPrimary, (loading || !photoUri) && { opacity: 0.7 }]}
                onPress={handleRegister}
                disabled={loading || !photoUri}
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
  container: { flex: 1, backgroundColor: theme.colors.background },
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
  // S138 — aviso de imutabilidade pós-cadastro (nome completo/apelido).
  immutableHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.sm,
  },

  genderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 8,
  },
  genderOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  genderText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  genderTextActive: { color: theme.colors.onPrimary },

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

  photoPreviewWrap: { alignItems: 'center', marginTop: theme.spacing.md, gap: theme.spacing.sm },
  photoPreview: { width: 160, height: 160, borderRadius: 80, backgroundColor: theme.colors.border },
  photoButtonsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  photoOptionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  photoOptionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
});
