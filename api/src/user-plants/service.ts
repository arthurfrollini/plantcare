import {
  frequencySchema,
  lightSchema,
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

export type UserPlantWithSpecies = UserPlantRow & {
  catalogPlant: Plant & { translations: PlantTranslation[] };
};

const include = {
  catalogPlant: { include: { translations: true } },
} as const;

export function toUserPlantDto(
  row: UserPlantRow & { catalogPlant: Plant },
  translation: PlantTranslation | null,
): UserPlant {
  return {
    id: row.id,
    catalogPlantId: row.catalogPlantId,
    nickname: row.nickname,
    speciesName: translation?.name ?? row.catalogPlant.scientificName,
    scientificName: row.catalogPlant.scientificName,
    about: translation?.about ?? '',
    waterTips: translation?.waterTips ?? '',
    frequency: frequencySchema.parse({
      times: row.frequencyTimes,
      per: row.frequencyPer,
    }),
    reminderTime: row.reminderTime,
    timeZone: row.timeZone,
    light: row.light === null ? null : lightSchema.parse(row.light),
    notes: row.notes,
    imageUrl: row.catalogPlant.imageFile
      ? `/static/plants/${row.catalogPlant.imageFile}`
      : null,
    hasPhoto: row.photoPath !== null,
    photoVersion: row.photoUpdatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
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
        (a.nickname ?? a.speciesName).localeCompare(
          b.nickname ?? b.speciesName,
          locale,
        ) ||
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
  const frequency = input.frequency ?? {
    times: species.frequencyTimes,
    per: species.frequencyPer,
  };
  const row = await prisma.userPlant
    .create({
      data: {
        userId,
        catalogPlantId: species.id,
        nickname: input.nickname ?? null,
        frequencyTimes: frequency.times,
        frequencyPer: frequency.per,
        reminderTime: input.reminderTime,
        timeZone: input.timeZone,
        light: input.light ?? species.light,
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
  const owned = await prisma.userPlant.findFirst({ where: { id, userId } });
  if (!owned) throw notFound();
  const row = await prisma.userPlant.update({
    where: { id },
    data: {
      ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
      ...(input.frequency !== undefined
        ? {
            frequencyTimes: input.frequency.times,
            frequencyPer: input.frequency.per,
          }
        : {}),
      ...(input.reminderTime !== undefined
        ? { reminderTime: input.reminderTime }
        : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.light !== undefined ? { light: input.light } : {}),
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
