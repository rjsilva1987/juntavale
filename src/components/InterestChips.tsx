// src/components/InterestChips.tsx
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { normalizeInterest } from '@/utils/interests';

interface InterestChipsProps {
  interests: string[];
  sharedSet: Set<string>;
  maxVisible?: number;
  variant?: 'overlay' | 'surface';
}

export function InterestChips({
  interests,
  sharedSet,
  maxVisible = 8,
  variant = 'overlay',
}: InterestChipsProps) {
  if (!interests?.length) return null;

  // Interesses em comum primeiro, preservando a ordem original dentro de
  // cada grupo (sort() não é usado aqui pra não depender de estabilidade).
  const shared: string[] = [];
  const rest: string[] = [];
  for (const interest of interests) {
    if (sharedSet.has(normalizeInterest(interest))) {
      shared.push(interest);
    } else {
      rest.push(interest);
    }
  }
  const ordered = [...shared, ...rest];
  const visible = ordered.slice(0, maxVisible);
  const hiddenCount = ordered.length - visible.length;

  return (
    <View style={styles.container}>
      {visible.map((interest, index) => {
        const isShared = sharedSet.has(normalizeInterest(interest));
        return (
          <View
            key={`${interest}-${index}`}
            style={[
              variant === 'surface' ? styles.chipSurface : styles.chip,
              isShared && styles.chipShared,
            ]}
          >
            <Text
              style={[
                variant === 'surface' ? styles.chipTextSurface : styles.chipText,
                isShared && styles.chipTextShared,
              ]}
              numberOfLines={1}
            >
              {interest}
            </Text>
          </View>
        );
      })}
      {hiddenCount > 0 && (
        <View style={variant === 'surface' ? styles.chipSurface : styles.chip}>
          <Text style={variant === 'surface' ? styles.chipTextSurface : styles.chipText}>
            +{hiddenCount}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.white,
  },
  chipShared: {
    backgroundColor: theme.colors.secondary,
  },
  chipTextShared: {
    color: theme.colors.onSecondary,
  },
  chipSurface: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipTextSurface: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
