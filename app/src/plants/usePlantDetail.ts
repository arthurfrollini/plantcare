import { useCallback, useEffect, useRef, useState } from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { defaultWateringDays, requiredWateringDays, type UserPlant } from '@plantcare/shared';

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
import { confirmationParams, scheduleChanges, syncAfterSave, type ScheduleValues } from './savePlant';

export type { PhotoMessage } from './pickPhoto';
export type FormError = 'network' | 'validation_error' | 'rate_limited' | 'unknown';

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

function initialValues(plant: UserPlant): ScheduleValues {
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

/** A plant in the garden: its schedule (saved together) and its photo (saved at once). */
export function usePlantDetail({ userPlantId }: { userPlantId: string }) {
  const navigation = useNavigation();
  const { status } = useAuth();
  const { t } = useTranslation();

  const [load, setLoad] = useState<Load>('loading');
  const [values, setValues] = useState<ScheduleValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<PhotoMessage | null>(null);
  const [savedPhotoFailed, setSavedPhotoFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Read synchronously, so two taps in the same frame cannot both run.
  const submitting = useRef(false);
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
        setValues(initialValues(loaded.plant));
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

  const retryLoad = useCallback(() => {
    setLoad('loading');
    setAttempt((n) => n + 1);
  }, []);

  const loaded = typeof load === 'object' && 'plant' in load ? load : null;
  const plant = loaded?.plant ?? null;
  const requiredDays = plant ? requiredWateringDays(plant.frequency) : 0;
  const needsReview = plant?.scheduleNeedsReview ?? false;
  const differs = plant !== null && (needsReview || Object.keys(scheduleChanges(plant, values)).length > 0);
  const canSave = differs && values.wateringDays.length === requiredDays;

  function toggleDay(day: number) {
    if (requiredDays === 0) return;
    setValues((current) => {
      const days = current.wateringDays;
      if (requiredDays === 1) return { ...current, wateringDays: [day] };
      if (days.includes(day)) return { ...current, wateringDays: days.filter((d) => d !== day) };
      if (days.length >= requiredDays) return current;
      return { ...current, wateringDays: [...days, day].sort((a, b) => a - b) };
    });
  }

  async function save(): Promise<void> {
    if (submitting.current || !plant || !canSave || status === 'loading') return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const changes = scheduleChanges(plant, values);
      if (Object.keys(changes).length > 0) await updateMyPlant(plant.id, changes);
      await syncAfterSave();
      navigation.dispatch(StackActions.replace('Confirmation', confirmationParams(t)));
    } catch (e) {
      setError(formError(e));
    } finally {
      submitting.current = false;
      setSaving(false);
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
    canSave,
    saving,
    error,
    photoSource,
    photoBusy,
    photoMessage,
    toggleDay,
    setReminderTime: (reminderTime: string) => setValues((v) => ({ ...v, reminderTime })),
    setLead: (reminderLeadMinutes: number) => setValues((v) => ({ ...v, reminderLeadMinutes })),
    save,
    changePhoto,
    removePhoto,
    handleSavedPhotoError,
    retryLoad,
  };
}
