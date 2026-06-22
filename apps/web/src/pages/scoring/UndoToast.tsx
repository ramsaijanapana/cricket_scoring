import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
  message: string;
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  reduceMotion: boolean;
}

export function UndoToast({ message, visible, onUndo, onDismiss, reduceMotion }: UndoToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-20 left-1/2 z-40 max-w-sm w-[calc(100%-2rem)]"
          style={{ x: '-50%' }}
          initial={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="glass px-4 py-3 flex items-center justify-between gap-3 rounded-xl shadow-lg">
            <span className="text-sm text-theme-secondary truncate">{message}</span>
            <button
              onClick={onUndo}
              className="text-cricket-gold text-sm font-bold shrink-0 min-w-0 min-h-0 px-2 py-1 flex items-center gap-1"
              aria-label="Undo last delivery"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
