import { useCallback, useEffect, useRef, useState } from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Frequency, Light, UserPlant } from '@plantcare/shared';

import { toApiError } from '../api/client';
import {
  getCatalogPlant,
  listMyPlants,
  plantPhotoSource,
  updateMyPlant,
  uploadPlantPhoto,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { loadTokens } from '../auth/session';
import type { RootStackParamList } from '../routes/stack.routes';
import { setPendingSave, type PlantFormValues } from './pendingSave';
import { pickPhoto as pickFrom, type PhotoMessage, type PhotoSource } from './pickPhoto';
import {
  changesBody,
  confirmationParams,
  createPlantWithPhoto,
  syncAfterSave,
} from './savePlant';

export type { PlantFormValues } from './pendingSave';
export type PlantFormParams = RootStackParamList['PlantForm'];

export type Species = {
  name: string;
  scientificName: string;
  about: string;
  waterTips: string;
  imageUrl: string | null;
};

export type FormError = 'network' | 'validation_error' | 'rate_limited' | 'unknown';
export type { PhotoMessage } from './pickPhoto';

type Load =
  | { state: 'loading' }
  | { state: 'error'; error: FormError }
  | { state: 'ready'; species: Species; saved: UserPlant | null; accessToken: string | null };

const DEFAULT_VALUES: PlantFormValues = {
  nickname: '',
  frequency: { times: 1, per: 'week' },
  reminderTime: '08:00',
  light: null,
  notes: '',
  photo: null,
};

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

function valuesOf(saved: UserPlant): PlantFormValues {
  return {
    nickname: saved.nickname ?? '',
    frequency: saved.frequency,
    reminderTime: saved.reminderTime,
    light: saved.light,
    notes: saved.notes ?? '',
    photo: null,
  };
}

type Ready = Extract<Load, { state: 'ready' }>;

async function loadForm(params: PlantFormParams): Promise<{ ready: Ready; values: PlantFormValues }> {
  if (params.mode === 'create') {
    const plant = await getCatalogPlant(params.catalogPlantId);
    return {
      ready: { state: 'ready', species: plant, saved: null, accessToken: null },
      // The species' own care plan is the starting point, with the photo if one was taken first.
      values: {
        ...DEFAULT_VALUES,
        frequency: plant.frequency,
        light: plant.light,
        photo: params.photo ?? null,
      },
    };
  }
  // The list request refreshes an expired token first, so the token is read after it.
  const plants = await listMyPlants();
  const tokens = await loadTokens();
  const saved = plants.find((p) => p.id === params.userPlantId);
  if (!saved) throw new Error('Plant not found');
  return {
    ready: {
      state: 'ready',
      species: {
        name: saved.speciesName,
        scientificName: saved.scientificName,
        about: saved.about,
        waterTips: saved.waterTips,
        imageUrl: saved.imageUrl,
      },
      saved,
      accessToken: tokens?.accessToken ?? null,
    },
    values: valuesOf(saved),
  };
}

export function usePlantForm(params: PlantFormParams) {
  const navigation = useNavigation();
  const { status } = useAuth();
  const { t } = useTranslation();

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [values, setValues] = useState<PlantFormValues>(DEFAULT_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [photoMessage, setPhotoMessage] = useState<PhotoMessage | null>(null);
  // Read synchronously, so two taps in the same frame cannot both submit.
  const submitting = useRef(false);
  const photoRetried = useRef(false);
  const [savedPhotoFailed, setSavedPhotoFailed] = useState(false);

  const { mode } = params;
  const targetId = params.mode === 'create' ? params.catalogPlantId : params.userPlantId;
  const initialPhoto = params.mode === 'create' ? params.photo : undefined;
  const photoUri = initialPhoto?.uri;
  const photoType = initialPhoto?.mimeType;
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const photo = photoUri && photoType ? { uri: photoUri, mimeType: photoType } : undefined;
    const target: PlantFormParams =
      mode === 'create'
        ? { mode, catalogPlantId: targetId, photo }
        : { mode, userPlantId: targetId };
    loadForm(target).then(
      (result) => {
        if (!active) return;
        setValues(result.values);
        setLoad(result.ready);
      },
      (e: unknown) => {
        if (active) setLoad({ state: 'error', error: formError(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [mode, targetId, photoUri, photoType, attempt]);

  const retryLoad = useCallback(() => {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const update = (patch: Partial<PlantFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  function setPer(per: Frequency['per']) {
    update({
      frequency:
        per === 'day'
          ? { times: 1, per: 'day' }
          : { times: values.frequency.per === 'week' ? values.frequency.times : 1, per: 'week' },
    });
  }

  function setTimes(times: number) {
    // Per day is always once a day.
    if (values.frequency.per === 'day') return;
    update({ frequency: { times: Math.min(7, Math.max(1, Math.round(times))), per: 'week' } });
  }

  async function pickPhoto(source: PhotoSource) {
    setPhotoMessage(null);
    const result = await pickFrom(source);
    if ('photo' in result) {
      update({ photo: result.photo });
    } else if ('message' in result) {
      setPhotoMessage(result.message);
    } else {
      // With a photo showing (just picked, or saved), "no photo" would be misleading.
      const showingPhoto = values.photo !== null || (load.state === 'ready' && load.saved?.hasPhoto);
      if (!showingPhoto) setPhotoMessage('cancelled');
    }
  }

  function removePhoto() {
    setPhotoMessage(null);
    update({ photo: null });
  }

  /**
   * The saved photo failed to load. The first time, maybe the token expired: refresh it and read
   * it again. After that the photo is given up on and the species illustration shows instead.
   */
  async function handleSavedPhotoError() {
    if (photoRetried.current) {
      setSavedPhotoFailed(true);
      return;
    }
    photoRetried.current = true;
    try {
      await listMyPlants();
      const tokens = await loadTokens();
      setLoad((current) =>
        current.state === 'ready' ? { ...current, accessToken: tokens?.accessToken ?? null } : current,
      );
    } catch {
      setSavedPhotoFailed(true);
    }
  }

  async function submit(): Promise<void> {
    if (submitting.current || load.state !== 'ready' || status === 'loading') return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      if (params.mode === 'create') {
        if (status !== 'signedIn') {
          await setPendingSave({ ...values, catalogPlantId: params.catalogPlantId });
          navigation.navigate('Auth', { mode: 'signUp', afterAuth: 'savePendingPlant' });
          return;
        }
        const { photoFailed } = await createPlantWithPhoto(params.catalogPlantId, values);
        await syncAfterSave();
        navigation.dispatch(StackActions.replace('Confirmation', confirmationParams(t, photoFailed)));
        return;
      }

      const saved = load.saved;
      if (!saved) return;
      const changes = changesBody(saved, values);
      if (Object.keys(changes).length > 0) await updateMyPlant(saved.id, changes);
      let photoFailed = false;
      if (values.photo) {
        try {
          await uploadPlantPhoto(saved.id, values.photo);
        } catch {
          photoFailed = true;
        }
      }
      await syncAfterSave();
      navigation.dispatch(StackActions.replace('Confirmation', confirmationParams(t, photoFailed)));
    } catch (e) {
      setError(formError(e));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const ready = load.state === 'ready' ? load : null;
  const savedPhoto =
    ready?.saved && ready.accessToken && !savedPhotoFailed ? plantPhotoSource(ready.saved, ready.accessToken) : null;

  return {
    load,
    species: ready?.species ?? null,
    savedPhoto,
    ...values,
    values,
    saving,
    error,
    photoMessage,
    status,
    retryLoad,
    setNickname: (nickname: string) => update({ nickname }),
    setPer,
    setTimes,
    setReminderTime: (reminderTime: string) => update({ reminderTime }),
    setLight: (light: Light | null) => update({ light }),
    setNotes: (notes: string) => update({ notes }),
    pickPhoto,
    removePhoto,
    handleSavedPhotoError,
    submit,
  };
}
