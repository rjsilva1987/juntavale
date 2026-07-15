// src/components/ReportModal.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { ReportReason, REPORT_REASON_LABELS } from '@/services/blockService';

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => Promise<void>;
}

export function ReportModal({ visible, onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setReason(null);
    setDetails('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, details.trim());
      setReason(null);
      setDetails('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Denunciar usuário</Text>
          <Text style={styles.subtitle}>Selecione o motivo da denúncia</Text>

          {REASONS.map((r) => {
            const active = reason === r;
            return (
              <AnimatedPressable
                key={r}
                style={styles.reasonRow}
                onPress={() => setReason(r)}
                disabled={submitting}
              >
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? theme.colors.primary : theme.colors.textLight}
                />
                <Text style={styles.reasonText}>{REPORT_REASON_LABELS[r]}</Text>
              </AnimatedPressable>
            );
          })}

          <Text style={styles.fieldLabel}>Detalhes (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Conte mais sobre o ocorrido…"
            placeholderTextColor={theme.colors.textLight}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={500}
            editable={!submitting}
          />

          <AnimatedPressable
            style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Enviar denúncia</Text>
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
  reasonText: { fontSize: theme.fontSize.md, color: theme.colors.text },
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
    height: 80,
    textAlignVertical: 'top',
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
  cancelBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.textSecondary },
});
