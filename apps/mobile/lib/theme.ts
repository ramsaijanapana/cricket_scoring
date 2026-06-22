import { theme, colors as uiColors } from '@cricket/ui/tokens';

export { theme };

/** Mobile theme colors including primitives not in the shared token set. */
export const colors = {
  ...uiColors,
  white: '#ffffff',
  black: '#000000',
} as const;

export const spacing = theme.spacing;
export const fontSize = theme.fontSize;
export const borderRadius = theme.borderRadius;
export const statusColors = theme.statusColors;

/** Format badge labels */
export const formatLabels: Record<string, string> = {
  test: 'TEST',
  odi: 'ODI',
  t20: 'T20',
  t10: 'T10',
  hundred: '100',
  firstclass: 'FC',
  lista: 'List A',
  custom: 'Custom',
};
