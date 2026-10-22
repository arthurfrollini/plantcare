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
  // Read synchronously, so two taps in the same frame cannot both run.
  const submitting = useRef(false);
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
        if (active) setLoad(loaded);
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

  /**
   * Saves one schedule field on its own, then re-syncs the reminders. One save runs at a time; a
   * second one while it runs is dropped. Resolves true once the change is stored.
   */
  async function saveField(
    field: SavingField,
    change: Partial<ScheduleValues>,
  ): Promise<boolean> {
    if (submitting.current || !plant || status === 'loading') return false;
    const stored: ScheduleValues = {
      wateringDays: plant.wateringDays,
      reminderTime: plant.reminderTime,
      reminderLeadMinutes: plant.reminderLeadMinutes,
    };
    const body: UpdateUserPlant = scheduleChanges(plant, { ...stored, ...change });
    if (Object.keys(body).length === 0) return true;

    submitting.current = true;
    setSavingField(field);
    setPending(change);
    setError(null);
    try {
      const next = await updateMyPlant(plant.id, body);
      setLoad((current) =>
        typeof current === 'object' && 'plant' in current ? { ...current, plant: next } : current,
      );
      setPending({});
      showSaved();
      await syncAfterSave();
      return true;
    } catch (e) {
      setPending({});
      setError(formError(e));
      return false;
    } finally {
      submitting.current = false;
      setSavingField(null);
    }
  }

  function replacePlant(next: UserPlant) {
    setSavedPhotoFailed(false);
    photoRetried.current = false;
    setLoad((current) =>
      typeof current === 'object' && 'plant' in current ? { ...current, plant: next } : current,
    );
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
          setPhotoMessage('failed');
        }
      } else if ('message' in result) {
        setPhotoMessage(result.message);
      } else if (!plant.hasPhoto) {
        setPhotoMessage('cancelled');
      }
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
      setPhotoMessage('failed');
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
