// src/components/AboutRow.tsx
//
// S104 — linha genérica do perfil estruturado (piloto do padrão `about`):
// ícone à esquerda, rótulo, valor à direita (ou "Adicionar" quando vazio) e
// chevron, mesmo padrão dos prints do Tinder. Reutilizável por qualquer
// campo do catálogo em src/constants/profileAbout.ts — não sabe nada sobre
// altura/signo especificamente, só recebe label/value/onPress já prontos.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';

interface AboutRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
}

export function AboutRow({ icon, label, value, onPress, disabled = false }: AboutRowProps) {
  return (
    <AnimatedPressable
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : `${label}: adicionar`}
    >
      <View style={styles.left}>
        <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || 'Adicionar'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    marginLeft: theme.spacing.sm,
  },
  value: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  placeholder: {
    color: theme.colors.primary,
  },
});
