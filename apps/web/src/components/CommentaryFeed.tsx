import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessageSquare, ChevronDown } from 'lucide-react';
import type { Commentary } from '@cricket/shared';
import { api } from '../lib/api';
import { getSocket, WS_EVENTS } from '../lib/socket';

interface CommentaryFeedProps {
  matchId: string;
}

const entryVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function dramaColor(level: number): string {
  if (level >= 3) return 'var(--color-gold, #eab308)';
  if (level >= 2) return 'var(--color-green, #16a34a)';
  return 'var(--text-tertiary, #71717a)';
}

export function CommentaryFeed({ matchId }: CommentaryFeedProps) {
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;
  const feedRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [allEntries, setAllEntries] = useState<Commentary[]>([]);
  const [realtimeEntries, setRealtimeEntries] = useState<Commentary[]>([]);

  // Fetch paginated commentary
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['commentary', matchId, page],
    queryFn: () => api.getCommentary(matchId, page),
    enabled: !!matchId,
  });

  // Accumulate pages
  useEffect(() => {
    if (data?.data) {
      setAllEntries((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEntries = data.data.filter((e) => !existingIds.has(e.id));
        // Page 1 entries go at the top (newest), additional pages go at the bottom (older)
        if (page === 1) {
          return [...newEntries, ...prev.filter((e) => !data.data.some((d) => d.id === e.id))];
        }
        return [...prev, ...newEntries];
      });
    }
  }, [data, page]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!matchId) return;
    const socket = getSocket();
    const deliveryEvent = WS_EVENTS.delivery(matchId);

    const handler = (eventData: any) => {
      if (eventData?.commentary) {
        setRealtimeEntries((prev) => {
          const exists = prev.some((e) => e.id === eventData.commentary.id);
          if (exists) return prev;
          return [eventData.commentary, ...prev];
        });
        // Auto-scroll to top when new entry arrives
        if (feedRef.current) {
          feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    };

    socket.on(deliveryEvent, handler);
    return () => {
      socket.off(deliveryEvent, handler);
    };
  }, [matchId]);

  // Merge realtime and fetched entries, deduplicated and sorted newest-first
  const mergedEntries = useCallback(() => {
    const map = new Map<string, Commentary>();
    for (const e of realtimeEntries) map.set(e.id, e);
    for (const e of allEntries) {
      if (!map.has(e.id)) map.set(e.id, e);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [realtimeEntries, allEntries]);

  const entries = mergedEntries();
  const hasMore = data?.hasMore ?? false;

  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 items-start">
            <div
              className="w-10 h-5 rounded-md shrink-0"
              style={{
                background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border-subtle) 50%, var(--bg-hover) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
            <div className="flex-1 space-y-1.5">
              <div
                className="h-3 rounded-lg w-full"
                style={{
                  background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.1 + 0.05}s`,
                }}
              />
              <div
                className="h-3 rounded-lg w-2/3"
                style={{
                  background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--bg-hover) 50%, var(--border-subtle) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.1 + 0.1}s`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-12 h-12 rounded-xl skeleton-subtle flex items-center justify-center mb-1"
        >
          <MessageSquare size={20} className="text-theme-muted" />
        </motion.div>
        <p className="text-theme-tertiary text-sm">No commentary yet</p>
        <p className="text-theme-muted text-xs">Commentary will appear as the match progresses</p>
      </div>
    );
  }

  return (
    <div ref={feedRef} className="max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
      <motion.div
        variants={reduceMotion ? undefined : containerVariants}
        initial={reduceMotion ? undefined : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
        className="space-y-1"
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              variants={reduceMotion ? undefined : entryVariants}
              initial={reduceMotion ? undefined : 'hidden'}
              animate={reduceMotion ? undefined : 'visible'}
              layout={!reduceMotion}
              className="flex gap-3 items-start py-2.5 px-3 rounded-xl transition-colors hover:bg-[var(--bg-hover)]"
            >
              {/* Over.ball badge */}
              <span
                className="text-[11px] font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded-md mt-0.5"
                style={{
                  background: entry.dramaLevel >= 3
                    ? 'rgba(234, 179, 8, 0.1)'
                    : entry.dramaLevel >= 2
                    ? 'rgba(22, 163, 74, 0.08)'
                    : 'var(--bg-hover)',
                  color: dramaColor(entry.dramaLevel),
                }}
              >
                {entry.overBall}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-theme-secondary leading-relaxed">{entry.text}</p>
                {entry.milestone && (
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-gold/10 text-cricket-gold">
                    {entry.milestone.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-[9px] text-theme-muted tabular-nums shrink-0 mt-1">
                {formatTimestamp(entry.publishedAt)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <motion.button
            onClick={() => setPage((p) => p + 1)}
            disabled={isFetching}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
              surface-interactive transition-colors disabled:opacity-40"
          >
            {isFetching ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading...
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                Load more
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}
