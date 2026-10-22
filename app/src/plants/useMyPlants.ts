import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { UserPlant } from '@plantcare/shared';

import { ApiError, toApiError } from '../api/client';
import { deleteMyPlant, listMyPlants } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { syncReminders } from '../reminders/sync';
import { readMyPlantsCache, writeMyPlantsCache } from './myPlantsCache';

/** The phone schedules at most this many reminders (see reminders/sync.ts). */
const REMINDER_CAP = 60;

let capWarned = false;

/** True once per app session, and only when the cap was actually the reason reminders were left out. */
function shouldWarnAboutCap(result: { scheduled: number; skipped: number }): boolean {
  if (capWarned || result.scheduled !== REMINDER_CAP || result.skipped === 0) return false;
  capWarned = true;
  return true;
}

export type MyPlantsResult = {
  plants: UserPlant[];
  offline: boolean;
  loading: boolean;
  /** Set when the API answered with an error; the cache is not shown for those. */
  error: ApiError | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export function useMyPlants(options: { onCapReached?: () => void } = {}): MyPlantsResult {
  const { status } = useAuth();
  const [plants, setPlants] = useState<UserPlant[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const latest = useRef(0);
  const plantsRef = useRef<UserPlant[]>([]);
  const onCapReached = useRef(options.onCapReached);
  useEffect(() => {
    onCapReached.current = options.onCapReached;
  });

  const apply = useCallback((next: UserPlant[]) => {
    plantsRef.current = next;
    setPlants(next);
  }, []);

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
      const remaining = plantsRef.current.filter((p) => p.id !== id);
      apply(remaining);
      void writeMyPlantsCache(remaining);
      const result = await syncReminders(remaining);
      if (shouldWarnAboutCap(result)) onCapReached.current?.();
    },
    [offline, apply],
  );

  return { plants, offline, loading, error, refresh, remove };
}
