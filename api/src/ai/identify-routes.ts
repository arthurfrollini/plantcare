import {
  aiStatusSchema,
  createUserPlantSchema,
  findHarmfulAdvice,
  identificationSchema,
  identifyResponseSchema,
  referencePhotoResponseSchema,
  userPlantSchema,
  type Identification,
  type IdentifyResponse,
  type Locale,
  type ReferencePhotoResponse,
} from '@plantcare/shared';
import { setTimeout } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../errors';
import { resolveLocale } from '../i18n';
import { getCatalogPlant } from '../plants/service';
import { storeSpeciesPhoto } from './commons';
import type { ReferenceSearch } from './reference-photo';
import type { PhotoStorage } from '../storage';
import { readPhotoUpload } from '../user-plants/photo-upload';
import { createUserPlant, setUserPlantPhoto } from '../user-plants/service';
import {
  createAiSpecies,
  findCatalogMatch,
  findSpecies,
} from './catalog-match';
import type { PhotoType } from '../user-plants/photo';
import {
  aiStatus,
  assertAiAllowed,
  countFailedAnswer,
  recordAiUsage,
  type AiConfig,
} from './usage';

const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

/** Gives a new species its photo, checked at the cost of the user whose add created it; never rejects. */
export type AttachSpeciesPhoto = (
  plantId: string,
  scientificName: string,
  userId: string,
) => Promise<void>;

/** Searches a checked photo for a species, at the cost of the user who asked; never rejects. */
export type FindReferencePhoto = (
  scientificName: string,
  userId: string,
) => Promise<ReferenceSearch>;

export type SpeciesPhotos = {
  attach: AttachSpeciesPhoto;
  findReference: FindReferencePhoto;
};

const noPhotos: SpeciesPhotos = {
  attach: () => Promise.resolve(),
  findReference: () => Promise.resolve({ status: 'unavailable' }),
};

export function identifyRoutes(
  app: FastifyInstance,
  storage: PhotoStorage,
  photos: SpeciesPhotos = noPhotos,
  /** How long an add waits for the species photo before answering without it. */
  speciesPhotoWaitMs = 10_000,
): void {
  const attachSpeciesPhoto = photos.attach;
  // One search per proposal at a time: a second call waits for the first one's answer.
  const searches = new Map<string, Promise<ReferencePhotoResponse>>();
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];
  const tags = ['ai'];
  const rateLimit = { max: 20, timeWindow: '1 minute' };

  function config(): AiConfig {
    return {
      ...app.aiConfig,
      enabled: app.aiConfig.enabled && app.plantAi !== undefined,
    };
  }

  async function catalogAnswer(
    id: string,
    locale: Locale,
  ): Promise<IdentifyResponse> {
    const plant = await getCatalogPlant(app.prisma, locale, id);
    if (!plant) throw new AppError(404, 'plant_not_found', 'Plant not found');
    return { kind: 'catalog', plant };
  }

  /** Drops the user's expired proposals and their photos; nobody can add them any more. */
  async function clearExpiredProposals(userId: string): Promise<void> {
    const where = { userId, expiresAt: { lt: new Date() } };
    const expired = await app.prisma.aiProposal.findMany({
      where,
      select: { photoKey: true, referenceKey: true },
    });
    if (expired.length === 0) return;
    await app.prisma.aiProposal.deleteMany({ where });
    for (const { photoKey, referenceKey } of expired) {
      if (photoKey !== null) await storage.remove(photoKey);
      if (referenceKey !== null) await storage.remove(referenceKey);
    }
  }

  /** The user's proposal that can still be added, or the reason it can't. */
  async function openProposal(id: string, userId: string) {
    const proposal = await app.prisma.aiProposal.findFirst({
      where: { id, userId },
    });
    if (!proposal)
      throw new AppError(404, 'proposal_not_found', 'Proposal not found');
    if (proposal.usedAt)
      throw new AppError(409, 'proposal_used', 'Already added');
    if (proposal.expiresAt <= new Date())
      throw new AppError(410, 'proposal_expired', 'Proposal expired');
    return proposal;
  }

  function referenceAnswer(proposal: {
    id: string;
    referenceStatus: string;
    referenceKey: string | null;
    referenceAuthor: string | null;
    referenceLicense: string | null;
    referenceSource: string | null;
  }): ReferencePhotoResponse {
    const { referenceAuthor, referenceLicense, referenceSource } = proposal;
    if (
      proposal.referenceStatus !== 'found' ||
      !proposal.referenceKey ||
      !referenceAuthor ||
      !referenceLicense ||
      !referenceSource
    ) {
      return { photo: null };
    }
    return {
      photo: {
        url: `/ai/proposals/${proposal.id}/reference-photo/image`,
        credit: {
          author: referenceAuthor,
          license: referenceLicense,
          source: referenceSource,
        },
      },
    };
  }

  /** Finds and stores the proposal's reference photo once; later calls get what was stored. */
  async function searchReference(
    id: string,
    userId: string,
  ): Promise<ReferencePhotoResponse> {
    const proposal = await openProposal(id, userId);
    if (proposal.referenceStatus !== 'none') return referenceAnswer(proposal);
    const { scientificName } = identificationSchema.parse(proposal.payload);
    const found = await photos.findReference(scientificName, userId);
    if (found.status === 'unavailable') return { photo: null };
    if (found.status === 'notFound') {
      await app.prisma.aiProposal.update({
        where: { id },
        data: { referenceStatus: 'notFound' },
      });
      return { photo: null };
    }
    const referenceKey = `proposals/${id}-ref.webp`;
    await storage.save(referenceKey, found.webp);
    const stored = await app.prisma.aiProposal.update({
      where: { id },
      data: {
        referenceStatus: 'found',
        referenceKey,
        referenceAuthor: found.photo.author,
        referenceLicense: found.photo.license,
        referenceSource: found.photo.source,
      },
    });
    return referenceAnswer(stored);
  }

  /** Calls the model, counts the call, and turns its answer into a response. */
  async function identifyWithAi(
    request: FastifyRequest,
    input: { name?: string; photo?: { data: Buffer; type: PhotoType } },
  ): Promise<IdentifyResponse> {
    const locale = resolveLocale(request.headers['accept-language']);
    await clearExpiredProposals(request.userId);
    await assertAiAllowed(app.prisma, request.userId, 'identify', config());
    const ai = app.plantAi;
    if (!ai)
      throw new AppError(503, 'ai_off', 'The AI is unavailable right now');
    const { result, usage } = await countFailedAnswer(
      app.prisma,
      request.userId,
      'identify',
      ai.identify({
        ...(input.name ? { name: input.name } : {}),
        ...(input.photo ? { photo: input.photo.data } : {}),
        locale,
      }),
    );
    await recordAiUsage(app.prisma, request.userId, 'identify', usage);
    if (!result.isPlant) return { kind: 'none', reason: 'not_a_plant' };
    // The care text of a new species reaches every user, so it gets the same guard as check-ups.
    const harmful = [
      result.about.en,
      result.about['pt-BR'],
      result.waterTips.en,
      result.waterTips['pt-BR'],
    ]
      .map(findHarmfulAdvice)
      .find((term) => term !== null);
    if (harmful) {
      request.log.warn(
        { term: harmful, scientificName: result.scientificName },
        'Dropped an identification with harmful care text',
      );
      return { kind: 'none', reason: 'unsure' };
    }

    const known = await findSpecies(app.prisma, result.scientificName);
    if (known) return catalogAnswer(known, locale);

    const proposal = await app.prisma.aiProposal.create({
      data: {
        userId: request.userId,
        payload: result,
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
      },
    });
    if (input.photo) {
      const photoKey = `proposals/${proposal.id}.${input.photo.type.ext}`;
      await storage.save(photoKey, input.photo.data);
      await app.prisma.aiProposal.update({
        where: { id: proposal.id },
        data: { photoKey },
      });
    }
    return { kind: 'proposal', proposalId: proposal.id, proposal: result };
  }

  typed.get(
    '/ai/status',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: 'Whether the AI is on, and what is left today',
        security,
        response: { 200: aiStatusSchema },
      },
    },
    (request) => aiStatus(app.prisma, request.userId, config()),
  );

  typed.post(
    '/ai/identify/name',
    {
      onRequest: app.authenticate,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Identify a plant by a typed name',
        description: 'Looks in the catalog first; only a miss goes to the AI.',
        security,
        body: z.object({ name: z.string().trim().min(1).max(100) }),
        response: { 200: identifyResponseSchema },
      },
    },
    async (request) => {
      const { name } = request.body;
      const match = await findCatalogMatch(app.prisma, name);
      if (match) {
        return catalogAnswer(
          match,
          resolveLocale(request.headers['accept-language']),
        );
      }
      return identifyWithAi(request, { name });
    },
  );

  typed.post(
    '/ai/identify/photo',
    {
      onRequest: app.authenticate,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Identify a plant from a photo',
        description:
          'Multipart form with a `photo` file field (JPEG, PNG or WebP, up to 5 MB).',
        security,
        consumes: ['multipart/form-data'],
        response: { 200: identifyResponseSchema },
      },
    },
    async (request) => {
      const photo = await readPhotoUpload(request);
      return identifyWithAi(request, { photo });
    },
  );

  typed.post(
    '/ai/proposals/:id/reference-photo',
    {
      onRequest: app.authenticate,
      config: { rateLimit },
      schema: {
        tags,
        summary: "Find a checked photo of a proposal's species",
        description:
          'Searches Wikimedia Commons, then iNaturalist, and has the AI check each candidate. The answer is stored: later calls return it without searching, except after every source failed.',
        security,
        params: z.object({ id: z.string() }),
        response: { 200: referencePhotoResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const running = searches.get(id);
      if (running) return running;
      const search = searchReference(id, request.userId).finally(() =>
        searches.delete(id),
      );
      searches.set(id, search);
      return search;
    },
  );

  typed.get(
    '/ai/proposals/:id/reference-photo/image',
    {
      onRequest: app.authenticate,
      schema: {
        tags,
        summary: "The proposal's reference photo",
        security,
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const proposal = await app.prisma.aiProposal.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { referenceKey: true },
      });
      const data = proposal?.referenceKey
        ? await storage.read(proposal.referenceKey)
        : null;
      if (!data) throw new AppError(404, 'not_found', 'Image not found');
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'private, max-age=86400')
        .send(data);
    },
  );

  typed.post(
    '/ai/proposals/:id/add',
    {
      onRequest: app.authenticate,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Add an identified species to my garden',
        description:
          'Saves the species to the catalog when it is new, then creates the plant with the given schedule and the identification photo.',
        security,
        params: z.object({ id: z.string() }),
        body: createUserPlantSchema.omit({ catalogPlantId: true }),
        response: { 201: userPlantSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const locale = resolveLocale(request.headers['accept-language']);
      const now = new Date();
      // Claim the proposal first: of two taps at once, only one gets count 1.
      const claimed = await app.prisma.aiProposal.updateMany({
        where: {
          id,
          userId: request.userId,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count === 0) {
        const proposal = await app.prisma.aiProposal.findFirst({
          where: { id, userId: request.userId },
        });
        if (!proposal)
          throw new AppError(404, 'proposal_not_found', 'Proposal not found');
        if (proposal.usedAt)
          throw new AppError(409, 'proposal_used', 'Already added');
        throw new AppError(410, 'proposal_expired', 'Proposal expired');
      }
      try {
        const proposal = await app.prisma.aiProposal.findUniqueOrThrow({
          where: { id },
        });
        const identification: Identification = identificationSchema.parse(
          proposal.payload,
        );
        const speciesId = await createAiSpecies(app.prisma, identification);
        const species = await app.prisma.plant.findUniqueOrThrow({
          where: { id: speciesId },
        });
        const reference = proposal.referenceKey
          ? await storage.read(proposal.referenceKey)
          : null;
        if (species.source === 'ai' && !species.imageKey && reference) {
          // The photo the user saw in the preview becomes the catalog's.
          await storeSpeciesPhoto(
            app.prisma,
            storage,
            speciesId,
            {
              url: '',
              author: proposal.referenceAuthor ?? 'Unknown',
              license: proposal.referenceLicense ?? '',
              source: proposal.referenceSource ?? '',
            },
            reference,
          );
        } else if (
          species.source === 'ai' &&
          !species.imageKey &&
          proposal.referenceStatus === 'none'
        ) {
          // Never searched (or every source was down): wait briefly, so the garden shows the photo
          // at once; a slow search still finishes later.
          await Promise.race([
            attachSpeciesPhoto(
              speciesId,
              species.scientificName,
              request.userId,
            ),
            setTimeout(speciesPhotoWaitMs, undefined, { ref: false }),
          ]);
        }
        let plant = await createUserPlant(app.prisma, request.userId, locale, {
          ...request.body,
          catalogPlantId: speciesId,
        });
        if (proposal.photoKey) {
          const data = await storage.read(proposal.photoKey);
          if (data) {
            const ext = proposal.photoKey.split('.').pop() ?? 'jpg';
            plant = await setUserPlantPhoto(
              app.prisma,
              storage,
              request.userId,
              plant.id,
              locale,
              `${plant.id}.${ext}`,
              data,
            );
            await storage.remove(proposal.photoKey);
          }
        }
        if (proposal.referenceKey) await storage.remove(proposal.referenceKey);
        return reply.code(201).send(plant);
      } catch (error) {
        // Let the user try again when the add itself failed.
        await app.prisma.aiProposal.update({
          where: { id },
          data: { usedAt: null },
        });
        throw error;
      }
    },
  );
}
