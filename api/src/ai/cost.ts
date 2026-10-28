/** Claude Haiku 5.5 list prices, per million tokens. */
const INPUT_USD_PER_MTOK = 0.1;
const OUTPUT_USD_PER_MTOK = 0.5;

export type AiUsageTokens = { inputTokens: number; outputTokens: number };

export function costUsd(usage: AiUsageTokens): number {
  return (
    (usage.inputTokens * INPUT_USD_PER_MTOK +
      usage.outputTokens * OUTPUT_USD_PER_MTOK) /
    1_000_000
  );
}
