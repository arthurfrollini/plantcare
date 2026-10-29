import MockAdapter from 'axios-mock-adapter';
import type { UserPlant } from '@plantcare/shared';

import { clearTokens } from '../auth/session';
import { api } from './client';
import { assetUrl } from './config';
import {
  addProposal,
  checkupPhotoSource,
  createCheckup,
  deleteMyPlant,
  deletePlantPhoto,
  getAiStatus,
  identifyByName,
  identifyByPhoto,
  listCatalog,
  listCheckups,
  markHealed,
  plantPhotoSource,
} from './endpoints';

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
    lastWateredOn: null,
    openCheckup: null,
    imageCredit: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('endpoints', () => {
  it('listCatalog sends query params and parses the page', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogPlant], nextPage: null, total: 1 });
    const page = await listCatalog({ light: 'shade', page: 2 });
    expect(mock.history.get[0]?.params).toEqual({ light: 'shade', page: 2 });
    expect(page.items[0]?.slug).toBe('yucca');
  });

  it('rejects a response that fails its schema', async () => {
    mock.onGet('/plants').reply(200, { items: [{ id: 1 }], nextPage: null, total: 1 });
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

describe('AI endpoints', () => {
  const identification = {
    isPlant: true,
    confidence: 'high',
    scientificName: 'Monstera deliciosa',
    names: { en: 'Swiss cheese plant', 'pt-BR': 'Costela-de-adão' },
    about: { en: 'a', 'pt-BR': 'a' },
    waterTips: { en: 'w', 'pt-BR': 'w' },
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 1, per: 'week' },
  };
  const checkup = {
    id: 'c1',
    createdAt: '2026-10-28T12:00:00.000Z',
    description: null,
    problem: 'Too much water.',
    steps: ['Let it dry.'],
    whenToWorry: 'If stems go soft.',
    status: 'open',
    healedAt: null,
    photoUrl: '/me/plants/up1/checkups/c1/photo',
  };

  it('getAiStatus parses the status', async () => {
    mock.onGet('/ai/status').reply(200, { enabled: true, identifyLeft: 9, checkupLeft: 5 });
    await expect(getAiStatus()).resolves.toEqual({ enabled: true, identifyLeft: 9, checkupLeft: 5 });
  });

  it('identifyByName posts the name and parses a proposal', async () => {
    mock.onPost('/ai/identify/name', { name: 'costela' }).reply(200, {
      kind: 'proposal',
      proposalId: 'p9',
      proposal: identification,
    });
    await expect(identifyByName('costela')).resolves.toMatchObject({ kind: 'proposal', proposalId: 'p9' });
  });

  it('identifyByPhoto sends the photo as multipart', async () => {
    mock.onPost('/ai/identify/photo').reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      return [200, { kind: 'none', reason: 'not_a_plant' }];
    });
    await expect(identifyByPhoto({ uri: 'file:///p.jpg', mimeType: 'image/jpeg' })).resolves.toEqual({
      kind: 'none',
      reason: 'not_a_plant',
    });
  });

  it('addProposal posts the schedule and returns the new plant', async () => {
    const schedule = { reminderTime: '08:00', timeZone: 'America/Sao_Paulo', wateringDays: [1] };
    mock.onPost('/ai/proposals/p9/add', schedule).reply(201, plant({ id: 'up9' }));
    await expect(addProposal('p9', schedule)).resolves.toMatchObject({ id: 'up9' });
  });

  it('createCheckup sends the description before the photo', async () => {
    mock.onPost('/me/plants/up1/checkups').reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      return [201, checkup];
    });
    await expect(
      createCheckup('up1', { uri: 'file:///p.jpg', mimeType: 'image/jpeg' }, 'folhas amarelas'),
    ).resolves.toMatchObject({ id: 'c1' });
  });

  it('listCheckups and markHealed parse check-ups', async () => {
    mock.onGet('/me/plants/up1/checkups').reply(200, [checkup]);
    mock.onPatch('/me/plants/up1/checkups/c1', { status: 'healed' }).reply(200, {
      ...checkup,
      status: 'healed',
      healedAt: '2026-10-29T12:00:00.000Z',
    });
    await expect(listCheckups('up1')).resolves.toHaveLength(1);
    await expect(markHealed('up1', 'c1')).resolves.toMatchObject({ status: 'healed' });
  });

  it('checkupPhotoSource builds an authorized source', () => {
    expect(checkupPhotoSource('/me/plants/up1/checkups/c1/photo', 'tok')).toEqual({
      uri: assetUrl('/me/plants/up1/checkups/c1/photo'),
      headers: { Authorization: 'Bearer tok' },
      cacheKey: '/me/plants/up1/checkups/c1/photo',
    });
  });
});
