import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
import { GEAR_SLOTS } from '../src/types/gear.js';
import { essenceForgedAtOnce, firstEpicDive, pacingRun } from './fixtures/pacing.js';

/**
 * Guard rails for the Delve ARPG progression curve. The autopilot plays the
 * real-time arena with a simple bot; if a balance change breaks these, the
 * curve has drifted (first dive too easy/hard, progression stalls, loot or
 * reactions stop flowing). Tuned values live in balance.json → delve.
 */

const registry = createDefaultRegistry();
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const SEEDS = [1, 2, 3, 4];
const DIVES = 12;

const fireResults = SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES }));
const runs: AutopilotDiveReport[][] = fireResults.map((r) => r.reports);
/** A Frost hero (the starter gear re-attuned to frost) must still get deeper dive over dive. */
const FROST_SEEDS = [1, 2];
const frostResults = FROST_SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES, primary: 'frost' }));
const frostRuns: AutopilotDiveReport[][] = frostResults.map((r) => r.reports);

/**
 * Every pair forced from the start (one seed each): a fused Primary sets off
 * its own reaction on every hit after the first, so none may run away or stall.
 */
const SWEEP_DIVES = 6;
const sweep = registry.getArpgData().reactions.map(({ elements: [primary, secondary] }) => ({
  pair: `${primary}+${secondary}`,
  depth: runAutopilot(registry, { seed: 1, dives: SWEEP_DIVES, primary, secondary }).reports[SWEEP_DIVES - 1].endDepth,
}));

/** The same Fire runs' economy, dive by dive (the DPS Lab's Economy view reads the same). */
const paced = SEEDS.map((seed) => pacingRun(registry, seed, DIVES));
const economies = paced.map((r) => r.economy);

const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));

describe('Delve ARPG pacing (autopilot)', () => {
  it('first dive is a short scouting run: every seed clears the opening floors', () => {
    for (const r of runs) expect(r[0].endDepth).toBeGreaterThanOrEqual(3);
    // A short scouting run: gear is locked mid-dive (see the weapon movesets spec).
    expect(endDepthAt(1)).toBeGreaterThanOrEqual(3);
    expect(endDepthAt(1)).toBeLessThanOrEqual(12);
  });

  it('keeps progressing dive over dive', () => {
    expect(endDepthAt(DIVES)).toBeGreaterThan(endDepthAt(1) + 5);
    expect(endDepthAt(DIVES)).toBeGreaterThan(endDepthAt(DIVES / 2));
  });

  it('a Frost primary progresses too', () => {
    const end = (dive: number) => avg(frostRuns.map((r) => r[dive - 1].endDepth));
    expect(end(DIVES)).toBeGreaterThanOrEqual(end(1) + 5);
  });

  it('legendaries arrive, forged from essences, without completing the codex early', () => {
    for (const { profile } of fireResults) {
      const gear = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag];
      expect(gear.some((i) => i?.rarity === 'legendary')).toBe(true);
    }
    const owned = avg(runs.map((r) => r[DIVES - 1].legendariesOwned));
    expect(owned).toBeGreaterThanOrEqual(1);
    expect(owned).toBeLessThan(registry.getDelveData().legendaries.length);
  });

  it("mana combos happen naturally: every run, Fire and Frost, discovers its own pair's reaction by dive 12", () => {
    for (const { profile } of [...fireResults, ...frostResults]) {
      const { primary, secondary } = profile.pair;
      expect(secondary).not.toBeNull();
      expect(profile.reactionsSeen).toContain(registry.getReactionFor(primary!, secondary!).id);
    }
  });

  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
    const depths = sweep.map((s) => s.depth).sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)];
    for (const s of sweep) {
      expect(s.depth, s.pair).toBeGreaterThanOrEqual(0.6 * median);
      expect(s.depth, s.pair).toBeLessThanOrEqual(1.6 * median);
    }
  });

  it('floors are a snackable length', () => {
    const perFloor = runs.flatMap((r) =>
      r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1)),
    );
    expect(avg(perFloor)).toBeGreaterThan(8);
    expect(avg(perFloor)).toBeLessThan(60);
  });
});

/**
 * The crafting spec's pacing targets, on the Fire runs' economy (`economySim`). The fourth,
 * "over 12 dives, depth progression at least matches today's rails", is the rails above.
 */
describe('Delve crafting pacing targets (economySim)', () => {
  it("before dive 1 the kit forges; after it, dive 1's own income (with what the kit left) pays for a magic item, and the Anvil forges one", () => {
    for (const [i, { first }] of paced.entries())
      expect(first, `seed ${SEEDS[i]}`).toEqual({ opened: true, kitAlone: false, withDive1: true, forged: true });
  });

  it('a first epic (or a legendary) is forged by about dive 5', () => {
    const first = economies.map(firstEpicDive);
    for (const [i, dive] of first.entries()) {
      expect(dive, `seed ${SEEDS[i]}`).toBeGreaterThan(0);
      expect(dive, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
    expect(avg(first)).toBeLessThanOrEqual(5);
  });

  it("the first boss's essence becomes a forged legendary on the Anvil visit after its dive", () => {
    for (const e of economies) expect(essenceForgedAtOnce(e), `seed ${e.seed}`).toBe(true);
  });
});
