// src/components/PollEditModal.tsx
//
// S126 — Enquete no perfil: modal de edição do dono (criar ou editar a
// pergunta + opções). Mesmo chrome/botões/paleta de SuperLikeNoteModal.tsx
// (primary/onPrimary, nunca secondary amarelo + texto branco). Draft local,
// ressincronizado toda vez que o modal abre (mesmo padrão de
// AboutVisibilityModal) — fechar pelo backdrop/botão de fechar nunca chama
// onSave, o draft morre com o modal. Quem faz o updateUserProfile/
// refreshProfile é o chamador (ProfileScreen) — este componente só valida e
// entrega (question, options) prontos.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
} from '@/constants/poll';
import { theme } from '@/constants/theme';
import { countCodePoints } from '@/utils/text';

interface PollEditModalProps {
  visible: boolean;
  initialQuestion?: string;
  initialOptions?: string[];
  onSave: (question: string, options: string[]) => void;
  // Só aparece se já existe enquete salva (mesmo padrão do botão "Remover"
  // do modal de prompt, ProfileScreen.tsx) — ausente = criando do zero.
  onRemove?: () => void;
  onClose: () => void;
  saving: boolean;
}

const emptyOptions = (): string[] => Array.from({ length: MIN_POLL_OPTIONS }, () => '');

export function PollEditModal({
  visible,
  initialQuestion,
  initialOptions,
  onSave,
  onRemove,
  onClose,
  saving,
}: PollEditModalProps) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [options, setOptions] = useState<string[]>(initialOptions ?? emptyOptions());

  // Ressincroniza o draft toda vez que o modal abre — evita vazar edição
  // cancelada de uma abertura anterior pra próxima.
  useEffect(() => {
    if (visible) {
      setQuestion(initialQuestion ?? '');
      setOptions(initialOptions && initialOptions.length > 0 ? initialOptions : emptyOptions());
    }
  }, [visible, initialQuestion, initialOptions]);

  const handleChangeOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  };

  const handleAddOption = () => {
    if (options.length >= MAX_POLL_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= MIN_POLL_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const trimmedQuestion = question.trim();
  const trimmedOptions = options.map((opt) => opt.trim());
  const isQuestionValid =
    countCodePoints(trimmedQuestion) > 0 &&
    countCodePoints(trimmedQuestion) <= MAX_POLL_QUESTION_LENGTH;
  const areOptionsValid =
    options.length >= MIN_POLL_OPTIONS &&
    options.length <= MAX_POLL_OPTIONS &&
    trimmedOptions.every(
      (opt) => countCodePoints(opt) > 0 && countCodePoints(opt) <= MAX_POLL_OPTION_LENGTH,
    );
  const canSave = isQuestionValid && areOptionsValid;

  const handleSave = () => {
    if (!canSave) return;
    onSave(trimmedQuestion, trimmedOptions);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <AnimatedPressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={8}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </AnimatedPressable>

              <Text style={styles.title}>Enquete</Text>
              <Text style={styles.subtitle}>
                Uma pergunta e de {MIN_POLL_OPTIONS} a {MAX_POLL_OPTIONS} opções — quem visitar seu
                perfil no Descobrir pode responder direto por lá.
              </Text>

              <TextInput
                style={styles.questionInput}
                placeholder="Ex: Praia ou serra?"
                placeholderTextColor={theme.colors.textLight}
                value={question}
                onChangeText={setQuestion}
                multiline
                maxLength={MAX_POLL_QUESTION_LENGTH}
              />
              <Text
                style={[styles.counter, countCodePoints(question) === 0 && styles.counterMuted]}
              >
                {countCodePoints(question)}/{MAX_POLL_QUESTION_LENGTH}
              </Text>

              {options.map((option, index) => (
                <View key={index} style={styles.optionRow}>
                  <TextInput
                    style={styles.optionInput}
                    placeholder={`Opção ${index + 1}`}
                    placeholderTextColor={theme.colors.textLight}
                    value={option}
                    onChangeText={(value) => handleChangeOption(index, value)}
                    maxLength={MAX_POLL_OPTION_LENGTH}
                  />
                  <AnimatedPressable
                    style={[
                      styles.removeOptionBtn,
                      options.length <= MIN_POLL_OPTIONS && styles.removeOptionBtnDisabled,
                    ]}
                    onPress={() => handleRemoveOption(index)}
                    disabled={options.length <= MIN_POLL_OPTIONS}
                    hitSlop={8}
                    accessibilityLabel="Remover opção"
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={22}
                      color={
                        options.length <= MIN_POLL_OPTIONS
                          ? theme.colors.textLight
                          : theme.colors.textSecondary
                      }
                    />
                  </AnimatedPressable>
                </View>
              ))}

              <AnimatedPressable
                style={[
                  styles.addOptionBtn,
                  options.length >= MAX_POLL_OPTIONS && styles.addOptionBtnDisabled,
                ]}
                onPress={handleAddOption}
                disabled={options.length >= MAX_POLL_OPTIONS}
              >
                <Ionicons name="add" size={18} color={theme.colors.primary} />
                <Text style={styles.addOptionText}>Adicionar opção</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar</Text>
                )}
              </AnimatedPressable>

              {!!onRemove && (
                <AnimatedPressable
                  style={styles.removePollBtn}
                  onPress={onRemove}
                  disabled={saving}
                >
                  <Text style={styles.removePollText}>Remover enquete</Text>
                </AnimatedPressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: 0,
  },
  closeBtn: {
    alignSelf: 'flex-end',
  },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  questionInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 70,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  counterMuted: { color: theme.colors.textLight },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  removeOptionBtn: { padding: 4 },
  removeOptionBtnDisabled: { opacity: 0.4 },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    marginBottom: 8,
  },
  addOptionBtnDisabled: { opacity: 0.4 },
  addOptionText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '700' },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  removePollBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  removePollText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '600' },
});
