import type { CreateUserPlant, UpdateUserPlant, UserPlant } from '@plantcare/shared';
import type { TFunction } from 'i18next';

import { createMyPlant, listMyPlants, uploadPlantPhoto } from '../api/endpoints';
import type { ConfirmationParams } from '../pages/Confirmation';
import { ensureNotificationPermission, syncReminders } from '../reminders/sync';
import type { PlantFormValues } from './pendingSave';

/** The device time zone as a canonical IANA name; the API rejects anything else. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function createBody(
  catalogPlantId: string,
  values: PlantFormValues,
): CreateUserPlant {
  const nickname = values.nickname.trim();
  const notes = values.notes.trim();
  return {
    catalogPlantId,
    ...(nickname ? { nickname } : {}),
    frequency: values.frequency,
    reminderTime: values.reminderTime,
    timeZone: deviceTimeZone(),
    light: values.light,
    ...(notes ? { notes } : {}),
  };
}

/** Only the fields that differ from the saved plant; empty when nothing changed. */
export function changesBody(saved: UserPlant, values: PlantFormValues): UpdateUserPlant {
  const body: UpdateUserPlant = {};
  const nickname = values.nickname.trim();
  const notes = values.notes.trim();
  if ((nickname || null) !== saved.nickname) body.nickname = nickname || null;
  if (
    values.frequency.per !== saved.frequency.per ||
    values.frequency.times !== saved.frequency.times
  ) {
    body.frequency = values.frequency;
  }
  if (values.reminderTime !== saved.reminderTime) {
    body.reminderTime = values.reminderTime;
    body.timeZone = deviceTimeZone();
  }
  if (values.light !== saved.light) body.light = values.light;
  if ((notes || null) !== saved.notes) body.notes = notes || null;
  return body;
}

/** Creates the plant, then its photo. The photo failing never undoes the plant. */
export async function createPlantWithPhoto(
  catalogPlantId: string,
  values: PlantFormValues,
): Promise<{ plant: UserPlant; photoFailed: boolean }> {
  const plant = await createMyPlant(createBody(catalogPlantId, values));
  if (!values.photo) return { plant, photoFailed: false };
  try {
    await uploadPlantPhoto(plant.id, values.photo);
    return { plant, photoFailed: false };
  } catch {
    return { plant, photoFailed: true };
  }
}

/**
 * Runs after a save the user asked for, so it may prompt for notification permission. A denial,
 * or a list that cannot be fetched, never blocks the save: the plant already exists.
 */
export async function syncAfterSave(): Promise<void> {
  try {
    await ensureNotificationPermission();
  } catch {
    // Reminders just stay off.
  }
  try {
    await syncReminders(await listMyPlants());
  } catch {
    // The next time My Plants loads, it syncs again.
  }
}

export function confirmationParams(t: TFunction, photoFailed: boolean): ConfirmationParams {
  const subtitle = t('plantForm.doneSubtitle');
  return {
    title: t('plantForm.doneTitle'),
    subtitle: photoFailed ? `${subtitle}\n\n${t('plantForm.photoNotSaved')}` : subtitle,
    buttonTitle: t('plantForm.doneButton'),
    icon: 'hug',
    nextScreen: 'MyPlants',
  };
}
