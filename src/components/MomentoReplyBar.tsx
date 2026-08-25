// src/components/MomentoReplyBar.tsx
//
// S143-C — barra FIXA de resposta ao momento, renderizada dentro do
// SafeAreaView do MomentoViewerModal (substitui por completo o antigo
// MomentoCommentModal, bottom-sheet separado — não convivem os dois
// caminhos de envio). Chips de sugestão sorteados de um catálogo estático
// aprovado (decisão 1), 3 emojis rápidos fixos (decisão 2) e um campo de
// texto livre. Componente majoritariamente APRESENTACIONAL: toda a decisão
// de negócio (comentário vs curtida, match vs pedido) mora no PAI —
// onSendText/onEmojiPress só disparam as props, erros são tratados lá
// (MomentoViewerModal), aqui só existe o spinner de `submitting`.
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { MOMENTO_REQUEST_TEXT_MAX } from '@/services/momentoRequestService';

// Decisão 1 (Raphael, spec S143-C) — catálogo ESTÁTICO de respostas curtas
// aprovadas, sem IA lendo o conteúdo do momento. Textos fechados no portão
// da sprint: não alterar sem passar pelo Raphael de novo.
const CHIP_CATALOG = [
  'Kkkkk adorei',
  'Que demais!',
  'Conta mais sobre isso',
  'Isso aí ein 👀',
  'Muito bom!',
  'Marca aê',
] as const;

// Decisão 2 — sempre os mesmos 3, ao contrário dos chips (esses NÃO
// sorteiam).
const QUICK_EMOJIS = ['👍', '😂', '❤️'] as const;

const CHIP_SAMPLE_SIZE = 3;

// Sorteio sem reposição — catálogo pequeno (6 itens), não precisa de nada
// mais sofisticado que ir removendo do "pool" a cada sorteio.
function sampleChips(catalog: readonly string[], size: number): string[] {
  const pool = [...catalog];
  const result: string[] = [];
  for (let i = 0; i < size && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

interface MomentoReplyBarProps {
  // Só serve de "seed" pra recalcular o sorteio dos chips quando o momento
  // exibido muda (mesma troca de item na fila do feed que já reresseta
  // `liked` em MomentoViewerModal) — decisão 1 (sortear 3 a cada exibição
  // do momento, não a cada re-render). O componente não usa o valor pra
  // mais nada.
  momentoId: string | null | undefined;
  onSendText: (text: string) => Promise<void>;
  onEmojiPress: (emoji: string) => Promise<void>;
  onFocusChange: (focused: boolean) => void;
  submitting: boolean;
}

export function MomentoReplyBar({
  momentoId,
  onSendText,
  onEmojiPress,
  onFocusChange,
  submitting,
}: MomentoReplyBarProps) {
  const [text, setText] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chips = useMemo(() => sampleChips(CHIP_CATALOG, CHIP_SAMPLE_SIZE), [momentoId]);

  const handleChipPress = async (chipText: string) => {
    if (submitting) return;
    await onSendText(chipText);
  };

  const handleEmojiTap = async (emoji: string) => {
    if (submitting) return;
    await onEmojiPress(emoji);
  };

  const handleSendPress = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || submitting) return;
    await onSendText(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {chips.map((chip) => (
          <AnimatedPressable
            key={chip}
            style={[styles.chip, submitting && styles.disabled]}
            onPress={() => handleChipPress(chip)}
            disabled={submitting}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {chip}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Enviar mensagem..."
          placeholderTextColor={theme.colors.textLight}
          value={text}
          onChangeText={setText}
          maxLength={MOMENTO_REQUEST_TEXT_MAX}
          editable={!submitting}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          returnKeyType="send"
          onSubmitEditing={handleSendPress}
        />

        {QUICK_EMOJIS.map((emoji) => (
          <AnimatedPressable
            key={emoji}
            style={[styles.emojiBtn, submitting && styles.disabled]}
            onPress={() => handleEmojiTap(emoji)}
            disabled={submitting}
          >
            <Text style={styles.emojiText}>{emoji}</Text>
          </AnimatedPressable>
        ))}

        <AnimatedPressable
          style={[styles.sendBtn, (submitting || text.trim().length === 0) && styles.disabled]}
          onPress={handleSendPress}
          disabled={submitting || text.trim().length === 0}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <Ionicons name="send" size={18} color={theme.colors.white} />
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  chipText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    maxHeight: 80,
  },
  emojiBtn: { padding: 4 },
  emojiText: { fontSize: 22 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
