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

type SyncResult = { scheduled: number; skipped: number };

/** Syncs and cancels run one at a time, in the order they were asked for. */
let queue: Promise<unknown> = Promise.resolve();
/** The sync at the end of the queue that has not started yet; a newer request replaces its plants. */
let waiting: { slot: { plants: UserPlant[] }; run: Promise<SyncResult> } | null = null;

async function runSync(plants: UserPlant[]): Promise<SyncResult> {
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

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    return { scheduled: 0, skipped: 0 };
  }

  let allowed = false;
  try {
    allowed = await hasNotificationPermission();
  } catch {
    // Treated as not allowed.
  }
  if (!allowed) return { scheduled: 0, skipped: 0 };
  // With nothing to remind about there is nothing to keep going with either.
  if (upcoming.length === 0) return { scheduled: 0, skipped: malformed };

  let scheduled = 0;
  let skipped = malformed;
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
 * permission and never rejects. `skipped` counts failures only: one per plant with a malformed
 * reminder time, plus one per reminder that failed to schedule. Reminders left out by the cap or
 * the one-year horizon are not counted. When notifications are not allowed or the old ones could
 * not be cancelled, the result is `{ scheduled: 0, skipped: 0 }`. With no reminders to schedule,
 * nothing is scheduled at all.
 *
 * Calls run one at a time, queued with cancelAllReminders. A call made while an earlier sync
 * still waits for its turn replaces that sync's plants, and both callers get the result of the
 * one run.
 */
export function syncReminders(plants: UserPlant[]): Promise<SyncResult> {
  if (waiting) {
    waiting.slot.plants = plants;
    return waiting.run;
  }
  const slot = { plants };
  const run = queue.then(() => {
    // Started: a newer request queues a run of its own.
    if (waiting?.slot === slot) waiting = null;
    return runSync(slot.plants);
  });
  waiting = { slot, run };
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Cancels every scheduled notification once the syncs asked for before it have run, so none of
 * them can schedule after it. Rejects when the native cancel fails; the queue keeps going.
 */
export function cancelAllReminders(): Promise<void> {
  // A sync asked for after this cancel must run after it, so it cannot join the waiting one.
  waiting = null;
  const run = queue.then(() => Notifications.cancelAllScheduledNotificationsAsync());
  queue = run.catch(() => undefined);
  return run;
}
