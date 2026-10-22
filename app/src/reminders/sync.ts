import * as Notifications from 'expo-notifications';
import { reminderSlots, type ReminderSlot, type UserPlant } from '@plantcare/shared';

import i18n from '../i18n';

/** iOS keeps at most 64 pending local notifications; stay under it. */
const MAX_SCHEDULED = 60;

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
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

/**
 * Replaces every scheduled reminder with one per watering slot of the given plants, in the order
 * given, up to MAX_SCHEDULED. `skipped` counts slots over the cap, one per plant with a malformed
 * reminder time, and every slot when notifications are not allowed.
 */
export async function syncReminders(
  plants: UserPlant[],
): Promise<{ scheduled: number; skipped: number }> {
  await cancelAllReminders();

  const allowed = await ensureNotificationPermission();
  let scheduled = 0;
  let skipped = 0;

  for (const plant of plants) {
    const slots = slotsOf(plant);
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
