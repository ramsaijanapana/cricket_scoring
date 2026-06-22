import { View, StyleSheet, type ViewProps } from 'react-native';
import { theme } from '../../tokens/theme';

export interface CardProps extends ViewProps {
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = { none: 0, sm: theme.spacing.lg, md: theme.spacing.xl, lg: theme.spacing['2xl'] };

export function Card({ style, hover: _hover, padding = 'md', ...props }: CardProps) {
  return <View style={[styles.card, { padding: paddingMap[padding] }, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface[800],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.surface[700],
  },
});
