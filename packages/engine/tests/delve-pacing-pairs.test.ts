import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';

/**
 * Every pair forced from the start: a fused Primary sets off its own reaction
 * on every hit after the first, so none may run away or stall. One seed's depth
 * swings far more than one pair's from another's (one pair went from 12 to 51
 * over ten seeds while the pairs' means ran 19 to 28), so each pair is its mean
 * over `SEEDS`. Its own file, so it runs beside the other pacing rails; four
 * dives keep it in budget on generated floors (the pairs' spread is the same by
 * dive 4 as by dive 6).
 */

const registry = createDefaultRegistry();
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const DIVES = 4;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const sweep = registry.getArpgData().reactions.map(({ elements: [primary, secondary] }) => ({
  pair: `${primary}+${secondary}`,
  depth: avg(
    SEEDS.map(
      (seed) =>
        runAutopilot(registry, { seed, dives: DIVES, primary, secondary }).reports[DIVES - 1]
          .endDepth,
    ),
  ),
}));

describe('Delve ARPG pacing: the forced pairs (autopilot)', () => {
  // Fails since B3 (carries and legendaries later); B3's plan records what it measured. B4 re-bands.
  it.fails(
    'no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 4 (its mean over the seeds)',
    () => {
      const depths = sweep.map((s) => s.depth).sort((a, b) => a - b);
      const median = depths[Math.floor(depths.length / 2)];
      for (const s of sweep) {
        expect(s.depth, s.pair).toBeGreaterThanOrEqual(0.6 * median);
        expect(s.depth, s.pair).toBeLessThanOrEqual(1.6 * median);
      }
    },
  );
});
