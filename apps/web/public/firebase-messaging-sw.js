/**
 * Firebase Cloud Messaging Service Worker.
 * Handles background push notifications when the app is not in focus.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'CricScore', body: event.data.text() } };
  }

  const { title, body, icon, badge, data } = payload.notification || payload;

  const options = {
    body: body || '',
    icon: icon || '/icons/icon-192.png',
    badge: badge || '/icons/badge-72.png',
    data: data || payload.data || {},
    tag: data?.matchId || 'cricscore-notification',
    renotify: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title || 'CricScore', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const matchId = event.notification.data?.matchId;
  const url = matchId ? `/matches/${matchId}/scorecard` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    }),
  );
});
