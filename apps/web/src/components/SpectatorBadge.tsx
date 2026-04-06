import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';
import { getSocket } from '../lib/socket';

interface SpectatorBadgeProps {
  matchId: string;
}

export function SpectatorBadge({ matchId }: SpectatorBadgeProps) {
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const prevCount = useRef<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    // Join the match room (idempotent if already joined by ScoringPage)
    socket.emit('join_match', { match_id: matchId });

    const presenceEvent = `match:${matchId}:presence`;

    const handlePresence = (data: { viewers: number }) => {
      prevCount.current = viewerCount;
      setViewerCount(data.viewers);
    };

    socket.on(presenceEvent, handlePresence);

    return () => {
      socket.off(presenceEvent, handlePresence);
    };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (viewerCount === null) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'var(--bg-hover)' }}
    >
      <Eye size={13} className="text-cricket-green" />
      <AnimatePresence mode="wait">
        <motion.span
          key={viewerCount}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="text-theme-secondary"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {viewerCount}
        </motion.span>
      </AnimatePresence>
      <span className="text-theme-muted">watching</span>
    </motion.div>
  );
}
