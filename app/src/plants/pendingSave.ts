import AsyncStorage from '@react-native-async-storage/async-storage';
import { frequencySchema, lightSchema, reminderTimeSchema } from '@plantcare/shared';
import { z } from 'zod';

export const PENDING_SAVE_KEY = '@plantcare:pendingSave';

export const plantFormValuesSchema = z.object({
  nickname: z.string(),
  frequency: frequencySchema,
  reminderTime: reminderTimeSchema,
  light: lightSchema.nullable(),
  notes: z.string(),
  photo: z.object({ uri: z.string(), mimeType: z.string() }).nullable(),
});
export type PlantFormValues = z.infer<typeof plantFormValuesSchema>;

const pendingSaveSchema = plantFormValuesSchema.extend({ catalogPlantId: z.string().min(1) });
export type PendingSave = z.infer<typeof pendingSaveSchema>;

/** Keeps a form the user filled in while signed out, until they have an account. */
export async function setPendingSave(value: PendingSave): Promise<void> {
  await AsyncStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(value));
}

/**
 * Returns the stored form and removes it BEFORE returning, so a repeat call (an effect that fires
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
