jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));
