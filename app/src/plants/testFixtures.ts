import type { CatalogPlant, UserPlant } from '@plantcare/shared';

export const accountFixture = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
  hasAvatar: false,
  avatarVersion: null,
};

export const catalogFixture: CatalogPlant = {
  id: 'c1',
  slug: 'monstera',
  scientificName: 'Monstera deliciosa',
  source: 'curated',
  name: 'Monstera',
  about: 'Big leaves.',
  waterTips: 'Water when the top soil is dry.',
  light: 'partial_shade',
  difficulty: 'easy',
  frequency: { times: 2, per: 'week' },
  imageUrl: null,
  imageCredit: null,
};

export const userPlantFixture: UserPlant = {
  id: 'p1',
  catalogPlantId: 'c1',
  nickname: 'Pikachu',
  speciesName: 'Monstera',
  scientificName: 'Monstera deliciosa',
  about: 'Big leaves.',
  waterTips: 'Water when the top soil is dry.',
  frequency: { times: 2, per: 'week' },
  reminderTime: '09:30',
  timeZone: 'America/Sao_Paulo',
  light: 'partial_shade',
  difficulty: 'easy',
  wateringDays: [1, 4],
  reminderLeadMinutes: 15,
  scheduleStartsOn: null,
  scheduleNeedsReview: false,
  notes: null,
  imageUrl: null,
  hasPhoto: false,
  photoVersion: null,
  lastWateredOn: null,
  createdAt: '2026-10-22T00:00:00.000Z',
  openCheckup: null,
};
