import { describe, expect, it } from 'vitest';
import { reminderSlots } from './schedule';

const MON = 2,
  TUE = 3,
  WED = 4,
  THU = 5,
  FRI = 6,
  SAT = 7,
  SUN = 1;

describe('reminderSlots', () => {
  it.each([
    [1, [MON]],
    [2, [MON, THU]],
    [3, [MON, WED, FRI]],
    [4, [MON, WED, FRI, SUN]],
    [5, [MON, TUE, THU, FRI, SAT]],
    [6, [MON, TUE, WED, THU, FRI, SAT]],
    [7, [SUN, MON, TUE, WED, THU, FRI, SAT]],
  ])('spreads %i weekly reminders', (times, weekdays) => {
    const slots = reminderSlots({ times, per: 'week' }, '08:30');
    expect(slots.map((s) => s.weekday)).toEqual(weekdays);
    expect(slots.every((s) => s.hour === 8 && s.minute === 30)).toBe(true);
  });

  it('daily is one slot without weekday', () => {
    expect(reminderSlots({ times: 1, per: 'day' }, '21:05')).toEqual([
      { weekday: null, hour: 21, minute: 5 },
    ]);
  });

  it.each(['9:5', '25:00', ''])(
    'rejects malformed reminder time %j',
    (time) => {
      expect(() => reminderSlots({ times: 1, per: 'day' }, time)).toThrow(
        'Invalid reminder time',
      );
    },
  );

  it.each(['00:00', '23:59'])('accepts boundary reminder time %j', (time) => {
    const [slot] = reminderSlots({ times: 1, per: 'day' }, time);
    expect(slot?.hour).toBe(Number(time.slice(0, 2)));
    expect(slot?.minute).toBe(Number(time.slice(3)));
  });
});
