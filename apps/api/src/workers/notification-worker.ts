import { Worker, type Job } from 'bullmq';
import { db } from '../db/index';
import { notification } from '../db/schema/notification';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Notification worker: inserts notification records into the DB.
 * Push notification via FCM is not yet implemented (no fcmToken field on user).
 */
export function createNotificationWorker(): Worker {
  const worker = new Worker<NotificationJob>(
    'notifications',
    async (job: Job<NotificationJob>) => {
      const { userId, type, title, body, data } = job.data;

      await db.insert(notification).values({
        userId,
        type,
        title,
        body,
        data,
      });

      // TODO: Push notification via FCM when user.fcmToken field is added
      console.log(`Notification created for user ${userId}: [${type}] ${title}`);
    },
    {
      connection: { url: REDIS_URL },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  return worker;
}
