import * as Notifications from 'expo-notifications';
import type { UserPlant } from '@plantcare/shared';

import { initI18n } from '../i18n';
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
    light: null,
    notes: null,
    imageUrl: null,
    hasPhoto: false,
    photoVersion: null,
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

describe('syncReminders', () => {
  it('schedules a WEEKLY trigger per slot', async () => {
    const result = await syncReminders([plant()]);

    expect(result).toEqual({ scheduled: 4, skipped: 0 });
    expect(requests().map((r) => r.trigger)).toEqual(
      [2, 4, 6, 1].map((weekday) => ({ type: 'weekly', weekday, hour: 8, minute: 30 })),
    );
    expect(requests()[0]?.content.data).toEqual({ userPlantId: 'p1' });
  });

  it('schedules one DAILY trigger for a daily plant', async () => {
    const result = await syncReminders([
      plant({ frequency: { times: 1, per: 'day' }, reminderTime: '21:05' }),
    ]);

    expect(result).toEqual({ scheduled: 1, skipped: 0 });
    expect(requests().map((r) => r.trigger)).toEqual([{ type: 'daily', hour: 21, minute: 5 }]);
  });

  it('names the plant by nickname, else species', async () => {
    await syncReminders([plant({ nickname: 'Fred', frequency: { times: 1, per: 'week' } })]);
    await syncReminders([plant({ frequency: { times: 1, per: 'week' } })]);

    const [first, second] = requests();
    expect(first?.content.body).toContain('Fred');
    expect(second?.content.body).toContain('Monstera');
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

  it('schedules at most 60 and reports the rest as skipped', async () => {
    const plants = Array.from({ length: 20 }, (_, i) => plant({ id: `p${i}` }));

    const result = await syncReminders(plants);

    expect(result).toEqual({ scheduled: 60, skipped: 20 });
    expect(schedule).toHaveBeenCalledTimes(60);
    expect(requests().at(-1)?.content.data).toEqual({ userPlantId: 'p14' });
  });

  it('skips a plant with a malformed time without aborting the others', async () => {
    const result = await syncReminders([
      plant({ id: 'bad', reminderTime: '25:99' }),
      plant({ id: 'good', frequency: { times: 2, per: 'week' } }),
    ]);

    expect(result).toEqual({ scheduled: 2, skipped: 1 });
    expect(requests().map((r) => r.content.data)).toEqual([
      { userPlantId: 'good' },
      { userPlantId: 'good' },
    ]);
  });

  it('skips a slot whose scheduling fails and keeps going', async () => {
    schedule.mockRejectedValueOnce(new Error('boom'));

    const result = await syncReminders([plant({ frequency: { times: 2, per: 'week' } })]);

    expect(result).toEqual({ scheduled: 1, skipped: 1 });
  });

  it('schedules nothing when notifications are not allowed', async () => {
    const denied = {
      granted: false,
      canAskAgain: false,
      expires: 'never' as const,
      status: Notifications.PermissionStatus.DENIED,
    };
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(denied);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce(denied);

    const result = await syncReminders([plant()]);

    expect(result).toEqual({ scheduled: 0, skipped: 4 });
    expect(schedule).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never rejects: a failed cancel skips every slot, and the queue keeps working', async () => {
    cancelAll.mockRejectedValueOnce(new Error('boom'));

    const failed = await syncReminders([plant(), plant({ reminderTime: 'x' })]);
    expect(failed).toEqual({ scheduled: 0, skipped: 5 });
    expect(schedule).not.toHaveBeenCalled();

    expect(await syncReminders([plant()])).toEqual({ scheduled: 4, skipped: 0 });
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

    const first = syncReminders([plant({ id: 'first', frequency: { times: 2, per: 'week' } })]);
    const second = syncReminders([plant({ id: 'second', frequency: { times: 3, per: 'week' } })]);
    await Promise.all([first, second]);

    expect(active.size).toBe(3);
    expect([...active].every((entry) => entry.includes('second'))).toBe(true);

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
