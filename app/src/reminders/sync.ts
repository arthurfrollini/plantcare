import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { reminderSlots, type ReminderSlot, type UserPlant } from '@plantcare/shared';

import i18n from '../i18n';

/** iOS keeps at most 64 pending local notifications; stay under it. */
const MAX_SCHEDULED = 60;

/** Reads the permission without ever prompting; for background syncs. */
export async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

/** Prompts when needed; for moments the user initiated, such as saving a plant. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (await hasNotificationPermission()) return true;
  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

function triggerFor(slot: ReminderSlot): Notifications.NotificationTriggerInput {
  if (slot.weekday === null) {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: slot.hour,
      minute: slot.minute,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: slot.weekday,
    hour: slot.hour,
    minute: slot.minute,
  };
}

function slotsOf(plant: UserPlant): ReminderSlot[] | null {
  try {
    return reminderSlots(plant.frequency, plant.reminderTime);
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();

async function runSync(plants: UserPlant[]): Promise<{ scheduled: number; skipped: number }> {
  const planned = plants.map((plant) => ({ plant, slots: slotsOf(plant) }));
  const totalSkipped = planned.reduce((n, { slots }) => n + (slots ? slots.length : 1), 0);

  try {
    await cancelAllReminders();
  } catch {
    return { scheduled: 0, skipped: totalSkipped };
  }

  let allowed = false;
  try {
    allowed = await hasNotificationPermission();
  } catch {
    // Treated as not allowed.
  }
  let scheduled = 0;
  let skipped = 0;

  for (const { plant, slots } of planned) {
    if (!slots) {
      skipped += 1;
      continue;
    }
    for (const slot of slots) {
      if (!allowed || scheduled >= MAX_SCHEDULED) {
        skipped += 1;
        continue;
      }
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('notification.title'),
            body: i18n.t('notification.body', { name: plant.nickname ?? plant.speciesName }),
            sound: true,
            data: { userPlantId: plant.id },
          },
          trigger: triggerFor(slot),
        });
        scheduled += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { scheduled, skipped };
}

/**
 * Replaces every scheduled reminder with one per watering slot of the given plants, in the order
 * given, up to MAX_SCHEDULED. Never prompts for permission and never rejects. `skipped` counts
 * slots over the cap, one per plant with a malformed reminder time, and every slot when
 * notifications are not allowed or the old ones could not be cancelled. Calls run one at a time.
 */
export function syncReminders(
  plants: UserPlant[],
): Promise<{ scheduled: number; skipped: number }> {
  const run = queue.then(() => runSync(plants));
  queue = run.catch(() => undefined);
  return run;
}

let capWarned = false;

/**
 * Tells the user, once per app session, that the phone holds only MAX_SCHEDULED reminders. Only
 * for syncs the user triggered (a save, a removal); background syncs stay silent. `skipped` also
 * counts denied permission and malformed times, so the cap counts only when it was really hit.
 */
export function warnIfCapped(result: { scheduled: number; skipped: number }): void {
  if (capWarned || result.scheduled !== MAX_SCHEDULED || result.skipped === 0) return;
  capWarned = true;
  Alert.alert(i18n.t('myPlants.capReached'));
}

/** Test-only: lets each test see the first-warning behaviour again. */
export function resetCapWarning(): void {
  capWarned = false;
}
