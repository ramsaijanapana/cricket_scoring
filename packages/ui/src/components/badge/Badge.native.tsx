import { View, Text, StyleSheet, type ViewProps } from 'react-native';
import { theme } from '../../tokens/theme';
import type { BadgeVariantProps } from './badge-variants';

export interface BadgeProps extends ViewProps, BadgeVariantProps {
  children: string;
  dot?: boolean;
}

const variantStyles = StyleSheet.create({
  default: { backgroundColor: theme.colors.surface[700] },
  success: { backgroundColor: 'rgba(22, 163, 74, 0.15)' },
  warning: { backgroundColor: 'rgba(234, 179, 8, 0.15)' },
  error: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  info: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
});

const textVariantStyles = StyleSheet.create({
  default: { color: theme.colors.surface[300] },
  success: { color: theme.colors.cricket.green },
  warning: { color: theme.colors.cricket.gold },
  error: { color: theme.colors.cricket.red },
  info: { color: theme.colors.cricket.blue },
});

export function Badge({ children, variant = 'default', size = 'md', dot, style, ...props }: BadgeProps) {
  const v = variant ?? 'default';
  const padding = size === 'sm' ? 4 : size === 'lg' ? 8 : 6;
  return (
    <View style={[styles.base, variantStyles[v], { paddingHorizontal: padding + 4, paddingVertical: padding / 2 }, style]} {...props}>
      {dot && <View style={[styles.dot, { backgroundColor: textVariantStyles[v].color }]} />}
      <Text style={[styles.text, textVariantStyles[v], size === 'sm' && { fontSize: 9 }, size === 'lg' && { fontSize: 12 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: theme.borderRadius.full, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
});
