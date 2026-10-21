import { describe, expect, it } from 'vitest';
import {
  createUserPlantSchema,
  frequencySchema,
  reminderTimeSchema,
  timeZoneSchema,
  updateUserPlantSchema,
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
  ])('rejects %j', (value) => {
    expect(frequencySchema.safeParse(value).success).toBe(false);
  });

  it.each([
    { times: 1, per: 'day' },
    { times: 1, per: 'week' },
    { times: 7, per: 'week' },
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
  it('accepts a null light', () => {
    expect(
      createUserPlantSchema.safeParse({ ...valid, light: null }).success,
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
  it('lets null clear nickname, light and notes', () => {
    const result = updateUserPlantSchema.safeParse({
      nickname: null,
      light: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('does not accept a species change', () => {
    const result = updateUserPlantSchema.parse({ catalogPlantId: 'other' });
    expect(result).not.toHaveProperty('catalogPlantId');
  });
});
