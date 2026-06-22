import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessageSquare, ChevronDown, ArrowUp, Languages } from 'lucide-react';
import type { Commentary } from '@cricket/shared';
import { api } from '../lib/api';
import { ReactionBar } from './ReactionBar';
import { getSocket, WS_EVENTS } from '../lib/socket';
import { patchCommentaryCache } from '../lib/match-cache';
import {
  COMMENTARY_PHASES,
  filterByPhase,
  mergeCommentaryEntries,
  isValidPhaseParam,
  isValidLangParam,
  type CommentaryPhase,
} from '../lib/commentary-utils';

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
  if (level >= 2) return 'var(--color-green)';
  return 'var(--text-tertiary, #71717a)';
}

const SCROLL_PIN_THRESHOLD = 48;

export function CommentaryFeed({ matchId }: CommentaryFeedProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;
  const feedRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [allEntries, setAllEntries] = useState<Commentary[]>([]);
  const [isPinnedToTop, setIsPinnedToTop] = useState(true);
  const [hasNewWhileScrolled, setHasNewWhileScrolled] = useState(false);

  const phaseParam = searchParams.get('phase');
  const langParam = searchParams.get('lang');
  const activePhase: CommentaryPhase | 'all' = isValidPhaseParam(phaseParam) ? phaseParam : 'all';
  const activeLang: 'en' | 'hi' = isValidLangParam(langParam) ? langParam : 'en';

  const setPhaseFilter = useCallback((phase: CommentaryPhase | 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (phase === 'all') next.delete('phase');
      else next.set('phase', phase);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleLanguage = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const nextLang = activeLang === 'en' ? 'hi' : 'en';
      if (nextLang === 'en') next.delete('lang');
      else next.set('lang', nextLang);
      return next;
    }, { replace: true });
    setPage(1);
    setAllEntries([]);
  }, [activeLang, setSearchParams]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['commentary', matchId, page, activeLang],
    queryFn: () => api.getCommentary(matchId, page, { lang: activeLang }),
    enabled: !!matchId,
  });

  useEffect(() => {
    setPage(1);
    setAllEntries([]);
  }, [matchId, activeLang]);

  useEffect(() => {
    if (data?.data) {
      setAllEntries((prev) => {
        if (page === 1) return mergeCommentaryEntries(data.data, prev);
        return mergeCommentaryEntries(prev, data.data);
      });
    }
  }, [data, page]);

  useEffect(() => {
    if (!matchId) return;
    const socket = getSocket();
    const deliveryEvent = WS_EVENTS.delivery(matchId);

    const handler = (eventData: { commentary?: Commentary }) => {
      if (!eventData?.commentary) return;
      if (activeLang !== 'en' && eventData.commentary.language !== activeLang) return;

      const added = patchCommentaryCache(queryClient, matchId, eventData.commentary, activeLang);
      setAllEntries((prev) => mergeCommentaryEntries([eventData.commentary], prev));

      if (added) {
        if (isPinnedToTop && feedRef.current) {
          feedRef.current.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else {
          setHasNewWhileScrolled(true);
        }
      }
    };

    socket.on(deliveryEvent, handler);
    return () => {
      socket.off(deliveryEvent, handler);
    };
  }, [matchId, activeLang, isPinnedToTop, reduceMotion, queryClient]);

  const handleScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    const pinned = el.scrollTop <= SCROLL_PIN_THRESHOLD;
    setIsPinnedToTop(pinned);
    if (pinned) setHasNewWhileScrolled(false);
  }, []);

  const scrollToLatest = useCallback(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    setIsPinnedToTop(true);
    setHasNewWhileScrolled(false);
  }, [reduceMotion]);

  const entries = useMemo(
    () => filterByPhase(
      [...allEntries].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      ),
      activePhase,
    ),
    [allEntries, activePhase],
  );

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {COMMENTARY_PHASES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPhaseFilter(value)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                activePhase === value
                  ? 'bg-cricket-green/15 text-cricket-green'
                  : 'surface-interactive text-theme-muted hover:text-theme-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleLanguage}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
            activeLang === 'hi'
              ? 'bg-cricket-gold/15 text-cricket-gold'
              : 'surface-interactive text-theme-muted hover:text-theme-secondary'
          }`}
          title={activeLang === 'hi' ? 'Switch to English' : 'Switch to Hindi'}
        >
          <Languages size={11} />
          {activeLang === 'hi' ? 'हिंदी' : 'EN'}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-12 h-12 rounded-xl skeleton-subtle flex items-center justify-center mb-1"
          >
            <MessageSquare size={20} className="text-theme-muted" />
          </motion.div>
          <p className="text-theme-tertiary text-sm">
            {activePhase !== 'all' ? `No ${activePhase} overs commentary yet` : 'No commentary yet'}
          </p>
          <p className="text-theme-muted text-xs">Commentary will appear as the match progresses</p>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={feedRef}
            onScroll={handleScroll}
            className="max-h-[480px] overflow-y-auto scrollbar-thin pr-1"
          >
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
                    <span
                      className="text-[11px] font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded-md mt-0.5"
                      style={{
                        background: entry.dramaLevel >= 3
                          ? 'rgba(234, 179, 8, 0.1)'
                          : entry.dramaLevel >= 2
                          ? 'color-mix(in srgb, var(--color-green) 8%, transparent)'
                          : 'var(--bg-hover)',
                        color: dramaColor(entry.dramaLevel),
                      }}
                    >
                      {entry.overBall}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-theme-secondary leading-relaxed">{entry.text}</p>
                      {entry.milestone && (
                        <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cricket-gold/10 text-cricket-gold">
                          {entry.milestone.replace(/_/g, ' ')}
                        </span>
                      )}
                      {entry.deliveryId && (
                        <div className="mt-2">
                          <ReactionBar matchId={matchId} deliveryId={entry.deliveryId} />
                        </div>
                      )}
                    </div>

                    <span className="text-[9px] text-theme-muted tabular-nums shrink-0 mt-1">
                      {formatTimestamp(entry.publishedAt)}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

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

          <AnimatePresence>
            {hasNewWhileScrolled && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={scrollToLatest}
                className="absolute top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5
                  px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg
                  bg-cricket-green text-white hover:bg-cricket-green/90 transition-colors"
              >
                <ArrowUp size={12} />
                New commentary
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
