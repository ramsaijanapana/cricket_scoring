import { db } from '../db/index';
import { achievement, userAchievement, activity, follow } from '../db/schema/index';
import { eq, and, count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface AchievementEvent {
  type: 'match_completed' | 'innings_ended' | 'delivery' | 'follow';
  matchId?: string;
  inningsId?: string;
  runsScored?: number;
  wicketsTaken?: number;
}

interface AchievementRule {
  slug: string;
  check: (userId: string, event: AchievementEvent) => Promise<boolean>;
}

const rules: AchievementRule[] = [
  {
    slug: 'first-match',
    async check(userId, event) {
      if (event.type !== 'match_completed') return false;
      // Check if user has participated in at least 1 completed match
      // Simply grant on first match_completed event they trigger
      return true;
    },
  },
  {
    slug: 'century',
    async check(_userId, event) {
      if (event.type !== 'innings_ended') return false;
      return (event.runsScored ?? 0) >= 100;
    },
  },
  {
    slug: 'five-wickets',
    async check(_userId, event) {
      if (event.type !== 'innings_ended') return false;
      return (event.wicketsTaken ?? 0) >= 5;
    },
  },
  {
    slug: 'hat-trick',
    async check(_userId, event) {
      // Placeholder: would need to check 3 consecutive wickets by same bowler
      // For now, this is triggered externally when detected
      if (event.type !== 'delivery') return false;
      return false; // placeholder — real detection requires delivery sequence analysis
    },
  },
  {
    slug: 'social-butterfly',
    async check(userId, event) {
      if (event.type !== 'follow') return false;
      const [result] = await db
        .select({ cnt: count() })
        .from(follow)
        .where(eq(follow.followerId, userId));
      return (result?.cnt ?? 0) >= 10;
    },
  },
];

/**
 * Check all achievement rules for the given user and event.
 * If an achievement is earned, inserts into user_achievement and activity tables.
 */
export async function checkAchievements(
  userId: string,
  event: AchievementEvent,
): Promise<void> {
  for (const rule of rules) {
    try {
      const passed = await rule.check(userId, event);
      if (!passed) continue;

      // Look up the achievement definition by slug
      const [ach] = await db
        .select()
        .from(achievement)
        .where(eq(achievement.slug, rule.slug))
        .limit(1);
      if (!ach) continue;

      // Check if already earned
      const [existing] = await db
        .select()
        .from(userAchievement)
        .where(
          and(
            eq(userAchievement.userId, userId),
            eq(userAchievement.achievementId, ach.id),
          ),
        )
        .limit(1);
      if (existing) continue;

      // Award the achievement
      await db.insert(userAchievement).values({
        userId,
        achievementId: ach.id,
        matchId: event.matchId ?? null,
        metadata: { event: event.type },
      });

      // Create activity for the feed
      await db.insert(activity).values({
        userId,
        activityType: 'achievement_earned',
        entityType: 'achievement',
        entityId: ach.id,
        metadata: { slug: rule.slug, name: ach.name },
        isPublic: true,
      });
    } catch (err) {
      // Log but don't fail — achievement checks shouldn't break main flows
      console.error(`[achievement] Error checking ${rule.slug} for user ${userId}:`, err);
    }
  }
}
