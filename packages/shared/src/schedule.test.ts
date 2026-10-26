import { describe, expect, it } from 'vitest';
import {
  defaultWateringDays,
  nextWatering,
  reminderMoments,
  toLocalDateString,
  requiredWateringDays,
  type ScheduleInput,
  wateringTimeOn,
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
    [{ times: 2, per: 'week' }, [2, 4]],
    [{ times: 3, per: 'week' }, [1, 4, 7]],
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

describe('reminderMoments', () => {
  const at = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m, d, h, min);

  it('daily lists each reminder still ahead, with its watering day', () => {
    const input = { ...base, reminderTime: '08:30' };
    expect(
      reminderMoments(input, at(2026, 9, 22, 9, 0), at(2026, 9, 25, 23, 59)),
    ).toEqual([
      { at: at(2026, 9, 23, 8, 15), wateringOn: '2026-10-23' },
      { at: at(2026, 9, 24, 8, 15), wateringOn: '2026-10-24' },
      { at: at(2026, 9, 25, 8, 15), wateringOn: '2026-10-25' },
    ]);
  });

  it('includes a reminder exactly at until and excludes one exactly at from', () => {
    const from = at(2026, 9, 22, 6, 45);
    const until = at(2026, 9, 23, 6, 45);
    expect(reminderMoments(base, from, until)).toEqual([
      { at: until, wateringOn: '2026-10-23' },
    ]);
  });

  it('weekly lists only the chosen weekdays', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 2, per: 'week' },
      wateringDays: [2, 4],
    };
    const moments = reminderMoments(
      input,
      at(2026, 9, 25, 0, 0),
      at(2026, 10, 8, 23, 59),
    );
    expect(moments.map((m) => m.wateringOn)).toEqual([
      '2026-10-27',
      '2026-10-29',
      '2026-11-03',
      '2026-11-05',
    ]);
    expect(moments.every((m) => m.at.getHours() === 6)).toBe(true);
  });

  it('weekly falls back to default days on a wrong count', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 3, per: 'week' },
      wateringDays: [1, 4],
    };
    const moments = reminderMoments(
      input,
      at(2026, 9, 25, 0, 0),
      at(2026, 10, 1, 23, 59),
    );
    // Defaults Mon, Thu, Sun: Oct 25, 26, 29, Nov 1.
    expect(moments.map((m) => m.wateringOn)).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-29',
      '2026-11-01',
    ]);
  });

  it('a lead across midnight belongs to the next day watering', () => {
    const input = { ...base, reminderTime: '00:10' };
    expect(
      reminderMoments(input, at(2026, 9, 22, 12, 0), at(2026, 9, 24, 12, 0)),
    ).toEqual([
      { at: at(2026, 9, 22, 23, 55), wateringOn: '2026-10-23' },
      { at: at(2026, 9, 23, 23, 55), wateringOn: '2026-10-24' },
    ]);
  });

  it('monthly steps 28 days from the anchor, matching wateringTimeOn', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
      reminderTime: '09:00',
      scheduleStartsOn: '2026-01-05',
    };
    const moments = reminderMoments(input, now, at(2027, 1, 28, 0, 0));
    const expected: { at: Date; wateringOn: string }[] = [];
    for (let k = 0; expected.length < 4; k++) {
      const d = at(2026, 0, 5 + 28 * k, 8, 45);
      if (d > now) expected.push({ at: d, wateringOn: toLocalDateString(d) });
    }
    expect(moments.slice(0, 4)).toEqual(expected);
    for (const m of moments) {
      const day = new Date(m.at.getFullYear(), m.at.getMonth(), m.at.getDate());
      expect(wateringTimeOn(input, day)).not.toBeNull();
    }
  });

  it('twoWeeks without an anchor lands on the fixed-reference days', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [1],
      reminderTime: '09:00',
    };
    // Every 14 days from Monday 2024-01-01: 2026-11-02 is a multiple of 14 days away.
    const moments = reminderMoments(input, now, at(2026, 11, 31, 0, 0));
    const days = Math.round(
      (Date.UTC(2026, 10, 2) - Date.UTC(2024, 0, 1)) / 86_400_000,
    );
    expect(days % 14).toBe(0);
    expect(moments.slice(0, 3)).toEqual([
      { at: at(2026, 10, 2, 8, 45), wateringOn: '2026-11-02' },
      { at: at(2026, 10, 16, 8, 45), wateringOn: '2026-11-16' },
      { at: at(2026, 10, 30, 8, 45), wateringOn: '2026-11-30' },
    ]);
  });

  it('is the same wherever the window starts', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [1],
      reminderTime: '09:00',
    };
    const until = at(2027, 3, 1, 0, 0);
    const early = reminderMoments(input, now, until);
    const late = reminderMoments(input, at(2026, 9, 29, 12, 0), until);
    expect(late).toEqual(early.filter((m) => m.at > at(2026, 9, 29, 12, 0)));
  });

  it('monthly without an anchor waters every 28 days whenever it syncs', () => {
    const input: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
      reminderTime: '09:00',
    };
    const first = nextWatering(input, now);
    const later = nextWatering(input, new Date(2026, 9, 29, 12, 0));
    // 28-day steps from Monday 2024-01-01: Oct 5, Nov 2, ...
    expect(first).toEqual(new Date(2026, 10, 2, 9, 0));
    expect(later).toEqual(first);
  });

  it('a year of a daily plant is 365 or 366 moments', () => {
    const from = at(2026, 9, 26, 12, 0);
    const moments = reminderMoments(base, from, at(2027, 9, 26, 12, 0));
    expect(moments.length).toBeGreaterThanOrEqual(365);
    expect(moments.length).toBeLessThanOrEqual(366);
  });

  it('stays in time order', () => {
    const moments = reminderMoments(
      { ...base, reminderTime: '00:10' },
      now,
      at(2026, 10, 30, 0, 0),
    );
    const times = moments.map((m) => m.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('one year of a monthly and a two-weekly plant is cheap', () => {
    const until = at(2027, 9, 26, 12, 0);
    for (const per of ['month', 'twoWeeks'] as const) {
      const input: ScheduleInput = {
        ...base,
        frequency: { times: 1, per },
        wateringDays: [1],
        scheduleStartsOn: '2024-03-04',
      };
      const start = performance.now();
      const runs = 20;
      for (let i = 0; i < runs; i++) reminderMoments(input, now, until);
      const each = (performance.now() - start) / runs;
      expect(each).toBeLessThan(25);
    }
  });

  it.each(['25:00', '', '9:5'])('throws on malformed time %j', (time) => {
    expect(() =>
      reminderMoments(
        { ...base, reminderTime: time },
        now,
        at(2026, 9, 30, 0, 0),
      ),
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

describe('wateringTimeOn', () => {
  const weekly: ScheduleInput = {
    ...base,
    frequency: { times: 2, per: 'week' },
    wateringDays: [2, 4],
    reminderTime: '08:30',
  };

  it('gives the watering time on a scheduled weekday only', () => {
    expect(wateringTimeOn(weekly, new Date(2026, 9, 20, 22, 0))).toEqual(
      new Date(2026, 9, 20, 8, 30),
    ); // Tuesday
    expect(wateringTimeOn(weekly, new Date(2026, 9, 21, 9, 0))).toBeNull();
  });

  it('waters every day for daily plants', () => {
    expect(wateringTimeOn(base, new Date(2026, 9, 21, 23, 0))).toEqual(
      new Date(2026, 9, 21, 7, 0),
    );
  });

  it('uses the anchor for monthly plants (28-day step)', () => {
    const monthly: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
      reminderTime: '09:00',
      scheduleStartsOn: '2026-01-05',
    };
    expect(wateringTimeOn(monthly, new Date(2026, 10, 9, 15, 0))).toEqual(
      new Date(2026, 10, 9, 9, 0),
    );
    expect(wateringTimeOn(monthly, new Date(2026, 10, 10))).toBeNull();
    expect(wateringTimeOn(monthly, new Date(2026, 0, 4))).toBeNull();
    expect(wateringTimeOn(monthly, new Date(2026, 0, 5))).toEqual(
      new Date(2026, 0, 5, 9, 0),
    );
  });

  it('uses the fixed reference Monday without an anchor', () => {
    const twoWeekly: ScheduleInput = {
      ...base,
      frequency: { times: 1, per: 'twoWeeks' },
      wateringDays: [1],
    };
    expect(wateringTimeOn(twoWeekly, new Date(2024, 0, 15))).toEqual(
      new Date(2024, 0, 15, 7, 0),
    );
    expect(wateringTimeOn(twoWeekly, new Date(2024, 0, 8))).toBeNull();
    expect(wateringTimeOn(twoWeekly, new Date(2026, 9, 19))).toEqual(
      new Date(2026, 9, 19, 7, 0),
    ); // 2024-01-01 + 73 * 14 days
    expect(wateringTimeOn(twoWeekly, new Date(2026, 9, 26))).toBeNull();
  });

  it('returns null for a malformed time', () => {
    expect(
      wateringTimeOn({ ...base, reminderTime: 'soon' }, new Date(2026, 9, 21)),
    ).toBeNull();
  });
});

describe('toLocalDateString', () => {
  it('formats the device-local date', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
