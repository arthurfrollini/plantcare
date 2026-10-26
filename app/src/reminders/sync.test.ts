import * as Notifications from 'expo-notifications';
import { z } from 'zod';
import { reminderMoments, type UserPlant } from '@plantcare/shared';

import { changeLanguage, initI18n } from '../i18n';
import { setToday } from '../plants/testClock';
import { cancelAllReminders, ensureNotificationPermission, syncReminders } from './sync';

const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
const cancelAll = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync);

function plant(overrides: Partial<UserPlant> = {}): UserPlant {
  return {
    id: 'p1',
    catalogPlantId: 'c1',
    nickname: null,
    speciesName: 'Monstera',
    scientificName: 'Monstera deliciosa',
    about: '',
    waterTips: '',
    frequency: { times: 4, per: 'week' },
    reminderTime: '08:30',
    timeZone: 'America/Sao_Paulo',
    light: 'partial_shade',
    difficulty: 'easy',
    wateringDays: [1, 3, 5, 7],
    reminderLeadMinutes: 15,
    scheduleStartsOn: null,
    scheduleNeedsReview: false,
    notes: null,
    imageUrl: null,
    hasPhoto: false,
    photoVersion: null,
    lastWateredOn: null,
    createdAt: '2026-10-22T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(initI18n);

beforeEach(() => {
  schedule.mockClear();
  cancelAll.mockClear();
  jest.mocked(Notifications.requestPermissionsAsync).mockClear();
});

function requests() {
  return schedule.mock.calls.map(([request]) => request);
}

/** A plant with few moments in a year, so everything fits under the cap. */
function monthly(overrides: Partial<UserPlant> = {}): UserPlant {
  return plant({
    frequency: { times: 1, per: 'month' },
    wateringDays: [1],
    scheduleStartsOn: '2026-11-01',
    ...overrides,
  });
}

function reminderCount(plants: UserPlant[]): number {
  const now = new Date();
  const later = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), now.getHours());
  return plants.reduce((n, p) => n + reminderMoments(p, now, later).length, 0);
}

describe('syncReminders', () => {
  beforeEach(() => setToday(new Date(2026, 9, 26, 12, 0)));
  afterEach(() => jest.useRealTimers());

  it('schedules a DATE trigger per watering, soonest first', async () => {
    const result = await syncReminders([plant()]);

    expect(result.scheduled).toBe(requests().length - 1);
    const reminders = requests().filter((r) => r.content.data?.kind !== 'keepGoing');
    expect(reminders.length).toBeGreaterThan(3);
    requests().forEach((r) => expect(r.trigger).toMatchObject({ type: 'date' }));
    // Monday 26 Oct is a watering day; its 08:15 has passed, so Wednesday 28 Oct is first.
    expect(reminders[0]?.trigger).toEqual({
      type: 'date',
      date: new Date(2026, 9, 28, 8, 15),
    });
    expect(reminders[0]?.content.data).toEqual({ userPlantId: 'p1' });
  });

  it('skips the reminder for a watering already ticked, and keeps the next', async () => {
    setToday(new Date(2026, 9, 26, 6, 0));
    await syncReminders([
      plant({
        frequency: { times: 1, per: 'day' },
        lastWateredOn: '2026-10-26',
      }),
    ]);

    const first = requests()[0]?.trigger;
    expect(first).toEqual({ type: 'date', date: new Date(2026, 9, 27, 8, 15) });
  });

  it('brings today back when the watering is not ticked', async () => {
    setToday(new Date(2026, 9, 26, 6, 0));
    await syncReminders([plant({ frequency: { times: 1, per: 'day' }, lastWateredOn: null })]);

    expect(requests()[0]?.trigger).toEqual({
      type: 'date',
      date: new Date(2026, 9, 26, 8, 15),
    });
  });

  it('keeps the 59 soonest across plants and fires the keep-going at the 60th', async () => {
    const daily = (id: string) => plant({ id, frequency: { times: 1, per: 'day' } });

    const result = await syncReminders([daily('a'), daily('b'), daily('c')]);

    expect(result.scheduled).toBe(59);
    expect(schedule).toHaveBeenCalledTimes(60);
    const reminders = requests().slice(0, 59);
    const times = reminders.map((r) =>
      z.object({ date: z.date() }).parse(r.trigger).date.getTime(),
    );
    expect(times).toEqual([...times].sort((x, y) => x - y));
    // Tomorrow 08:15 for a, b, c in id order, then the day after.
    expect(reminders.slice(0, 4).map((r) => r.content.data)).toEqual([
      { userPlantId: 'a' },
      { userPlantId: 'b' },
      { userPlantId: 'c' },
      { userPlantId: 'a' },
    ]);
    // 59 = 19 full days of three + 2: the 60th moment is plant c, 20 days after the first.
    const last = requests()[59];
    expect(last?.content.data).toEqual({ kind: 'keepGoing' });
    expect(last?.content.title).toBe('🌱 Your reminders are running out');
    expect(last?.content.body).toBe('Open PlantCare to keep getting watering reminders.');
    expect(last?.trigger).toEqual({
      type: 'date',
      date: new Date(2026, 10, 15, 8, 15),
    });
  });

  it('writes the keep-going in pt-BR', async () => {
    await changeLanguage('pt-BR');
    await syncReminders([plant({ frequency: { times: 1, per: 'day' } })]);
    await changeLanguage('en');

    const last = requests().at(-1);
    expect(last?.content.title).toBe('🌱 Seus lembretes estão acabando');
    expect(last?.content.body).toBe(
      'Abra o PlantCare pra continuar recebendo os lembretes de rega.',
    );
  });

  it('fires the keep-going one year from now when everything fits', async () => {
    const result = await syncReminders([
      plant({
        frequency: { times: 1, per: 'month' },
        wateringDays: [1],
        scheduleStartsOn: '2026-11-01',
      }),
    ]);

    expect(result.scheduled).toBeGreaterThan(0);
    expect(result.scheduled).toBeLessThan(59);
    expect(result.skipped).toBe(0);
    expect(schedule).toHaveBeenCalledTimes(result.scheduled + 1);
    const last = requests().at(-1);
    expect(last?.content.data).toEqual({ kind: 'keepGoing' });
    expect(last?.trigger).toEqual({
      type: 'date',
      date: new Date(2027, 9, 26, 12, 0),
    });
  });

  it('schedules nothing, not even the keep-going, with no plants or no moments', async () => {
    expect(await syncReminders([])).toEqual({ scheduled: 0, skipped: 0 });
    expect(await syncReminders([plant({ reminderTime: '25:99' })])).toEqual({
      scheduled: 0,
      skipped: 1,
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(cancelAll).toHaveBeenCalledTimes(2);
  });

  it('cancels existing notifications before scheduling', async () => {
    const order: string[] = [];
    cancelAll.mockImplementationOnce(() => {
      order.push('cancel');
      return Promise.resolve();
    });
    schedule.mockImplementationOnce(() => {
      order.push('schedule');
      return Promise.resolve('id');
    });

    await syncReminders([plant({ frequency: { times: 1, per: 'week' } })]);

    expect(order).toEqual(['cancel', 'schedule']);
  });

  it('skips a plant with a malformed time without aborting the others', async () => {
    const good = monthly({ id: 'good' });
    const count = reminderCount([good]);

    const result = await syncReminders([plant({ id: 'bad', reminderTime: '25:99' }), good]);

    expect(result).toEqual({ scheduled: count, skipped: 1 });
    const data = requests().map((r) => r.content.data);
    expect(data.slice(0, count).every((d) => d?.userPlantId === 'good')).toBe(true);
    expect(data.at(-1)).toEqual({ kind: 'keepGoing' });
  });

  it('skips a reminder whose scheduling fails and keeps going', async () => {
    const count = reminderCount([monthly()]);
    schedule.mockRejectedValueOnce(new Error('boom'));

    const result = await syncReminders([monthly()]);

    expect(result).toEqual({ scheduled: count - 1, skipped: 1 });
  });

  it('schedules nothing when notifications are not allowed', async () => {
    const count = reminderCount([monthly()]);
    const denied = {
      granted: false,
      canAskAgain: false,
      expires: 'never' as const,
      status: Notifications.PermissionStatus.DENIED,
    };
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(denied);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce(denied);

    const result = await syncReminders([monthly()]);

    expect(result).toEqual({ scheduled: 0, skipped: count });
    expect(schedule).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never rejects: a failed cancel skips every reminder, and the queue keeps working', async () => {
    const count = reminderCount([monthly()]);
    cancelAll.mockRejectedValueOnce(new Error('boom'));

    const failed = await syncReminders([monthly(), plant({ reminderTime: 'x' })]);
    expect(failed).toEqual({ scheduled: 0, skipped: count + 1 });
    expect(schedule).not.toHaveBeenCalled();

    expect(await syncReminders([monthly()])).toEqual({
      scheduled: count,
      skipped: 0,
    });
  });

  it('runs concurrent syncs one after another; the second call wins', async () => {
    const active = new Set<string>();
    let next = 0;
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
    cancelAll.mockImplementation(async () => {
      await tick();
      active.clear();
    });
    schedule.mockImplementation(async (request) => {
      await tick();
      next += 1;
      active.add(`${next}:${JSON.stringify(request.content.data)}`);
      return String(next);
    });

    const first = syncReminders([monthly({ id: 'first' })]);
    const second = syncReminders([monthly({ id: 'second' })]);
    await Promise.all([first, second]);

    expect(active.size).toBe(reminderCount([monthly()]) + 1);
    expect([...active].some((entry) => entry.includes('first'))).toBe(false);
    expect([...active].some((entry) => entry.includes('second'))).toBe(true);

    cancelAll.mockReset();
    cancelAll.mockResolvedValue(undefined);
    schedule.mockReset();
    schedule.mockResolvedValue('notification-id');
  });
});

describe('cancelAllReminders', () => {
  it('cancels everything', async () => {
    await cancelAllReminders();
    expect(cancelAll).toHaveBeenCalledTimes(1);
  });
});

describe('ensureNotificationPermission', () => {
  it('is true when already granted', async () => {
    expect(await ensureNotificationPermission()).toBe(true);
  });
});
