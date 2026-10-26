import * as Notifications from 'expo-notifications';
import { reminderMoments, type UserPlant } from '@plantcare/shared';

import i18n from '../i18n';

/** iOS keeps at most 64 pending local notifications; stay under it: 59 reminders + 1 keep-going. */
const MAX_REMINDERS = 59;

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

type Planned = { at: Date; plant: UserPlant };

/** Every upcoming reminder of one plant that is not for a watering already ticked; null if malformed. */
function plannedFor(plant: UserPlant, now: Date, until: Date): Planned[] | null {
  try {
    return reminderMoments(plant, now, until)
      .filter((moment) => moment.wateringOn !== plant.lastWateredOn)
      .map((moment) => ({ at: moment.at, plant }));
  } catch {
    return null;
  }
}

function byTimeThenPlant(a: Planned, b: Planned): number {
  const byTime = a.at.getTime() - b.at.getTime();
  if (byTime !== 0) return byTime;
  return a.plant.id < b.plant.id ? -1 : a.plant.id > b.plant.id ? 1 : 0;
}

function dateTrigger(date: Date): Notifications.NotificationTriggerInput {
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
}

let queue: Promise<unknown> = Promise.resolve();

async function runSync(plants: UserPlant[]): Promise<{ scheduled: number; skipped: number }> {
  const now = new Date();
  const until = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
  );
  let malformed = 0;
  const upcoming: Planned[] = [];
  for (const plant of plants) {
    const planned = plannedFor(plant, now, until);
    if (planned) upcoming.push(...planned);
    else malformed += 1;
  }
  upcoming.sort(byTimeThenPlant);
  const totalSkipped = upcoming.length + malformed;

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
  // With nothing to remind about there is nothing to keep going with either.
  if (!allowed || upcoming.length === 0) return { scheduled: 0, skipped: totalSkipped };

  let scheduled = 0;
  let skipped = malformed + Math.max(0, upcoming.length - MAX_REMINDERS);
  for (const { at, plant } of upcoming.slice(0, MAX_REMINDERS)) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('notification.title'),
          body: i18n.t('notification.body', {
            minutes: plant.reminderLeadMinutes,
            name: plant.speciesName,
          }),
          sound: true,
          data: { userPlantId: plant.id },
        },
        trigger: dateTrigger(at),
      });
      scheduled += 1;
    } catch {
      skipped += 1;
    }
  }

  // Slot 60: fires when the first left-out reminder would have, or at the end of the horizon.
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('notification.keepGoingTitle'),
        body: i18n.t('notification.keepGoingBody'),
        sound: true,
        data: { kind: 'keepGoing' },
      },
      trigger: dateTrigger(upcoming[MAX_REMINDERS]?.at ?? until),
    });
  } catch {
    // The reminders stay; only the nudge to reopen the app is lost.
  }
  return { scheduled, skipped };
}

/**
 * Replaces every scheduled reminder with one dated notification per upcoming watering of the
 * given plants, up to a year ahead, skipping waterings already ticked. The MAX_REMINDERS soonest
 * across all plants are kept, followed by one "keep going" notification. Never prompts for
 * permission and never rejects. `skipped` counts reminders left out by the cap, one per plant
 * with a malformed reminder time, and every reminder when notifications are not allowed or the
 * old ones could not be cancelled. With no reminders to schedule, nothing is scheduled at all.
 * Calls run one at a time.
 */
export function syncReminders(
  plants: UserPlant[],
): Promise<{ scheduled: number; skipped: number }> {
  const run = queue.then(() => runSync(plants));
  queue = run.catch(() => undefined);
  return run;
}
