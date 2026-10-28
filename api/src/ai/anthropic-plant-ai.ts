import Anthropic from '@anthropic-ai/sdk';
import {
  checkupAdviceSchema,
  identificationSchema,
  type CheckupAdvice,
  type Identification,
} from '@plantcare/shared';
import type { z } from 'zod';
import { AppError } from '../errors';
import { detectPhotoType, type PhotoType } from '../user-plants/photo';
import type { AiUsageTokens } from './cost';
import { toOutputSchema } from './output-schema';
import type { PlantAi } from './plant-ai';
import {
  IDENTIFY_SYSTEM,
  checkupPrompt,
  checkupSystem,
  identifyPrompt,
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

async function run<T>(
  create: CreateFn,
  params: CreateParams,
  schema: z.ZodType<T>,
): Promise<{ result: T; usage: AiUsageTokens }> {
  let response: Awaited<ReturnType<CreateFn>>;
  try {
    response = await create(params);
  } catch {
    throw new AppError(
      502,
      'ai_unavailable',
      'The AI is unavailable right now',
    );
  }
  const parsed = schema.safeParse(jsonText(response.content));
  if (response.stop_reason === 'refusal' || !parsed.success) {
    throw new AppError(502, 'ai_unavailable', 'The AI could not answer');
  }
  return {
    result: parsed.data,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function sdkCreate(apiKey: string | undefined): CreateFn {
  const client = new Anthropic({ apiKey });
  return (params) => client.messages.create(params);
}

export function createAnthropicPlantAi(options: {
  model: string;
  apiKey?: string;
  create?: CreateFn;
}): PlantAi {
  const create = options.create ?? sdkCreate(options.apiKey);

  return {
    identify({ photo, name, locale }) {
      const content: Anthropic.ContentBlockParam[] = photo
        ? [imageBlock(photo), { type: 'text', text: identifyPrompt(undefined) }]
        : [{ type: 'text', text: identifyPrompt(name) }];
      return run<Identification>(
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
      );
    },
    checkup({ photo, species, description, locale }) {
      return run<CheckupAdvice>(
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
      );
    },
  };
}
