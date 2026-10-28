import { toCheckupDto, type CheckupRow } from '../ai/checkup-dto';
import { speciesImageUrl } from '../plants/service';
import {
  DEFAULT_REMINDER_LEAD,
  difficultySchema,
  effectiveWateringDays,
  frequencySchema,
  lightSchema,
  requiredWateringDays,
  type CreateUserPlant,
  type Locale,
  type UpdateUserPlant,
  type UserPlant,
} from '@plantcare/shared';
import { AppError } from '../errors';
import type {
  Plant,
  PlantTranslation,
  PrismaClient,
  UserPlant as UserPlantRow,
} from '../generated/prisma/client';
import { pickTranslation } from '../plants/service';
import type { PhotoStorage } from '../storage';
import { daysBetween, nextOccurrenceDate, todayInZone } from './schedule-start';

export type UserPlantWithSpecies = UserPlantRow & {
  catalogPlant: Plant & { translations: PlantTranslation[] };
  waterings: { wateredOn: Date }[];
};

const include = {
  catalogPlant: { include: { translations: true } },
  waterings: {
    orderBy: { wateredOn: 'desc' },
    take: 1,
    select: { wateredOn: true },
  },
  checkups: {
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const;

function isDateBased(frequency: { per: string }): boolean {
  return frequency.per === 'twoWeeks' || frequency.per === 'month';
}

export function toUserPlantDto(
  row: UserPlantRow & {
    catalogPlant: Plant;
    waterings: { wateredOn: Date }[];
    checkups?: CheckupRow[];
  },
  translation: PlantTranslation | null,
): UserPlant {
  const frequency = frequencySchema.parse({
    times: row.catalogPlant.frequencyTimes,
    per: row.catalogPlant.frequencyPer,
  });
  const required = requiredWateringDays(frequency);
  // A date-based plant without an anchor (its species changed to one) has no
  // fixed start: picking the day again sets it.
  const scheduleNeedsReview =
    (required > 0 &&
      row.wateringDays.length > 0 &&
      row.wateringDays.length !== required) ||
    (isDateBased(frequency) && row.scheduleStartsOn === null);
  return {
    id: row.id,
    catalogPlantId: row.catalogPlantId,
    nickname: row.nickname,
    speciesName: translation?.name ?? row.catalogPlant.scientificName,
    scientificName: row.catalogPlant.scientificName,
    about: translation?.about ?? '',
    waterTips: translation?.waterTips ?? '',
    frequency,
    light: lightSchema.parse(row.catalogPlant.light),
    difficulty: difficultySchema.parse(row.catalogPlant.difficulty),
    wateringDays: scheduleNeedsReview || required === 0 ? [] : row.wateringDays,
    reminderTime: row.reminderTime,
    reminderLeadMinutes: row.reminderLeadMinutes,
    scheduleStartsOn: row.scheduleStartsOn?.toISOString().slice(0, 10) ?? null,
    scheduleNeedsReview,
    lastWateredOn:
      row.waterings[0]?.wateredOn.toISOString().slice(0, 10) ?? null,
    timeZone: row.timeZone,
    notes: row.notes,
    imageUrl: speciesImageUrl(row.catalogPlant),
    hasPhoto: row.photoPath !== null,
    photoVersion: row.photoUpdatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    openCheckup: row.checkups?.[0] ? toCheckupDto(row.checkups[0]) : null,
  };
}

function assertWateringDays(days: number[], required: number): void {
  if (days.length !== 0 && days.length !== required) {
    throw new AppError(
      400,
      'invalid_watering_days',
      `Expected ${required} watering days`,
    );
  }
}

/** Next occurrence of the day the reminders use: the stored one, or the default while it is wrong. */
function anchorFor(
  species: Plant,
  days: number[],
  time: string,
  timeZone: string,
): Date | null {
  const frequency = frequencySchema.parse({
    times: species.frequencyTimes,
    per: species.frequencyPer,
  });
  if (!isDateBased(frequency)) return null;
  const weekday = effectiveWateringDays(frequency, days)[0] ?? 1;
  return new Date(
    `${nextOccurrenceDate(weekday, time, timeZone, new Date())}T00:00:00Z`,
  );
}

function present(row: UserPlantWithSpecies, locale: Locale): UserPlant {
  return toUserPlantDto(
    row,
    pickTranslation(row.catalogPlant.translations, locale),
  );
}

function notFound(): AppError {
  return new AppError(404, 'user_plant_not_found', 'Plant not found');
}

export async function listUserPlants(
  prisma: PrismaClient,
  userId: string,
  locale: Locale,
): Promise<UserPlant[]> {
  const rows = await prisma.userPlant.findMany({
    where: { userId },
    include,
  });
  return rows
    .map((row) => present(row, locale))
    .sort(
      (a, b) =>
        a.reminderTime.localeCompare(b.reminderTime) ||
        a.speciesName.localeCompare(b.speciesName, locale) ||
        a.id.localeCompare(b.id),
    );
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'P2003';
}

export async function createUserPlant(
  prisma: PrismaClient,
  userId: string,
  locale: Locale,
  input: CreateUserPlant,
): Promise<UserPlant> {
  const species = await prisma.plant.findUnique({
    where: { id: input.catalogPlantId },
  });
  if (!species) {
    throw new AppError(400, 'plant_not_found', 'Plant not found');
  }
  const days = input.wateringDays ?? [];
  assertWateringDays(
    days,
    requiredWateringDays(
      frequencySchema.parse({
        times: species.frequencyTimes,
        per: species.frequencyPer,
      }),
    ),
  );
  const row = await prisma.userPlant
    .create({
      data: {
        userId,
        catalogPlantId: species.id,
        nickname: input.nickname ?? null,
        wateringDays: days,
        reminderTime: input.reminderTime,
        reminderLeadMinutes: input.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD,
        scheduleStartsOn: anchorFor(
          species,
          days,
          input.reminderTime,
          input.timeZone,
        ),
        timeZone: input.timeZone,
        notes: input.notes ?? null,
      },
      include,
    })
    .catch((error: unknown) => {
      // The token outlived its user: the owner row is gone.
      if (isForeignKeyViolation(error)) {
        throw new AppError(
          401,
          'unauthorized',
          'Missing or invalid access token',
        );
      }
      throw error;
    });
  return present(row, locale);
}

export async function updateUserPlant(
  prisma: PrismaClient,
  userId: string,
  id: string,
  locale: Locale,
  input: UpdateUserPlant,
): Promise<UserPlant> {
  const owned = await prisma.userPlant.findFirst({
    where: { id, userId },
    include: { catalogPlant: true },
  });
  if (!owned) throw notFound();
  const species = owned.catalogPlant;
  if (input.wateringDays !== undefined) {
    assertWateringDays(
      input.wateringDays,
      requiredWateringDays(
        frequencySchema.parse({
          times: species.frequencyTimes,
          per: species.frequencyPer,
        }),
      ),
    );
  }
  const scheduleChanged =
    input.wateringDays !== undefined || input.reminderTime !== undefined;
  const days = input.wateringDays ?? owned.wateringDays;
  const time = input.reminderTime ?? owned.reminderTime;
  const zone = input.timeZone ?? owned.timeZone;
  const row = await prisma.userPlant.update({
    where: { id },
    data: {
      ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
      ...(input.wateringDays !== undefined
        ? { wateringDays: input.wateringDays }
        : {}),
      ...(input.reminderTime !== undefined
        ? { reminderTime: input.reminderTime }
        : {}),
      ...(input.reminderLeadMinutes !== undefined
        ? { reminderLeadMinutes: input.reminderLeadMinutes }
        : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(scheduleChanged
        ? { scheduleStartsOn: anchorFor(species, days, time, zone) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include,
  });
  return present(row, locale);
}

/** Returns the plant's photo key (null if none); 404 unless the caller owns it. */
export async function getPhotoKey(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<string | null> {
  const owned = await prisma.userPlant.findFirst({
    where: { id, userId },
    select: { photoPath: true },
  });
  if (!owned) throw notFound();
  return owned.photoPath;
}

export async function setUserPlantPhoto(
  prisma: PrismaClient,
  storage: PhotoStorage,
  userId: string,
  id: string,
  locale: Locale,
  key: string,
  data: Buffer,
): Promise<UserPlant> {
  const previous = await getPhotoKey(prisma, userId, id);
  await storage.save(key, data);
  const row = await prisma.userPlant.update({
    where: { id },
    data: { photoPath: key, photoUpdatedAt: new Date() },
    include,
  });
  if (previous !== null && previous !== key) await storage.remove(previous);
  return present(row, locale);
}

export async function removeUserPlantPhoto(
  prisma: PrismaClient,
  storage: PhotoStorage,
  userId: string,
  id: string,
  locale: Locale,
): Promise<UserPlant> {
  const previous = await getPhotoKey(prisma, userId, id);
  const row = await prisma.userPlant.update({
    where: { id },
    data: { photoPath: null, photoUpdatedAt: new Date() },
    include,
  });
  if (previous !== null) await storage.remove(previous);
  return present(row, locale);
}

export async function deleteUserPlant(
  prisma: PrismaClient,
  storage: PhotoStorage,
  userId: string,
  id: string,
): Promise<void> {
  const photoKey = await getPhotoKey(prisma, userId, id);
  const { count } = await prisma.userPlant.deleteMany({
    where: { id, userId },
  });
  if (count === 0) throw notFound();
  if (photoKey !== null) await storage.remove(photoKey);
}

const MAX_DAYS_OFF = 1;

async function ownedWithZone(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<{ timeZone: string }> {
  const owned = await prisma.userPlant.findFirst({
    where: { id, userId },
    select: { timeZone: true },
  });
  if (!owned) throw notFound();
  return owned;
}

async function presentById(
  prisma: PrismaClient,
  id: string,
  locale: Locale,
): Promise<UserPlant> {
  const row = await prisma.userPlant.findUniqueOrThrow({
    where: { id },
    include,
  });
  return present(row, locale);
}

/** Records a watering; `created` is false when the day was already marked. */
export async function markWatered(
  prisma: PrismaClient,
  userId: string,
  id: string,
  locale: Locale,
  wateredOn: string,
): Promise<{ plant: UserPlant; created: boolean }> {
  const { timeZone } = await ownedWithZone(prisma, userId, id);
  const off = Math.abs(
    daysBetween(todayInZone(timeZone, new Date()), wateredOn),
  );
  if (off > MAX_DAYS_OFF) {
    throw new AppError(
      400,
      'invalid_watering_date',
      'The date is too far from today in the plant time zone',
    );
  }
  const date = new Date(`${wateredOn}T00:00:00Z`);
  const { count } = await prisma.watering.createMany({
    data: [{ userPlantId: id, wateredOn: date }],
    skipDuplicates: true,
  });
  return { plant: await presentById(prisma, id, locale), created: count > 0 };
}

export async function unmarkWatered(
  prisma: PrismaClient,
  userId: string,
  id: string,
  locale: Locale,
  wateredOn: string,
): Promise<UserPlant> {
  await ownedWithZone(prisma, userId, id);
  await prisma.watering.deleteMany({
    where: { userPlantId: id, wateredOn: new Date(`${wateredOn}T00:00:00Z`) },
  });
  return presentById(prisma, id, locale);
}
