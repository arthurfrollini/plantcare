import Constants from 'expo-constants';

/**
 * The API runs on the same machine as Metro, so its host is taken from the address the app
 * loaded the bundle from. EXPO_PUBLIC_API_URL overrides it.
 */
export function apiUrl(): string {
  const override: unknown = process.env.EXPO_PUBLIC_API_URL;
  if (typeof override === 'string' && override) return override;

  const hostUri: unknown = Constants.expoConfig?.hostUri;
  const metroHost = typeof hostUri === 'string' ? hostUri.split(':')[0] : undefined;
  const host = metroHost ?? 'localhost';

  return `http://${host}:3333`;
}

/** Joins the API base URL and a relative path such as `/static/plants/yucca.svg`. */
export function assetUrl(path: string): string {
  return `${apiUrl().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
