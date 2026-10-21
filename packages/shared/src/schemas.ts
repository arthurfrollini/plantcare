import { z } from 'zod';

export const localeSchema = z.enum(['en', 'pt-BR']);
export type Locale = z.infer<typeof localeSchema>;

export const lightSchema = z.enum(['full_sun', 'partial_shade', 'shade']);
export type Light = z.infer<typeof lightSchema>;

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const frequencySchema = z.discriminatedUnion('per', [
  z.object({ times: z.literal(1), per: z.literal('day') }),
  z.object({
    times: z.number().int().min(1).max(7),
    per: z.literal('week'),
  }),
]);
export type Frequency = z.infer<typeof frequencySchema>;

export const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm (24h)');

// Constructing a formatter throws RangeError for unknown zones. This works
// in Node and Hermes alike, unlike Intl.supportedValuesOf.
export const timeZoneSchema = z.string().refine((value) => {
  if (value === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

export const plantSourceSchema = z.enum(['curated', 'ai']);
export type PlantSource = z.infer<typeof plantSourceSchema>;

export const catalogPlantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  scientificName: z.string(),
  source: plantSourceSchema,
  name: z.string(),
  about: z.string(),
  waterTips: z.string(),
  light: lightSchema,
  difficulty: difficultySchema,
  frequency: frequencySchema,
  imageUrl: z.string().nullable(),
});
export type CatalogPlant = z.infer<typeof catalogPlantSchema>;

export const catalogPageSchema = z.object({
  items: z.array(catalogPlantSchema),
  nextPage: z.number().nullable(),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  language: localeSchema,
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const userPlantSchema = z.object({
  id: z.string(),
  catalogPlantId: z.string(),
  nickname: z.string().nullable(),
  speciesName: z.string(),
  scientificName: z.string(),
  about: z.string(),
  waterTips: z.string(),
  frequency: frequencySchema,
  reminderTime: z.string(),
  timeZone: z.string(),
  light: lightSchema.nullable(),
  notes: z.string().nullable(),
  // Species illustration; the user's own photo is fetched separately.
  imageUrl: z.string().nullable(),
  hasPhoto: z.boolean(),
  createdAt: z.string(),
});
export type UserPlant = z.infer<typeof userPlantSchema>;

const nicknameSchema = z.string().trim().min(1).max(40);
const notesSchema = z.string().max(500);

export const createUserPlantSchema = z.object({
  catalogPlantId: z.string().min(1),
  nickname: nicknameSchema.optional(),
  frequency: frequencySchema.optional(),
  reminderTime: reminderTimeSchema,
  timeZone: timeZoneSchema,
  light: lightSchema.optional(),
  notes: notesSchema.optional(),
});
export type CreateUserPlant = z.infer<typeof createUserPlantSchema>;

// The species cannot change, so catalogPlantId is not part of an update.
export const updateUserPlantSchema = z.object({
  nickname: nicknameSchema.nullable().optional(),
  frequency: frequencySchema.optional(),
  reminderTime: reminderTimeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  light: lightSchema.nullable().optional(),
  notes: notesSchema.nullable().optional(),
});
export type UpdateUserPlant = z.infer<typeof updateUserPlantSchema>;
