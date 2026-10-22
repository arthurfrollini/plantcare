import AsyncStorage from '@react-native-async-storage/async-storage';
import { userPlantSchema, type UserPlant } from '@plantcare/shared';
import { z } from 'zod';

export const MY_PLANTS_CACHE_KEY = '@plantcare:myPlantsCache';

const cacheSchema = z.array(userPlantSchema);

export async function writeMyPlantsCache(plants: UserPlant[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify(plants));
  } catch {
    // The cache is a convenience; a failed write just means no offline list.
  }
}

/** The last synced list, or an empty one when nothing valid is stored. */
export async function readMyPlantsCache(): Promise<UserPlant[]> {
  try {
    const raw = await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
