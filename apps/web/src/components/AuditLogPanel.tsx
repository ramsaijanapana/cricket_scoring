import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { History, Undo2, Edit3, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface AuditEntry {
  id: string;
  userId?: string;
  matchId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

const ACTION_ICONS: Record<string, typeof Undo2> = {
  delivery_undone: Undo2,
  delivery_corrected: Edit3,
  delivery_recorded: History,
  match_status_changed: AlertCircle,
};

const ACTION_LABELS: Record<string, string> = {
  delivery_undone: 'Ball Undone',
  delivery_corrected: 'Ball Corrected',
  delivery_recorded: 'Ball Recorded',
  match_status_changed: 'Status Changed',
};

const ACTION_COLORS: Record<string, string> = {
  delivery_undone: 'text-cricket-gold',
  delivery_corrected: 'text-blue-400',
  delivery_recorded: 'text-cricket-green',
  match_status_changed: 'text-purple-400',
};

export function AuditLogPanel({ matchId }: { matchId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-log', matchId],
    queryFn: () => api.getAuditLog(matchId),
    enabled: !!matchId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-14 rounded-lg animate-pulse"
            style={{ background: 'var(--bg-hover)' }}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-theme-muted text-sm">
        Failed to load audit log
      </div>
    );
  }

  const entries: AuditEntry[] = data?.data || [];

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <History size={28} className="text-theme-muted mx-auto mb-3" />
        <p className="text-theme-secondary font-semibold text-sm">No audit entries</p>
        <p className="text-theme-tertiary text-xs mt-1">
          Undo and correction history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-theme-muted uppercase tracking-widest">
            <th className="text-left py-2.5 font-semibold">Action</th>
            <th className="text-left py-2.5 font-semibold">Entity</th>
            <th className="text-left py-2.5 font-semibold">Details</th>
            <th className="text-right py-2.5 font-semibold">Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => {
            const Icon = ACTION_ICONS[entry.action] || History;
            const label = ACTION_LABELS[entry.action] || entry.action;
            const color = ACTION_COLORS[entry.action] || 'text-theme-muted';

            return (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="table-row-border"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={color} />
                    <span className={`font-semibold text-xs ${color}`}>{label}</span>
                  </div>
                </td>
                <td className="py-3 text-theme-secondary text-xs">
                  {entry.entityType}
                  {entry.entityId && (
                    <span className="text-theme-muted ml-1">
                      ({entry.entityId.slice(0, 8)}...)
                    </span>
                  )}
                </td>
                <td className="py-3 text-theme-tertiary text-xs max-w-[200px] truncate">
                  {entry.before && entry.after
                    ? summarizeChanges(entry.before, entry.after)
                    : entry.action === 'delivery_undone'
                    ? 'Delivery marked as overridden'
                    : '-'}
                </td>
                <td className="py-3 text-right text-theme-muted text-xs whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(entry.createdAt)}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function summarizeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changes: string[] = [];
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes.push(`${key}: ${before[key]} -> ${after[key]}`);
    }
  }
  return changes.length > 0 ? changes.slice(0, 2).join(', ') : 'No visible changes';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}
