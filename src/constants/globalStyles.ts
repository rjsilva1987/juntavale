// src/constants/globalStyles.ts
import { StyleSheet } from 'react-native';

import { theme } from './theme';

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  textBody: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  textCaption: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
});
