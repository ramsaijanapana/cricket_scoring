import { createFeedWorker } from './feed-worker';
import { createNotificationWorker } from './notification-worker';
import { trendingWorker } from './trending-worker';

/**
 * Initialize and start all background workers.
 * Call this after the Fastify app is ready.
 */
export function startWorkers() {
  const feedWorker = createFeedWorker();
  const notificationWorker = createNotificationWorker();

  console.log('Background workers started: feed-fanout, notifications, trending');

  return { feedWorker, notificationWorker, trendingWorker };
}
