import { describe, expect, it } from 'vitest';
import {
  defaultWateringDays,
  nextWatering,
  type ReminderTrigger,
  reminderTriggers,
  requiredWateringDays,
  type ScheduleInput,
} from './schedule';

const base: ScheduleInput = {
  frequency: { times: 1, per: 'day' },
  wateringDays: [],
  reminderTime: '07:00',
  reminderLeadMinutes: 15,
  scheduleStartsOn: null,
};
const now = new Date(2026, 9, 22, 12, 0); // Thursday

describe('requiredWateringDays / defaultWateringDays', () => {
  it.each([
    [{ times: 1, per: 'day' }, 0],
    [{ times: 3, per: 'week' }, 3],
    [{ times: 1, per: 'twoWeeks' }, 1],
    [{ times: 1, per: 'month' }, 1],
  ] as const)('requires for %j', (f, n) => {
    expect(requiredWateringDays(f)).toBe(n);
  });

  it.each([
    [{ times: 1, per: 'day' }, []],
    [{ times: 1, per: 'week' }, [1]],
    [{ times: 2, per: 'week' }, [1, 4]],
    [{ times: 3, per: 'week' }, [1, 3, 5]],
    [{ times: 4, per: 'week' }, [1, 3, 5, 7]],
    [{ times: 5, per: 'week' }, [1, 2, 4, 5, 6]],
    [{ times: 6, per: 'week' }, [1, 2, 3, 4, 5, 6]],
    [{ times: 7, per: 'week' }, [1, 2, 3, 4, 5, 6, 7]],
    [{ times: 1, per: 'twoWeeks' }, [1]],
    [{ times: 1, per: 'month' }, [1]],
  ] as const)('defaults for %j', (f, days) => {
    expect(defaultWateringDays(f)).toEqual(days);
  });
});

describe('reminderTriggers', () => {
  it('daily fires lead minutes before', () => {
    expect(reminderTriggers(base, now)).toEqual([
      { kind: 'daily', hour: 6, minute: 45 },
    ]);
  });

  it('daily wraps past midnight', () => {
    expect(reminderTriggers({ ...base, reminderTime: '00:00' }, now)).toEqual([
      { kind: 'daily', hour: 23, minute: 45 },
    ]);
  });

  it('weekly converts ISO days to Expo weekdays', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 2, per: 'week' },
      wateringDays: [1, 4],
      reminderTime: '08:30',
      reminderLeadMinutes: 30,
    };
    expect(reminderTriggers(input, now)).toEqual([
      { kind: 'weekly', weekday: 2, hour: 8, minute: 0 },
      { kind: 'weekly', weekday: 5, hour: 8, minute: 0 },
    ]);
  });

  it('weekly moves to the previous day below midnight (Monday to Sunday)', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'week' },
      wateringDays: [1],
      reminderTime: '00:00',
    };
    expect(reminderTriggers(input, now)).toEqual([
      { kind: 'weekly', weekday: 1, hour: 23, minute: 45 },
    ]);
  });

  it('weekly falls back to default days on a wrong count', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 3, per: 'week' },
      wateringDays: [1, 4],
    };
    expect(
      reminderTriggers(input, now).map((t) => t.kind === 'weekly' && t.weekday),
    ).toEqual([2, 4, 6]);
  });

  it('monthly steps 28 days from the anchor', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
      reminderTime: '09:00',
      scheduleStartsOn: '2026-01-05',
    };
    // 2026-01-05 + 28k: ... Oct 19 is k=40? compute expected independently
    const anchor = new Date(2026, 0, 5, 9, 0);
    const expected: ReminderTrigger[] = [];
    for (let k = 0; expected.length < 3; k++) {
      const d = new Date(2026, 0, 5 + 28 * k, 8, 45);
      if (d > now) expected.push({ kind: 'date', date: d });
    }
    expect(anchor.getDay()).toBe(1);
    expect(reminderTriggers(input, now)).toEqual(expected);
    expect(expected[0]?.kind).toBe('date');
  });

  it('twoWeeks skips a reminder that already passed today', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [4],
      reminderTime: '09:00',
      scheduleStartsOn: '2026-10-22',
    };
    const triggers = reminderTriggers(input, new Date(2026, 9, 22, 8, 50));
    expect(triggers).toHaveLength(3);
    expect(triggers[0]).toEqual({
      kind: 'date',
      date: new Date(2026, 10, 5, 8, 45),
    });
  });

  it('twoWeeks keeps today when the reminder is still ahead', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [4],
      reminderTime: '09:00',
      scheduleStartsOn: '2026-10-22',
    };
    expect(reminderTriggers(input, new Date(2026, 9, 22, 8, 0))[0]).toEqual({
      kind: 'date',
      date: new Date(2026, 9, 22, 8, 45),
    });
  });

  it('twoWeeks without an anchor starts on the next chosen weekday', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [3],
      reminderTime: '09:00',
    };
    // Thursday Oct 22 -> next Wednesday is Oct 28
    expect(reminderTriggers(input, now)[0]).toEqual({
      kind: 'date',
      date: new Date(2026, 9, 28, 8, 45),
    });
  });

  it.each(['25:00', '', '9:5'])('throws on malformed time %j', (time) => {
    expect(() =>
      reminderTriggers({ ...base, reminderTime: time }, now),
    ).toThrow('Invalid reminder time');
  });
});

describe('nextWatering', () => {
  it('finds the next weekly day', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 2, per: 'week' },
      wateringDays: [1, 4],
      reminderTime: '08:30',
    };
    // Tuesday Oct 20 10:00 -> Thursday Oct 22 08:30
    expect(nextWatering(input, new Date(2026, 9, 20, 10, 0))).toEqual(
      new Date(2026, 9, 22, 8, 30),
    );
  });

  it('daily rolls to tomorrow once today has passed', () => {
    expect(nextWatering(base, now)).toEqual(new Date(2026, 9, 23, 7, 0));
  });

  it('returns the next anchored occurrence for monthly plants', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
      scheduleStartsOn: '2026-10-22',
    };
    expect(nextWatering(input, now)).toEqual(new Date(2026, 10, 19, 7, 0));
  });

  it('returns null for a malformed time', () => {
    expect(nextWatering({ ...base, reminderTime: '25:00' }, now)).toBeNull();
  });
});
