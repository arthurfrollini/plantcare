import { describe, expect, it } from 'vitest';
import { nextOccurrenceDate } from './schedule-start';

const zone = 'America/Sao_Paulo';

describe('nextOccurrenceDate', () => {
  it('finds the next Wednesday from a Thursday morning', () => {
    const now = new Date('2026-10-22T11:00:00Z');
    expect(nextOccurrenceDate(3, '09:00', zone, now)).toBe('2026-10-28');
  });

  it('counts today when the time has not passed', () => {
    const now = new Date('2026-10-22T11:00:00Z');
    expect(nextOccurrenceDate(4, '09:00', zone, now)).toBe('2026-10-22');
  });

  it('skips to next week when the time has passed today', () => {
    const now = new Date('2026-10-22T13:00:00Z');
    expect(nextOccurrenceDate(4, '09:00', zone, now)).toBe('2026-10-29');
  });
});
