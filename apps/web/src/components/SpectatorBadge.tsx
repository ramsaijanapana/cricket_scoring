import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';
import { api } from '../lib/api';
import { getSocket, joinMatch, leaveMatch, WS_EVENTS } from '../lib/socket';

interface SpectatorBadgeProps {
  matchId: string;
}

export function SpectatorBadge({ matchId }: SpectatorBadgeProps) {
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadInitialCount = async () => {
      try {
        const { count } = await api.getMatchPresence(matchId);
        if (!cancelled) setViewerCount(count);
      } catch {
        if (!cancelled) setViewerCount(0);
      }
    };

    void loadInitialCount();

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    joinMatch(matchId);

    const handlePresence = (data: { matchId: string; count: number }) => {
      if (data.matchId !== matchId) return;
      setViewerCount(data.count);
    };

    socket.on(WS_EVENTS.presenceUpdate, handlePresence);

    return () => {
      cancelled = true;
      socket.off(WS_EVENTS.presenceUpdate, handlePresence);
      leaveMatch(matchId);
    };
  }, [matchId]);

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
      <span className="text-theme-secondary">watching</span>
    </motion.div>
  );
}
