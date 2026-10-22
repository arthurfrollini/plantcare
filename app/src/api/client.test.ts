import MockAdapter from 'axios-mock-adapter';

import { changeLanguage, initI18n } from '../i18n';
import { clearTokens, loadTokens, saveTokens } from '../auth/session';
import { ApiError, api, setSignedOutHandler } from './client';

const user = {
  id: 'u1',
  name: 'Ana',
  email: 'a@b.co',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
};

beforeAll(initI18n);

let mock: MockAdapter;
let onSignedOut: jest.Mock;

beforeEach(async () => {
  mock = new MockAdapter(api);
  onSignedOut = jest.fn();
  setSignedOutHandler(onSignedOut);
  await clearTokens();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

describe('headers', () => {
  it('sends Accept-Language and follows the language switch', async () => {
    mock.onGet('/ping').reply(200, {});
    await api.get('/ping');
    await changeLanguage('pt-BR');
    await api.get('/ping');
    expect(mock.history.get.map((r): unknown => r.headers?.['Accept-Language'])).toEqual(['en', 'pt-BR']);
  });

  it('sends Authorization only when tokens are saved', async () => {
    mock.onGet('/ping').reply(200, {});
    await api.get('/ping');
    await saveTokens({ accessToken: 'tok', refreshToken: 'ref' });
    await api.get('/ping');
    expect(mock.history.get.map((r): unknown => r.headers?.Authorization)).toEqual([undefined, 'Bearer tok']);
  });

  it('sends no Content-Type on a bodiless DELETE', async () => {
    mock.onDelete('/x').reply(204);
    await api.delete('/x');
    const headers = mock.history.delete[0]?.headers;
    expect(headers?.['Content-Type']).toBeUndefined();
  });
});

describe('refresh', () => {
  const newPair = { accessToken: 'new-a', refreshToken: 'new-r', user };

  it('shares one refresh between concurrent 401s and retries each request once', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'old-r' });
    mock.onPost('/auth/refresh').reply(200, newPair);
    mock.onGet(/\/data\/\d/).reply((config) =>
      config.headers?.Authorization === 'Bearer new-a' ? [200, { ok: true }] : [401, {}],
    );

    const results = await Promise.all([
      api.get('/data/1'),
      api.get('/data/2'),
      api.get('/data/3'),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(1);
    expect(mock.history.post[0]?.data).toBe(JSON.stringify({ refreshToken: 'old-r' }));
    expect(await loadTokens()).toEqual({ accessToken: 'new-a', refreshToken: 'new-r' });
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('clears tokens and signs out once when the refresh fails', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'old-r' });
    mock.onPost('/auth/refresh').reply(401, { error: { code: 'invalid_token', message: 'no' } });
    mock.onGet(/\/data\/\d/).reply(401, {});

    const results = await Promise.allSettled([api.get('/data/1'), api.get('/data/2')]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(await loadTokens()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(mock.history.post).toHaveLength(1);
  });

  it('retries a request at most once', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'old-r' });
    mock.onPost('/auth/refresh').reply(200, newPair);
    mock.onGet('/data').reply(401, {});

    await expect(api.get('/data')).rejects.toMatchObject({ status: 401 });
    expect(mock.history.get).toHaveLength(2);
  });

  it('does not refresh a 401 when signed out (wrong password)', async () => {
    mock.onPost('/auth/login').reply(401, { error: { code: 'invalid_credentials', message: 'x' } });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
    expect(mock.history.post).toHaveLength(1);
  });

  it('keeps the session when the refresh cannot reach the API', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'old-r' });
    mock.onPost('/auth/refresh').networkError();
    mock.onGet('/data').reply(401, {});

    await expect(api.get('/data')).rejects.toMatchObject({ status: null, code: 'network' });
    expect(await loadTokens()).not.toBeNull();
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it('turns a network error into ApiError(null, network)', async () => {
    mock.onGet('/x').networkError();
    const error = await api.get('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: null, code: 'network' });
  });

  it('turns an API error body into ApiError(status, code)', async () => {
    mock.onGet('/x').reply(404, { error: { code: 'plant_not_found', message: 'Nope' } });
    const error = await api.get('/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, code: 'plant_not_found', message: 'Nope' });
  });
});
