// src/components/RequirePhotoModal.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';

import { isAdminUid } from '@/config/admin';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { addProfilePhoto, uploadProfilePhoto } from '@/services/firestoreService';
import { pickFromCamera, pickFromGallery, type PickPhotoResult } from '@/utils/pickPhoto';

import { AnimatedPressable } from './AnimatedPressable';

// S120 — trava conta legada sem NENHUMA foto até adicionar uma. Guarda
// contra o primeiro render é `profile != null` (perfil já carregou), não
// mais Array.isArray: um profile carregado com `photos` ausente (doc legado
// sem a chave) agora também dispara o modal, não só `photos: []`. Admin
// (isAdminUid, cobre os dois uids do S115) nunca vê o modal — o painel
// admin não pode ficar bloqueado por falta de foto. Sem botão de fechar,
// sem dismiss por backdrop, e onRequestClose vazio bloqueia o botão físico
// de voltar do Android — sair sem foto não é uma opção nesta tela (só a
// saída de emergência "Sair da conta" no rodapé).
export function RequirePhotoModal() {
  const { profile, user, refreshProfile, logout } = useAuth();
  const [uploading, setUploading] = useState(false);

  const photos = profile?.photos;
  const visible =
    profile != null && !isAdminUid(user?.uid) && (photos === undefined || photos.length === 0);

  // S120 — `pick.reason` distingue cancelamento (silencioso, comportamento
  // correto) de permissão negada (Alert já mostrado dentro de
  // pickFromCamera/pickFromGallery, antes de chegar aqui) — os dois casos
  // batem no mesmo `!pick.uri`, então não precisa de branch por reason
  // aqui: o feedback de permissão já aconteceu na origem.
  const handlePick = async (pick: PickPhotoResult) => {
    if (!pick.uri || !user) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(user.uid, pick.uri);
      await addProfilePhoto(user.uid, photos ?? [], url);
      await refreshProfile();
    } catch (err) {
      console.error(
        `[RequirePhotoModal] upload da foto (modal de trava) falhou — uid ${user.uid}`,
        err,
      );
      Alert.alert('Erro', 'Não foi possível salvar a foto. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleSelfie = async () => handlePick(await pickFromCamera());
  const handleGallery = async () => handlePick(await pickFromGallery());

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Adicione uma foto</Text>
          <Text style={styles.subtitle}>
            Agora é obrigatório ter pelo menos uma foto no perfil pra continuar usando o app.
          </Text>

          {uploading ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
          ) : (
            <View style={styles.buttonsRow}>
              <AnimatedPressable style={styles.optionBtn} onPress={handleSelfie}>
                <Text style={styles.optionText}>Tirar selfie</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.optionBtn} onPress={handleGallery}>
                <Text style={styles.optionText}>Escolher da galeria</Text>
              </AnimatedPressable>
            </View>
          )}

          {/* Saída de emergência — deliberadamente discreta (texto puro,
              sem borda/card), bem menos proeminente que os dois botões de
              foto acima: não é um terceiro caminho pra continuar sem foto,
              só destranca quem não quer/pode adicionar foto agora. */}
          <AnimatedPressable style={styles.logoutBtn} onPress={logout} disabled={uploading}>
            <Text style={styles.logoutText}>Sair da conta</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
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
    marginBottom: theme.spacing.lg,
  },
  buttonsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  optionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  optionText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  spinner: { marginVertical: 20 },
  logoutBtn: { alignItems: 'center', marginTop: theme.spacing.lg, padding: 4 },
  logoutText: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },
});
