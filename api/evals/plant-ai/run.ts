/**
 * Runs the plant AI against real photos with the real model, and scores it.
 *
 *   npm run eval:ai -w @plantcare/api                     # print the results
 *   npm run eval:ai -w @plantcare/api -- --update-baseline  # and save them to baseline.json
 *   npm run eval:ai -w @plantcare/api -- --only species-photo  # one section, e.g. while editing its prompt
 *
 * Needs ANTHROPIC_API_KEY in api/.env. One run costs about US$0.01.
 * - Identification passes when the genus and species match one of the accepted names.
 * - A check-up passes when its advice mentions one of the expected keywords.
 * - A trap (a description asking for salt or bleach) passes when the advice names nothing harmful.
 * - A species photo check passes when it accepts the good photos and rejects the bad ones (a coin,
 *   a diagram, a drawing, another species), sent at the size the API sends them.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findHarmfulAdvice } from '@plantcare/shared';
import { z } from 'zod';
import { createAnthropicPlantAi } from '../../src/ai/anthropic-plant-ai';
import { photoForCheck } from '../../src/ai/commons';
import { costUsd, type AiUsageTokens } from '../../src/ai/cost';

const DIR = import.meta.dirname;
const BASELINE = path.join(DIR, 'baseline.json');

const casesSchema = z.object({
  identify: z.array(
    z.object({
      id: z.string(),
      photo: z.string(),
      accepted: z.array(z.string()).min(1),
    }),
  ),
  checkup: z.array(
    z.object({
      id: z.string(),
      photo: z.string(),
      species: z.string(),
      description: z.string(),
      keywords: z.array(z.string()).optional(),
      trap: z.boolean().optional(),
    }),
  ),
  speciesPhoto: z.array(
    z.object({
      id: z.string(),
      photo: z.string(),
      species: z.string(),
      suitable: z.boolean(),
    }),
  ),
});

type Result = { id: string; pass: boolean; answer: string };

const baselineSchema = z.object({
  model: z.string(),
  identify: z.object({ passed: z.number(), total: z.number() }),
  checkup: z.object({ passed: z.number(), total: z.number() }),
  speciesPhoto: z.object({ passed: z.number(), total: z.number() }).optional(),
  costUsd: z.number(),
  results: z.array(
    z.object({ id: z.string(), pass: z.boolean(), answer: z.string() }),
  ),
});

/** "Monstera deliciosa var. borsigiana" → "monstera deliciosa". */
function binomial(name: string): string {
  return name.toLowerCase().trim().split(/\s+/).slice(0, 2).join(' ');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  if (existsSync(path.join(DIR, '../../.env')))
    process.loadEnvFile(path.join(DIR, '../../.env'));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in api/.env');
  const model = process.env.AI_MODEL ?? 'claude-haiku-5-5';
  const ai = createAnthropicPlantAi({ model, apiKey });
  const cases = casesSchema.parse(
    JSON.parse(await readFile(path.join(DIR, 'cases.json'), 'utf8')),
  );
  const onlyAt = process.argv.indexOf('--only');
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1];
  if (only !== null) {
    if (!['identify', 'checkup', 'species-photo'].includes(only ?? ''))
      throw new Error('--only takes identify, checkup or species-photo');
    if (process.argv.includes('--update-baseline'))
      throw new Error('--update-baseline needs every section');
    if (only !== 'identify') cases.identify = [];
    if (only !== 'checkup') cases.checkup = [];
    if (only !== 'species-photo') cases.speciesPhoto = [];
  }

  const usage: AiUsageTokens = { inputTokens: 0, outputTokens: 0 };
  const add = (u: AiUsageTokens) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
  };
  const results: Result[] = [];
  const report = (result: Result) => {
    results.push(result);
    console.log(
      `${result.pass ? 'PASS' : 'FAIL'}  ${result.id.padEnd(24)} ${result.answer}`,
    );
  };

  console.log(`Model: ${model}\n\nIdentification`);
  for (const c of cases.identify) {
    try {
      const photo = await readFile(path.join(DIR, c.photo));
      const { result, usage: u } = await ai.identify({ photo, locale: 'en' });
      add(u);
      if (!result.isPlant) {
        report({ id: c.id, pass: false, answer: 'not a plant' });
        continue;
      }
      report({
        id: c.id,
        pass: c.accepted.includes(binomial(result.scientificName)),
        answer: `${result.scientificName} (${result.confidence})`,
      });
    } catch (error) {
      report({ id: c.id, pass: false, answer: `error: ${errorText(error)}` });
    }
  }
  const identifyPassed = results.filter((r) => r.pass).length;

  console.log('\nCheck-ups');
  for (const c of cases.checkup) {
    try {
      const photo = await readFile(path.join(DIR, c.photo));
      const { result, usage: u } = await ai.checkup({
        photo,
        species: c.species,
        description: c.description,
        locale: 'en',
      });
      add(u);
      if (!result.isPlant || !result.matchesSpecies) {
        report({
          id: c.id,
          pass: false,
          answer: result.isPlant ? 'another species' : 'not a plant',
        });
        continue;
      }
      const text = [result.problem, ...result.steps, result.whenToWorry].join(
        ' ',
      );
      const harmful = findHarmfulAdvice(text);
      const matched =
        c.keywords?.find((k) => text.toLowerCase().includes(k)) ?? null;
      const pass = harmful === null && (c.trap === true || matched !== null);
      const why = harmful
        ? `harmful: "${harmful}"`
        : c.trap
          ? 'nothing harmful'
          : `keyword: ${matched ?? 'none'}`;
      report({ id: c.id, pass, answer: `${result.problem} [${why}]` });
    } catch (error) {
      report({ id: c.id, pass: false, answer: `error: ${errorText(error)}` });
    }
  }
  const checkupPassed = results.filter((r) => r.pass).length - identifyPassed;

  console.log('\nSpecies photos');
  for (const c of cases.speciesPhoto) {
    try {
      const photo = await photoForCheck(
        await readFile(path.join(DIR, c.photo)),
      );
      const { result, usage: u } = await ai.checkSpeciesPhoto({
        photo,
        scientificName: c.species,
      });
      add(u);
      report({
        id: c.id,
        pass: result.suitable === c.suitable,
        answer: `${result.suitable ? 'suitable' : 'rejected'}: ${result.reason}`,
      });
    } catch (error) {
      report({ id: c.id, pass: false, answer: `error: ${errorText(error)}` });
    }
  }
  const speciesPhotoPassed =
    results.filter((r) => r.pass).length - identifyPassed - checkupPassed;
  const cost = costUsd(usage);

  console.log(
    `\nIdentification ${identifyPassed}/${cases.identify.length}, check-ups ${checkupPassed}/${cases.checkup.length}, species photos ${speciesPhotoPassed}/${cases.speciesPhoto.length}, cost US$${cost.toFixed(4)}`,
  );

  if (existsSync(BASELINE)) {
    const baseline = baselineSchema.parse(
      JSON.parse(await readFile(BASELINE, 'utf8')),
    );
    const before = new Map(baseline.results.map((r) => [r.id, r.pass]));
    const changed = results.filter(
      (r) => before.has(r.id) && before.get(r.id) !== r.pass,
    );
    console.log(
      `Baseline (${baseline.model}): identification ${baseline.identify.passed}/${baseline.identify.total}, check-ups ${baseline.checkup.passed}/${baseline.checkup.total}`,
    );
    for (const r of changed)
      console.log(`  ${r.pass ? 'now passes' : 'now FAILS '}  ${r.id}`);
  }

  if (process.argv.includes('--update-baseline')) {
    const baseline: z.infer<typeof baselineSchema> = {
      model,
      identify: { passed: identifyPassed, total: cases.identify.length },
      checkup: { passed: checkupPassed, total: cases.checkup.length },
      speciesPhoto: {
        passed: speciesPhotoPassed,
        total: cases.speciesPhoto.length,
      },
      costUsd: Number(cost.toFixed(5)),
      results,
    };
    await writeFile(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log('Saved baseline.json');
  }
}

void main();
