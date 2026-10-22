import type { Difficulty, Light } from '@plantcare/shared';

/** The emoji for each light level, shared by the catalog filters and the plant detail tiles. */
export const LIGHT_EMOJI: Record<Light, string> = {
  full_sun: '☀️',
  partial_shade: '⛅',
  shade: '☁️',
};

/** The emoji for each difficulty, shared by the catalog filters and the plant detail tiles. */
export const DIFFICULTY_EMOJI: Record<Difficulty, string> = {
  easy: '😌',
  medium: '🙂',
  hard: '😅',
};

export const WATER_EMOJI = '💧';
