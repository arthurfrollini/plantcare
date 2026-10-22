import AsyncStorage from '@react-native-async-storage/async-storage';

import { PENDING_SAVE_KEY, setPendingSave, takePendingSave, type PendingSave } from './pendingSave';

const pending: PendingSave = {
  catalogPlantId: 'c1',
  nickname: 'Pikachu',
  frequency: { times: 1, per: 'day' },
  reminderTime: '08:00',
  light: null,
  notes: '',
  photo: { uri: 'file:///leaf.jpg', mimeType: 'image/jpeg' },
};

beforeEach(() => AsyncStorage.clear());

describe('pendingSave', () => {
  it('returns the stored form and removes the key', async () => {
    await setPendingSave(pending);

    expect(await takePendingSave()).toEqual(pending);
    expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
    expect(await takePendingSave()).toBeNull();
  });

  it('hands the form to only one of two overlapping takes', async () => {
    await setPendingSave(pending);

    const taken = await Promise.all([takePendingSave(), takePendingSave()]);

    expect(taken.filter((v) => v !== null)).toHaveLength(1);
  });

  it('drops a malformed value', async () => {
    await AsyncStorage.setItem(PENDING_SAVE_KEY, '{"nope":1}');

    expect(await takePendingSave()).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
  });
});
