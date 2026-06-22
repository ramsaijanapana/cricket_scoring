import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Rss, Clock, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

interface FeedItem {
  feedItemId: string;
  seen: boolean;
  activityId: string;
  activityType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  actorId: string;
  actorName: string | null;
  actorAvatar: string | null;
  createdAt: string;
}

export function FeedPage() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.getFeed(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.data.length >= lastPage.limit ? lastPage.page + 1 : undefined,
  });

  const items = data?.pages.flatMap((page) => page.data as FeedItem[]) ?? [];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityDescription = (item: FeedItem) => {
    switch (item.activityType) {
      case 'match_scored':
        return 'scored a match';
      case 'match_won':
        return 'won a match';
      case 'follow':
        return 'followed a user';
      case 'like':
        return 'liked an activity';
      case 'milestone':
        return 'achieved a milestone';
      default:
        return item.activityType.replace(/_/g, ' ');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Rss size={20} className="text-cricket-green" />
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Activity Feed</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-sm text-[var(--text-muted)]">Loading feed...</div>
        </div>
      ) : isError ? (
        <div className="card py-12 text-center">
          <p className="text-theme-muted text-sm mb-3">Failed to load feed.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-cricket-green text-white"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Rss size={40} className="mx-auto text-[var(--text-muted)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            No activity yet. Follow users or teams to see their updates here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <motion.div
                key={item.feedItemId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.2 }}
                className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-[var(--border-default)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-cricket-green/10 flex items-center justify-center text-cricket-green text-xs font-bold shrink-0">
                    {item.actorAvatar ? (
                      <img
                        src={item.actorAvatar}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      (item.actorName || '?')[0].toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)]">
                      <span className="font-semibold">{item.actorName || 'User'}</span>
                      {' '}
                      <span className="text-[var(--text-secondary)]">
                        {getActivityDescription(item)}
                      </span>
                    </p>

                    {item.entityType === 'match' && item.entityId && (
                      <Link
                        to={`/matches/${item.entityId}/scorecard`}
                        className="inline-block mt-1.5 text-xs text-cricket-green hover:underline"
                      >
                        View scorecard
                      </Link>
                    )}

                    <div className="flex items-center gap-1 mt-2 text-[10px] text-[var(--text-muted)]">
                      <Clock size={10} />
                      {formatTime(item.createdAt)}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {hasNextPage && (
            <div className="text-center py-6">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-4 py-2 text-sm font-medium text-cricket-green border border-cricket-green/30 rounded-xl hover:bg-cricket-green/5 transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
