import { Worker, type Job } from 'bullmq';
import { db } from '../db/index';
import { follow } from '../db/schema/follow';
import { feedItem } from '../db/schema/activity';
import { eq } from 'drizzle-orm';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface FeedFanoutJob {
  activityId: string;
  userId: string;
}

/**
 * Fan-out worker: when an activity is created, insert feed_item records
 * for every follower of the activity's author.
 */
export function createFeedWorker(): Worker {
  const worker = new Worker<FeedFanoutJob>(
    'feed-fanout',
    async (job: Job<FeedFanoutJob>) => {
      const { activityId, userId } = job.data;

      // Find all followers of the user who created the activity
      const followers = await db
        .select({ followerId: follow.followerId })
        .from(follow)
        .where(eq(follow.followingId, userId));

      if (followers.length === 0) return;

      // Batch insert feed items for each follower
      const values = followers.map((f) => ({
        userId: f.followerId,
        activityId,
      }));

      await db.insert(feedItem).values(values);

      console.log(`Feed fan-out: delivered activity ${activityId} to ${followers.length} followers`);
    },
    {
      connection: { url: REDIS_URL },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Feed fan-out job ${job?.id} failed:`, err.message);
  });

  return worker;
}
