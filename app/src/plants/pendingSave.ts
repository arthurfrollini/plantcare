import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

export const PENDING_SAVE_KEY = '@plantcare:pendingSave';

/** A species picked in the catalog; the API gives it the species' own care plan. */
export const speciesPickSchema = z.strictObject({ catalogPlantId: z.string().min(1) });
export type SpeciesPick = z.infer<typeof speciesPickSchema>;

const pendingSaveSchema = z.object({ plants: z.array(speciesPickSchema).min(1) });
export type PendingSave = z.infer<typeof pendingSaveSchema>;

/** Keeps the plants picked while signed out, until the user has an account. */
export async function setPendingSave(value: PendingSave): Promise<void> {
  await AsyncStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(value));
}

/**
 * Returns the stored plants and removes it BEFORE returning, so a repeat call (an effect that fires
 * twice) finds nothing and the plant cannot be created twice. A malformed value is dropped.
 */
export function takePendingSave(): Promise<PendingSave | null> {
  // Calls run one at a time, so two overlapping takes cannot both read the value.
  const run = takeQueue.then(takeOnce);
  takeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let takeQueue: Promise<unknown> = Promise.resolve();

async function takeOnce(): Promise<PendingSave | null> {
  const raw = await AsyncStorage.getItem(PENDING_SAVE_KEY);
  if (raw === null) return null;
  await AsyncStorage.removeItem(PENDING_SAVE_KEY);
  try {
    const parsed = pendingSaveSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
