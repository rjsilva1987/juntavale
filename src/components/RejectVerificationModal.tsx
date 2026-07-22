// src/components/RejectVerificationModal.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, StyleSheet, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { REJECTION_REASON_OPTIONS, RejectionReason } from '@/constants/rejectionReasons';
import { theme } from '@/constants/theme';

// S58 — mesmo padrão estrutural do ReportModal.tsx: sheet deslizante,
// seleção única por radio, botão de confirmar desabilitado sem seleção. Sem
// KeyboardAvoidingView porque não há campo de texto aqui (catálogo fixo,
// sem motivo livre).
interface RejectVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: RejectionReason) => Promise<void>;
}

export function RejectVerificationModal({
  visible,
  onClose,
  onSubmit,
}: RejectVerificationModalProps) {
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setReason(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason);
      setReason(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title}>Rejeitar verificação</Text>
            <Text style={styles.subtitle}>Selecione o motivo da rejeição</Text>

            {REJECTION_REASON_OPTIONS.map((option) => {
              const active = reason === option.value;
              return (
                <AnimatedPressable
                  key={option.value}
                  style={styles.reasonRow}
                  onPress={() => setReason(option.value)}
                  disabled={submitting}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? theme.colors.primary : theme.colors.textLight}
                  />
                  <Text style={styles.reasonText}>{option.label}</Text>
                </AnimatedPressable>
              );
            })}

            <AnimatedPressable
              style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!reason || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Confirmar rejeição</Text>
              )}
            </AnimatedPressable>

            <AnimatedPressable style={styles.cancelBtn} onPress={handleClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </AnimatedPressable>
          </ScrollView>
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
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: 0,
  },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  reasonText: { fontSize: theme.fontSize.md, color: theme.colors.text, flexShrink: 1 },
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
