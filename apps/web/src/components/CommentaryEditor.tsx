import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Check, X } from 'lucide-react';
import type { Commentary } from '@cricket/shared';
import { api } from '../lib/api';

interface CommentaryEditorProps {
  matchId: string;
  /** The latest commentary entry for the most recent delivery */
  commentary: Commentary | null;
  /** Called externally when the next delivery is submitted to auto-close the editor */
  deliveryVersion: number;
}

export function CommentaryEditor({ matchId, commentary, deliveryVersion }: CommentaryEditorProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = !!prefersReducedMotion;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-close editor when new delivery arrives
  useEffect(() => {
    setIsEditing(false);
  }, [deliveryVersion]);

  // Update edit text when commentary changes
  useEffect(() => {
    if (commentary) {
      setEditText(commentary.text);
    }
  }, [commentary?.id]);

  const mutation = useMutation({
    mutationFn: (text: string) => {
      if (!commentary) throw new Error('No commentary to update');
      return api.updateCommentary(matchId, commentary.id, { text });
    },
    onSuccess: () => {
      setIsEditing(false);
    },
  });

  const startEditing = () => {
    setIsEditing(true);
    setEditText(commentary?.text || '');
    // Focus the textarea after render
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText(commentary?.text || '');
  };

  const saveEdit = () => {
    if (editText.trim() && editText !== commentary?.text) {
      mutation.mutate(editText.trim());
    } else {
      setIsEditing(false);
    }
  };

  if (!commentary) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={commentary.id}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="rounded-xl p-3 mt-1"
        style={{ background: 'var(--bg-hover)' }}
      >
        {!isEditing ? (
          /* Display mode */
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(22, 163, 74, 0.08)', color: 'var(--color-green, #16a34a)' }}
                >
                  {commentary.overBall}
                </span>
                <span className="text-[9px] text-theme-muted uppercase tracking-widest font-semibold">
                  Commentary
                </span>
              </div>
              <p className="text-xs text-theme-secondary leading-relaxed">
                {mutation.isSuccess && mutation.data ? (mutation.data as Commentary).text : commentary.text}
              </p>
            </div>
            <motion.button
              onClick={startEditing}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              className="w-6 h-6 min-w-0 min-h-0 rounded-md flex items-center justify-center
                text-theme-muted hover:text-theme-primary hover:bg-[var(--bg-card)]
                transition-colors shrink-0"
              aria-label="Edit commentary"
              title="Edit commentary"
            >
              <Pencil size={11} />
            </motion.button>
          </div>
        ) : (
          /* Edit mode */
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(234, 179, 8, 0.1)', color: 'var(--color-gold, #eab308)' }}
              >
                {commentary.overBall}
              </span>
              <span className="text-[9px] text-cricket-gold uppercase tracking-widest font-semibold">
                Editing
              </span>
            </div>
            <textarea
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === 'Escape') cancelEdit();
              }}
              rows={2}
              className="w-full text-xs text-theme-primary bg-[var(--bg-card)] border border-[var(--border-medium)]
                rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-cricket-green/40
                transition-colors placeholder:text-theme-muted"
              placeholder="Enter commentary..."
            />
            <div className="flex items-center justify-end gap-1.5">
              {mutation.isError && (
                <span className="text-[10px] text-cricket-red mr-auto">Save failed</span>
              )}
              <motion.button
                onClick={cancelEdit}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="w-7 h-7 min-w-0 min-h-0 rounded-lg flex items-center justify-center
                  text-theme-muted hover:text-theme-primary hover:bg-[var(--bg-card)]
                  transition-colors"
                aria-label="Cancel edit"
              >
                <X size={13} />
              </motion.button>
              <motion.button
                onClick={saveEdit}
                disabled={mutation.isPending}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="w-7 h-7 min-w-0 min-h-0 rounded-lg flex items-center justify-center
                  bg-cricket-green/15 text-cricket-green hover:bg-cricket-green/25
                  transition-colors disabled:opacity-40"
                aria-label="Save commentary"
              >
                {mutation.isPending ? (
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Check size={13} />
                )}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
