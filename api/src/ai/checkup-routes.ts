import {
  checkupSchema,
  findHarmfulAdvice,
  type CheckupAdvice,
  type Locale,
} from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import { pickTranslation } from '../plants/service';
import type { PhotoStorage } from '../storage';
import { contentTypeForKey } from '../user-plants/photo';
import { readPhotoUpload } from '../user-plants/photo-upload';
import { toCheckupDto } from './checkup-dto';
import { assertAiAllowed, recordAiUsage, type AiConfig } from './usage';

const MAX_DESCRIPTION = 500;

type Advice = Pick<CheckupAdvice, 'problem' | 'steps' | 'whenToWorry'>;

/** Shown instead of advice the harm guard stopped. */
const SAFE_ADVICE: Record<Locale, Advice> = {
  en: {
    problem: "We couldn't give safe advice for this photo.",
    steps: [
      'Check the symptom guide for the most common causes.',
      'Ask again with a clearer photo or a short description.',
    ],
    whenToWorry:
      'If it keeps getting worse over a week, show it to someone at a garden center.',
  },
  'pt-BR': {
    problem: 'Não conseguimos dar um conselho seguro para esta foto.',
    steps: [
      'Veja o guia de sintomas para as causas mais comuns.',
      'Pergunte de novo com uma foto mais nítida ou uma descrição curta.',
    ],
    whenToWorry:
      'Se continuar piorando por uma semana, mostre a planta a alguém numa loja de jardinagem.',
  },
};

function harmfulTerm(advice: Advice): string | null {
  for (const text of [advice.problem, ...advice.steps, advice.whenToWorry]) {
    const term = findHarmfulAdvice(text);
    if (term) return term;
  }
  return null;
}

export function checkupRoutes(
  app: FastifyInstance,
  storage: PhotoStorage,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['ai'];
  const params = z.object({ id: z.string() });

  function config(): AiConfig {
    return {
      ...app.aiConfig,
      enabled: app.aiConfig.enabled && app.plantAi !== undefined,
    };
  }

  async function ownPlant(userId: string, id: string) {
    const plant = await app.prisma.userPlant.findFirst({
      where: { id, userId },
      include: { catalogPlant: { include: { translations: true } } },
    });
    if (!plant)
      throw new AppError(404, 'user_plant_not_found', 'Plant not found');
    return plant;
  }

  async function ownCheckup(
    userId: string,
    plantId: string,
    checkupId: string,
  ) {
    const checkup = await app.prisma.checkup.findFirst({
      where: { id: checkupId, userPlantId: plantId, userPlant: { userId } },
    });
    if (!checkup)
      throw new AppError(404, 'checkup_not_found', 'Check-up not found');
    return checkup;
  }

  typed.post(
    '/me/plants/:id/checkups',
    {
      onRequest: app.authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Ask the AI what is wrong with a plant',
        description:
          'Multipart form: an optional `description` field (up to 500 characters) sent before a required `photo` file.',
        security,
        params,
        consumes: ['multipart/form-data'],
        response: { 201: checkupSchema },
      },
    },
    async (request, reply) => {
      const locale = resolveLocale(request.headers['accept-language']);
      const plant = await ownPlant(request.userId, request.params.id);
      await assertAiAllowed(app.prisma, request.userId, 'checkup', config());
      // 500 characters can take up to 2 KB in UTF-8 (accents, emoji).
      const { data, type, fields } = await readPhotoUpload(request, {
        maxFieldBytes: 2048,
      });
      const description = fields.description?.trim() || undefined;
      if (description && description.length > MAX_DESCRIPTION) {
        throw new AppError(400, 'validation_error', 'Description is too long');
      }

      const ai = app.plantAi;
      if (!ai)
        throw new AppError(503, 'ai_off', 'The AI is unavailable right now');
      const name = pickTranslation(
        plant.catalogPlant.translations,
        locale,
      )?.name;
      const species = name
        ? `${name} (${plant.catalogPlant.scientificName})`
        : plant.catalogPlant.scientificName;
      const { result, usage } = await ai.checkup({
        photo: data,
        species,
        ...(description ? { description } : {}),
        locale,
      });
      await recordAiUsage(app.prisma, request.userId, 'checkup', usage);

      if (!result.isPlant) {
        throw new AppError(422, 'not_a_plant', 'The photo shows no plant');
      }
      if (!result.matchesSpecies) {
        throw new AppError(
          422,
          'species_mismatch',
          'The photo shows a different plant',
        );
      }
      let advice: Advice = result;
      const term = harmfulTerm(result);
      if (term) {
        request.log.warn(
          { term, plantId: plant.id },
          'Replaced harmful plant advice',
        );
        advice = SAFE_ADVICE[locale];
      }

      const checkup = await app.prisma.checkup.create({
        data: {
          userPlantId: plant.id,
          photoKey: '',
          description: description ?? null,
          problem: advice.problem,
          steps: advice.steps,
          whenToWorry: advice.whenToWorry,
        },
      });
      const photoKey = `checkups/${checkup.id}.${type.ext}`;
      await storage.save(photoKey, data);
      const saved = await app.prisma.checkup.update({
        where: { id: checkup.id },
        data: { photoKey },
      });
      return reply.code(201).send(toCheckupDto(saved));
    },
  );

  typed.get(
    '/me/plants/:id/checkups',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "A plant's check-ups, newest first",
        security,
        params,
        response: { 200: z.array(checkupSchema) },
      },
    },
    async (request) => {
      const plant = await ownPlant(request.userId, request.params.id);
      const rows = await app.prisma.checkup.findMany({
        where: { userPlantId: plant.id },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toCheckupDto);
    },
  );

  typed.patch(
    '/me/plants/:id/checkups/:checkupId',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Mark a check-up as healed',
        security,
        params: z.object({ id: z.string(), checkupId: z.string() }),
        body: z.strictObject({ status: z.literal('healed') }),
        response: { 200: checkupSchema },
      },
    },
    async (request) => {
      const { id, checkupId } = request.params;
      const checkup = await ownCheckup(request.userId, id, checkupId);
      const saved = await app.prisma.checkup.update({
        where: { id: checkup.id },
        data: { status: 'healed', healedAt: checkup.healedAt ?? new Date() },
      });
      return toCheckupDto(saved);
    },
  );

  typed.get(
    '/me/plants/:id/checkups/:checkupId/photo',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "A check-up's photo",
        security,
        params: z.object({ id: z.string(), checkupId: z.string() }),
      },
    },
    async (request, reply) => {
      const { id, checkupId } = request.params;
      const checkup = await ownCheckup(request.userId, id, checkupId);
      const data = await storage.read(checkup.photoKey);
      if (!data) throw new AppError(404, 'not_found', 'Photo not found');
      return reply
        .header('content-type', contentTypeForKey(checkup.photoKey))
        .header('cache-control', 'private, max-age=86400')
        .send(data);
    },
  );
}
