// src/components/MomentoCommentModal.tsx
//
// S143-B — composer de comentário/resposta a um momento de outra pessoa,
// aberto a partir do MomentoViewerModal. Decide sozinho entre caso A (já é
// match: manda mensagem normal com momentoRef) e caso B (sem match: cria/
// reusa um pedido, momentoRequests/{...}) — decisão 5, sem perguntar ao
// usuário qual caminho (ver sendMomentoComment, momentoRequestService.ts).
// Mesmo padrão visual/estrutural de MomentoComposerModal.tsx (Modal
// transparent "slide", backdrop + sheet, KeyboardAvoidingView) — Modal
// sibling do viewer, nunca aninhado (mesmo padrão de ReportModal.tsx).
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { MOMENTO_REQUEST_TEXT_MAX, sendMomentoComment } from '@/services/momentoRequestService';
import { MomentoWithId } from '@/services/momentoService';

interface MomentoCommentModalProps {
  visible: boolean;
  momento: MomentoWithId | null;
  onClose: () => void;
}

export function MomentoCommentModal({ visible, momento, onClose }: MomentoCommentModalProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setText('');
    onClose();
  };

  const handleSend = async () => {
    if (!user || !momento || text.trim().length === 0) return;
    setSubmitting(true);
    try {
      const result = await sendMomentoComment(user.uid, momento, text);
      if (result.via === 'match') {
        Alert.alert('Comentário enviado', 'Sua mensagem foi enviada na conversa.');
      } else if (result.status === 'pending') {
        Alert.alert(
          'Pedido enviado',
          'Vocês ainda não têm match — avisamos o autor do momento. Assim que ele responder, a conversa libera aqui.',
        );
      } else if (result.status === 'answered') {
        Alert.alert('Mensagem enviada', 'Sua mensagem foi enviada na conversa deste pedido.');
      } else {
        Alert.alert(
          'Pedido recusado',
          'O autor já recusou um pedido de conversa pra este momento.',
        );
      }
      setText('');
      onClose();
    } catch (error) {
      Alert.alert(
        'Não foi possível enviar',
        error instanceof Error ? error.message : 'Tente novamente em instantes.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Comentar momento</Text>
            <Text style={styles.subtitle}>
              Se vocês ainda não têm match, o autor recebe um pedido de conversa antes.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Escreva um comentário..."
              placeholderTextColor={theme.colors.textLight}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={MOMENTO_REQUEST_TEXT_MAX}
              editable={!submitting}
              autoFocus
            />

            <AnimatedPressable
              style={[
                styles.submitBtn,
                (submitting || text.trim().length === 0) && styles.submitBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={submitting || text.trim().length === 0}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Enviar</Text>
              )}
            </AnimatedPressable>

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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
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
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 100,
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
