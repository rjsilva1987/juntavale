// src/components/FilterModal.tsx
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';

import { UfPicker } from '@/components/UfPicker';
import { LookingFor, LOOKING_FOR_OPTIONS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { UF } from '@/constants/ufs';
import { DiscoverFilters, Gender } from '@/services/firestoreService';

interface FilterModalProps {
  visible: boolean;
  filters: DiscoverFilters;
  defaultFilters: DiscoverFilters;
  onApply: (filters: DiscoverFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

const GENDER_OPTIONS: { label: string; value: Gender | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Masculino', value: 'masculino' },
  { label: 'Feminino', value: 'feminino' },
];

const LOOKING_FOR_FILTER_OPTIONS: { label: string; value: LookingFor | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  ...LOOKING_FOR_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
];

export function FilterModal({
  visible,
  filters,
  defaultFilters,
  onApply,
  onClear,
  onClose,
}: FilterModalProps) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const setAgeMin = (value: number) => {
    setDraft((prev) => ({ ...prev, ageMin: Math.min(value, prev.ageMax) }));
  };
  const setAgeMax = (value: number) => {
    setDraft((prev) => ({ ...prev, ageMax: Math.max(value, prev.ageMin) }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filtros de descoberta</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Fechar</Text>
            </TouchableOpacity>
          </View>

          {/* Age range */}
          <Text style={styles.label}>
            Faixa etária: {draft.ageMin} - {draft.ageMax} anos
          </Text>
          <Text style={styles.subLabel}>Idade mínima</Text>
          <Slider
            minimumValue={18}
            maximumValue={60}
            step={1}
            value={draft.ageMin}
            onValueChange={setAgeMin}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.border}
            thumbTintColor={theme.colors.primary}
          />
          <Text style={styles.subLabel}>Idade máxima</Text>
          <Slider
            minimumValue={18}
            maximumValue={60}
            step={1}
            value={draft.ageMax}
            onValueChange={setAgeMax}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.border}
            thumbTintColor={theme.colors.primary}
          />

          {/* Estado */}
          <Text style={styles.label}>Estado</Text>
          <UfPicker
            value={draft.uf}
            includeAll
            onChange={(item) => setDraft((prev) => ({ ...prev, uf: item as UF | 'all' }))}
          />

          {/* Gender */}
          <Text style={styles.label}>Gênero</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((option) => {
              const active = draft.gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.genderOption, active && styles.genderOptionActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, gender: option.value }))}
                >
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Busca (lookingFor) */}
          <Text style={styles.label}>Busca</Text>
          <View style={styles.lookingForRow}>
            {LOOKING_FOR_FILTER_OPTIONS.map((option) => {
              const active = draft.lookingFor === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.lookingForOption, active && styles.lookingForOptionActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, lookingFor: option.value }))}
                >
                  <Text
                    style={[styles.lookingForText, active && styles.lookingForTextActive]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Só verificados */}
          <View style={styles.verifiedRow}>
            <View style={styles.verifiedLabelRow}>
              <Ionicons name="shield-checkmark" size={16} color={theme.colors.primary} />
              <Text style={styles.label}>Apenas perfis verificados</Text>
            </View>
            <Switch
              value={draft.verifiedOnly}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, verifiedOnly: value }))}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
              ios_backgroundColor={theme.colors.border}
            />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setDraft(defaultFilters);
                onClear();
              }}
            >
              <Text style={styles.clearBtnText}>Limpar filtros</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={() => onApply(draft)}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    ...theme.shadows.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  closeText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '600' },

  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  subLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },

  genderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  genderOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  genderText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  genderTextActive: { color: theme.colors.onPrimary },

  lookingForRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  lookingForOption: {
    flexBasis: '31%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  lookingForOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  lookingForText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  lookingForTextActive: { color: theme.colors.onPrimary },

  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },

  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  applyBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onPrimary },
});
