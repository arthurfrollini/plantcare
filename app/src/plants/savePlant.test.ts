import MockAdapter from 'axios-mock-adapter';

import { api, toApiError } from '../api/client';
import { clearTokens } from '../auth/session';
import type { SpeciesPick } from './pendingSave';
import { addPlants, createBody, deviceTimeZone, scheduleChanges } from './savePlant';
import { userPlantFixture } from './testFixtures';

const monstera: SpeciesPick = { catalogPlantId: 'c1' };
const cactus: SpeciesPick = { catalogPlantId: 'c2' };
const fern: SpeciesPick = { catalogPlantId: 'c3' };

let mock: MockAdapter;

beforeEach(async () => {
  mock = new MockAdapter(api);
  await clearTokens();
});

afterEach(() => mock.restore());

function postedIds(): unknown[] {
  return mock.history.post.map((r): unknown => {
    const body: unknown = JSON.parse(String(r.data));
    return body && typeof body === 'object' && 'catalogPlantId' in body
      ? body.catalogPlantId
      : undefined;
  });
}

describe('createBody', () => {
  it('sends only the species, the 08:00 reminder and the time zone', () => {
    expect(createBody({ catalogPlantId: 'c2' })).toEqual({
      catalogPlantId: 'c2',
      reminderTime: '08:00',
      timeZone: deviceTimeZone(),
    });
  });
});

describe('scheduleChanges', () => {
  const values = { wateringDays: [1, 4], reminderTime: '09:30', reminderLeadMinutes: 15 };

  it('sends only the weekdays when only they changed', () => {
    expect(scheduleChanges(userPlantFixture, { ...values, wateringDays: [1, 3, 5] })).toEqual({
      wateringDays: [1, 3, 5],
    });
  });

  it('sends the time with the time zone when only the time changed', () => {
    expect(scheduleChanges(userPlantFixture, { ...values, reminderTime: '07:30' })).toEqual({
      reminderTime: '07:30',
      timeZone: deviceTimeZone(),
    });
  });

  it('sends only the lead when only it changed', () => {
    expect(scheduleChanges(userPlantFixture, { ...values, reminderLeadMinutes: 30 })).toEqual({
      reminderLeadMinutes: 30,
    });
  });

  it('sends nothing when nothing changed', () => {
    expect(scheduleChanges(userPlantFixture, values)).toEqual({});
  });
});

describe('addPlants', () => {
  it('creates each picked species in order', async () => {
    mock.onPost('/me/plants').reply(201, userPlantFixture);

    const result = await addPlants([monstera, cactus, fern]);

    expect(postedIds()).toEqual(['c1', 'c2', 'c3']);
    expect(result.added).toHaveLength(3);
    expect(result.failed).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('keeps going after a failure and reports the ones that failed', async () => {
    mock
      .onPost('/me/plants')
      .replyOnce(201, userPlantFixture)
      .onPost('/me/plants')
      .replyOnce(500, { error: { code: 'internal', message: 'boom' } })
      .onPost('/me/plants')
      .replyOnce(201, userPlantFixture);

    const result = await addPlants([monstera, cactus, fern]);

    expect(postedIds()).toEqual(['c1', 'c2', 'c3']);
    expect(result.added).toHaveLength(2);
    expect(result.failed).toEqual([cactus]);
    expect(toApiError(result.error).code).toBe('internal');
  });
});
