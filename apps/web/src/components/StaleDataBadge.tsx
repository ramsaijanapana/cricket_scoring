import { Clock } from 'lucide-react';

function formatCachedAge(cachedAt: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - cachedAt) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function StaleDataBadge({ cachedAt }: { cachedAt: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: 'rgba(234, 179, 8, 0.12)', color: 'var(--color-gold, #eab308)' }}
      role="status"
      aria-live="polite"
    >
      <Clock size={10} aria-hidden />
      Cached {formatCachedAge(cachedAt)}
    </span>
  );
}
