import { motion, useReducedMotion } from 'framer-motion';
import { useSocketStatus, type SocketStatus } from '../hooks/useSocketStatus';
import { useScoringStore } from '../stores/scoring-store';

const STATUS_CONFIG: Record<SocketStatus, { color: string; bgColor: string; label: string }> = {
  connected: {
    color: 'var(--color-green, #16a34a)',
    bgColor: 'rgba(22, 163, 74, 0.12)',
    label: 'Connected',
  },
  reconnecting: {
    color: 'var(--color-gold, #eab308)',
    bgColor: 'rgba(234, 179, 8, 0.12)',
    label: 'Reconnecting...',
  },
  offline: {
    color: 'var(--color-red, #ef4444)',
    bgColor: 'rgba(239, 68, 68, 0.12)',
    label: 'Offline',
  },
};

export function SyncStatusBadge() {
  const socketStatus = useSocketStatus();
  const pendingCount = useScoringStore((s) => s.pendingCount);
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;

  const config = STATUS_CONFIG[socketStatus];

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: config.bgColor, color: config.color }}
      role="status"
      aria-live="polite"
    >
      {/* Status dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          socketStatus === 'reconnecting' ? 'animate-pulse' : ''
        }`}
        style={{ background: config.color }}
      />
      <span>{config.label}</span>
      {pendingCount > 0 && (
        <span
          className="ml-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold"
          style={{ background: 'rgba(234, 179, 8, 0.2)', color: 'var(--color-gold, #eab308)' }}
        >
          {pendingCount} pending
        </span>
      )}
    </motion.div>
  );
}
