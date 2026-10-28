import { z } from 'zod';
import {
  catalogPlantSchema,
  difficultySchema,
  frequencySchema,
  lightSchema,
} from './schemas';

const localizedSchema = z.object({
  en: z.string().min(1),
  'pt-BR': z.string().min(1),
});

/** What the model returns when asked to identify a plant. */
export const identificationSchema = z.object({
  isPlant: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  scientificName: z.string(),
  names: localizedSchema,
  about: localizedSchema,
  waterTips: localizedSchema,
  light: lightSchema,
  difficulty: difficultySchema,
  frequency: frequencySchema,
});
export type Identification = z.infer<typeof identificationSchema>;

/** What the model returns for a sick-plant check-up. */
export const checkupAdviceSchema = z.object({
  isPlant: z.boolean(),
  matchesSpecies: z.boolean(),
  problem: z.string(),
  steps: z.array(z.string().min(1)).min(1).max(5),
  whenToWorry: z.string(),
});
export type CheckupAdvice = z.infer<typeof checkupAdviceSchema>;

export const identifyResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), plant: catalogPlantSchema }),
  z.object({
    kind: z.literal('proposal'),
    proposalId: z.string(),
    proposal: identificationSchema,
  }),
  z.object({
    kind: z.literal('none'),
    reason: z.enum(['not_a_plant', 'unsure']),
  }),
]);
export type IdentifyResponse = z.infer<typeof identifyResponseSchema>;

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

export const aiStatusSchema = z.object({
  enabled: z.boolean(),
  identifyLeft: z.number().int().min(0),
  checkupLeft: z.number().int().min(0),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

/**
 * Substances and practices that hurt plants or people, in English and Portuguese. Advice that names
 * any of them never reaches the screen.
 */
const HARMFUL_TERMS = [
  'salt',
  'bleach',
  'vinegar',
  'sugar',
  'alcohol',
  'motor oil',
  'kerosene',
  'gasoline',
  'insecticide',
  'pesticide',
  'herbicide',
  'sal',
  'água sanitária',
  'vinagre',
  'açúcar',
  'álcool',
  'óleo de motor',
  'querosene',
  'gasolina',
  'inseticida',
  'pesticida',
  'herbicida',
  'agrotóxico',
];

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

const MATCHERS = HARMFUL_TERMS.map((term) => ({
  term,
  // Whole words only, so "salty" or "salve" don't count as "salt" or "sal".
  pattern: new RegExp(`(?<![\\p{L}])${fold(term)}(?![\\p{L}])`, 'u'),
}));

/** The first harmful term the text mentions, or null. Case and accents don't matter. */
export function findHarmfulAdvice(text: string): string | null {
  const folded = fold(text);
  return MATCHERS.find(({ pattern }) => pattern.test(folded))?.term ?? null;
}
