// src/constants/theme.ts
export const theme = {
  colors: {
    // Core palette (warm Tinder-style tones)
    primary: '#FD3A69',
    primaryDark: '#D81E52',
    primaryLight: '#FFE3EA',
    secondary: '#FF7A5C',
    secondaryDark: '#E85A3C',
    secondaryLight: '#FFE8E0',

    background: '#FFFBFA',
    surface: '#FFFFFF',

    text: '#241A1D',
    textSecondary: '#8A7377',
    textLight: '#B5A5A8',

    onPrimary: '#FFFFFF',
    onSecondary: '#241A1D',

    border: '#F1E4E6',

    error: '#E5484D',
    success: '#3DAA6B',

    // Swipe-specific semantics
    like: '#3DAA6B',
    nope: '#E5484D',
    superLike: '#3B82F6',

    white: '#FFFFFF',
  },

  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },

  shadows: {
    light: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
  },
} as const;

export type Theme = typeof theme;
