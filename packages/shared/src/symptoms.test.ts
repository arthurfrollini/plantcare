import { describe, expect, it } from 'vitest';
import { findHarmfulAdvice } from './ai';
import { SYMPTOMS } from './symptoms';

describe('SYMPTOMS', () => {
  it('lists the nine symptoms in order', () => {
    expect(SYMPTOMS.map((s) => s.id)).toEqual([
      'yellow_leaves',
      'brown_tips',
      'spots',
      'holes',
      'wilting',
      'white_powder',
      'leaf_drop',
      'leggy',
      'tiny_bugs',
    ]);
  });

  it('has every text in English and Portuguese', () => {
    for (const symptom of SYMPTOMS) {
      expect(symptom.title.en).not.toBe('');
      expect(symptom.title['pt-BR']).not.toBe('');
      expect(symptom.causes.length).toBeGreaterThan(0);
      for (const cause of symptom.causes) {
        for (const text of [cause.title, cause.check, cause.do]) {
          expect(text.en.trim()).not.toBe('');
          expect(text['pt-BR'].trim()).not.toBe('');
        }
      }
    }
  });

  it('gives every cause a unique id', () => {
    const ids = SYMPTOMS.flatMap((s) => s.causes.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never recommends anything harmful', () => {
    for (const cause of SYMPTOMS.flatMap((s) => s.causes)) {
      for (const text of [cause.title, cause.check, cause.do]) {
        expect(findHarmfulAdvice(text.en)).toBeNull();
        expect(findHarmfulAdvice(text['pt-BR'])).toBeNull();
      }
    }
  });

  it('puts too much water first for yellow leaves, the most common cause', () => {
    const yellow = SYMPTOMS.find((s) => s.id === 'yellow_leaves');
    expect(yellow?.causes[0]?.id).toBe('too_much_water');
  });
});
