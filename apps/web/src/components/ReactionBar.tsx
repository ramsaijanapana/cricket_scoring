import { useState } from 'react';
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

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
}

let floatIdCounter = 0;

export function ReactionBar({
  matchId,
  deliveryId,
}: {
  matchId: string;
  deliveryId?: string;
}) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [reacted, setReacted] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) =>
      api.submitReaction(matchId, { deliveryId: deliveryId!, emoji }),
    onSuccess: (_data, vars) => {
      setReacted(vars.emoji);
    },
  });

  const handleReaction = (emoji: string) => {
    if (!deliveryId || reacted) return;

    // Spawn floating animation
    const id = ++floatIdCounter;
    const x = Math.random() * 60 - 30;
    setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 1200);

    mutation.mutate({ emoji });
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        {REACTIONS.map(({ emoji, label }) => (
          <motion.button
            key={emoji}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => handleReaction(emoji)}
            disabled={!deliveryId || !!reacted}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all ${
              reacted === emoji
                ? 'bg-cricket-green/15 ring-2 ring-cricket-green/30'
                : reacted
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-[var(--bg-hover)]'
            } ${!deliveryId ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={label}
            aria-label={`React with ${label}`}
          >
            {emoji}
          </motion.button>
        ))}
      </div>

      {/* Floating emoji animations */}
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

      {mutation.isError && (
        <p className="text-[10px] text-cricket-red mt-1">
          {(mutation.error as any)?.message || 'Reaction failed'}
        </p>
      )}
    </div>
  );
}
