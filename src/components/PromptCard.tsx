// src/components/PromptCard.tsx
import { StyleSheet, Text, View } from 'react-native';

import { getPromptText } from '@/constants/prompts';
import { theme } from '@/constants/theme';

interface PromptCardProps {
  promptId: string;
  answer: string;
  variant?: 'overlay' | 'surface';
}

export function PromptCard({ promptId, answer, variant = 'overlay' }: PromptCardProps) {
  const question = getPromptText(promptId);
  // id de catálogo futuro/desconhecido (app desatualizado lendo doc mais
  // novo) — sem pergunta pra mostrar, não renderiza nada em vez de um card
  // com título vazio.
  if (!question) return null;

  const isOverlay = variant === 'overlay';

  return (
    <View style={isOverlay ? styles.containerOverlay : styles.containerSurface}>
      <Text style={isOverlay ? styles.questionOverlay : styles.questionSurface}>{question}</Text>
      <Text
        style={isOverlay ? styles.answerOverlay : styles.answerSurface}
        numberOfLines={isOverlay ? 3 : undefined}
      >
        {answer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  containerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  questionOverlay: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.white,
    opacity: 0.8,
    marginBottom: 2,
  },
  answerOverlay: {
    fontSize: theme.fontSize.md,
    color: theme.colors.white,
  },
  containerSurface: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  questionSurface: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  answerSurface: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
});
