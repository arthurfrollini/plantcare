import AsyncStorage from '@react-native-async-storage/async-storage';

import { MY_PLANTS_CACHE_KEY, readMyPlantsCache, writeMyPlantsCache } from './myPlantsCache';
import { userPlantFixture } from './testFixtures';

beforeEach(() => AsyncStorage.clear());

describe('myPlantsCache', () => {
  it('reads back what it wrote', async () => {
    await writeMyPlantsCache([{ ...userPlantFixture, lastWateredOn: '2026-10-22' }]);

    expect(await readMyPlantsCache()).toEqual([
      { ...userPlantFixture, lastWateredOn: '2026-10-22' },
    ]);
  });

  it('still reads a list cached before waterings existed', async () => {
    const { lastWateredOn: _dropped, ...beforeWaterings } = userPlantFixture;
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([beforeWaterings]));

    const cached = await readMyPlantsCache();

    expect(cached.map((plant) => plant.id)).toEqual(['p1']);
    expect(cached[0]?.lastWateredOn).toBeNull();
  });

  it('reads an unreadable cache as empty', async () => {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, '{not json');

    expect(await readMyPlantsCache()).toEqual([]);
  });
});
