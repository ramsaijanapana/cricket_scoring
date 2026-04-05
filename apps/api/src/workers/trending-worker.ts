import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { computeTrending } from '../services/trending-service';
import { env } from '../config';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const trendingQueue = new Queue('trending', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

export const trendingWorker = new Worker('trending', async () => {
  console.log('[trending-worker] Computing trending data...');
  await computeTrending();
  console.log('[trending-worker] Trending computation complete');
}, { connection });

trendingWorker.on('failed', (job, err) => {
  console.error(`[trending-worker] Job ${job?.id} failed:`, err.message);
});

export async function startTrendingSchedule() {
  // Add a repeatable job that runs every hour
  await trendingQueue.add('compute-trending', {}, {
    repeat: { pattern: '0 * * * *' }, // every hour
  });
  console.log('[trending-worker] Hourly trending schedule started');
}
