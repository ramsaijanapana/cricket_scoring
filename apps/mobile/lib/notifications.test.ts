import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetNotificationHandler = vi.fn();
const mockSetNotificationCategoryAsync = vi.fn();
const mockGetPermissionsAsync = vi.fn();
const mockRequestPermissionsAsync = vi.fn();
const mockSetNotificationChannelAsync = vi.fn();
const mockGetExpoPushTokenAsync = vi.fn();
const mockAddNotificationReceivedListener = vi.fn();
const mockAddNotificationResponseReceivedListener = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  setNotificationCategoryAsync: (...args: unknown[]) => mockSetNotificationCategoryAsync(...args),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  addNotificationReceivedListener: (...args: unknown[]) =>
    mockAddNotificationReceivedListener(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { MAX: 5, HIGH: 4 },
}));

vi.mock('expo-device', () => ({
  isDevice: true,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: { eas: { projectId: 'proj-123' } },
    },
  },
}));

vi.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

vi.mock('./storage', () => ({
  storage: {
    getToken: vi.fn().mockResolvedValue(null),
  },
}));

const mockRegisterDeviceToken = vi.fn();

vi.mock('./api', () => ({
  api: {
    registerDeviceToken: (...args: unknown[]) => mockRegisterDeviceToken(...args),
  },
}));

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { storage } from './storage';

describe('setupNotificationCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers wicket, milestone, and match_complete categories', async () => {
    const { setupNotificationCategories } = await import('./notifications');

    await setupNotificationCategories();

    expect(mockSetNotificationCategoryAsync).toHaveBeenCalledWith(
      'wicket',
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'view_scorecard' }),
      ]),
    );
    expect(mockSetNotificationCategoryAsync).toHaveBeenCalledWith(
      'milestone',
      expect.any(Array),
    );
    expect(mockSetNotificationCategoryAsync).toHaveBeenCalledWith(
      'match_complete',
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'dismiss' }),
      ]),
    );
  });
});

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Device).isDevice = true;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  });

  it('returns null on simulators', async () => {
    vi.mocked(Device).isDevice = false;
    const { registerForPushNotifications } = await import('./notifications');

    await expect(registerForPushNotifications()).resolves.toBeNull();
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns null when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const { registerForPushNotifications } = await import('./notifications');

    await expect(registerForPushNotifications()).resolves.toBeNull();
  });

  it('returns expo push token when permission is granted', async () => {
    const { registerForPushNotifications } = await import('./notifications');

    await expect(registerForPushNotifications()).resolves.toBe('ExponentPushToken[abc]');
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-123' });
  });

  it('creates android channels when running on android', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const { registerForPushNotifications } = await import('./notifications');

    await registerForPushNotifications();

    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ name: 'Default' }),
    );
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      'match_events',
      expect.objectContaining({ name: 'Match Events' }),
    );
  });
});

describe('registerPushTokenIfAuthed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Device).isDevice = true;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
    vi.mocked(storage.getToken).mockResolvedValue(null);
    mockRegisterDeviceToken.mockResolvedValue(undefined);
  });

  it('skips registration when user is not authenticated', async () => {
    const { registerPushTokenIfAuthed } = await import('./notifications');

    await registerPushTokenIfAuthed();

    expect(mockRegisterDeviceToken).not.toHaveBeenCalled();
  });

  it('registers device token with API when authed and token available', async () => {
    vi.mocked(storage.getToken).mockResolvedValue('auth-token');
    const { registerPushTokenIfAuthed } = await import('./notifications');

    await registerPushTokenIfAuthed();

    expect(mockRegisterDeviceToken).toHaveBeenCalledWith('ExponentPushToken[xyz]', 'ios');
  });

  it('swallows API registration errors', async () => {
    vi.mocked(storage.getToken).mockResolvedValue('auth-token');
    mockRegisterDeviceToken.mockRejectedValue(new Error('server unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { registerPushTokenIfAuthed } = await import('./notifications');

    await expect(registerPushTokenIfAuthed()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[notifications] Failed to register token with server:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

describe('setupNotificationListeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddNotificationReceivedListener.mockReturnValue({ remove: vi.fn() });
    mockAddNotificationResponseReceivedListener.mockImplementation(() => ({ remove: vi.fn() }));
  });

  it('returns cleanup that removes subscriptions', async () => {
    const receivedRemove = vi.fn();
    const responseRemove = vi.fn();
    mockAddNotificationReceivedListener.mockReturnValue({ remove: receivedRemove });
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: responseRemove });

    const { setupNotificationListeners } = await import('./notifications');
    const cleanup = setupNotificationListeners();

    cleanup();

    expect(receivedRemove).toHaveBeenCalled();
    expect(responseRemove).toHaveBeenCalled();
  });

  it('navigates to scorecard when user taps a match notification', async () => {
    let responseHandler: ((response: unknown) => void) | undefined;
    mockAddNotificationResponseReceivedListener.mockImplementation((handler) => {
      responseHandler = handler;
      return { remove: vi.fn() };
    });

    const { setupNotificationListeners } = await import('./notifications');
    setupNotificationListeners();

    responseHandler?.({
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: {
          content: {
            data: { matchId: 'match-77' },
          },
        },
      },
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/matches/match-77/scorecard');
  });
});

describe('initNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddNotificationReceivedListener.mockReturnValue({ remove: vi.fn() });
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: vi.fn() });
  });

  it('sets up categories and listeners', async () => {
    const { initNotifications } = await import('./notifications');

    await initNotifications();

    expect(mockSetNotificationCategoryAsync).toHaveBeenCalled();
    expect(mockAddNotificationReceivedListener).toHaveBeenCalled();
    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalled();
  });
});
