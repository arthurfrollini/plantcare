import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { UserPlant } from '@plantcare/shared';

import { ApiError, toApiError } from '../api/client';
import {
  deleteMyPlant,
  listMyPlants,
  markWatered as postWatered,
  undoWatered as deleteWatered,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { syncReminders } from '../reminders/sync';
import { readMyPlantsCache, writeMyPlantsCache } from './myPlantsCache';

export type MyPlantsResult = {
  plants: UserPlant[];
  offline: boolean;
  loading: boolean;
  /** Set when the API answered with an error; the cache is not shown for those. */
  error: ApiError | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Records a watering on `day` (YYYY-MM-DD, local), the date of the row tapped rather than of the
   * tap, so a tap just after midnight still marks the row on screen. False when it failed. A call
   * while one for this plant is in flight joins it.
   */
  markWatered: (id: string, day: string) => Promise<boolean>;
  /** Takes the watering on `day` back. Same rules as markWatered. */
  undoWatered: (id: string, day: string) => Promise<boolean>;
};

export function useMyPlants(): MyPlantsResult {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const [plants, setPlants] = useState<UserPlant[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const latest = useRef(0);
  const plantsRef = useRef<UserPlant[]>([]);
  // Plants with a watering request in flight; a repeat call for one joins it.
  const watering = useRef(new Map<string, Promise<boolean>>());
  const shownFor = useRef<string | null>(null);
  // True while the list on screen is the cached one shown ahead of the request.
  const fromCache = useRef(false);

  const apply = useCallback((next: UserPlant[]) => {
    fromCache.current = false;
    plantsRef.current = next;
    setPlants(next);
  }, []);

  // Another account (or none) must never see the previous list.
  useEffect(() => {
    const switched = userId !== null && shownFor.current !== null && shownFor.current !== userId;
    if (userId !== null) shownFor.current = userId;
    if (status === 'signedIn' && !switched) return;
    if (status !== 'signedIn') shownFor.current = null;
    latest.current += 1;
    apply([]);
    setOffline(false);
    setError(null);
    setLoading(true);
  }, [status, userId, apply]);

  const refresh = useCallback(async () => {
    if (status !== 'signedIn') return;
    const request = ++latest.current;
    // Nothing on screen yet: show the last synced list while the request is in flight, so a slow
    // or unreachable API does not leave a spinner.
    if (plantsRef.current.length === 0) {
      void readMyPlantsCache().then((cached) => {
        if (request !== latest.current || plantsRef.current.length > 0 || cached.length === 0) return;
        apply(cached);
        fromCache.current = true;
        setLoading(false);
      });
    }
    try {
      const fresh = await listMyPlants();
      if (request !== latest.current) return;
      apply(fresh);
      setOffline(false);
      setError(null);
      await writeMyPlantsCache(fresh);
    } catch (e) {
      if (request !== latest.current) return;
      const failure = toApiError(e);
      if (failure.code === 'network') {
        apply(await readMyPlantsCache());
        if (request !== latest.current) return;
        setOffline(true);
        setError(null);
      } else {
        // A server error shows the error, not the cached list shown while waiting.
        if (fromCache.current) apply([]);
        setError(failure);
      }
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [status, apply]);

  // A plant saved in the form shows up when the user comes back to this tab.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const remove = useCallback(
    async (id: string) => {
      if (offline) return;
      await deleteMyPlant(id);
      // A refresh already in flight may still carry the deleted plant.
      latest.current += 1;
      setLoading(false);
      const remaining = plantsRef.current.filter((p) => p.id !== id);
      apply(remaining);
      void writeMyPlantsCache(remaining);
      await syncReminders(remaining);
    },
    [offline, apply],
  );

  const changeWatering = useCallback(
    (
      id: string,
      day: string,
      send: (id: string, day: string) => Promise<UserPlant>,
    ): Promise<boolean> => {
      // A call during an in-flight one, mark or undo, joins it; the card disables the row meanwhile.
      const running = watering.current.get(id);
      if (running) return running;
      const run = (async () => {
        try {
          // Sent on a later microtask, so the map entry below is set before `finally` deletes it,
          // even if `send` throws at once.
          const updated = await Promise.resolve().then(() => send(id, day));
          // A refresh already in flight may still carry the old state of this plant.
          latest.current += 1;
          setLoading(false);
          const next = plantsRef.current.map((p) => (p.id === id ? updated : p));
          apply(next);
          void writeMyPlantsCache(next);
          // The ticked watering gains or loses its reminder; never awaited, never prompts.
          void syncReminders(next);
          return true;
        } catch {
          return false;
        } finally {
          watering.current.delete(id);
        }
      })();
      watering.current.set(id, run);
      return run;
    },
    [apply],
  );

  const markWatered = useCallback(
    (id: string, day: string) => changeWatering(id, day, postWatered),
    [changeWatering],
  );
  const undoWatered = useCallback(
    (id: string, day: string) => changeWatering(id, day, deleteWatered),
    [changeWatering],
  );

  return { plants, offline, loading, error, refresh, remove, markWatered, undoWatered };
}
