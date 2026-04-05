import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  AUTH_TOKEN: "@cricscore/auth_token",
  USER: "@cricscore/user",
  SETTINGS: "@cricscore/settings",
} as const;

export const storage = {
  // Auth token
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.AUTH_TOKEN);
  },

  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
  },

  async removeToken(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
  },

  // User data
  async getUser<T>(): Promise<T | null> {
    const data = await AsyncStorage.getItem(KEYS.USER);
    return data ? JSON.parse(data) : null;
  },

  async setUser(user: unknown): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  },

  async removeUser(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.USER);
  },

  // Settings
  async getSetting<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(`${KEYS.SETTINGS}/${key}`);
    return data ? JSON.parse(data) : null;
  },

  async setSetting(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(`${KEYS.SETTINGS}/${key}`, JSON.stringify(value));
  },

  // Clear all app data
  async clearAll(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter((k) => k.startsWith("@cricscore/"));
    await AsyncStorage.multiRemove(appKeys);
  },
};
