import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  createUserPlantSchema,
  frequencySchema,
  halfHourTimeSchema,
  localDateSchema,
  passwordSchema,
  reminderLeadSchema,
  reminderTimeSchema,
  timeZoneSchema,
  updateUserPlantSchema,
  userNameSchema,
  userSchema,
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

describe('passwordSchema', () => {
  it('accepts 8 ASCII characters', () => {
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(true);
  });
  it('rejects 7 characters', () => {
    expect(passwordSchema.safeParse('abcdefg').success).toBe(false);
  });
  it('rejects 129 characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
  it('rejects 25 four-byte emoji (100 bytes)', () => {
    expect(passwordSchema.safeParse('😀'.repeat(25)).success).toBe(false);
  });
});

describe('userNameSchema', () => {
  it('trims', () => {
    expect(userNameSchema.parse('  Ana ')).toBe('Ana');
  });
  it('rejects blank and 61 characters', () => {
    expect(userNameSchema.safeParse('   ').success).toBe(false);
    expect(userNameSchema.safeParse('a'.repeat(61)).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const body = {
    currentPassword: 'old',
    newPassword: 'abcdefgh',
    refreshToken: 'r',
  };
  it('accepts a valid body', () => {
    expect(changePasswordSchema.safeParse(body).success).toBe(true);
  });
  it('rejects an extra key', () => {
    expect(changePasswordSchema.safeParse({ ...body, extra: 1 }).success).toBe(
      false,
    );
  });
  it('caps the refresh token at 256 characters, like /auth/refresh', () => {
    const at = (length: number) =>
      changePasswordSchema.safeParse({
        ...body,
        refreshToken: 'r'.repeat(length),
      }).success;
    expect(at(256)).toBe(true);
    expect(at(257)).toBe(false);
  });
});

describe('userSchema', () => {
  it('parses avatar fields', () => {
    const user = userSchema.parse({
      id: 'u1',
      name: 'Ana',
      email: null,
      language: 'en',
      hasPassword: false,
      hasGoogle: true,
      hasAvatar: true,
      avatarVersion: 'v1',
    });
    expect(user.hasAvatar).toBe(true);
    expect(user.avatarVersion).toBe('v1');
  });
});

describe('localDateSchema', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(localDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(localDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(localDateSchema.safeParse('2026-2-3').success).toBe(false);
  });
});
