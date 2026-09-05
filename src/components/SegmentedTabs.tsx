// src/components/SegmentedTabs.tsx
//
// S180-B — seletor de segmento genérico (ex.: Grupos | Eventos em
// AdminCommunityScreen, Pendentes | Todos em AdminListingsScreen). Molde
// dos chips de categoria de ListingsScreen.tsx (~161-171/281-294): ativo
// preenchido, inativo com borda — aqui em tokens de PRIMARY, não secondary
// (o amarelo #FBBF24 — REGRA DE OURO nunca texto branco sobre amarelo, e o
// chip de categoria usa onSecondary/secondary; aqui ativo usa primary/
// onPrimary, sem esse risco).
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';

interface SegmentedTabsProps<K extends string> {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}

export function SegmentedTabs<K extends string>({
  options,
  value,
  onChange,
}: SegmentedTabsProps<K>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <AnimatedPressable
            key={option.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(option.key)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: theme.fontSize.xs, fontWeight: '600', color: theme.colors.text },
  chipTextActive: { color: theme.colors.onPrimary },
});
