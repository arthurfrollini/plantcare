import * as SecureStore from 'expo-secure-store';

export type Tokens = { accessToken: string; refreshToken: string };

const ACCESS_KEY = 'plantcare.accessToken';
const REFRESH_KEY = 'plantcare.refreshToken';

export async function loadTokens(): Promise<Tokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

let epoch = 0;

/** Changes every time the session is cleared, so in-flight work can tell it was signed out. */
export function sessionEpoch(): number {
  return epoch;
}

export async function clearTokens(): Promise<void> {
  epoch += 1;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
