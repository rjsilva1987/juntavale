// src/components/MomentoComposerModal.tsx
//
// S121 — modal de criação de momento (story de 24h), mesmo padrão
// visual/estrutural de ReportModal.tsx (Modal transparent animationType
// "slide", backdrop + sheet, KeyboardAvoidingView).
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  deleteMomentoPhotoBestEffort,
  MOMENTO_TEXT_MAX,
  publishPhotoMomento,
  publishTextMomento,
  uploadMomentoPhoto,
} from '@/services/momentoService';
import { pickFromCamera, pickFromGallery } from '@/utils/pickPhoto';

interface MomentoComposerModalProps {
  visible: boolean;
  onClose: () => void;
  // Recarrega "meu momento" na tela mãe após um publish bem-sucedido.
  onPublished: () => void;
  // URL do momento atual do usuário, se houver — só usada internamente pra
  // limpeza best-effort da foto antiga (fluxo de substituição, limite de 1
  // momento ativo).
  existingPhotoUrl?: string;
}

type ComposerMode = 'text' | 'photo' | null;

export function MomentoComposerModal({
  visible,
  onClose,
  onPublished,
  existingPhotoUrl,
}: MomentoComposerModalProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<ComposerMode>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setMode(null);
    setText('');
    onClose();
  };

  // Fluxo de substituição (limite de 1 ativo): DEPOIS do publish bem
  // sucedido, se existingPhotoUrl foi passado e o novo momento não é a
  // mesma foto, limpa a foto antiga best-effort — nunca antes (se o publish
  // falhar, a foto antiga não pode já ter sido apagada).
  const finishPublish = async (newPhotoUrl?: string) => {
    if (existingPhotoUrl && newPhotoUrl !== existingPhotoUrl) {
      await deleteMomentoPhotoBestEffort(existingPhotoUrl);
    }
    onPublished();
    handleClose();
  };

  const handlePublishText = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await publishTextMomento(user.uid, text);
      await finishPublish(undefined);
    } catch (error) {
      Alert.alert(
        'Não foi possível publicar',
        error instanceof Error ? error.message : 'Tente novamente em instantes.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const publishPhoto = async (localUri: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const photoUrl = await uploadMomentoPhoto(user.uid, localUri);
      await publishPhotoMomento(user.uid, photoUrl);
      await finishPublish(photoUrl);
    } catch {
      Alert.alert('Não foi possível publicar', 'Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachPhoto = () => {
    Alert.alert('Anexar foto', undefined, [
      {
        text: 'Tirar foto',
        onPress: async () => {
          const result = await pickFromCamera();
          if (result.uri) await publishPhoto(result.uri);
        },
      },
      {
        text: 'Escolher da galeria',
        onPress: async () => {
          const result = await pickFromGallery();
          if (result.uri) await publishPhoto(result.uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Novo momento</Text>
            <Text style={styles.subtitle}>Fica visível por 24h pra toda a base.</Text>

            <View style={styles.tabRow}>
              <AnimatedPressable
                style={[styles.tabBtn, mode === 'text' && styles.tabBtnActive]}
                onPress={() => setMode('text')}
                disabled={submitting}
              >
                <Ionicons
                  name="text"
                  size={18}
                  color={mode === 'text' ? theme.colors.onSecondary : theme.colors.textSecondary}
                />
                <Text style={[styles.tabText, mode === 'text' && styles.tabTextActive]}>Texto</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.tabBtn, mode === 'photo' && styles.tabBtnActive]}
                onPress={() => setMode('photo')}
                disabled={submitting}
              >
                <Ionicons
                  name="camera"
                  size={18}
                  color={mode === 'photo' ? theme.colors.onSecondary : theme.colors.textSecondary}
                />
                <Text style={[styles.tabText, mode === 'photo' && styles.tabTextActive]}>Foto</Text>
              </AnimatedPressable>
            </View>

            {mode === 'text' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="O que está rolando?"
                  placeholderTextColor={theme.colors.textLight}
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={MOMENTO_TEXT_MAX}
                  editable={!submitting}
                  autoFocus
                />
                <AnimatedPressable
                  style={[
                    styles.submitBtn,
                    (submitting || text.trim().length === 0) && styles.submitBtnDisabled,
                  ]}
                  onPress={handlePublishText}
                  disabled={submitting || text.trim().length === 0}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.submitBtnText}>Publicar</Text>
                  )}
                </AnimatedPressable>
              </>
            )}

            {mode === 'photo' && (
              <AnimatedPressable
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleAttachPhoto}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.submitBtnText}>Escolher foto</Text>
                )}
              </AnimatedPressable>
            )}

            <AnimatedPressable style={styles.cancelBtn} onPress={handleClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </AnimatedPressable>
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
  },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  tabBtnActive: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary },
  tabText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.onSecondary },
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
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: 16 },
  cancelBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
