import { Queue } from 'bullmq';

import { env } from '../config';

const REDIS_URL = env.REDIS_URL;

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
