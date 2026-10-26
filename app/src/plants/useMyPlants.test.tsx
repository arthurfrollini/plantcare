import React, { type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import MockAdapter from 'axios-mock-adapter';
import { userPlantSchema, type UserPlant } from '@plantcare/shared';
import { z } from 'zod';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import * as endpoints from '../api/endpoints';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import * as reminders from '../reminders/sync';
import { MY_PLANTS_CACHE_KEY } from './myPlantsCache';
import { setToday } from './testClock';
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
    // Only the plant left gets reminders, plus the keep-going.
    const data = jest
      .mocked(Notifications.scheduleNotificationAsync)
      .mock.calls.map(([request]) => request.content.data);
    expect(data.length).toBeGreaterThan(1);
    expect(data.some((d) => d?.userPlantId === 'p1')).toBe(false);
    expect(data.some((d) => d?.userPlantId === 'p2')).toBe(true);
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
      // Thursday, noon.
      setToday(new Date(2026, 9, 22, 12, 0));
    });
    afterEach(() => jest.useRealTimers());

    it('sends the given day, replaces the plant and the cache', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      let ok = false;
      await act(async () => {
        ok = await result.current.markWatered('p1', today);
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

    it('resyncs reminders from the server list after a mark', async () => {
      const sync = jest.spyOn(reminders, 'syncReminders');
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));
      sync.mockClear();
      // The server knows of a plant added elsewhere that the list on screen does not have yet.
      const server = [
        { ...userPlantFixture, lastWateredOn: today },
        { ...userPlantFixture, id: 'p2' },
      ];
      jest.spyOn(endpoints, 'listMyPlants').mockResolvedValueOnce(server);

      await act(async () => {
        await result.current.markWatered('p1', today);
      });

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(sync).toHaveBeenCalledWith(server);
      expect(result.current.plants.map((p) => p.id)).toEqual(['p1']);
    }, 20000);

    it('resyncs reminders from the server list after an undo', async () => {
      const sync = jest.spyOn(reminders, 'syncReminders');
      mock.onGet('/me/plants').reply(200, [{ ...userPlantFixture, lastWateredOn: today }]);
      mock
        .onDelete(`/me/plants/p1/waterings/${today}`)
        .reply(200, { ...userPlantFixture, lastWateredOn: null });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants[0]?.lastWateredOn).toBe(today));
      sync.mockClear();
      const server = [
        { ...userPlantFixture, lastWateredOn: null, reminderTime: '19:00' },
        { ...userPlantFixture, id: 'p2' },
      ];
      jest.spyOn(endpoints, 'listMyPlants').mockResolvedValueOnce(server);

      await act(async () => {
        await result.current.undoWatered('p1', today);
      });

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(sync).toHaveBeenCalledWith(server);
    }, 20000);

    it('falls back to the updated local list when the server list fails', async () => {
      const sync = jest.spyOn(reminders, 'syncReminders');
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));
      sync.mockClear();
      jest.spyOn(endpoints, 'listMyPlants').mockRejectedValueOnce(new Error('offline'));

      await act(async () => {
        await result.current.markWatered('p1', today);
      });

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(sync).toHaveBeenCalledWith([{ ...userPlantFixture, lastWateredOn: today }]);
    }, 20000);

    it('answers the mark at once, and skips the resync after a sign-out', async () => {
      const sync = jest.spyOn(reminders, 'syncReminders');
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => ({ my: useMyPlants(), auth: useAuth() }), { wrapper });
      await waitFor(() => expect(result.current.my.plants).toHaveLength(1));
      sync.mockClear();
      let answer: (plants: UserPlant[]) => void = () => undefined;
      const list = jest.spyOn(endpoints, 'listMyPlants').mockReturnValueOnce(
        new Promise<UserPlant[]>((resolve) => {
          answer = resolve;
        }),
      );

      let ok = false;
      await act(async () => {
        ok = await result.current.my.markWatered('p1', today);
      });
      expect(ok).toBe(true);
      expect(result.current.my.plants[0]?.lastWateredOn).toBe(today);
      expect(list).toHaveBeenCalledTimes(1);
      expect(sync).not.toHaveBeenCalled();

      await act(() => result.current.auth.signOut());
      await act(async () => {
        answer([{ ...userPlantFixture, lastWateredOn: today }]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(sync).not.toHaveBeenCalled();
    }, 20000);

    it('does not resync reminders when the mark fails', async () => {
      const sync = jest.spyOn(reminders, 'syncReminders');
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(500, { error: { code: 'internal', message: 'x' } });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));
      sync.mockClear();

      await act(async () => {
        await result.current.markWatered('p1', today);
      });

      expect(sync).not.toHaveBeenCalled();
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
        ok = await result.current.markWatered('p1', today);
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
        first = result.current.markWatered('p1', today);
        second = result.current.markWatered('p1', today);
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
        await result.current.markWatered('p1', today);
      });
      expect(result.current.plants[0]?.lastWateredOn).toBe(today);
      await act(async () => {
        await result.current.undoWatered('p1', today);
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
        ok = await result.current.undoWatered('p1', today);
      });

      expect(ok).toBe(true);
      expect(mock.history.delete[0]?.headers?.['Content-Type']).toBeUndefined();
      expect(result.current.plants[0]?.lastWateredOn).toBeNull();
    });

    it("sends the row's day, not the clock's, once midnight has passed", async () => {
      mock.onGet('/me/plants').reply(200, [{ ...userPlantFixture, lastWateredOn: today }]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      mock
        .onDelete(`/me/plants/p1/waterings/${today}`)
        .reply(200, { ...userPlantFixture, lastWateredOn: null });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));

      // Friday 00:01: the row on screen is still Thursday's.
      jest.setSystemTime(new Date(2026, 9, 23, 0, 1));
      await act(async () => {
        await result.current.undoWatered('p1', today);
      });
      await act(async () => {
        await result.current.markWatered('p1', today);
      });

      expect(mock.history.delete.map((request) => request.url)).toEqual([
        `/me/plants/p1/waterings/${today}`,
      ]);
      expect(
        z
          .object({ wateredOn: z.string() })
          .parse(JSON.parse(z.string().parse(mock.history.post[0]?.data))),
      ).toEqual({ wateredOn: today });
    });

    it('lets a later call through after a request that failed before it started', async () => {
      mock.onGet('/me/plants').reply(200, [userPlantFixture]);
      mock
        .onPost('/me/plants/p1/waterings')
        .reply(201, { ...userPlantFixture, lastWateredOn: today });
      const { result } = renderHook(() => useMyPlants(), { wrapper });
      await waitFor(() => expect(result.current.plants).toHaveLength(1));
      jest.spyOn(endpoints, 'markWatered').mockImplementationOnce(() => {
        throw new Error('thrown before any request');
      });

      const results: boolean[] = [];
      await act(async () => {
        results.push(await result.current.markWatered('p1', today));
      });
      await act(async () => {
        results.push(await result.current.markWatered('p1', today));
      });

      expect(results).toEqual([false, true]);
      expect(mock.history.post).toHaveLength(1);
      expect(result.current.plants[0]?.lastWateredOn).toBe(today);
    });
  });
});
