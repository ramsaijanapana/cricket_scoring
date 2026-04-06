import { db } from '../db/index';
import { deviceToken } from '../db/schema/device-token';
import { notificationPreference } from '../db/schema/notification-preference';
import { eq, and } from 'drizzle-orm';

// FCM credentials — gracefully handle missing config
let fcmAccessToken: string | null = null;
let fcmProjectId: string | null = null;

try {
  fcmProjectId = process.env.FCM_PROJECT_ID || null;
  // In production, use service account credentials to get an OAuth2 access token.
  // For now, we support a static server key or skip if not configured.
  fcmAccessToken = process.env.FCM_SERVER_KEY || null;
} catch {
  // Silently ignore — push will be disabled
}

if (!fcmProjectId || !fcmAccessToken) {
  console.warn('Push notifications: FCM credentials not configured. Push will be skipped.');
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a push notification to all registered devices for a user via FCM HTTP v1 API.
 * Gracefully skips if FCM is not configured.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  if (!fcmProjectId || !fcmAccessToken) {
    return { sent: 0, failed: 0 };
  }

  // Check user's push preference
  const pref = await db.query.notificationPreference.findFirst({
    where: eq(notificationPreference.userId, userId),
  });
  if (pref && !pref.pushEnabled) {
    return { sent: 0, failed: 0 };
  }

  const tokens = await db
    .select()
    .from(deviceToken)
    .where(eq(deviceToken.userId, userId));

  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  const url = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`;

  for (const token of tokens) {
    try {
      const message: Record<string, unknown> = {
        message: {
          token: token.token,
          notification: { title, body },
          ...(data ? { data } : {}),
          webpush: {
            notification: {
              icon: '/icons/icon-192.png',
              badge: '/icons/badge-72.png',
            },
          },
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fcmAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (res.ok) {
        sent++;
      } else {
        const errBody = await res.text();
        console.warn(`FCM push failed for token ${token.id}: ${res.status} ${errBody}`);
        failed++;

        // Remove invalid tokens (404 or 410 = token expired/unregistered)
        if (res.status === 404 || res.status === 410) {
          await db.delete(deviceToken).where(eq(deviceToken.id, token.id));
        }
      }
    } catch (err) {
      console.warn(`FCM push error for token ${token.id}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Register a device token for push notifications.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  // Upsert — if token already exists for this user, update timestamp
  const existing = await db
    .select()
    .from(deviceToken)
    .where(and(eq(deviceToken.userId, userId), eq(deviceToken.token, token)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(deviceToken)
      .set({ updatedAt: new Date(), platform })
      .where(eq(deviceToken.id, existing[0].id));
  } else {
    await db.insert(deviceToken).values({ userId, token, platform });
  }
}

/**
 * Unregister a device token.
 */
export async function unregisterDeviceToken(
  userId: string,
  token: string,
): Promise<boolean> {
  const deleted = await db
    .delete(deviceToken)
    .where(and(eq(deviceToken.userId, userId), eq(deviceToken.token, token)))
    .returning();
  return deleted.length > 0;
}
