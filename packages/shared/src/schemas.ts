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
  z.object({ times: z.literal(1), per: z.literal('twoWeeks') }),
  z.object({ times: z.literal(1), per: z.literal('month') }),
]);
export type Frequency = z.infer<typeof frequencySchema>;

export const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm (24h)');

// ISO weekdays: 1 = Monday ... 7 = Sunday. Strictly ascending, so no repeats.
export const isoWeekdaySchema = z.number().int().min(1).max(7);
export const wateringDaysSchema = z
  .array(isoWeekdaySchema)
  .max(7)
  .refine(
    (days) => days.every((day, i) => i === 0 || day > (days[i - 1] ?? 0)),
    'Expected strictly ascending weekdays',
  );

export const halfHourTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, 'Expected HH:00 or HH:30');

export const DEFAULT_REMINDER_LEAD = 15;
export const reminderLeadSchema = z.number().int().min(5).max(30).multipleOf(5);

const AREA_LOCATION = /^[A-Za-z][A-Za-z_]*(\/[A-Za-z0-9_+-]+)+$/;

// Constructing a formatter throws RangeError for unknown zones. This works
// in Node and Hermes alike, unlike Intl.supportedValuesOf. Offsets (+03:00)
// and abbreviations (EST, GMT) are valid for Intl but not canonical IANA
// names, so only UTC and Area/Location shapes pass; the stored value is the
// canonical casing reported by Intl.
export const timeZoneSchema = z
  .string()
  .refine(
    (value) => /^utc$/i.test(value) || AREA_LOCATION.test(value),
    'Expected an IANA time zone such as America/Sao_Paulo',
  )
  .transform((value, ctx) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: value,
      }).resolvedOptions().timeZone;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Unknown time zone' });
      return z.NEVER;
    }
  });

export const plantSourceSchema = z.enum(['curated', 'ai']);
export type PlantSource = z.infer<typeof plantSourceSchema>;

/** Who took a species photo from Wikimedia Commons, under which license, and its page there. */
export const imageCreditSchema = z.object({
  author: z.string(),
  license: z.string(),
  source: z.string(),
});
export type ImageCredit = z.infer<typeof imageCreditSchema>;

/** A catalog species whose photo needs a credit, for the photo credits list. */
export const photoCreditSchema = z.object({
  id: z.string(),
  name: z.string(),
  scientificName: z.string(),
  imageUrl: z.string(),
  credit: imageCreditSchema,
});
export type PhotoCredit = z.infer<typeof photoCreditSchema>;

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
  // Who took the species photo and under which license, when it came from Wikimedia Commons.
  // Defaults to null so a catalog cached or served before credits existed still reads.
  imageCredit: imageCreditSchema.nullable().default(null),
});
export type CatalogPlant = z.infer<typeof catalogPlantSchema>;

export const catalogPageSchema = z.object({
  items: z.array(catalogPlantSchema),
  nextPage: z.number().nullable(),
  /** Every plant matching the filters, across pages. */
  total: z.number().int(),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;

export const userNameSchema = z.string().trim().min(1).max(60);

// bcrypt ignores bytes past 72, so cap the UTF-8 length. TextEncoder runs in
// Node and Hermes alike, unlike Buffer.
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: 'Expected at most 72 bytes in UTF-8',
  });

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  refreshToken: z.string().min(1).max(256),
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  language: localeSchema,
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
  hasAvatar: z.boolean(),
  avatarVersion: z.string().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** A real calendar date as YYYY-MM-DD, in the device's local time. */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((text) => {
    const [year = 0, month = 0, day = 0] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Not a real calendar date');

/** One AI check-up of a sick plant, as the API returns it. */
export const checkupSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  description: z.string().nullable(),
  problem: z.string(),
  steps: z.array(z.string()),
  whenToWorry: z.string(),
  status: z.enum(['open', 'healed']),
  healedAt: z.string().nullable(),
  photoUrl: z.string(),
});
export type Checkup = z.infer<typeof checkupSchema>;

export const userPlantSchema = z.object({
  id: z.string(),
  catalogPlantId: z.string(),
  nickname: z.string().nullable(),
  speciesName: z.string(),
  scientificName: z.string(),
  about: z.string(),
  waterTips: z.string(),
  frequency: frequencySchema,
  light: lightSchema,
  difficulty: difficultySchema,
  wateringDays: wateringDaysSchema,
  reminderTime: z.string(),
  reminderLeadMinutes: reminderLeadSchema,
  // YYYY-MM-DD; anchor for every-two-weeks and monthly plants.
  scheduleStartsOn: z.string().nullable(),
  scheduleNeedsReview: z.boolean(),
  timeZone: z.string(),
  notes: z.string().nullable(),
  // Species illustration; the user's own photo is fetched separately.
  imageUrl: z.string().nullable(),
  // The species photo's credit; null for an illustration. Defaults to null for older caches.
  imageCredit: imageCreditSchema.nullable().default(null),
  hasPhoto: z.boolean(),
  // ISO time of the last photo save; use it to bust image caches.
  photoVersion: z.string().nullable(),
  // Local date of the latest watering, or null if never watered. Defaults to null so a list cached
  // or served before waterings existed still reads.
  lastWateredOn: localDateSchema.nullable().default(null),
  createdAt: z.string(),
  // The newest check-up not yet marked healed. Defaults to null so older caches still read.
  openCheckup: checkupSchema.nullable().default(null),
});
export type UserPlant = z.infer<typeof userPlantSchema>;

const nicknameSchema = z.string().trim().min(1).max(40);
const notesSchema = z.string().max(500);

export const createUserPlantSchema = z.strictObject({
  catalogPlantId: z.string().min(1),
  nickname: nicknameSchema.optional(),
  wateringDays: wateringDaysSchema.optional(),
  reminderTime: halfHourTimeSchema,
  reminderLeadMinutes: reminderLeadSchema.optional(),
  timeZone: timeZoneSchema,
  notes: notesSchema.optional(),
});
export type CreateUserPlant = z.infer<typeof createUserPlantSchema>;

// The species cannot change, so catalogPlantId is not part of an update.
// Frequency and light belong to the species and are rejected here.
export const updateUserPlantSchema = z.strictObject({
  nickname: nicknameSchema.nullable().optional(),
  wateringDays: wateringDaysSchema.optional(),
  reminderTime: halfHourTimeSchema.optional(),
  reminderLeadMinutes: reminderLeadSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  notes: notesSchema.nullable().optional(),
});
export type UpdateUserPlant = z.infer<typeof updateUserPlantSchema>;
