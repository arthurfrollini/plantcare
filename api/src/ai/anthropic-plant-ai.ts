import Anthropic from '@anthropic-ai/sdk';
import { checkupAdviceSchema, identificationSchema } from '@plantcare/shared';
import { z } from 'zod';
import { AppError } from '../errors';
import { detectPhotoType, type PhotoType } from '../user-plants/photo';
import type { AiUsageTokens } from './cost';
import { toOutputSchema } from './output-schema';
import { speciesPhotoCheckSchema, type PlantAi } from './plant-ai';
import {
  IDENTIFY_SYSTEM,
  SPECIES_PHOTO_SYSTEM,
  checkupPrompt,
  checkupSystem,
  identifyPrompt,
  speciesPhotoPrompt,
} from './prompts';

export type CreateParams = {
  model: string;
  max_tokens: number;
  system: string;
  thinking: { type: 'disabled' } | { type: 'adaptive' };
  output_config: {
    effort: 'low';
    format: { type: 'json_schema'; schema: Record<string, unknown> };
  };
  messages: Anthropic.MessageParam[];
};

/** The one SDK call the client makes, injectable so tests never hit the network. */
export type CreateFn = (params: CreateParams) => Promise<{
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}>;

const MEDIA_TYPES: Record<
  PhotoType['ext'],
  Anthropic.Base64ImageSource['media_type']
> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function imageBlock(photo: Buffer): Anthropic.ImageBlockParam {
  const type = detectPhotoType(photo);
  if (!type) throw new AppError(400, 'invalid_photo', 'Unsupported photo');
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: MEDIA_TYPES[type.ext],
      data: photo.toString('base64'),
    },
  };
}

function jsonText(content: Awaited<ReturnType<CreateFn>>['content']): unknown {
  const text = content.find((block) => block.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The model could not give a usable answer. Carries the tokens a paid answer used (null when the
 * call itself failed), so they still count towards the limits, and the original error as cause.
 */
export class AiAnswerError extends AppError {
  constructor(
    readonly usage: AiUsageTokens | null,
    cause: unknown,
  ) {
    super(502, 'ai_unavailable', 'The AI could not answer');
    this.cause = cause;
  }
}

const notAPlantSchema = z.object({ isPlant: z.literal(false) });
const otherSpeciesSchema = z.object({
  isPlant: z.literal(true),
  matchesSpecies: z.literal(false),
});

async function run<T, F>(
  create: CreateFn,
  params: CreateParams,
  schema: z.ZodType<T>,
  fallback: z.ZodType<F>,
): Promise<{ result: T | F; usage: AiUsageTokens }> {
  let response: Awaited<ReturnType<CreateFn>>;
  try {
    response = await create(params);
  } catch (error) {
    throw new AiAnswerError(null, error);
  }
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  if (response.stop_reason === 'refusal') {
    throw new AiAnswerError(usage, new Error('The model refused'));
  }
  const json = jsonText(response.content);
  const parsed = schema.safeParse(json);
  if (parsed.success) return { result: parsed.data, usage };
  // "Not a plant" with broken placeholders is still a clear answer.
  const short = fallback.safeParse(json);
  if (short.success) return { result: short.data, usage };
  throw new AiAnswerError(usage, parsed.error);
}

/** Gives up before the app's 60 s timeout, so a retry from the app never races a late answer. */
export const ANTHROPIC_CLIENT_OPTIONS = { timeout: 45_000, maxRetries: 1 };
/**
 * The whole call, retry and body included. The SDK's timeout stops once the headers arrive, so a
 * body that stalls after them would otherwise hold the request forever.
 */
export const ANTHROPIC_DEADLINE_MS = 50_000;

export function sdkCreate(options: {
  apiKey?: string;
  /** Tests pass a stub. */
  fetch?: typeof fetch;
  deadlineMs?: number;
}): CreateFn {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...ANTHROPIC_CLIENT_OPTIONS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const deadlineMs = options.deadlineMs ?? ANTHROPIC_DEADLINE_MS;
  return (params) =>
    client.messages.create(params, {
      signal: AbortSignal.timeout(deadlineMs),
    });
}

export function createAnthropicPlantAi(options: {
  model: string;
  apiKey?: string;
  create?: CreateFn;
}): PlantAi {
  const create = options.create ?? sdkCreate({ apiKey: options.apiKey });

  return {
    identify({ photo, name, locale }) {
      const content: Anthropic.ContentBlockParam[] = photo
        ? [imageBlock(photo), { type: 'text', text: identifyPrompt(undefined) }]
        : [{ type: 'text', text: identifyPrompt(name) }];
      return run(
        create,
        {
          model: options.model,
          max_tokens: 2000,
          system: `${IDENTIFY_SYSTEM}\n\nThe user's language is ${locale}.`,
          thinking: { type: 'disabled' },
          output_config: {
            effort: 'low',
            format: {
              type: 'json_schema',
              schema: toOutputSchema(identificationSchema),
            },
          },
          messages: [{ role: 'user', content }],
        },
        identificationSchema,
        notAPlantSchema,
      );
    },
    checkup({ photo, species, description, locale }) {
      return run(
        create,
        {
          model: options.model,
          max_tokens: 4000,
          system: checkupSystem(locale),
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'low',
            format: {
              type: 'json_schema',
              schema: toOutputSchema(checkupAdviceSchema),
            },
          },
          messages: [
            {
              role: 'user',
              content: [
                imageBlock(photo),
                { type: 'text', text: checkupPrompt(species, description) },
              ],
            },
          ],
        },
        checkupAdviceSchema,
        z.union([notAPlantSchema, otherSpeciesSchema]),
      );
    },
    checkSpeciesPhoto({ photo, scientificName }) {
      return run(
        create,
        {
          model: options.model,
          max_tokens: 300,
          system: SPECIES_PHOTO_SYSTEM,
          thinking: { type: 'disabled' },
          output_config: {
            effort: 'low',
            format: {
              type: 'json_schema',
              schema: toOutputSchema(speciesPhotoCheckSchema),
            },
          },
          messages: [
            {
              role: 'user',
              content: [
                imageBlock(photo),
                { type: 'text', text: speciesPhotoPrompt(scientificName) },
              ],
            },
          ],
        },
        speciesPhotoCheckSchema,
        z.never(),
      );
    },
  };
}
