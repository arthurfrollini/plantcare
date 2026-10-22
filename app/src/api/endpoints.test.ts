import MockAdapter from 'axios-mock-adapter';
import type { UserPlant } from '@plantcare/shared';

import { clearTokens } from '../auth/session';
import { api } from './client';
import { assetUrl } from './config';
import { deleteMyPlant, deletePlantPhoto, listCatalog, plantPhotoSource } from './endpoints';

let mock: MockAdapter;
beforeEach(async () => {
  mock = new MockAdapter(api);
  await clearTokens();
});
afterEach(() => mock.restore());

const catalogPlant = {
  id: 'p1',
  slug: 'yucca',
  scientificName: 'Yucca',
  source: 'curated',
  name: 'Yucca',
  about: 'a',
  waterTips: 'w',
  light: 'shade',
  difficulty: 'easy',
  frequency: { times: 1, per: 'day' },
  imageUrl: '/static/plants/yucca.svg',
};

function plant(overrides: Partial<UserPlant>): UserPlant {
  return {
    id: 'up1',
    catalogPlantId: 'p1',
    nickname: null,
    speciesName: 'Yucca',
    scientificName: 'Yucca',
    about: 'a',
    waterTips: 'w',
    frequency: { times: 1, per: 'day' },
    reminderTime: '08:00',
    timeZone: 'UTC',
    light: 'shade',
    difficulty: 'easy',
    wateringDays: [],
    reminderLeadMinutes: 15,
    scheduleStartsOn: null,
    scheduleNeedsReview: false,
    notes: null,
    imageUrl: null,
    hasPhoto: false,
    photoVersion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('endpoints', () => {
  it('listCatalog sends query params and parses the page', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogPlant], nextPage: null });
    const page = await listCatalog({ light: 'shade', page: 2 });
    expect(mock.history.get[0]?.params).toEqual({ light: 'shade', page: 2 });
    expect(page.items[0]?.slug).toBe('yucca');
  });

  it('rejects a response that fails its schema', async () => {
    mock.onGet('/plants').reply(200, { items: [{ id: 1 }], nextPage: null });
    await expect(listCatalog({})).rejects.toThrow();
  });

  it('deleteMyPlant sends no Content-Type', async () => {
    mock.onDelete('/me/plants/up1').reply(204);
    await deleteMyPlant('up1');
    expect(mock.history.delete[0]?.headers?.['Content-Type']).toBeUndefined();
  });

  it('deletePlantPhoto returns the updated plant', async () => {
    mock.onDelete('/me/plants/up1/photo').reply(200, plant({ id: 'up1' }));
    const updated = await deletePlantPhoto('up1');
    expect(updated.hasPhoto).toBe(false);
  });
});

describe('assetUrl', () => {
  it('joins without a double slash', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://host:3333/';
    expect(assetUrl('/static/plants/yucca.svg')).toBe('http://host:3333/static/plants/yucca.svg');
    process.env.EXPO_PUBLIC_API_URL = 'http://host:3333';
    expect(assetUrl('/static/plants/yucca.svg')).toBe('http://host:3333/static/plants/yucca.svg');
    delete process.env.EXPO_PUBLIC_API_URL;
  });
});

describe('plantPhotoSource', () => {
  it('is null without a photo', () => {
    expect(plantPhotoSource(plant({}), 'tok')).toBeNull();
  });

  it('builds an authorized source whose cacheKey follows photoVersion', () => {
    const a = plantPhotoSource(plant({ hasPhoto: true, photoVersion: 'v1' }), 'tok');
    const b = plantPhotoSource(plant({ hasPhoto: true, photoVersion: 'v2' }), 'tok');
    expect(a?.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(a?.uri).toMatch(/\/me\/plants\/up1\/photo$/);
    expect(a?.cacheKey).toBe('up1-v1');
    expect(b?.cacheKey).not.toBe(a?.cacheKey);
  });
});
