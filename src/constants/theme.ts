// src/constants/theme.ts

// ---- paletas de fundo (S93) ----
// Trocar de cor ou voltar ao padrao = mudar UMA linha (ACTIVE_PALETTE, abaixo).
// background = fundo de TELA. surface = fundo de card/sheet/header/tab bar.
// theme.colors.white NAO entra aqui: e primeiro plano (texto/icone sobre cor).
const PALETTES = {
  padrao: { background: '#F9FAFB', surface: '#FFFFFF' },
  creme: { background: '#FDFAEC', surface: '#FFFFFF' },
  verde: { background: '#E8F3E9', surface: '#FFFFFF' },
} as const;

const ACTIVE_PALETTE = PALETTES.padrao;

export const theme = {
  colors: {
    // Core palette (blue + yellow tones)
    primary: '#2563EB',
    primaryDark: '#1E3A8A',
    primaryLight: '#DBEAFE',
    secondary: '#FBBF24',
    secondaryDark: '#F59E0B',
    secondaryLight: '#FEF3C7',

    background: ACTIVE_PALETTE.background,
    surface: ACTIVE_PALETTE.surface,

    text: '#1F2937',
    textSecondary: '#6B7280',
    textLight: '#9CA3AF',

    onPrimary: '#FFFFFF',
    onSecondary: '#1E3A8A',

    border: '#E5E7EB',

    error: '#E5484D',
    success: '#3DAA6B',

    // Swipe-specific semantics
    like: '#3DAA6B',
    nope: '#E5484D',
    superLike: '#FBBF24',

    // Reservada a primeiro plano: texto e icone desenhados sobre cor. Fundo
    // de card/modal/header usa `surface`; fundo de tela usa `background`.
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
