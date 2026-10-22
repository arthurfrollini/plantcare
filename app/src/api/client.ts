import { create, isAxiosError, isCancel, type InternalAxiosRequestConfig } from 'axios';
import { authResponseSchema } from '@plantcare/shared';
import { z } from 'zod';

import { currentLanguage } from '../i18n';
import { clearTokens, loadTokens, saveTokens, sessionEpoch } from '../auth/session';
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
  if (isCancel(e)) return new ApiError(null, 'canceled', 'Request canceled');
  if (isAxiosError(e)) {
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

export const api = create({ baseURL: apiUrl(), timeout: 15000 });

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

/** Secure-store failures leave the client as ApiError like everything else. */
async function fromStorage<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (e) {
    throw new ApiError(null, 'storage', e instanceof Error ? e.message : 'Storage failed');
  }
}

/** Only a refresh the server rejects, or one that fails locally, ends the session. */
function endsSession(error: ApiError): boolean {
  if (error.status === null) return error.code !== 'network';
  return error.status === 400 || error.status === 401;
}

async function doRefresh(): Promise<void> {
  const epoch = sessionEpoch();
  try {
    const tokens = await fromStorage(loadTokens());
    if (!tokens) throw new ApiError(401, 'unauthorized', 'Not signed in');
    const res = await api.post(
      '/auth/refresh',
      { refreshToken: tokens.refreshToken },
      { skipAuthRefresh: true },
    );
    const parsed = authResponseSchema.parse(res.data);
    // Signed out while the refresh was in flight: do not bring the session back.
    if (sessionEpoch() !== epoch) throw new ApiError(401, 'unauthorized', 'Signed out');
    await fromStorage(
      saveTokens({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }),
    );
  } catch (e) {
    const error = toApiError(e);
    if (endsSession(error) && sessionEpoch() === epoch) {
      await clearTokens();
      signedOutHandler();
    }
    throw error;
  }
}

function sentToken(config: InternalAxiosRequestConfig): string | null {
  const header = config.headers.get('Authorization');
  return typeof header === 'string' ? header.replace(/^Bearer /, '') : null;
}

function isAuthRoute(url: string | undefined): boolean {
  return url?.startsWith('/auth/') ?? false;
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (
    isAxiosError(error) &&
    error.response?.status === 401 &&
    error.config &&
    !error.config.skipAuthRefresh &&
    !error.config.retried &&
    !isAuthRoute(error.config.url) &&
    sentToken(error.config) !== null
  ) {
    const config = error.config;
    // A request that failed with an already-replaced token only needs a retry.
    const current = await loadTokens();
    if (current?.accessToken === sentToken(config)) await refreshOnce();
    return api.request({ ...config, retried: true });
  }
  throw toApiError(error);
});
