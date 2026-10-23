import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import MockAdapter from 'axios-mock-adapter';
import { userPlantSchema } from '@plantcare/shared';
import { z } from 'zod';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { resetCapWarning } from '../reminders/sync';
import { MY_PLANTS_CACHE_KEY } from './myPlantsCache';
import { accountFixture, userPlantFixture } from './testFixtures';
import { useMyPlants } from './useMyPlants';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual<object>('@react-navigation/native'),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
  await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
  mock.onGet('/me').reply(200, accountFixture);
  jest.mocked(Notifications.scheduleNotificationAsync).mockClear();
  resetCapWarning();
});

afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useMyPlants', () => {
  it('loads the list and caches it', async () => {
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    const { result } = renderHook(() => useMyPlants(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plants.map((p) => p.id)).toEqual(['p1']);
    expect(result.current.offline).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY)) ?? 'null')).toEqual([
      userPlantFixture,
    ]);
  });

  it('shows the cached list while the request is still in flight', async () => {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([userPlantFixture]));
    mock.onGet('/me/plants').reply(() => new Promise(() => undefined));
    const { result } = renderHook(() => useMyPlants(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plants.map((p) => p.id)).toEqual(['p1']);
    expect(result.current.offline).toBe(false);
  });

  it('falls back to the cache, offline, when the API is unreachable', async () => {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([userPlantFixture]));
    mock.onGet('/me/plants').networkError();
    const { result } = renderHook(() => useMyPlants(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.plants).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('shows an error, not the cache, on a server error, and Retry recovers', async () => {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([userPlantFixture]));
    mock.onGet('/me/plants').replyOnce(500, { error: { code: 'internal', message: 'boom' } });
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    const { result } = renderHook(() => useMyPlants(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.offline).toBe(false);
    expect(result.current.plants).toHaveLength(0);

    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.plants).toHaveLength(1);
  });

  it('deletes without a Content-Type, drops the plant and resyncs the rest', async () => {
    const second = { ...userPlantFixture, id: 'p2' };
    mock.onGet('/me/plants').reply(200, [userPlantFixture, second]);
    mock.onDelete('/me/plants/p1').reply(204);
    const { result } = renderHook(() => useMyPlants(), { wrapper });
    await waitFor(() => expect(result.current.plants).toHaveLength(2));
    jest.mocked(Notifications.scheduleNotificationAsync).mockClear();

    await act(() => result.current.remove('p1'));

    expect(result.current.plants.map((p) => p.id)).toEqual(['p2']);
    const sent = mock.history.delete[0];
    expect(sent?.headers?.['Content-Type']).toBeUndefined();
    // Two weekly slots for the one plant left.
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('does nothing when removing while offline', async () => {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([userPlantFixture]));
    mock.onGet('/me/plants').networkError();
    const { result } = renderHook(() => useMyPlants(), { wrapper });
    await waitFor(() => expect(result.current.offline).toBe(true));

    await act(() => result.current.remove('p1'));

    expect(mock.history.delete).toHaveLength(0);
    expect(result.current.plants).toHaveLength(1);
  });

  it('reports the 60-reminder cap once, and only when it was hit', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const daily = { ...userPlantFixture, frequency: { times: 1, per: 'day' as const } };
    const many = Array.from({ length: 62 }, (_, i) => ({ ...daily, id: `d${i}` }));
    mock.onGet('/me/plants').reply(200, many);
    mock.onDelete(/\/me\/plants\/.*/).reply(204);
    const { result } = renderHook(() => useMyPlants(), { wrapper });
    await waitFor(() => expect(result.current.plants).toHaveLength(62));

    await act(() => result.current.remove('d0'));
    await act(() => result.current.remove('d1'));

    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('keeps a deleted plant gone when a refresh started before the delete answers late', async () => {
    const second = { ...userPlantFixture, id: 'p2' };
    mock.onGet('/me/plants').replyOnce(200, [userPlantFixture, second]);
    mock.onDelete('/me/plants/p1').reply(204);
    const { result } = renderHook(() => useMyPlants(), { wrapper });
    await waitFor(() => expect(result.current.plants).toHaveLength(2));
    let release: () => void = () => undefined;
    mock.onGet('/me/plants').replyOnce(
      () => new Promise((resolve) => (release = () => resolve([200, [userPlantFixture, second]]))),
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refresh();
    });
    await act(() => result.current.remove('p1'));
    await act(async () => {
      release();
      await pending;
    });

    expect(result.current.plants.map((p) => p.id)).toEqual(['p2']);
    expect(result.current.loading).toBe(false);
  });

  it('clears the list when the user signs out', async () => {
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    const { result } = renderHook(() => ({ my: useMyPlants(), auth: useAuth() }), { wrapper });
    await waitFor(() => expect(result.current.my.plants).toHaveLength(1));

    await act(() => result.current.auth.signOut());

    expect(result.current.my.plants).toHaveLength(0);
  });

  describe('marking watered', () => {
    const today = '2026-10-22';
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: [
          'nextTick',
          'setImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
        ],
      });
      jest.setSystemTime(new Date(2026, 9, 22, 12, 0));
    });
    afterEach(() => jest.useRealTimers());

    it('sends today, replaces the plant and the cache', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      let ok = false;
      await act(async () => {
        ok = await result.current.markWatered('p1');
      });

      expect(ok).toBe(true);
      expect(z.object({ wateredOn: z.string() }).parse(JSON.parse(z.string().parse(mock.history.post[0]?.data)))).toEqual({
        wateredOn: today,
      });
      expect(result.current.plants[0]?.lastWateredOn).toBe(today);
      const cached = z
        .array(userPlantSchema)
        .parse(JSON.parse((await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY)) ?? '[]'));
      expect(cached[0]?.lastWateredOn).toBe(today);
    });

    it('returns false and leaves the list and cache on failure', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(500, { error: { code: 'internal', message: 'x' } });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      let ok = true;
      await act(async () => {
        ok = await result.current.markWatered('p1');
      });

      expect(ok).toBe(false);
      expect(result.current.plants[0]?.lastWateredOn).toBeNull();
      const cached = z
        .array(userPlantSchema)
        .parse(JSON.parse((await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY)) ?? '[]'));
      expect(cached[0]?.lastWateredOn).toBeNull();
    });

    it('sends one request for two quick calls on the same plant', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      let release: () => void = () => undefined;
      mock.onPost('/me/plants/p1/waterings').reply(
        () =>
          new Promise((resolve) => {
            release = () => resolve([201, { ...userPlantFixture, lastWateredOn: today }]);
          }),
      );
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      let first: Promise<boolean> = Promise.resolve(false);
      let second: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.markWatered('p1');
        second = result.current.markWatered('p1');
      });
      await waitFor(() => expect(mock.history.post).toHaveLength(1), { timeout: 5000 });
      const results: boolean[] = [];
      await act(async () => {
        release();
        results.push(await first, await second);
      });

      expect(mock.history.post).toHaveLength(1);
      expect(results).toEqual([true, true]);
    });

    it('ends with no watering after mark then undo', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      mock
        .onDelete(`/me/plants/p1/waterings/${today}`)
        .reply(200, { ...userPlantFixture, lastWateredOn: null });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      await act(async () => {
        await result.current.markWatered('p1');
      });
      expect(result.current.plants[0]?.lastWateredOn).toBe(today);
      await act(async () => {
        await result.current.undoWatered('p1');
      });

      expect(result.current.plants[0]?.lastWateredOn).toBeNull();
      const cached = z
        .array(userPlantSchema)
        .parse(JSON.parse((await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY)) ?? '[]'));
      expect(cached[0]?.lastWateredOn).toBeNull();
    });

    it('can undo a plant loaded with today as its last watering', async () => {
      mock.onGet('/me/plants').reply(200, [{ ...userPlantFixture, lastWateredOn: today }]);
      mock
        .onDelete(`/me/plants/p1/waterings/${today}`)
        .reply(200, { ...userPlantFixture, lastWateredOn: null });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants[0]?.lastWateredOn).toBe(today));

      let ok = false;
      await act(async () => {
        ok = await result.current.undoWatered('p1');
      });

      expect(ok).toBe(true);
      expect(mock.history.delete[0]?.headers?.['Content-Type']).toBeUndefined();
      expect(result.current.plants[0]?.lastWateredOn).toBeNull();
    });
  });
});
