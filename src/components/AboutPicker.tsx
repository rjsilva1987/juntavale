// src/components/AboutPicker.tsx
//
// S104 — seletor genérico do perfil estruturado: mesmo molde visual de
// modal do UfPicker (bottom sheet: backdrop + FlatList de opções), mas
// GENÉRICO de verdade — as opções vêm por prop, e o componente é
// CONTROLADO (visible/onClose) em vez de embutir o próprio trigger, porque
// quem dispara a abertura é a linha (AboutRow) que já mostra ícone/rótulo/
// valor/chevron; ter os dois com Pressable próprio duplicaria o toque.
// Cobre `type: 'number'` (Altura) e `type: 'single'` (lista, aplica na
// hora) além de, desde a S106, `type: 'multi'` (lista com toggle por item,
// rascunho interno, só aplica no botão "Concluir" — mesma ideia do
// `number`, que também usa rascunho+confirmação em vez de aplicar a cada
// tecla). Não reaproveita nem altera UfPicker.tsx — ao lado, sem tocar.
//
// GENÉRICO em V (S106, Parte D): `single`/`multi` parametrizam value/
// options/onChange por V extends string em vez de `string` fixo — é isso
// que deixa o call site em ProfileScreen.tsx dispensar o cast pro union
// AboutValues[AboutFieldId]. MAS (achado da auditoria S106-B): V não é o
// tipo do campo especificamente aberto — o call site instancia V a partir
// de `singleField`/`multiField`, que são a UNIÃO de todos os campos
// single/multi do catálogo, porque o campo aberto só existe em runtime (o
// estado guarda um `AboutFieldId`, union amplo, não um literal por
// abertura). Então o tipo NÃO impede um valor de outro campo single (ex.:
// 'cachorro', de `pets`) chegar ao `onChange` enquanto `sign` está aberto
// — quem garante isso na prática é o componente, que só lista pra toque
// as `options` recebidas por prop, nunca as de outro campo. Ainda assim é
// mais estreito que o cast anterior, que aceitava qualquer value do
// catálogo inteiro, inclusive de campos number e multi.
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

interface AboutPickerOption<V extends string> {
  value: V;
  label: string;
}

interface AboutPickerSingleProps<V extends string> {
  type: 'single';
  visible: boolean;
  onClose: () => void;
  title: string;
  value: V | null;
  onChange: (value: V) => void;
  options: readonly AboutPickerOption<V>[];
}

interface AboutPickerMultiProps<V extends string> {
  type: 'multi';
  visible: boolean;
  onClose: () => void;
  title: string;
  value: V[] | null;
  onChange: (value: V[]) => void;
  options: readonly AboutPickerOption<V>[];
  maxSelected?: number;
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

type AboutPickerProps<V extends string> =
  AboutPickerSingleProps<V> | AboutPickerMultiProps<V> | AboutPickerNumberProps;

export function AboutPicker<V extends string = string>(props: AboutPickerProps<V>) {
  const { visible, onClose, title } = props;
  // Rascunho do campo numérico (texto) e do multi (array) — ambos só
  // aplicam no botão de confirmar. A lista `single` seleciona e fecha na
  // hora, não precisa de estado próprio.
  const [draftText, setDraftText] = useState('');
  const [draftMulti, setDraftMulti] = useState<V[]>([]);

  useEffect(() => {
    if (visible && props.type === 'number') {
      setDraftText(props.value != null ? String(props.value) : '');
    }
    if (visible && props.type === 'multi') {
      setDraftMulti(props.value ?? []);
    }
  }, [visible, props.type, props.value]);

  const handleSelectOption = (value: V) => {
    if (props.type !== 'single') return;
    props.onChange(value);
    onClose();
  };

  const multiMax = props.type === 'multi' ? props.maxSelected : undefined;
  const multiLimitReached = multiMax != null && draftMulti.length >= multiMax;

  const handleToggleOption = (value: V) => {
    if (props.type !== 'multi') return;
    setDraftMulti((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (multiMax != null && prev.length >= multiMax) return prev;
      return [...prev, value];
    });
  };

  const handleConfirmMulti = () => {
    if (props.type !== 'multi') return;
    props.onChange(draftMulti);
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
            ) : props.type === 'multi' ? (
              <>
                <FlatList
                  data={props.options}
                  keyExtractor={(item) => item.value}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const active = draftMulti.includes(item.value);
                    const disabled = !active && multiLimitReached;
                    return (
                      <Pressable
                        style={[
                          styles.option,
                          active && styles.optionActive,
                          disabled && styles.optionDisabled,
                        ]}
                        onPress={() => handleToggleOption(item.value)}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            active && styles.optionTextActive,
                            disabled && styles.optionTextDisabled,
                          ]}
                        >
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
                {multiMax != null && (
                  <Text style={styles.numberHint}>
                    Escolha até {multiMax} ({draftMulti.length}/{multiMax})
                  </Text>
                )}
                <Pressable style={styles.confirmBtn} onPress={handleConfirmMulti}>
                  <Text style={styles.confirmBtnText}>Concluir</Text>
                </Pressable>
              </>
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
  optionDisabled: {
    opacity: 0.4,
  },
  optionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  optionTextActive: {
    color: theme.colors.onSecondary,
    fontWeight: '700',
  },
  optionTextDisabled: {
    color: theme.colors.textLight,
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
