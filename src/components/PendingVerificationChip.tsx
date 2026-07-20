// src/components/PendingVerificationChip.tsx
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { theme } from '@/constants/theme';

interface PendingVerificationChipProps {
  style?: ViewStyle;
}

// Contraparte neutra do VerifiedBadge (S47) — perfil ainda não verificado.
// Só leitura (sem onPress/navegação, de propósito): é status, não convite a
// ação. Paleta obrigatoriamente neutra (fundo de superfície atenuada + texto
// secundário do tema) — nenhuma cor/ícone de alerta, pra não ler como erro.
export function PendingVerificationChip({ style }: PendingVerificationChipProps) {
  return (
    <View style={[styles.chip, style]}>
      <Text style={styles.text} numberOfLines={1}>
        Verificação pendente
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
