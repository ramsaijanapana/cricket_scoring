/**
 * React Native / mobile theme object.
 *
 * All values are numbers or plain strings — no Tailwind classes, no rem units.
 * Import directly in React Native components:
 *   import { theme } from '@cricket/ui/tokens';
 */
export const theme = {
  colors: {
    cricket: {
      green: '#16a34a',
      greenLight: '#22c55e',
      gold: '#eab308',
      red: '#ef4444',
      blue: '#3b82f6',
      purple: '#a855f7',
    },
    surface: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#a3a3a3',
      400: '#737373',
      500: '#525252',
      600: '#404040',
      700: '#262626',
      750: '#1f1f1f',
      800: '#171717',
      850: '#121212',
      900: '#0a0a0a',
    },
  },

  // Spacing as numeric pixel values for StyleSheet
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
  },

  // Font sizes as numeric pixel values
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },

  // Border radii as numeric pixel values
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  },

  // Semantic colours for match status badges
  statusColors: {
    live: '#ef4444',
    scheduled: '#3b82f6',
    completed: '#737373',
    innings_break: '#eab308',
    rain_delay: '#a855f7',
    abandoned: '#737373',
  },
} as const;
