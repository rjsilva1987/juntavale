// src/components/AboutVisibilityModal.tsx
//
// S109 — visibilidade por campo do `about`: uma row por campo do catálogo
// (ABOUT_FIELDS, agrupado por ABOUT_GROUPS — zero id hardcoded aqui, um
// campo novo no catálogo ganha row sozinho), Switch por linha. LIGADO =
// visível (leitura natural, mesmo sentido das duas rows que já existem em
// ProfileScreen — paused/reengagementOptOut). Mesmo contrato de rascunho +
// confirmação do AboutPicker multi (ver AboutPicker.tsx): fechar pelo
// backdrop DESCARTA (o draft é só local, nunca chega em onSave), só o botão
// aplica. NÃO reusa AboutRow — aqui a row não navega pra um seletor, só
// alterna um Switch, contrato diferente por completo.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  ABOUT_FIELDS,
  ABOUT_GROUPS,
  ABOUT_GROUP_LABELS,
  type AboutFieldId,
} from '@/constants/profileAbout';
import { theme } from '@/constants/theme';

interface AboutVisibilityModalProps {
  visible: boolean;
  onClose: () => void;
  hiddenFields: AboutFieldId[];
  onSave: (hiddenFields: AboutFieldId[]) => void;
}

export function AboutVisibilityModal({
  visible,
  onClose,
  hiddenFields,
  onSave,
}: AboutVisibilityModalProps) {
  // Rascunho local, ressincronizado toda vez que o modal abre — fechar pelo
  // backdrop simplesmente nunca chama onSave, o draft morre com o modal.
  const [draftHidden, setDraftHidden] = useState<AboutFieldId[]>(hiddenFields ?? []);

  useEffect(() => {
    if (visible) setDraftHidden(hiddenFields ?? []);
  }, [visible, hiddenFields]);

  const handleToggle = (id: AboutFieldId) => {
    setDraftHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = () => {
    onSave(draftHidden);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Editar visibilidade</Text>
          <Text style={styles.sheetSubtitle}>
            Campo desligado some do seu perfil público, mas continua salvo e editável só pra você.
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {ABOUT_GROUPS.map((group) => (
              <View key={group}>
                <Text style={styles.groupLabel}>{ABOUT_GROUP_LABELS[group]}</Text>
                {ABOUT_FIELDS.filter((field) => field.group === group).map((field) => (
                  <View key={field.id} style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Ionicons name={field.icon} size={20} color={theme.colors.textSecondary} />
                      <Text style={styles.rowLabel}>{field.label}</Text>
                    </View>
                    <Switch
                      value={!draftHidden.includes(field.id)}
                      onValueChange={() => handleToggle(field.id)}
                    />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <AnimatedPressable style={styles.confirmBtn} onPress={handleSave}>
            <Text style={styles.confirmBtnText}>Salvar</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '80%',
    ...theme.shadows.medium,
  },
  sheetTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  groupLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  confirmBtn: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  },
});
