// src/components/AboutPicker.tsx
//
// S104 — seletor genérico do perfil estruturado: mesmo molde visual de
// modal do UfPicker (bottom sheet: backdrop + FlatList de opções), mas
// GENÉRICO de verdade — as opções vêm por prop, e o componente é
// CONTROLADO (visible/onClose) em vez de embutir o próprio trigger, porque
// quem dispara a abertura é a linha (AboutRow) que já mostra ícone/rótulo/
// valor/chevron; ter os dois com Pressable próprio duplicaria o toque.
// Cobre `type: 'number'` (Altura) além de `type: 'single'` — não é lista,
// é TextInput com faixa min/max e confirmação. NÃO cobre `type: 'multi'`:
// S104 só tem campos single/number; se a S106 trouxer o primeiro campo
// multi, este componente precisa crescer (multi-seleção com toggle por
// item) ou ganhar irmão — decisão de produto em aberto, ver saída da
// sprint. Não reaproveita nem altera UfPicker.tsx — ao lado, sem tocar.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { theme } from '@/constants/theme';

interface AboutPickerOption {
  value: string;
  label: string;
}

interface AboutPickerSingleProps {
  type: 'single';
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string | null;
  onChange: (value: string) => void;
  options: readonly AboutPickerOption[];
}

interface AboutPickerNumberProps {
  type: 'number';
  visible: boolean;
  onClose: () => void;
  title: string;
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
}

type AboutPickerProps = AboutPickerSingleProps | AboutPickerNumberProps;

export function AboutPicker(props: AboutPickerProps) {
  const { visible, onClose, title } = props;
  // Rascunho só do campo numérico — a lista `single` seleciona e fecha na
  // hora, não precisa de estado próprio.
  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    if (visible && props.type === 'number') {
      setDraftText(props.value != null ? String(props.value) : '');
    }
  }, [visible, props.type, props.value]);

  const handleSelectOption = (value: string) => {
    if (props.type !== 'single') return;
    props.onChange(value);
    onClose();
  };

  const draftNumber = Number(draftText);
  const draftValid =
    props.type === 'number' &&
    draftText.trim().length > 0 &&
    Number.isFinite(draftNumber) &&
    draftNumber >= props.min &&
    draftNumber <= props.max;

  const handleConfirmNumber = () => {
    if (props.type !== 'number' || !draftValid) return;
    props.onChange(draftNumber);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View style={styles.modalContainer}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{title}</Text>

            {props.type === 'single' ? (
              <FlatList
                data={props.options}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = item.value === props.value;
                  return (
                    <Pressable
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => handleSelectOption(item.value)}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>
                        {item.label}
                      </Text>
                      {active && (
                        <Ionicons name="checkmark" size={18} color={theme.colors.onSecondary} />
                      )}
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            ) : (
              <>
                <View style={styles.numberInputRow}>
                  <TextInput
                    style={styles.numberInput}
                    value={draftText}
                    onChangeText={setDraftText}
                    keyboardType="number-pad"
                    placeholder={`${props.min}-${props.max}`}
                    placeholderTextColor={theme.colors.textLight}
                    autoFocus
                  />
                  {!!props.suffix && <Text style={styles.numberSuffix}>{props.suffix}</Text>}
                </View>
                <Text style={styles.numberHint}>
                  Entre {props.min} e {props.max}
                  {props.suffix ? ` ${props.suffix}` : ''}
                </Text>
                <Pressable
                  style={[styles.confirmBtn, !draftValid && styles.confirmBtnDisabled]}
                  onPress={handleConfirmNumber}
                  disabled={!draftValid}
                >
                  <Text style={styles.confirmBtnText}>Confirmar</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '70%',
    ...theme.shadows.medium,
  },
  sheetTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
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

  numberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.background,
  },
  numberInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  numberSuffix: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  numberHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginTop: 6,
  },
  confirmBtn: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    // S104 — achado da auditoria: fundo `primary` pede texto `onPrimary`
    // (mesmo par de FilterModal.tsx genderTextActive e RegisterScreen.tsx
    // genderTextActive), não `onSecondary` — os dois tons de azul ficavam
    // com contraste ruim.
    color: theme.colors.onPrimary,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  },
});
