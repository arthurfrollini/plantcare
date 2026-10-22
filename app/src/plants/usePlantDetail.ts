import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultWateringDays,
  requiredWateringDays,
  type UpdateUserPlant,
  type UserPlant,
} from '@plantcare/shared';

import { toApiError } from '../api/client';
import {
  deletePlantPhoto,
  listMyPlants,
  plantPhotoSource,
  updateMyPlant,
  uploadPlantPhoto,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { loadTokens } from '../auth/session';
import { pickPhoto, type PhotoMessage, type PhotoSource } from './pickPhoto';
import { scheduleChanges, syncAfterSave, type ScheduleValues } from './savePlant';

export type { PhotoMessage } from './pickPhoto';
export type FormError = 'network' | 'validation_error' | 'rate_limited' | 'unknown';
export type SavingField = 'days' | 'time' | 'lead';

/** How long the "Saved" toast stays after a save. */
export const SAVED_TOAST_MS = 1500;

type Loaded = { plant: UserPlant; accessToken: string | null };
type Load = 'loading' | { error: FormError } | Loaded;

function formError(e: unknown): FormError {
  const { code } = toApiError(e);
  switch (code) {
    case 'network':
    case 'validation_error':
    case 'rate_limited':
      return code;
    default:
      return 'unknown';
  }
}

/** The schedule as shown: the stored days, or the defaults the reminders use while they are wrong. */
function shownValues(plant: UserPlant): ScheduleValues {
  const required = requiredWateringDays(plant.frequency);
  return {
    wateringDays:
      plant.wateringDays.length === required
        ? plant.wateringDays
        : defaultWateringDays(plant.frequency),
    reminderTime: plant.reminderTime,
    reminderLeadMinutes: plant.reminderLeadMinutes,
  };
}

function storedValues(plant: UserPlant): ScheduleValues {
  return {
    wateringDays: plant.wateringDays,
    reminderTime: plant.reminderTime,
    reminderLeadMinutes: plant.reminderLeadMinutes,
  };
}

const FIELD_KEYS: Record<SavingField, keyof ScheduleValues> = {
  days: 'wateringDays',
  time: 'reminderTime',
  lead: 'reminderLeadMinutes',
};

const EMPTY_VALUES: ScheduleValues = { wateringDays: [], reminderTime: '08:00', reminderLeadMinutes: 15 };

/** A plant in the garden: each schedule field and the photo are saved as soon as they change. */
export function usePlantDetail({ userPlantId }: { userPlantId: string }) {
  const { status } = useAuth();

  const [load, setLoad] = useState<Load>('loading');
  // The value being saved, shown until the response replaces the plant or the save fails.
  const [pending, setPending] = useState<Partial<ScheduleValues>>({});
  const [savingField, setSavingField] = useState<SavingField | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<PhotoMessage | null>(null);
  const [savedPhotoFailed, setSavedPhotoFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The plant as last stored, read by queued saves that run after this render.
  const plantRef = useRef<UserPlant | null>(null);
  // Schedule saves run one after another; the newest change to a field is the one stored.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const latestSave = useRef<Record<SavingField, number>>({ days: 0, time: 0, lead: 0 });
  const queuedSaves = useRef(0);
  // Reminder syncs run one at a time, outside the save queue.
  const syncQueue = useRef<Promise<unknown>>(Promise.resolve());
  const syncWaiting = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoWorking = useRef(false);
  const photoRetried = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // The list request refreshes an expired token first, so the token is read after it.
      const plants = await listMyPlants();
      const tokens = await loadTokens();
      const plant = plants.find((p) => p.id === userPlantId);
      if (!plant) throw new Error('Plant not found');
      return { plant, accessToken: tokens?.accessToken ?? null };
    })().then(
      (loaded) => {
        if (!active) return;
        plantRef.current = loaded.plant;
        setLoad(loaded);
      },
      (e: unknown) => {
        if (active) setLoad({ error: formError(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [userPlantId, attempt]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const retryLoad = useCallback(() => {
    setLoad('loading');
    setAttempt((n) => n + 1);
  }, []);

  const loaded = typeof load === 'object' && 'plant' in load ? load : null;
  const plant = loaded?.plant ?? null;
  const requiredDays = plant ? requiredWateringDays(plant.frequency) : 0;
  const needsReview = plant?.scheduleNeedsReview ?? false;
  const values: ScheduleValues = plant ? { ...shownValues(plant), ...pending } : EMPTY_VALUES;

  function showSaved() {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSaved(true);
    savedTimer.current = setTimeout(() => {
      savedTimer.current = null;
      setSaved(false);
    }, SAVED_TOAST_MS);
  }

  function storePlant(next: UserPlant) {
    plantRef.current = next;
    setLoad((current) =>
      typeof current === 'object' && 'plant' in current ? { ...current, plant: next } : current,
    );
  }

  /** Re-syncs the reminders after a save. A sync still waiting to start covers this save too. */
  function queueSync() {
    if (syncWaiting.current) return;
    syncWaiting.current = true;
    syncQueue.current = syncQueue.current
      .then(() => {
        syncWaiting.current = false;
        return syncAfterSave();
      })
      .catch(() => undefined);
  }

  /** Stops showing a field's unsaved value, unless a newer change to it is still on its way. */
  function settlePending(field: SavingField, save: number) {
    if (save !== latestSave.current[field]) return;
    const key = FIELD_KEYS[field];
    setPending((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /**
   * Saves one schedule field on its own. Saves run in order, and a change replaced by a newer one
   * to the same field before its turn is skipped, so the last change is the one stored; the
   * screen shows it from the tap on. The reminders re-sync after each stored change, outside the
   * queue. Resolves true once the change is stored (or replaced by a newer one), false when the
   * save failed and the stored value is back on screen with `error` set.
   */
  function saveField(field: SavingField, change: Partial<ScheduleValues>): Promise<boolean> {
    if (!plantRef.current || status === 'loading') return Promise.resolve(false);
    latestSave.current[field] += 1;
    const save = latestSave.current[field];
    queuedSaves.current += 1;
    setPending((current) => ({ ...current, ...change }));
    setError(null);

    const run = saveQueue.current
      .then(async () => {
        const current = plantRef.current;
        if (!current || save !== latestSave.current[field]) return true;
        const body: UpdateUserPlant = scheduleChanges(current, {
          ...storedValues(current),
          ...change,
        });
        if (Object.keys(body).length === 0) {
          settlePending(field, save);
          return true;
        }
        setSavingField(field);
        try {
          storePlant(await updateMyPlant(current.id, body));
          settlePending(field, save);
          // A failure of an earlier save that this one replaced no longer applies.
          setError(null);
          showSaved();
          queueSync();
          return true;
        } catch (e) {
          settlePending(field, save);
          setError(formError(e));
          return false;
        }
      })
      .finally(() => {
        queuedSaves.current -= 1;
        if (queuedSaves.current === 0) setSavingField(null);
      });
    saveQueue.current = run.catch(() => undefined);
    return run;
  }

  function replacePlant(next: UserPlant) {
    setSavedPhotoFailed(false);
    photoRetried.current = false;
    storePlant(next);
  }

  async function changePhoto(source: PhotoSource): Promise<void> {
    if (photoWorking.current || !plant) return;
    photoWorking.current = true;
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      const result = await pickPhoto(source);
      if ('photo' in result) {
        try {
          replacePlant(await uploadPlantPhoto(plant.id, result.photo));
        } catch {
          setPhotoMessage('uploadFailed');
        }
      } else if ('message' in result) {
        setPhotoMessage(result.message);
      }
      // A cancelled picker leaves the photo as it was, with nothing to say.
    } finally {
      photoWorking.current = false;
      setPhotoBusy(false);
    }
  }

  async function removePhoto(): Promise<void> {
    if (photoWorking.current || !plant) return;
    photoWorking.current = true;
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      replacePlant(await deletePlantPhoto(plant.id));
    } catch {
      setPhotoMessage('removeFailed');
    } finally {
      photoWorking.current = false;
      setPhotoBusy(false);
    }
  }

  /**
   * The saved photo failed to load. The first time, maybe the token expired: refresh it and read
   * it again. After that the photo is given up on and the species illustration shows instead.
   */
  async function handleSavedPhotoError(): Promise<void> {
    if (photoRetried.current) {
      setSavedPhotoFailed(true);
      return;
    }
    photoRetried.current = true;
    try {
      await listMyPlants();
      const tokens = await loadTokens();
      setLoad((current) =>
        typeof current === 'object' && 'plant' in current
          ? { ...current, accessToken: tokens?.accessToken ?? null }
          : current,
      );
    } catch {
      setSavedPhotoFailed(true);
    }
  }

  const loadState: 'ready' | 'loading' | { error: FormError } = loaded
    ? 'ready'
    : typeof load === 'object' && 'error' in load
      ? load
      : 'loading';

  const photoSource =
    loaded && loaded.accessToken && !savedPhotoFailed
      ? plantPhotoSource(loaded.plant, loaded.accessToken)
      : null;

  return {
    load: loadState,
    plant,
    values,
    requiredDays,
    needsReview,
    savingField,
    saved,
    error,
    photoSource,
    photoBusy,
    photoMessage,
    saveDays: (wateringDays: number[]) => saveField('days', { wateringDays }),
    saveReminderTime: (reminderTime: string) => saveField('time', { reminderTime }),
    saveLead: (reminderLeadMinutes: number) => saveField('lead', { reminderLeadMinutes }),
    changePhoto,
    removePhoto,
    handleSavedPhotoError,
    retryLoad,
  };
}
