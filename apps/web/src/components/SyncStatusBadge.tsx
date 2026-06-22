import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@cricket/ui';
import { useSocketStatus, type SocketStatus } from '../hooks/useSocketStatus';
import { useScoringStore } from '../stores/scoring-store';

const STATUS_VARIANT: Record<SocketStatus, 'success' | 'warning' | 'error'> = {
  connected: 'success',
  reconnecting: 'warning',
  offline: 'error',
};

const STATUS_LABEL: Record<SocketStatus, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  offline: 'Offline',
};

export function SyncStatusBadge() {
  const socketStatus = useSocketStatus();
  const pendingCount = useScoringStore((s) => s.pendingCount);
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      role="status"
      aria-live="polite"
    >
      <Badge variant={STATUS_VARIANT[socketStatus]} dot={socketStatus !== 'offline'}>
        {STATUS_LABEL[socketStatus]}
        {pendingCount > 0 && ` · ${pendingCount} pending`}
      </Badge>
    </motion.div>
  );
}
