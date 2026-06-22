import { View, Text, StyleSheet } from 'react-native';
import { getMatchStatusConfig } from '../match-status-config';
import { theme } from '../../tokens/theme';

export interface MatchStatusPillProps {
  status: string;
}

export function MatchStatusPill({ status }: MatchStatusPillProps) {
  const config = getMatchStatusConfig(status);
  return (
    <View style={[styles.pill, { backgroundColor: config.bgColor }]}>
      {config.pulse && <View style={[styles.dot, { backgroundColor: config.color }]} />}
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.borderRadius.full, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
});
