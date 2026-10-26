import type { UserPlant } from '@plantcare/shared';

import { userPlantFixture } from './testFixtures';
import { nextWateringAfterToday, todayRows } from './today';

function plant(overrides: Partial<UserPlant>): UserPlant {
  return { ...userPlantFixture, ...overrides };
}

// Thursday 2026-10-22, local time.
const noon = new Date(2026, 9, 22, 12, 0);
const daily = { times: 1, per: 'day' } as const;

describe('todayRows', () => {
  it('sorts by time, then species name', () => {
    const rows = todayRows(
      [
        plant({
          id: 'c',
          frequency: daily,
          reminderTime: '18:00',
          speciesName: 'Aloe',
        }),
        plant({
          id: 'b',
          frequency: daily,
          reminderTime: '08:00',
          speciesName: 'Yucca',
        }),
        plant({
          id: 'a',
          frequency: daily,
          reminderTime: '08:00',
          speciesName: 'Monstera',
        }),
      ],
      noon,
    );
    expect(rows.map((r) => r.plant.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves out plants not due today', () => {
    // Fixture waters Mon and Thu (ISO 1, 4); 2026-10-22 is a Thursday, 10-23 a Friday.
    expect(todayRows([plant({})], noon)).toHaveLength(1);
    expect(todayRows([plant({})], new Date(2026, 9, 23, 12, 0))).toHaveLength(0);
  });

  it('marks done when lastWateredOn is today, late when past and not done', () => {
    const rows = todayRows(
      [
        plant({
          id: 'done',
          frequency: daily,
          reminderTime: '08:00',
          lastWateredOn: '2026-10-22',
        }),
        plant({ id: 'late', frequency: daily, reminderTime: '09:00' }),
        plant({ id: 'later', frequency: daily, reminderTime: '18:00' }),
      ],
      noon,
    );
    expect(rows.map((r) => [r.plant.id, r.done, r.late])).toEqual([
      ['done', true, false],
      ['late', false, true],
      ['later', false, false],
    ]);
  });

  it('treats a plant watered yesterday as not done after midnight', () => {
    const rows = todayRows(
      [
        plant({
          frequency: daily,
          reminderTime: '09:00',
          lastWateredOn: '2026-10-21',
        }),
      ],
      new Date(2026, 9, 22, 0, 5),
    );
    expect(rows[0]?.done).toBe(false);
    expect(rows[0]?.late).toBe(false);
  });

  it('shows a monthly plant only on its watering date', () => {
    const p = plant({
      frequency: { times: 1, per: 'month' },
      scheduleStartsOn: '2026-10-22',
      wateringDays: [1],
    });
    expect(todayRows([p], noon)).toHaveLength(1);
    expect(todayRows([p], new Date(2026, 9, 23, 12, 0))).toHaveLength(0);
    expect(todayRows([p], new Date(2026, 10, 5, 12, 0))).toHaveLength(0);
  });
});

describe('nextWateringAfterToday', () => {
  it('returns the earliest watering from tomorrow on', () => {
    const next = nextWateringAfterToday(
      [
        plant({ id: 'late', frequency: daily, reminderTime: '18:00' }),
        plant({ id: 'early', frequency: daily, reminderTime: '07:00' }),
      ],
      noon,
    );
    expect(next?.plant.id).toBe('early');
    expect(next?.at).toEqual(new Date(2026, 9, 23, 7, 0));
  });

  it('skips today even when a watering is still ahead', () => {
    const next = nextWateringAfterToday([plant({ frequency: daily, reminderTime: '18:00' })], noon);
    expect(next?.at).toEqual(new Date(2026, 9, 23, 18, 0));
  });

  it('picks a monthly plant whose date comes before the weekly one', () => {
    // Anchored on Saturday 2026-10-24, so due that day...
    const biweekly = plant({
      id: 'biweekly',
      frequency: { times: 1, per: 'month' },
      scheduleStartsOn: '2026-10-24',
      reminderTime: '06:00',
    });
    // ...while the weekly plant waters Mondays only (2026-10-26).
    const weekly = plant({
      id: 'weekly',
      frequency: { times: 1, per: 'week' },
      wateringDays: [1],
      reminderTime: '09:00',
    });
    // Friday 10-23 has neither; Saturday 10-24 comes before Monday 10-26.
    const next = nextWateringAfterToday([weekly, biweekly], noon);
    expect(next?.plant.id).toBe('biweekly');
    expect(next?.at).toEqual(new Date(2026, 9, 24, 6, 0));
  });

  it('returns null without plants', () => {
    expect(nextWateringAfterToday([], noon)).toBeNull();
  });
});
