import MockAdapter from 'axios-mock-adapter';

import { api, toApiError } from '../api/client';
import { clearTokens } from '../auth/session';
import type { SpeciesPick } from './pendingSave';
import { addPlants, createBody, deviceTimeZone } from './savePlant';
import { userPlantFixture } from './testFixtures';

const monstera: SpeciesPick = {
  catalogPlantId: 'c1',
  frequency: { times: 2, per: 'week' },
  light: 'partial_shade',
};
const cactus: SpeciesPick = {
  catalogPlantId: 'c2',
  frequency: { times: 1, per: 'week' },
  light: 'full_sun',
};
const fern: SpeciesPick = {
  catalogPlantId: 'c3',
  frequency: { times: 1, per: 'day' },
  light: 'shade',
};

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
  it("starts from the species' care plan with an 08:00 reminder and nothing personal", () => {
    expect(createBody(cactus)).toEqual({
      catalogPlantId: 'c2',
      frequency: { times: 1, per: 'week' },
      reminderTime: '08:00',
      timeZone: deviceTimeZone(),
      light: 'full_sun',
    });
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
