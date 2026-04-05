import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const notificationQueue = new Queue('notifications', {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/**
 * Enqueue a notification job for background processing.
 */
export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await notificationQueue.add('notify', {
    userId,
    type,
    title,
    body,
    data,
  });
}
