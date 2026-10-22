import type { UserPlant } from '@plantcare/shared';

import { userPlantFixture } from './testFixtures';
import { nextWateringAt, sortByNextWatering } from './nextWatering';

function plant(overrides: Partial<UserPlant>): UserPlant {
  return { ...userPlantFixture, ...overrides };
}

describe('nextWateringAt', () => {
  it('uses the chosen weekdays at the reminder time', () => {
    // Wednesday 2026-10-21 12:00; chosen days Monday and Thursday.
    const next = nextWateringAt(
      plant({ wateringDays: [1, 4], reminderTime: '09:30' }),
      new Date(2026, 9, 21, 12),
    );
    expect(next).toEqual(new Date(2026, 9, 22, 9, 30));
  });

  it('follows the 28 day cycle for a monthly plant', () => {
    const next = nextWateringAt(
      plant({
        frequency: { times: 1, per: 'month' },
        wateringDays: [1],
        scheduleStartsOn: '2026-10-05',
        reminderTime: '09:30',
      }),
      new Date(2026, 9, 21, 12),
    );
    expect(next).toEqual(new Date(2026, 10, 2, 9, 30));
  });

  it('is null for a malformed time', () => {
    expect(nextWateringAt(plant({ reminderTime: 'x' }), new Date())).toBeNull();
  });
});

describe('sortByNextWatering', () => {
  it('puts the soonest first and bad times last', () => {
    const sorted = sortByNextWatering([
      plant({ id: 'bad', reminderTime: 'x' }),
      plant({
        id: 'daily',
        frequency: { times: 1, per: 'day' },
        wateringDays: [],
      }),
    ]);
    expect(sorted.map((s) => s.plant.id)).toEqual(['daily', 'bad']);
  });
});
