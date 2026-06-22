import { forwardRef } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { theme } from '../../tokens/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const Input = forwardRef<TextInput, InputProps>(({ label, error, style, ...props }, ref) => (
  <View style={styles.wrapper}>
    {label && <Text style={styles.label}>{label.toUpperCase()}</Text>}
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.surface[500]}
      style={[styles.input, error && styles.inputError, style]}
      {...props}
    />
    {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
  </View>
));

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  label: { marginBottom: theme.spacing.sm, fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.surface[400] },
  input: {
    marginBottom: theme.spacing.lg, borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface[800], paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md, fontSize: theme.fontSize.base, color: '#ffffff',
  },
  inputError: { borderWidth: 1, borderColor: theme.colors.cricket.red },
  error: { marginTop: -8, marginBottom: theme.spacing.sm, fontSize: theme.fontSize.xs, color: theme.colors.cricket.red },
});
