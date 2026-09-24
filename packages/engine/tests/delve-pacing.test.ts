import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';

/**
 * Guard rails for the Delve progression curve. The autopilot plays like a
 * sensible player; if a balance change breaks these, the curve has drifted
 * (first dive too easy/hard, progression stalls, legendaries flood in).
 * Tuned values live in balance.json → delve.
 */

const registry = createDefaultRegistry();
const SEEDS = [1, 2, 3, 4, 5, 6];
const DIVES = 20;

const runs: AutopilotDiveReport[][] = SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES }).reports);

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));

describe('Delve pacing (autopilot)', () => {
  it('first dive gets past the opening depths but not absurdly deep', () => {
    for (const r of runs) expect(r[0].endDepth).toBeGreaterThanOrEqual(3);
    expect(endDepthAt(1)).toBeGreaterThanOrEqual(4);
    expect(endDepthAt(1)).toBeLessThanOrEqual(16);
  });

  it('the first boss is a real gate for fresh heroes', () => {
    const stoppedEarly = runs.filter((r) => r[0].endDepth <= 5).length;
    expect(stoppedEarly).toBeGreaterThanOrEqual(1);
  });

  it('keeps progressing over many dives with no early wall', () => {
    expect(endDepthAt(10)).toBeGreaterThan(endDepthAt(1) + 8);
    expect(endDepthAt(20)).toBeGreaterThan(endDepthAt(10));
  });

  it('legendaries arrive steadily without completing the codex early', () => {
    const owned = avg(runs.map((r) => r[DIVES - 1].legendariesOwned));
    expect(owned).toBeGreaterThanOrEqual(3);
    expect(owned).toBeLessThan(registry.getDelveData().legendaries.length);
  });

  it('dives stay snackable', () => {
    const seconds = avg(runs.flatMap((r) => r.slice(0, 10).map((d) => d.fightSeconds)));
    expect(seconds).toBeLessThan(300);
  });
});
