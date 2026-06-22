import { cn } from '../../lib/utils';
import { getMatchStatusConfig } from '../match-status-config';
import { withAlpha } from '../../lib/color-utils';

export interface MatchStatusPillProps {
  status: string;
  className?: string;
}

export function MatchStatusPill({ status, className }: MatchStatusPillProps) {
  const config = getMatchStatusConfig(status);
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-bold uppercase tracking-widest px-2.5 py-1 rounded-full text-[10px]', className)}
      style={{ background: config.bgColor, color: config.color, boxShadow: config.pulse ? `0 0 12px ${withAlpha(config.color, 0.2)}` : undefined }}
    >
      {config.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current inline-block animate-pulse-soft" />}
      {config.label}
    </span>
  );
}
