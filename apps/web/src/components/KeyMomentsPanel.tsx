import { motion } from 'framer-motion';
import { Sparkles, Trophy, History, CircleDot } from 'lucide-react';
import type { KeyMoment } from '../lib/keyMoments';

const CATEGORY_STYLES: Record<
  KeyMoment['category'],
  { icon: typeof Sparkles; color: string; bg: string }
> = {
  milestone: { icon: Trophy, color: 'text-cricket-gold', bg: 'rgba(234, 179, 8, 0.08)' },
  wicket: { icon: CircleDot, color: 'text-cricket-red', bg: 'rgba(239, 68, 68, 0.08)' },
  audit: { icon: History, color: 'text-blue-400', bg: 'rgba(59, 130, 246, 0.08)' },
  partnership: { icon: Sparkles, color: 'text-cricket-green', bg: 'rgba(22, 163, 74, 0.08)' },
};

interface KeyMomentsPanelProps {
  moments: KeyMoment[];
}

export function KeyMomentsPanel({ moments }: KeyMomentsPanelProps) {
  if (moments.length === 0) return null;

  return (
    <div className="card mb-6 relative overflow-hidden gradient-strip-top">
      <div className="flex items-center gap-2 mb-4 pb-3 divider">
        <Sparkles size={14} className="text-cricket-gold" />
        <span className="text-sm font-bold text-theme-primary">Key Moments</span>
        <span className="text-[10px] font-semibold text-theme-muted uppercase tracking-widest ml-auto">
          Auto-generated
        </span>
      </div>

      <ol className="space-y-2">
        {moments.map((moment, idx) => {
          const style = CATEGORY_STYLES[moment.category];
          const Icon = style.icon;

          return (
            <motion.li
              key={moment.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{ background: style.bg }}
            >
              <Icon size={14} className={`${style.color} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${style.color}`}>{moment.label}</span>
                  {moment.inningsNum != null && (
                    <span className="text-[10px] font-semibold text-theme-muted uppercase tracking-wide">
                      Inn {moment.inningsNum}
                    </span>
                  )}
                </div>
                {moment.detail && (
                  <p className="text-xs text-theme-secondary mt-0.5 truncate">{moment.detail}</p>
                )}
              </div>
              {moment.timestamp && (
                <span className="text-[10px] text-theme-muted whitespace-nowrap tabular-nums shrink-0">
                  {formatTime(moment.timestamp)}
                </span>
              )}
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
