import { describe, expect, it } from 'vitest';
import { costUsd } from './cost';

describe('costUsd', () => {
  it('prices Haiku at US$0.10 in and US$0.50 out per million tokens', () => {
    expect(
      costUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.6);
    expect(costUsd({ inputTokens: 2_000, outputTokens: 400 })).toBeCloseTo(
      0.0004,
    );
  });
});
