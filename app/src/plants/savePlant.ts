import { timeZoneSchema } from '@plantcare/shared';
import type { CreateUserPlant, UpdateUserPlant, UserPlant } from '@plantcare/shared';
import type { TFunction } from 'i18next';

import { createMyPlant, listMyPlants } from '../api/endpoints';
import type { ConfirmationParams } from '../pages/Confirmation';
import { ensureNotificationPermission, syncReminders, warnIfCapped } from '../reminders/sync';
import type { PlantFormValues, SpeciesPick } from './pendingSave';

/** Every plant added from the catalog starts with its reminder at this time; it can be edited. */
export const DEFAULT_REMINDER_TIME = '08:00';

/** Keeps a zone only when the API will accept it; devices may report "GMT" or an empty value. */
export function normalizeTimeZone(zone: string | undefined): string {
  const parsed = timeZoneSchema.safeParse(zone);
  return parsed.success ? parsed.data : 'UTC';
}

/** The device time zone as a canonical IANA name; the API rejects anything else. */
export function deviceTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'UTC';
  }
}

/** A new plant with the species' own care plan; nickname, notes and photo come later, by editing. */
export function createBody(pick: SpeciesPick): CreateUserPlant {
  return {
    catalogPlantId: pick.catalogPlantId,
    frequency: pick.frequency,
    reminderTime: DEFAULT_REMINDER_TIME,
    timeZone: deviceTimeZone(),
    light: pick.light,
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

export type AddPlantsResult = {
  added: UserPlant[];
  failed: SpeciesPick[];
  /** Why the first failure happened, to pick the message when nothing was added. */
  error: unknown;
};

/**
 * Adds the picked species to the garden one at a time (the API creates one plant per request).
 * A failure does not stop the rest; the caller decides what to do with the ones that failed.
 */
export async function addPlants(picks: SpeciesPick[]): Promise<AddPlantsResult> {
  const result: AddPlantsResult = { added: [], failed: [], error: null };
  for (const pick of picks) {
    try {
      result.added.push(await createMyPlant(createBody(pick)));
    } catch (e) {
      result.failed.push(pick);
      if (result.error === null) result.error = e;
    }
  }
  return result;
}

/**
 * Runs after a save the user asked for, so it may prompt for notification permission. A denial,
 * or a list that cannot be fetched, never blocks the save: the plant already exists. Warns once
 * per session when the phone's reminder cap was hit.
 */
export async function syncAfterSave(): Promise<{ scheduled: number; skipped: number } | null> {
  try {
    await ensureNotificationPermission();
  } catch {
    // Reminders just stay off.
  }
  try {
    const result = await syncReminders(await listMyPlants());
    warnIfCapped(result);
    return result;
  } catch {
    // The next time a sync runs (sign-in, foreground), it tries again.
    return null;
  }
}

/** The confirmation after plants were added from the catalog; mentions any that were not. */
export function addedConfirmationParams(
  t: TFunction,
  added: number,
  failed: number,
): ConfirmationParams {
  const subtitle = t('plantSelect.added', { count: added });
  return {
    title: t('plantForm.doneTitle'),
    subtitle: failed > 0 ? `${subtitle}\n\n${t('plantSelect.notAdded', { count: failed })}` : subtitle,
    buttonTitle: t('plantForm.doneButton'),
    icon: 'hug',
    nextScreen: 'MyPlants',
  };
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
