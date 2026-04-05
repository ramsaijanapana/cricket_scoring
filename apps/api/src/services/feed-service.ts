import { Queue } from 'bullmq';
import { db } from '../db/index';
import { activity } from '../db/schema/activity';

import { env } from '../config';

const REDIS_URL = env.REDIS_URL;

const feedQueue = new Queue('feed-fanout', {
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
 * Create an activity record and enqueue fan-out to followers' feeds.
 */
export async function publishActivity(
  userId: string,
  activityType: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  const [record] = await db.insert(activity).values({
    userId,
    activityType,
    entityType,
    entityId,
    metadata,
    isPublic: true,
  }).returning();

  await feedQueue.add('fanout', {
    activityId: record.id,
    userId,
  });

  return record;
}
