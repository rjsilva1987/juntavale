// src/components/ForgotPasswordModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { getAuthErrorMessage } from '@/constants/authErrors';
import { theme } from '@/constants/theme';
import { auth } from '@/services/firebase';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  initialEmail: string;
}

export function ForgotPasswordModal({ visible, onClose, initialEmail }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const canSubmit = email.trim().length > 0 && !loading;

  // O modal fica montado o tempo todo (visible só alterna a prop do Modal),
  // então o useState acima só roda uma vez — sem isto, o campo ficaria preso
  // no e-mail digitado da PRIMEIRA vez que a tela abriu, ignorando o que o
  // usuário editou no LoginScreen antes de abrir de novo.
  useEffect(() => {
    if (visible) setEmail(initialEmail);
  }, [visible, initialEmail]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSendLink = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      onClose();
      Alert.alert(
        'Verifique seu e-mail',
        'Se existir uma conta com esse e-mail, você vai receber um link para criar uma senha nova. Confira também a caixa de spam.',
      );
    } catch (error) {
      // S62/S69 — 'auth/user-not-found' é tratado como sucesso, com o MESMO
      // Alert do caminho feliz acima: mesma proteção contra enumeração de
      // e-mail do login (ver authErrors.ts) — dizer "esse e-mail não existe"
      // aqui revelaria quem tem conta.
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
        onClose();
        Alert.alert(
          'Verifique seu e-mail',
          'Se existir uma conta com esse e-mail, você vai receber um link para criar uma senha nova. Confira também a caixa de spam.',
        );
        return;
      }
      Alert.alert('Não foi possível enviar', getAuthErrorMessage(error, 'reset'));
    } finally {
      setLoading(false);
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

              <Text style={styles.title}>Esqueci minha senha</Text>
              <Text style={styles.subtitle}>
                Informe o e-mail cadastrado e enviaremos um link para você criar uma senha nova.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor={theme.colors.textLight}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />

              <AnimatedPressable
                style={[styles.sendNoteBtn, !canSubmit && styles.sendNoteBtnDisabled]}
                onPress={handleSendLink}
                disabled={!canSubmit}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  <Text style={styles.sendNoteBtnText}>Enviar link</Text>
                )}
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
  },
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
});
