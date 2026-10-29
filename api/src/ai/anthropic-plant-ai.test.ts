import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors';
import {
  ANTHROPIC_CLIENT_OPTIONS,
  createAnthropicPlantAi,
  type CreateFn,
  type CreateParams,
} from './anthropic-plant-ai';

// A real JPEG starts with FF D8 FF.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const identification = {
  isPlant: true,
  confidence: 'high',
  scientificName: 'Zamioculcas zamiifolia',
  names: { en: 'ZZ plant', 'pt-BR': 'Zamioculca' },
  about: { en: 'Glossy leaves.', 'pt-BR': 'Folhas brilhantes.' },
  waterTips: { en: 'Let it dry.', 'pt-BR': 'Deixe secar.' },
  light: 'partial_shade',
  difficulty: 'easy',
  frequency: { times: 1, per: 'twoWeeks' },
};

function stub(answer: unknown, stopReason = 'end_turn') {
  return vi.fn<CreateFn>(() =>
    Promise.resolve({
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      stop_reason: stopReason,
      usage: { input_tokens: 1500, output_tokens: 300 },
    }),
  );
}

/** The params of the first call; fails the test when there was none. */
function firstParams(create: ReturnType<typeof stub>): CreateParams {
  const params = create.mock.calls[0]?.[0];
  if (!params) throw new Error('create was not called');
  return params;
}

function firstContent(create: ReturnType<typeof stub>) {
  const message = firstParams(create).messages[0];
  if (!message || !Array.isArray(message.content))
    throw new Error('no content blocks');
  return message.content;
}

describe('createAnthropicPlantAi', () => {
  it('sends the photo before the text, with thinking off, low effort and a JSON schema', async () => {
    const parse = stub(identification);
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: parse,
    });

    const { result, usage } = await ai.identify({
      photo: jpeg,
      locale: 'pt-BR',
    });

    expect(result).toMatchObject({ scientificName: 'Zamioculcas zamiifolia' });
    expect(usage).toEqual({ inputTokens: 1500, outputTokens: 300 });
    const params = firstParams(parse);
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    const content = firstContent(parse);
    expect(content[0]).toMatchObject({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: jpeg.toString('base64'),
      },
    });
    expect(Array.isArray(content) && content[1]).toMatchObject({
      type: 'text',
    });
  });

  it('identifies a typed name without an image', async () => {
    const parse = stub(identification);
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: parse,
    });
    await ai.identify({ name: 'zamioculca', locale: 'pt-BR' });
    const content = firstContent(parse);
    expect(content.map((block) => block.type)).toEqual(['text']);
    expect(JSON.stringify(content)).toContain('zamioculca');
  });

  it('runs check-ups with adaptive thinking and tells the model the species and language', async () => {
    const parse = stub({
      isPlant: true,
      matchesSpecies: true,
      problem: 'Too much water.',
      steps: ['Let the soil dry.'],
      whenToWorry: 'If the stems go soft.',
    });
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: parse,
    });
    await ai.checkup({
      photo: jpeg,
      species: 'Zamioculcas zamiifolia',
      description: 'folhas amarelas',
      locale: 'pt-BR',
    });
    const params = firstParams(parse);
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config.effort).toBe('low');
    const text = JSON.stringify(params);
    expect(text).toContain('Zamioculcas zamiifolia');
    expect(text).toContain('folhas amarelas');
    expect(text).toContain('Brazilian Portuguese');
  });

  it('checks a catalog photo with the photo first, the species named, thinking off and a JSON schema', async () => {
    const parse = stub({ suitable: false, reason: 'A coin, not a plant.' });
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: parse,
    });

    const { result, usage } = await ai.checkSpeciesPhoto({
      photo: jpeg,
      scientificName: 'Zantedeschia aethiopica',
    });

    expect(result).toEqual({ suitable: false, reason: 'A coin, not a plant.' });
    expect(usage).toEqual({ inputTokens: 1500, outputTokens: 300 });
    const params = firstParams(parse);
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config.format.schema.required).toEqual([
      'suitable',
      'reason',
    ]);
    // Drawings, diagrams and objects such as coins are what the check exists to catch.
    expect(params.system).toMatch(/coin/);
    expect(params.system).toMatch(/diagram/);
    expect(params.system).toMatch(/drawing/);
    const content = firstContent(parse);
    expect(content.map((block) => block.type)).toEqual(['image', 'text']);
    expect(JSON.stringify(content[1])).toContain('Zantedeschia aethiopica');
  });

  it('reports the AI as unavailable on a refusal or an answer that fails the schema', async () => {
    for (const parse of [
      stub(identification, 'refusal'),
      stub({ isPlant: 'yes' }),
    ]) {
      const ai = createAnthropicPlantAi({
        model: 'claude-haiku-5-5',
        create: parse,
      });
      await expect(
        ai.identify({ name: 'x', locale: 'en' }),
      ).rejects.toMatchObject({
        statusCode: 502,
        code: 'ai_unavailable',
      });
    }
  });

  it('reports the AI as unavailable when the API call fails', async () => {
    const parse = vi.fn<CreateFn>(() =>
      Promise.reject(new Error('socket hang up')),
    );
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: parse,
    });
    await expect(
      ai.identify({ name: 'x', locale: 'en' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('reads an answer with broken placeholders as "not a plant" when it says so', async () => {
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: stub({
        isPlant: false,
        confidence: 'low',
        scientificName: '',
        names: { en: '', 'pt-BR': '' },
        about: { en: '', 'pt-BR': '' },
        waterTips: { en: '', 'pt-BR': '' },
        light: 'shade',
        difficulty: 'easy',
        frequency: { times: 0, per: 'week' },
      }),
    });

    const { result, usage } = await ai.identify({ photo: jpeg, locale: 'en' });

    expect(result.isPlant).toBe(false);
    expect(usage).toEqual({ inputTokens: 1500, outputTokens: 300 });
  });

  it('reads a check-up with empty steps as "another species" when it says so', async () => {
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: stub({
        isPlant: true,
        matchesSpecies: false,
        problem: '',
        steps: [],
        whenToWorry: '',
      }),
    });

    const { result } = await ai.checkup({
      photo: jpeg,
      species: 'Zamioculcas zamiifolia',
      locale: 'en',
    });

    expect(result).toMatchObject({ isPlant: true, matchesSpecies: false });
  });

  it('keeps the tokens of a paid answer it cannot use, so they still count', async () => {
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: stub({ isPlant: 'yes' }),
    });

    await expect(
      ai.identify({ name: 'x', locale: 'en' }),
    ).rejects.toMatchObject({
      code: 'ai_unavailable',
      usage: { inputTokens: 1500, outputTokens: 300 },
    });
  });

  it('keeps the API error as the cause, for the logs', async () => {
    const failure = new Error(
      '400 output_config.format.schema: oneOf is not supported',
    );
    const ai = createAnthropicPlantAi({
      model: 'claude-haiku-5-5',
      create: vi.fn<CreateFn>(() => Promise.reject(failure)),
    });

    await expect(
      ai.identify({ name: 'x', locale: 'en' }),
    ).rejects.toMatchObject({
      cause: failure,
      usage: null,
    });
  });

  it('gives up on the API before the app does, and retries once', () => {
    expect(ANTHROPIC_CLIENT_OPTIONS).toEqual({
      timeout: 45_000,
      maxRetries: 1,
    });
  });
});
