// src/components/SuperLikeNoteModal.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';

const MAX_NOTE_LENGTH = 150;

interface SuperLikeNoteModalProps {
  visible: boolean;
  // Fechar pelo backdrop OU pelo botão de fechar cancela a super curtida
  // inteira (S67, item 4.4) — nenhum swipe é gravado, nenhuma cota é gasta.
  onClose: () => void;
  onSendWithoutNote: () => void;
  onSendWithNote: (note: string) => void;
}

export function SuperLikeNoteModal({
  visible,
  onClose,
  onSendWithoutNote,
  onSendWithNote,
}: SuperLikeNoteModalProps) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const canSendWithNote = trimmed.length > 0;

  const handleClose = () => {
    setNote('');
    onClose();
  };

  const handleSendWithoutNote = () => {
    setNote('');
    onSendWithoutNote();
  };

  const handleSendWithNote = () => {
    if (!canSendWithNote) return;
    const value = note;
    setNote('');
    onSendWithNote(value);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <AnimatedPressable
                style={styles.closeBtn}
                onPress={handleClose}
                hitSlop={8}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </AnimatedPressable>

              <Text style={styles.title}>Super Curtida ⭐</Text>
              <Text style={styles.subtitle}>
                Anexe um bilhete opcional pra chamar atenção (até {MAX_NOTE_LENGTH} caracteres)
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Ex: Adorei seu perfil, bora conversar?"
                placeholderTextColor={theme.colors.textLight}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={MAX_NOTE_LENGTH}
              />
              <Text style={[styles.counter, note.length === 0 && styles.counterMuted]}>
                {note.length}/{MAX_NOTE_LENGTH}
              </Text>

              <AnimatedPressable
                style={[styles.sendNoteBtn, !canSendWithNote && styles.sendNoteBtnDisabled]}
                onPress={handleSendWithNote}
                disabled={!canSendWithNote}
              >
                <Text style={styles.sendNoteBtnText}>Enviar bilhete</Text>
              </AnimatedPressable>

              <AnimatedPressable style={styles.sendPlainBtn} onPress={handleSendWithoutNote}>
                <Text style={styles.sendPlainBtnText}>Enviar sem bilhete</Text>
              </AnimatedPressable>
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
    backgroundColor: theme.colors.white,
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
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 90,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  counterMuted: { color: theme.colors.textLight },
  sendNoteBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  sendNoteBtnDisabled: { opacity: 0.5 },
  sendNoteBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  sendPlainBtn: { alignItems: 'center', paddingVertical: 16 },
  sendPlainBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
