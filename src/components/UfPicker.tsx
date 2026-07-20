// src/components/UfPicker.tsx
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/constants/theme';
import { UF_OPTIONS } from '@/constants/ufs';

interface UfPickerOption {
  sigla: string;
  nome: string;
}

interface UfPickerProps {
  value: string | null;
  onChange: (uf: string) => void;
  placeholder?: string;
  includeAll?: boolean;
  disabled?: boolean;
}

const ALL_OPTION: UfPickerOption = { sigla: 'all', nome: 'Todos os estados' };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function UfPicker({
  value,
  onChange,
  placeholder = 'Selecione seu estado',
  includeAll = false,
  disabled = false,
}: UfPickerProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const options: UfPickerOption[] = useMemo(
    () => (includeAll ? [ALL_OPTION, ...UF_OPTIONS] : UF_OPTIONS),
    [includeAll],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return options;
    return options.filter(
      (option) =>
        normalize(option.nome).includes(normalizedQuery) ||
        normalize(option.sigla).includes(normalizedQuery),
    );
  }, [options, query]);

  const selectedOption = useMemo(
    () => options.find((option) => option.sigla === value) ?? null,
    [options, value],
  );

  const openPicker = () => {
    if (disabled) return;
    setQuery('');
    setVisible(true);
  };

  const closePicker = () => setVisible(false);

  const handleSelect = (uf: string) => {
    onChange(uf);
    closePicker();
  };

  return (
    <>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          selectedOption ? `Estado selecionado: ${selectedOption.nome}` : placeholder
        }
      >
        <Text style={[styles.fieldText, !selectedOption && styles.fieldPlaceholder]}>
          {selectedOption
            ? selectedOption.sigla === 'all'
              ? selectedOption.nome
              : `${selectedOption.nome} (${selectedOption.sigla})`
            : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.backdrop} onPress={closePicker} />
          <View style={styles.sheet}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar estado ou sigla"
              placeholderTextColor={theme.colors.textLight}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.sigla}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.sigla === value;
                return (
                  <Pressable
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => handleSelect(item.sigla)}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {item.sigla === 'all' ? item.nome : `${item.nome} (${item.sigla})`}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.onSecondary} />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  fieldText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    flexShrink: 1,
  },
  fieldPlaceholder: {
    color: theme.colors.textLight,
  },

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
    maxHeight: '70%',
    ...theme.shadows.medium,
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  optionActive: {
    backgroundColor: theme.colors.secondaryLight,
  },
  optionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  optionTextActive: {
    color: theme.colors.onSecondary,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
});
