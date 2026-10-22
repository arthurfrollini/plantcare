import AsyncStorage from '@react-native-async-storage/async-storage';

import { PENDING_SAVE_KEY, setPendingSave, takePendingSave, type PendingSave } from './pendingSave';

const pending: PendingSave = {
  plants: [
    { catalogPlantId: 'c1', frequency: { times: 1, per: 'day' }, light: 'shade' },
    { catalogPlantId: 'c2', frequency: { times: 2, per: 'week' }, light: 'full_sun' },
  ],
};

beforeEach(() => AsyncStorage.clear());

describe('pendingSave', () => {
  it('returns the stored plants and removes the key', async () => {
    await setPendingSave(pending);

    expect(await takePendingSave()).toEqual(pending);
    expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
    expect(await takePendingSave()).toBeNull();
  });

  it('hands the plants to only one of two overlapping takes', async () => {
    await setPendingSave(pending);

    const taken = await Promise.all([takePendingSave(), takePendingSave()]);

    expect(taken.filter((v) => v !== null)).toHaveLength(1);
  });

  it('drops a form saved by an older version of the app', async () => {
    await AsyncStorage.setItem(
      PENDING_SAVE_KEY,
      JSON.stringify({ catalogPlantId: 'c1', nickname: '', frequency: { times: 1, per: 'day' } }),
    );

    expect(await takePendingSave()).toBeNull();
  });

  it('drops a malformed value', async () => {
    await AsyncStorage.setItem(PENDING_SAVE_KEY, '{"nope":1}');

    expect(await takePendingSave()).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
  });
});
