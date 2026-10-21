import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * The fake API (json-server, `npm run server`) runs on the same machine as Metro, so its host is
 * taken from the address the app loaded the bundle from. EXPO_PUBLIC_API_URL overrides it.
 */
function apiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  const host =
    metroHost ??
    (Platform.OS === 'web' ? window.location.hostname : 'localhost');

  return `http://${host}:3333`;
}

const api = axios.create({
  baseURL: apiUrl(),
});

export default api;
