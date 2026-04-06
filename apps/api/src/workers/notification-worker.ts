import { Worker, type Job } from 'bullmq';
import { db } from '../db/index';
import { notification } from '../db/schema/notification';
import { sendPushNotification } from '../services/push-service';
import { socialBroadcast } from '../services/realtime';
import { eq } from 'drizzle-orm';

import { env } from '../config';

const REDIS_URL = env.REDIS_URL;

interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Notification worker: inserts notification records into the DB and sends push via FCM.
 */
export function createNotificationWorker(): Worker {
  const worker = new Worker<NotificationJob>(
    'notifications',
    async (job: Job<NotificationJob>) => {
      const { userId, type, title, body, data } = job.data;

      // 1. Persist notification to DB
      const [record] = await db.insert(notification).values({
        userId,
        type,
        title,
        body,
        data,
      }).returning();

      // 2. Broadcast via WebSocket for real-time in-app notification
      try {
        socialBroadcast.notification(userId, {
          id: record.id,
          type,
          title,
          body,
          data,
          read: false,
          createdAt: record.createdAt.toISOString(),
        });
      } catch {
        // Non-critical — notification is persisted even if broadcast fails
      }

      // 3. Send push notification via FCM
      try {
        const stringData = data
          ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
          : undefined;
        const result = await sendPushNotification(userId, title, body, stringData);

        if (result.sent > 0) {
          await db
            .update(notification)
            .set({ pushSent: true })
            .where(eq(notification.id, record.id));
        }

        console.log(
          `Notification created for user ${userId}: [${type}] ${title} (push: ${result.sent} sent, ${result.failed} failed)`,
        );
      } catch (err) {
        // Push failure is non-fatal — notification is still in DB
        console.warn(`Push notification failed for user ${userId}:`, err);
      }
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
