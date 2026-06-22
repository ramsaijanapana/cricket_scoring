import {
  Pressable, Text, ActivityIndicator, StyleSheet,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { theme } from '../../tokens/theme';
import type { ButtonVariantProps } from './button-variants';

export interface ButtonProps extends Omit<PressableProps, 'children'>, ButtonVariantProps {
  children: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: theme.colors.cricket.green },
  secondary: { backgroundColor: theme.colors.surface[700] },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.surface[600] },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: theme.colors.cricket.red },
});

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.borderRadius.lg },
  md: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: theme.borderRadius.xl },
  lg: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: theme.borderRadius.xl },
});

const textVariantStyles = StyleSheet.create({
  primary: { color: '#ffffff' }, secondary: { color: '#ffffff' },
  outline: { color: theme.colors.surface[200] }, ghost: { color: theme.colors.surface[300] },
  danger: { color: '#ffffff' },
});

const textSizeStyles = StyleSheet.create({
  sm: { fontSize: theme.fontSize.xs }, md: { fontSize: theme.fontSize.lg }, lg: { fontSize: theme.fontSize.lg },
});

export function Button({ children, variant = 'primary', size = 'md', fullWidth = false, loading = false, disabled, style, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;
  const v = variant ?? 'primary';
  const s = size ?? 'md';
  return (
    <Pressable accessibilityRole="button" disabled={isDisabled}
      style={({ pressed }) => [variantStyles[v], sizeStyles[s], fullWidth && styles.fullWidth, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]}
      {...props}>
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={[styles.text, textVariantStyles[v], textSizeStyles[s]]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' }, disabled: { opacity: 0.6 }, pressed: { opacity: 0.85 },
  text: { fontWeight: '700', textAlign: 'center' },
});
