import { Worker, type Job } from 'bullmq';
import { db } from '../db/index';
import { notification } from '../db/schema/notification';
import { sendPushNotification } from '../services/push-service';
import { getFollowerIdsForTeams, type ScoringFanoutJob } from '../services/notification-service';
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

async function deliverNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const [record] = await db.insert(notification).values({
    userId,
    type,
    title,
    body,
    data,
  }).returning();

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
    console.warn(`Push notification failed for user ${userId}:`, err);
  }
}

async function processScoringFanout(job: Job<ScoringFanoutJob>): Promise<void> {
  const { matchId, teamIds, notifications: payloads } = job.data;

  const followerIds = await getFollowerIdsForTeams(teamIds);
  if (followerIds.length === 0) return;

  for (const payload of payloads) {
    for (const userId of followerIds) {
      await deliverNotification(userId, payload.type, payload.title, payload.body, {
        matchId,
        ...payload.data,
      });
    }
  }

  console.log(
    `Scoring fan-out: match ${matchId} — ${payloads.length} event(s) to ${followerIds.length} follower(s)`,
  );
}

/**
 * Notification worker: inserts notification records into the DB and sends push via FCM.
 */
export function createNotificationWorker(): Worker {
  const worker = new Worker<NotificationJob | ScoringFanoutJob>(
    'notifications',
    async (job: Job<NotificationJob | ScoringFanoutJob>) => {
      if (job.name === 'scoring-fanout') {
        await processScoringFanout(job as Job<ScoringFanoutJob>);
        return;
      }

      const { userId, type, title, body, data } = job.data as NotificationJob;
      await deliverNotification(userId, type, title, body, data);
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
