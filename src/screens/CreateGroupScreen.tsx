// src/screens/CreateGroupScreen.tsx
//
// S124-A — formulário de criação de grupo: nome (obrigatório, <=120),
// descrição (opcional, <=2000), seletor de prazo de encerramento (data no
// futuro, teto de +30 dias). Mesmo molde de formulário de SupportScreen.tsx
// (chips + TextInput + botão de enviar).
//
// Seletor de prazo: sem lib de date-picker no projeto (nenhuma tela usa
// @react-native-community/datetimepicker hoje) — resolvido com chips de
// presets (1/3/7/15/30 dias), igual ao padrão de categoryChip do
// SupportScreen. Escolha de UI, não de produto: o teto de 30 dias e "quem
// cria escolhe o prazo" já vêm fechados da spec.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  createGroup,
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_DURATION_DAYS,
  MAX_GROUP_NAME_LENGTH,
} from '@/services/groupService';
import { countCodePoints } from '@/utils/text';

type CreateGroupScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

// Presets de prazo, em dias — teto MAX_GROUP_DURATION_DAYS (30) sempre
// presente como última opção.
const DURATION_PRESETS_DAYS = [1, 3, 7, 15, MAX_GROUP_DURATION_DAYS];

export default function CreateGroupScreen({ navigation }: CreateGroupScreenProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const canSubmit =
    countCodePoints(trimmedName) > 0 &&
    countCodePoints(trimmedName) <= MAX_GROUP_NAME_LENGTH &&
    countCodePoints(description.trim()) <= MAX_GROUP_DESCRIPTION_LENGTH &&
    durationDays != null &&
    !submitting;

  const handleSubmit = async () => {
    if (!user || !canSubmit || durationDays == null) return;
    setSubmitting(true);
    try {
      const expiresAt = dayjs().add(durationDays, 'day').toDate();
      const groupId = await createGroup(user.uid, trimmedName, description, expiresAt);
      navigation.replace('GroupDetail', { groupId });
    } catch (err) {
      console.error('[CreateGroupScreen] falha ao criar grupo:', err);
      Alert.alert('Erro', 'Não foi possível criar o grupo. Tente novamente.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tentar de novo', onPress: handleSubmit },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Criar grupo</Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Nome do grupo</Text>
            <TextInput
              style={styles.inputSingle}
              placeholder="Ex.: Corrida de sexta"
              placeholderTextColor={theme.colors.textLight}
              value={name}
              onChangeText={setName}
              maxLength={MAX_GROUP_NAME_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {countCodePoints(name)}/{MAX_GROUP_NAME_LENGTH}
            </Text>

            <Text style={styles.label}>Descrição (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Do que se trata esse grupo?"
              placeholderTextColor={theme.colors.textLight}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {countCodePoints(description)}/{MAX_GROUP_DESCRIPTION_LENGTH}
            </Text>

            <Text style={styles.label}>Prazo de encerramento</Text>
            <Text style={styles.hint}>
              O grupo some automaticamente nessa data. Teto de {MAX_GROUP_DURATION_DAYS} dias.
            </Text>
            <View style={styles.durationRow}>
              {DURATION_PRESETS_DAYS.map((days) => {
                const active = durationDays === days;
                return (
                  <AnimatedPressable
                    key={days}
                    style={[styles.durationChip, active && styles.durationChipActive]}
                    onPress={() => setDurationDays(days)}
                    disabled={submitting}
                  >
                    <Text
                      style={[styles.durationChipText, active && styles.durationChipTextActive]}
                    >
                      {days} {days === 1 ? 'dia' : 'dias'}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <AnimatedPressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Criar grupo</Text>
              )}
            </AnimatedPressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { padding: theme.spacing.md },

  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  hint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },

  inputSingle: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },

  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.lg },
  durationChip: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  durationChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  durationChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  durationChipTextActive: { color: theme.colors.white },

  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 15,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
});
