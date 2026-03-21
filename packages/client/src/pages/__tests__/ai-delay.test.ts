import { describe, it, expect } from 'vitest';
import { calcAiDelay } from '../ai-delay';

describe('AI delay calculation', () => {
  it('clamps tier 1 (500ms base) to at least 1000ms', () => {
    for (let i = 0; i < 100; i++) {
      expect(calcAiDelay(500)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('clamps high values to at most 5000ms', () => {
    for (let i = 0; i < 100; i++) {
      expect(calcAiDelay(5000)).toBeLessThanOrEqual(5000);
    }
  });

  it('produces varied results', () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) results.add(calcAiDelay(2000));
    expect(results.size).toBeGreaterThan(5);
  });
});
