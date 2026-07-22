// src/components/DeleteAccountModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { auth, functions } from '@/services/firebase';

// S53 — exigência da Play Store: exclusão de conta precisa ser possível
// dentro do app. Palavra de confirmação em maiúsculas de propósito (mesmo
// padrão de "digite para confirmar" de outros apps) — reduz exclusão por
// toque acidental, já que o botão some ao apagar o texto.
const CONFIRM_WORD = 'EXCLUIR';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ visible, onClose }: DeleteAccountModalProps) {
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = confirmText === CONFIRM_WORD && password.length > 0 && !submitting;

  const handleClose = () => {
    if (submitting) return;
    setConfirmText('');
    setPassword('');
    onClose();
  };

  const handleDelete = async () => {
    if (!user?.email || !canSubmit) return;

    setSubmitting(true);

    // Reautenticação obrigatória antes de qualquer chamada destrutiva —
    // deleteAccount (Cloud Function) confia cegamente no uid do token, então
    // a senha precisa ser validada aqui, no client, antes de acionar a
    // function. Erro aqui não apaga nada.
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } catch (error) {
      console.error('[DeleteAccountModal] falha na reautenticação:', error);
      Alert.alert('Senha incorreta', 'Confira sua senha e tente novamente.');
      setSubmitting(false);
      return;
    }

    try {
      const deleteAccount = httpsCallable(functions, 'deleteAccount');
      await deleteAccount();
      setConfirmText('');
      setPassword('');
      onClose();
      // signOut(auth) direto, NÃO logout() do AuthContext: logout() chama
      // removePushToken (deleteDoc em users/{uid}/private/push) antes do
      // signOut, mas a Cloud Function deleteAccount já apagou users/{uid}
      // inteiro (recursiveDelete) — essa escrita aqui só recriaria um doc
      // órfão ou falharia por permission-denied (dono não existe mais nas
      // rules). O token de push já morreu junto com o doc.
      await signOut(auth);
    } catch (error) {
      console.error('[DeleteAccountModal] falha ao excluir a conta:', error);
      Alert.alert('Erro', 'Não foi possível excluir sua conta agora. Tente novamente mais tarde.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Ionicons name="warning" size={32} color={theme.colors.error} style={styles.icon} />
          <Text style={styles.title}>Excluir sua conta</Text>
          <Text style={styles.body}>
            Isso vai apagar permanentemente seu perfil, fotos, matches e conversas. Essa ação não
            pode ser desfeita.
          </Text>

          <Text style={styles.fieldLabel}>Digite {CONFIRM_WORD} para confirmar</Text>
          <TextInput
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={theme.colors.textLight}
          />

          <Text style={styles.fieldLabel}>Confirme sua senha</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!submitting}
            placeholder="Senha"
            placeholderTextColor={theme.colors.textLight}
          />

          <AnimatedPressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleDelete}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Excluir permanentemente</Text>
            )}
          </AnimatedPressable>

          <AnimatedPressable style={styles.cancelBtn} onPress={handleClose} disabled={submitting}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </AnimatedPressable>
        </Pressable>
      </Pressable>
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
  },
  icon: { alignSelf: 'center', marginBottom: 8 },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginTop: 8,
    marginBottom: 6,
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
  submitBtn: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
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
