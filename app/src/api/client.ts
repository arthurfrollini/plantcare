import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { authResponseSchema } from '@plantcare/shared';
import { z } from 'zod';

import { currentLanguage } from '../i18n';
import { clearTokens, loadTokens, saveTokens } from '../auth/session';
import { apiUrl } from './config';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The refresh request itself: no bearer token and no 401 handling. */
    skipAuthRefresh?: boolean;
    /** Set on the one retry after a refresh. */
    retried?: boolean;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (axios.isAxiosError(e)) {
    if (!e.response) return new ApiError(null, 'network', e.message);
    const body = errorBodySchema.safeParse(e.response.data);
    return body.success
      ? new ApiError(e.response.status, body.data.error.code, body.data.error.message)
      : new ApiError(e.response.status, 'unknown', e.message);
  }
  return new ApiError(null, 'unknown', e instanceof Error ? e.message : 'Unknown error');
}

let signedOutHandler: () => void = () => undefined;

export function setSignedOutHandler(fn: () => void): void {
  signedOutHandler = fn;
}

export const api = axios.create({ baseURL: apiUrl() });

api.interceptors.request.use(async (config) => {
  config.headers.set('Accept-Language', currentLanguage());
  if (!config.skipAuthRefresh) {
    const tokens = await loadTokens();
    if (tokens) config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  return config;
});

let refreshing: Promise<void> | null = null;

/** One refresh shared by every request that sees a 401 while it is in flight. */
function refreshOnce(): Promise<void> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<void> {
  const tokens = await loadTokens();
  if (!tokens) throw new ApiError(401, 'unauthorized', 'Not signed in');
  try {
    const res = await api.post(
      '/auth/refresh',
      { refreshToken: tokens.refreshToken },
      { skipAuthRefresh: true },
    );
    const parsed = authResponseSchema.parse(res.data);
    await saveTokens({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken });
  } catch (e) {
    const error = toApiError(e);
    // An unreachable API says nothing about the session: keep the tokens.
    if (error.status === null) throw error;
    await clearTokens();
    signedOutHandler();
    throw error;
  }
}

function sentToken(config: InternalAxiosRequestConfig): string | null {
  const header = config.headers.get('Authorization');
  return typeof header === 'string' ? header.replace(/^Bearer /, '') : null;
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    error.config &&
    !error.config.skipAuthRefresh &&
    !error.config.retried &&
    sentToken(error.config) !== null
  ) {
    const failed: AxiosError = error;
    const config = failed.config;
    if (config) {
      // A request that failed with an already-replaced token only needs a retry.
      const current = await loadTokens();
      if (current && current.accessToken === sentToken(config)) {
        try {
          await refreshOnce();
        } catch (e) {
          throw toApiError(e);
        }
      }
      try {
        return await api.request({ ...config, retried: true });
      } catch (e) {
        throw toApiError(e);
      }
    }
  }
  throw toApiError(error);
});
