import { Queue } from 'bullmq';
import { db } from '../db/index';
import { teamFollow } from '../db/schema/follow';
import { inArray } from 'drizzle-orm';

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

export interface ScoringNotificationPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ScoringFanoutJob {
  matchId: string;
  teamIds: string[];
  notifications: ScoringNotificationPayload[];
}

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

/**
 * Enqueue a single fan-out job for scoring events (wicket, milestone, match complete).
 * Follower lookup and per-user delivery happen in the notification worker.
 */
export async function queueScoringEventFanout(
  matchId: string,
  teamIds: string[],
  notifications: ScoringNotificationPayload[],
): Promise<void> {
  if (teamIds.length === 0 || notifications.length === 0) return;

  await notificationQueue.add('scoring-fanout', {
    matchId,
    teamIds,
    notifications,
  });
}

/**
 * Batch lookup of unique follower user IDs for the given team IDs.
 */
export async function getFollowerIdsForTeams(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];

  const followers = await db
    .select({ userId: teamFollow.userId })
    .from(teamFollow)
    .where(inArray(teamFollow.teamId, teamIds));

  return [...new Set(followers.map((f) => f.userId))];
}
