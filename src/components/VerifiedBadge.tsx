// src/components/VerifiedBadge.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/constants/theme';

interface VerifiedBadgeProps {
  size?: number;
}

export function VerifiedBadge({ size = 16 }: VerifiedBadgeProps) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="checkmark" size={size * 0.7} color={theme.colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
