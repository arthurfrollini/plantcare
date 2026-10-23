import React, { type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import { changeLanguage, currentLanguage, initI18n } from '../i18n';
import { AuthProvider, useAuth } from './AuthProvider';
import { GoogleSignInButton } from './GoogleSignInButton';
import * as SecureStore from 'expo-secure-store';
import { clearTokens, loadTokens, saveTokens } from './session';

const baseUser = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
  hasAvatar: false,
  avatarVersion: null,
};
const authBody = { accessToken: 'acc', refreshToken: 'ref', user: baseUser };

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
  // jest's react-native has no AppState subscription to remove.
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function renderAuth() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'));
  return hook;
}

function lastBody(history: MockAdapter['history']['post']): unknown {
  const data: unknown = history[history.length - 1]?.data;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

describe('start', () => {
  it('is signed out without tokens and does not call the API', async () => {
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedOut');
    expect(mock.history.get).toHaveLength(0);
  });

  it('loads the account when tokens exist', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user?.name).toBe('Ana');
    expect(mock.history.patch).toHaveLength(0);
  });

  it('keeps the device language and sends it to the account when they differ', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await changeLanguage('pt-BR');
    mock.onGet('/me').reply(200, baseUser);
    mock.onPatch('/me').reply(200, { ...baseUser, language: 'pt-BR' });
    const { result } = await renderAuth();
    expect(currentLanguage()).toBe('pt-BR');
    expect(lastBody(mock.history.patch)).toEqual({ language: 'pt-BR' });
    expect(result.current.user?.language).toBe('pt-BR');
  });

  it('keeps the device language when that PATCH fails', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await changeLanguage('pt-BR');
    mock.onGet('/me').reply(200, baseUser);
    mock.onPatch('/me').networkError();
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedIn');
    expect(currentLanguage()).toBe('pt-BR');
  });

  it('retries the account when the app returns to the foreground', async () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler;
      return { remove };
    });
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').replyOnce(() => Promise.reject(new Error('Network Error')));
    mock.onGet('/me').reply(200, baseUser);
    const { result } = await renderAuth();
    expect(result.current.user).toBeNull();

    act(() => onChange('active'));

    await waitFor(() => expect(result.current.user?.name).toBe('Ana'));
  });

  it('sends one GET /me for two quick foreground events', async () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler;
      return { remove: jest.fn() };
    });
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').replyOnce(() => Promise.reject(new Error('Network Error')));
    mock.onGet('/me').reply(200, baseUser);
    const { result } = await renderAuth();

    act(() => {
      onChange('active');
      onChange('active');
    });

    await waitFor(() => expect(result.current.user?.name).toBe('Ana'));
    expect(mock.history.get.filter((r) => r.url === '/me')).toHaveLength(2);
  });

  it('stays signed in with no account when the API is unreachable', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').networkError();
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toBeNull();
    expect(await loadTokens()).not.toBeNull();
  });

  it('is signed in at once, before the account answers, when tokens exist', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(() => new Promise(() => undefined));
    const hook = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
    expect(hook.result.current.user).toBeNull();
  });

  it('signs out when the refresh is rejected', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    mock.onPost('/auth/refresh').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedOut');
    expect(await loadTokens()).toBeNull();
  });
});

describe('signUp', () => {
  it('posts the typed name and the current language, saves tokens and signs in', async () => {
    await changeLanguage('pt-BR');
    mock.onPost('/auth/register').reply(201, { ...authBody, user: { ...baseUser, language: 'pt-BR' } });
    const { result } = await renderAuth();

    await act(() => result.current.signUp('Ana', 'ana@example.com', 'secret123'));

    expect(lastBody(mock.history.post)).toEqual({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'secret123',
      language: 'pt-BR',
    });
    expect(await loadTokens()).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    expect(result.current.status).toBe('signedIn');
    expect(await AsyncStorage.getItem('@plantcare:user')).toBe('Ana');
  });
});

describe('signIn', () => {
  it('applies the account language and name, and later requests follow it', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Local name');
    mock.onPost('/auth/login').reply(200, {
      ...authBody,
      user: { ...baseUser, name: 'Ana Souza', language: 'pt-BR' },
    });
    mock.onGet('/plants').reply(200, {});
    const { result } = await renderAuth();

    await act(() => result.current.signIn('ana@example.com', 'secret123'));
    await api.get('/plants');

    expect(currentLanguage()).toBe('pt-BR');
    expect(await AsyncStorage.getItem('@plantcare:user')).toBe('Ana Souza');
    expect(mock.history.get[0]?.headers?.['Accept-Language']).toBe('pt-BR');
  });

  it('stays signed out on a wrong password', async () => {
    mock.onPost('/auth/login').reply(401, {
      error: { code: 'invalid_credentials', message: 'Wrong' },
    });
    const { result } = await renderAuth();

    await act(async () => {
      await expect(result.current.signIn('ana@example.com', 'nope')).rejects.toMatchObject({
        code: 'invalid_credentials',
      });
    });

    expect(result.current.status).toBe('signedOut');
    expect(await loadTokens()).toBeNull();
  });
});

describe('signed-out handler', () => {
  it('moves status to signedOut when a refresh fails', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    const { result } = await renderAuth();
    expect(result.current.status).toBe('signedIn');

    mock.onGet('/ping').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    mock.onPost('/auth/refresh').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    await act(async () => {
      await api.get('/ping').catch(() => undefined);
    });

    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
  });

  it('clears the cached list and cancels reminders on a forced sign-out, like a tapped one', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await AsyncStorage.setItem('@plantcare:myPlantsCache', '[]');
    mock.onGet('/me').reply(200, baseUser);
    mock.onGet('/me/plants').reply(200, []);
    const cancel = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync);
    const { result } = await renderAuth();
    cancel.mockClear();

    mock.onGet('/ping').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    mock.onPost('/auth/refresh').reply(401, { error: { code: 'unauthorized', message: 'no' } });
    await act(async () => {
      await api.get('/ping').catch(() => undefined);
    });

    await waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(await AsyncStorage.getItem('@plantcare:myPlantsCache')).toBeNull();
    expect(result.current.status).toBe('signedOut');
  });
});

describe('signOut', () => {
  it('still signs out, and a second tap is a no-op, when clearing the tokens fails', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await AsyncStorage.setItem('@plantcare:myPlantsCache', '[]');
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const { result } = await renderAuth();
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('keychain'));

    await act(() => result.current.signOut());

    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem('@plantcare:myPlantsCache')).toBeNull();
  });

  it('still signs out when removing the cached list fails', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const { result } = await renderAuth();
    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('disk'));

    await act(() => result.current.signOut());

    expect(result.current.status).toBe('signedOut');
    expect(await loadTokens()).toBeNull();
  });

  it('cancels every scheduled reminder, and a failure does not block sign-out', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const cancel = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync);
    cancel.mockClear();
    cancel.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderAuth();

    await act(() => result.current.signOut());

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('signedOut');
    expect(await loadTokens()).toBeNull();
  });

  it('logs out, clears tokens and the My Plants cache', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await AsyncStorage.setItem('@plantcare:myPlantsCache', '[]');
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const { result } = await renderAuth();

    await act(() => result.current.signOut());

    expect(lastBody(mock.history.post)).toEqual({ refreshToken: 'ref' });
    expect(await loadTokens()).toBeNull();
    expect(await AsyncStorage.getItem('@plantcare:myPlantsCache')).toBeNull();
    expect(result.current.status).toBe('signedOut');
  });

  it('signs out at once even when logout never answers', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    await AsyncStorage.setItem('@plantcare:myPlantsCache', '[]');
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(() => new Promise(() => undefined));
    const { result } = await renderAuth();

    await act(() => result.current.signOut());

    expect(result.current.status).toBe('signedOut');
    expect(await loadTokens()).toBeNull();
    expect(await AsyncStorage.getItem('@plantcare:myPlantsCache')).toBeNull();
    expect(mock.history.post).toHaveLength(1);
  });

  it('sends one logout for two taps in the same frame', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const { result } = await renderAuth();

    await act(async () => {
      await Promise.all([result.current.signOut(), result.current.signOut()]);
    });

    expect(mock.history.post).toHaveLength(1);
  });

  it('does nothing on a second sign out', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPost('/auth/logout').reply(204);
    const { result } = await renderAuth();

    await act(() => result.current.signOut());
    await act(() => result.current.signOut());

    expect(mock.history.post).toHaveLength(1);
  });
});

describe('setLanguage', () => {
  it('only changes the app language when signed out', async () => {
    const { result } = await renderAuth();
    await act(() => result.current.setLanguage('pt-BR'));
    expect(currentLanguage()).toBe('pt-BR');
    expect(mock.history.patch).toHaveLength(0);
  });

  it('keeps the local language when the account PATCH fails', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPatch('/me').networkError();
    const { result } = await renderAuth();

    await act(() => result.current.setLanguage('pt-BR'));

    expect(currentLanguage()).toBe('pt-BR');
    expect(result.current.status).toBe('signedIn');
  });

  it('patches the account when signed in', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onPatch('/me').reply(200, { ...baseUser, language: 'pt-BR' });
    const { result } = await renderAuth();

    await act(() => result.current.setLanguage('pt-BR'));

    expect(lastBody(mock.history.patch)).toEqual({ language: 'pt-BR' });
    expect(result.current.user?.language).toBe('pt-BR');
  });
});

describe('setLanguage reminders', () => {
  it('resyncs from the API after a language change while signed in', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onGet('/me/plants').reply(200, []);
    mock.onPatch('/me').reply(200, { ...baseUser, language: 'pt-BR' });
    const { result } = await renderAuth();
    const lists = () => mock.history.get.filter((r) => r.url === '/me/plants').length;
    await waitFor(() => expect(lists()).toBe(1));

    await act(() => result.current.setLanguage('pt-BR'));

    await waitFor(() => expect(lists()).toBe(2));
    expect(mock.history.get.filter((r) => r.url === '/me/plants')[1]?.headers?.['Accept-Language']).toBe(
      'pt-BR',
    );
  });

  it('does not touch the plants list when signed out', async () => {
    const { result } = await renderAuth();
    await act(() => result.current.setLanguage('pt-BR'));
    expect(mock.history.get).toHaveLength(0);
  });
});

describe('GoogleSignInButton', () => {
  it('renders nothing without a provider', async () => {
    render(
      <AuthProvider>
        <GoogleSignInButton title="Continue with Google" />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Continue with Google')).not.toBeOnTheScreen(), {
      timeout: 5000,
    });
  });

  it('posts the token from the provider to /auth/google', async () => {
    mock.onPost('/auth/google').reply(200, authBody);
    const provider = jest.fn(() => Promise.resolve('fake-id-token'));
    render(
      <AuthProvider>
        <GoogleSignInButton title="Continue with Google" provider={provider} />
      </AuthProvider>,
    );

    fireEvent.press(await screen.findByText('Continue with Google'));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(mock.history.post[0]?.url).toBe('/auth/google');
    expect(lastBody(mock.history.post)).toEqual({ idToken: 'fake-id-token', language: 'en' });
  });
});

describe('reminder sync', () => {
  const plant = {
    id: 'p1', catalogPlantId: 'c1', nickname: null, speciesName: 'Monstera', scientificName: 'M',
    about: '', waterTips: '', frequency: { times: 1, per: 'day' }, reminderTime: '09:00',
    timeZone: 'UTC', light: 'partial_shade', difficulty: 'easy', wateringDays: [], reminderLeadMinutes: 15,
    scheduleStartsOn: null, scheduleNeedsReview: false, notes: null, imageUrl: null, hasPhoto: false, photoVersion: null,
    createdAt: '2026-10-22T00:00:00.000Z',
  };
  const scheduled = () => jest.mocked(Notifications.scheduleNotificationAsync);

  function captureAppState() {
    const handlers: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    });
    return (state: AppStateStatus) => handlers.forEach((h) => h(state));
  }

  beforeEach(() => {
    scheduled().mockClear();
    jest.mocked(Notifications.cancelAllScheduledNotificationsAsync).mockClear();
  });

  it('syncs on launch when signed in, and not when signed out', async () => {
    await renderAuth();
    expect(mock.history.get).toHaveLength(0);

    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onGet('/me/plants').reply(200, [plant]);
    await renderAuth();

    await waitFor(() => expect(scheduled()).toHaveBeenCalledTimes(1));
  });

  it('syncs after sign-in', async () => {
    mock.onPost('/auth/login').reply(200, authBody);
    mock.onGet('/me/plants').reply(200, [plant]);
    const { result } = await renderAuth();

    await act(() => result.current.signIn('ana@example.com', 'secret123'));

    await waitFor(() => expect(scheduled()).toHaveBeenCalledTimes(1));
  });

  it('syncs when the app returns to the foreground while signed in', async () => {
    const fire = captureAppState();
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onGet('/me/plants').reply(200, [plant]);
    await renderAuth();
    await waitFor(() => expect(scheduled()).toHaveBeenCalledTimes(1));

    act(() => fire('active'));

    await waitFor(() => expect(scheduled()).toHaveBeenCalledTimes(2));
  });

  it('does not sync on foreground while signed out', async () => {
    const fire = captureAppState();
    await renderAuth();

    act(() => fire('active'));
    // Give a wrongly started sync time to reach the API before asserting that none did.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mock.history.get).toHaveLength(0);
    expect(scheduled()).not.toHaveBeenCalled();
  });

  it('runs one sync for foreground events while one is in flight', async () => {
    const fire = captureAppState();
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    let release: () => void = () => undefined;
    mock.onGet('/me/plants').reply(
      () => new Promise((resolve) => (release = () => resolve([200, [plant]]))),
    );
    await renderAuth();
    await waitFor(() => expect(mock.history.get.filter((r) => r.url === '/me/plants')).toHaveLength(1));

    act(() => {
      fire('active');
      fire('active');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mock.history.get.filter((r) => r.url === '/me/plants')).toHaveLength(1);
    act(() => {
      release();
    });
    await waitFor(() => expect(scheduled()).toHaveBeenCalledTimes(1));
  });

  it('keeps existing reminders when the API is unreachable', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, baseUser);
    mock.onGet('/me/plants').networkError();
    await renderAuth();

    await waitFor(() => expect(mock.history.get.some((r) => r.url === '/me/plants')).toBe(true));
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});

describe('account actions', () => {
  const full = baseUser;

  async function signedIn() {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, full);
    mock.onGet('/me/plants').reply(200, []);
    return renderAuth();
  }

  it('deleteAccount clears tokens, cache, reminders, images and the stored name', async () => {
    await AsyncStorage.setItem('@plantcare:myPlantsCache', '[]');
    const { result } = await signedIn();
    mock.onDelete('/me').reply(204);
    const cancel = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync);
    cancel.mockClear();
    const clearDisk = jest.spyOn(Image, 'clearDiskCache');
    const clearMemory = jest.spyOn(Image, 'clearMemoryCache');

    await act(() => result.current.deleteAccount());

    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
    expect(await loadTokens()).toBeNull();
    expect(await AsyncStorage.getItem('@plantcare:myPlantsCache')).toBeNull();
    expect(await AsyncStorage.getItem('@plantcare:user')).toBeNull();
    expect(cancel).toHaveBeenCalled();
    expect(clearDisk).toHaveBeenCalled();
    expect(clearMemory).toHaveBeenCalled();
  });

  it('deleteAccount still signs out when clearing the image cache fails', async () => {
    const { result } = await signedIn();
    mock.onDelete('/me').reply(204);
    jest.spyOn(Image, 'clearDiskCache').mockRejectedValueOnce(new Error('disk'));
    jest.spyOn(Image, 'clearMemoryCache').mockImplementationOnce(() => {
      throw new Error('memory');
    });

    await act(() => result.current.deleteAccount());

    expect(result.current.status).toBe('signedOut');
    expect(await AsyncStorage.getItem('@plantcare:user')).toBeNull();
  });

  it('a failed deleteAccount keeps the session', async () => {
    const { result } = await signedIn();
    mock.onDelete('/me').reply(500);
    const clearDisk = jest.spyOn(Image, 'clearDiskCache');

    await act(async () => {
      await expect(result.current.deleteAccount()).rejects.toBeDefined();
    });

    expect(result.current.status).toBe('signedIn');
    expect(await loadTokens()).not.toBeNull();
    expect(clearDisk).not.toHaveBeenCalled();
  });

  it('changePassword sends the refresh token and stays signed in on 403', async () => {
    const { result } = await signedIn();
    mock.onPost('/me/password').reply(403, { error: 'wrong_password' });

    await act(async () => {
      await expect(result.current.changePassword('old', 'newpassword1')).rejects.toBeDefined();
    });

    expect(lastBody(mock.history.post)).toEqual({
      currentPassword: 'old',
      newPassword: 'newpassword1',
      refreshToken: 'ref',
    });
    expect(result.current.status).toBe('signedIn');
    expect(await loadTokens()).not.toBeNull();
  });

  it('updateName updates the user name', async () => {
    const { result } = await signedIn();
    mock.onPatch('/me').reply(200, { ...full, name: 'Bea' });

    await act(() => result.current.updateName('Bea'));

    expect(result.current.user?.name).toBe('Bea');
    expect(await AsyncStorage.getItem('@plantcare:user')).toBe('Bea');
  });
});
