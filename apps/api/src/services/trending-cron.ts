import cron, { type ScheduledTask } from 'node-cron';
import { computeTrending } from './trending-service';

let task: ScheduledTask | null = null;

/**
 * Start the trending computation cron job.
 * Runs computeTrending() every hour at minute 0.
 */
export function startTrendingCron(): void {
  if (task) return; // already started

  task = cron.schedule('0 * * * *', async () => {
    try {
      console.log('[trending-cron] Computing trending snapshots...');
      await computeTrending();
      console.log('[trending-cron] Done.');
    } catch (err) {
      console.error('[trending-cron] Error computing trending:', err);
    }
  });

  console.log('[trending-cron] Scheduled trending computation every hour.');
}
