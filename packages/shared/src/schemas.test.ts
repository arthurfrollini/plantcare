import { describe, expect, it } from 'vitest';
import {
  createUserPlantSchema,
  frequencySchema,
  halfHourTimeSchema,
  reminderLeadSchema,
  reminderTimeSchema,
  timeZoneSchema,
  updateUserPlantSchema,
  wateringDaysSchema,
} from './schemas';

const valid = {
  catalogPlantId: 'p1',
  reminderTime: '08:00',
  timeZone: 'America/Sao_Paulo',
};

describe('frequencySchema', () => {
  it.each([
    { times: 2, per: 'day' },
    { times: 0, per: 'week' },
    { times: 8, per: 'week' },
    { times: 1.5, per: 'week' },
    { times: 2, per: 'month' },
    { times: 2, per: 'twoWeeks' },
  ])('rejects %j', (value) => {
    expect(frequencySchema.safeParse(value).success).toBe(false);
  });

  it.each([
    { times: 1, per: 'day' },
    { times: 1, per: 'week' },
    { times: 7, per: 'week' },
    { times: 1, per: 'twoWeeks' },
    { times: 1, per: 'month' },
  ])('accepts %j', (value) => {
    expect(frequencySchema.safeParse(value).success).toBe(true);
  });
});

describe('reminderTimeSchema', () => {
  it.each(['25:00', '9:05', '09:5'])('rejects %s', (value) => {
    expect(reminderTimeSchema.safeParse(value).success).toBe(false);
  });
  it.each(['00:00', '23:59'])('accepts %s', (value) => {
    expect(reminderTimeSchema.safeParse(value).success).toBe(true);
  });
});

describe('wateringDaysSchema', () => {
  it.each([[[3, 1]], [[1, 1]], [[0]], [[8]]])('rejects %j', (value) => {
    expect(wateringDaysSchema.safeParse(value).success).toBe(false);
  });
  it.each([[[]], [[1]], [[1, 3, 5]], [[1, 2, 3, 4, 5, 6, 7]]])(
    'accepts %j',
    (value) => {
      expect(wateringDaysSchema.safeParse(value).success).toBe(true);
    },
  );
});

describe('halfHourTimeSchema', () => {
  it.each(['13:30', '00:00', '23:30'])('accepts %s', (value) => {
    expect(halfHourTimeSchema.safeParse(value).success).toBe(true);
  });
  it.each(['13:15', '24:00', '9:00'])('rejects %s', (value) => {
    expect(halfHourTimeSchema.safeParse(value).success).toBe(false);
  });
});

describe('reminderLeadSchema', () => {
  it.each([5, 15, 30])('accepts %i', (value) => {
    expect(reminderLeadSchema.safeParse(value).success).toBe(true);
  });
  it.each([0, 7, 35])('rejects %i', (value) => {
    expect(reminderLeadSchema.safeParse(value).success).toBe(false);
  });
});

describe('timeZoneSchema', () => {
  it.each(['America/Sao_Paulo', 'UTC'])('accepts %s', (value) => {
    expect(timeZoneSchema.safeParse(value).success).toBe(true);
  });
  it.each(['+03:00', '-0300', 'EST', 'GMT'])('rejects %s', (value) => {
    expect(timeZoneSchema.safeParse(value).success).toBe(false);
  });
  it('stores the canonical name', () => {
    expect(timeZoneSchema.parse('america/sao_paulo')).toBe('America/Sao_Paulo');
    expect(timeZoneSchema.parse('UTC')).toBe('UTC');
    expect(timeZoneSchema.parse('America/Sao_Paulo')).toBe('America/Sao_Paulo');
  });
  it.each(['Mars/Olympus', ''])('rejects %j', (value) => {
    expect(timeZoneSchema.safeParse(value).success).toBe(false);
  });
});

describe('createUserPlantSchema', () => {
  it.each([{ frequency: { times: 1, per: 'day' } }, { light: 'shade' }])(
    'rejects species-owned key %j',
    (extra) => {
      expect(
        createUserPlantSchema.safeParse({ ...valid, ...extra }).success,
      ).toBe(false);
    },
  );

  it('rejects a reminder time off the half hour', () => {
    expect(
      createUserPlantSchema.safeParse({ ...valid, reminderTime: '08:15' })
        .success,
    ).toBe(false);
  });

  it('accepts watering days and a lead', () => {
    expect(
      createUserPlantSchema.safeParse({
        ...valid,
        wateringDays: [1, 4],
        reminderLeadMinutes: 10,
      }).success,
    ).toBe(true);
  });

  it('rejects a body without catalogPlantId', () => {
    const { catalogPlantId: _omit, ...rest } = valid;
    expect(createUserPlantSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts the minimal body', () => {
    expect(createUserPlantSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a nickname', () => {
    expect(
      createUserPlantSchema.safeParse({ ...valid, nickname: 'Pikachu' })
        .success,
    ).toBe(true);
  });

  it.each(['   ', 'x'.repeat(41)])('rejects nickname %j', (nickname) => {
    expect(
      createUserPlantSchema.safeParse({ ...valid, nickname }).success,
    ).toBe(false);
  });

  it('rejects notes over 500 characters', () => {
    expect(
      createUserPlantSchema.safeParse({ ...valid, notes: 'x'.repeat(501) })
        .success,
    ).toBe(false);
  });
});

describe('updateUserPlantSchema', () => {
  it('lets null clear nickname and notes', () => {
    const result = updateUserPlantSchema.safeParse({
      nickname: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    { catalogPlantId: 'other' },
    { frequency: { times: 1, per: 'day' } },
    { light: 'shade' },
  ])('rejects unknown or species-owned key %j', (extra) => {
    expect(updateUserPlantSchema.safeParse(extra).success).toBe(false);
  });

  it('accepts days, time and lead', () => {
    expect(
      updateUserPlantSchema.safeParse({
        wateringDays: [2],
        reminderTime: '09:30',
        reminderLeadMinutes: 5,
      }).success,
    ).toBe(true);
  });
});
