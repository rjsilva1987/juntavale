// src/components/FounderBadge.tsx
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

interface FounderBadgeProps {
  number: number;
}

// Selo fundador (S51) — só renderiza quando o perfil tem founderNumber
// (atribuído por Cloud Function, ver assignFounderNumber em
// functions/src/index.ts). flexShrink: 0 de propósito, igual
// PendingVerificationChip/VerifiedBadge — quem cede espaço pra nome longo é
// o texto do nome (flexShrink: 1 no caller), nunca o badge.
export function FounderBadge({ number }: FounderBadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text} numberOfLines={1}>
        Fundador #{number}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.onSecondary,
  },
});
