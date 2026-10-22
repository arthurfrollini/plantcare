import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { UserPlant } from '@plantcare/shared';

import { ApiError, toApiError } from '../api/client';
import { deleteMyPlant, listMyPlants } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { syncReminders, warnIfCapped } from '../reminders/sync';
import { readMyPlantsCache, writeMyPlantsCache } from './myPlantsCache';

export type MyPlantsResult = {
  plants: UserPlant[];
  offline: boolean;
  loading: boolean;
  /** Set when the API answered with an error; the cache is not shown for those. */
  error: ApiError | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
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
  const shownFor = useRef<string | null>(null);

  const apply = useCallback((next: UserPlant[]) => {
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
      const result = await syncReminders(remaining);
      warnIfCapped(result);
    },
    [offline, apply],
  );

  return { plants, offline, loading, error, refresh, remove };
}
