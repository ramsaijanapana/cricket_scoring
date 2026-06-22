import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

const REACTIONS = [
  { emoji: '\uD83D\uDD25', label: 'Fire' },
  { emoji: '\uD83C\uDFAF', label: 'Bullseye' },
  { emoji: '\uD83D\uDC4F', label: 'Clap' },
  { emoji: '\uD83D\uDE31', label: 'Shocked' },
  { emoji: '\uD83D\uDCAA', label: 'Strong' },
];

const REACTED_STORAGE_KEY = 'cricket_reactions';
const REACTION_COOLDOWN_MS = 2000;

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
}

type ReactionCounts = Record<string, number>;

let floatIdCounter = 0;

function getStoredReaction(deliveryId: string): string | null {
  try {
    const raw = localStorage.getItem(REACTED_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[deliveryId] ?? null;
  } catch {
    return null;
  }
}

function storeReaction(deliveryId: string, emoji: string): void {
  try {
    const raw = localStorage.getItem(REACTED_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[deliveryId] = emoji;
    localStorage.setItem(REACTED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota / parse errors
  }
}

export function ReactionBar({
  matchId,
  deliveryId,
}: {
  matchId: string;
  deliveryId?: string;
}) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [reacted, setReacted] = useState<string | null>(null);
  const [counts, setCounts] = useState<ReactionCounts>({});
  const [cooldownMs, setCooldownMs] = useState(0);
  const lastReactionAt = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deliveryId) return;

    const stored = getStoredReaction(deliveryId);
    if (stored) setReacted(stored);

    let cancelled = false;

    const loadCounts = async () => {
      try {
        const { data } = await api.getReactions(matchId, deliveryId);
        if (cancelled) return;

        const next: ReactionCounts = {};
        for (const row of data) {
          next[row.emoji] = (next[row.emoji] ?? 0) + row.count;
        }
        setCounts(next);
      } catch {
        // Non-blocking: counts are optional UI polish
      }
    };

    void loadCounts();

    return () => {
      cancelled = true;
    };
  }, [matchId, deliveryId]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldownTicker = () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);

    const tick = () => {
      const remaining = Math.max(0, REACTION_COOLDOWN_MS - (Date.now() - lastReactionAt.current));
      setCooldownMs(remaining);
      if (remaining <= 0 && cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    };

    tick();
    cooldownTimer.current = setInterval(tick, 100);
  };

  const mutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) =>
      api.submitReaction(matchId, { deliveryId: deliveryId!, emoji }),
    onSuccess: (_data, vars) => {
      if (!deliveryId) return;
      setReacted(vars.emoji);
      storeReaction(deliveryId, vars.emoji);
      setCounts((prev) => ({
        ...prev,
        [vars.emoji]: (prev[vars.emoji] ?? 0) + 1,
      }));
    },
    onError: (error: unknown) => {
      if (!deliveryId) return;
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        const stored = getStoredReaction(deliveryId);
        if (stored) setReacted(stored);
      }
    },
  });

  const handleReaction = (emoji: string) => {
    if (!deliveryId || reacted || mutation.isPending) return;

    const now = Date.now();
    if (now - lastReactionAt.current < REACTION_COOLDOWN_MS) return;

    lastReactionAt.current = now;
    startCooldownTicker();

    const id = ++floatIdCounter;
    const x = Math.random() * 60 - 30;
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 1200);

    mutation.mutate({ emoji });
  };

  const onCooldown = cooldownMs > 0;
  const disabled = !deliveryId || !!reacted || mutation.isPending || onCooldown;

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        {REACTIONS.map(({ emoji, label }) => {
          const count = counts[emoji] ?? 0;
          return (
            <motion.button
              key={emoji}
              whileHover={disabled ? undefined : { scale: 1.2 }}
              whileTap={disabled ? undefined : { scale: 0.85 }}
              onClick={() => handleReaction(emoji)}
              disabled={disabled}
              className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all ${
                reacted === emoji
                  ? 'bg-cricket-green/15 ring-2 ring-cricket-green/30'
                  : reacted
                  ? 'opacity-40 cursor-not-allowed'
                  : onCooldown
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[var(--bg-hover)]'
              } ${!deliveryId ? 'opacity-30 cursor-not-allowed' : ''}`}
              title={
                onCooldown
                  ? `Wait ${Math.ceil(cooldownMs / 1000)}s`
                  : label
              }
              aria-label={`React with ${label}`}
            >
              {emoji}
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-cricket-green text-white text-[9px] font-bold leading-[14px] text-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {floatingEmojis.map(({ id, emoji, x }) => (
          <motion.span
            key={id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            animate={{ opacity: 0, y: -60, x, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 text-xl pointer-events-none"
          >
            {emoji}
          </motion.span>
        ))}
      </AnimatePresence>

      {onCooldown && !reacted && (
        <p className="text-[10px] text-theme-muted mt-1">
          Slow down — wait {Math.ceil(cooldownMs / 1000)}s
        </p>
      )}

      {mutation.isError && (
        <p className="text-[10px] text-cricket-red mt-1">
          {(mutation.error as Error)?.message || 'Reaction failed'}
        </p>
      )}
    </div>
  );
}
