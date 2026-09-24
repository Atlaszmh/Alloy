import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';

/**
 * Guard rails for the Delve ARPG progression curve. The autopilot plays the
 * real-time arena with a simple bot; if a balance change breaks these, the
 * curve has drifted (first dive too easy/hard, progression stalls, loot or
 * reactions stop flowing). Tuned values live in balance.json → delve.
 */

const registry = createDefaultRegistry();
const SEEDS = [1, 2, 3, 4];
const DIVES = 12;

const runs: AutopilotDiveReport[][] = SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES }).reports);

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));

describe('Delve ARPG pacing (autopilot)', () => {
  it('first dive gets past the opening floors but stalls around the first boss', () => {
    for (const r of runs) expect(r[0].endDepth).toBeGreaterThanOrEqual(3);
    expect(endDepthAt(1)).toBeGreaterThanOrEqual(4);
    expect(endDepthAt(1)).toBeLessThanOrEqual(12);
  });

  it('keeps progressing dive over dive', () => {
    expect(endDepthAt(DIVES)).toBeGreaterThan(endDepthAt(1) + 5);
    expect(endDepthAt(DIVES)).toBeGreaterThan(endDepthAt(DIVES / 2));
  });

  it('legendaries arrive without completing the codex early', () => {
    const owned = avg(runs.map((r) => r[DIVES - 1].legendariesOwned));
    expect(owned).toBeGreaterThanOrEqual(1);
    expect(owned).toBeLessThan(registry.getDelveData().legendaries.length);
  });

  it('mana combos happen naturally: several reactions get discovered', () => {
    expect(avg(runs.map((r) => r[DIVES - 1].reactionsSeen))).toBeGreaterThanOrEqual(2);
  });

  it('floors are a snackable length', () => {
    const perFloor = runs.flatMap((r) =>
      r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1)),
    );
    expect(avg(perFloor)).toBeGreaterThan(8);
    expect(avg(perFloor)).toBeLessThan(60);
  });
});
