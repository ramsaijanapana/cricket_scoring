export const colors = {
  cricket: {
    green: "#16a34a",
    greenLight: "#22c55e",
    gold: "#eab308",
    red: "#ef4444",
    blue: "#3b82f6",
    purple: "#a855f7",
  },
  surface: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#a3a3a3",
    400: "#737373",
    500: "#525252",
    600: "#404040",
    700: "#262626",
    750: "#1f1f1f",
    800: "#171717",
    850: "#121212",
    900: "#0a0a0a",
  },
  white: "#ffffff",
  black: "#000000",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/** Status colors for match states */
export const statusColors: Record<string, string> = {
  live: colors.cricket.red,
  scheduled: colors.cricket.blue,
  completed: colors.surface[400],
  innings_break: colors.cricket.gold,
  rain_delay: colors.cricket.purple,
  abandoned: colors.surface[500],
};

/** Format badge labels */
export const formatLabels: Record<string, string> = {
  test: "TEST",
  odi: "ODI",
  t20: "T20",
  t10: "T10",
  hundred: "100",
  firstclass: "FC",
  lista: "List A",
  custom: "Custom",
};
