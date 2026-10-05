import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
import { GEAR_SLOTS } from '../src/types/gear.js';
import { firstEpicDive, legendaryFollowsEssence, pacingRun } from './fixtures/pacing.js';

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
/** The same Fire heroes rushing every floor: the bot makes for the exit (see the floor maps spec). */
const rushRuns: AutopilotDiveReport[][] = SEEDS.map(
  (seed) => runAutopilot(registry, { seed, dives: DIVES, policy: 'beeline' }).reports,
);

/** The same Fire runs' economy, dive by dive (the DPS Lab's Economy view reads the same). */
const paced = SEEDS.map((seed) => pacingRun(registry, seed, DIVES));
const economies = paced.map((r) => r.economy);

const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));
/** Each dive's floor time over its floors (a death's floor counts). */
const perFloor = (r: AutopilotDiveReport[]) =>
  r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1));

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

  // At least three seeds in four (the robust rails' form): an essence is a boss's roll, and on
  // furnished floors one seed may go 12 dives without one however deep it gets (seed 1 reaches
  // depth 52 without; over 16 seeds 15 own a legendary at dive 12).
  it('legendaries arrive, forged from essences, without completing the codex early', () => {
    const withLegendary = fireResults.filter(({ profile }) =>
      [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].some((i) => i?.rarity === 'legendary'),
    );
    expect(withLegendary.length).toBeGreaterThanOrEqual(3);
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

  // The room objects spec's bands (bigger, furnished rooms): a clear 40–75 s a floor, a rush 25–55 s.
  it('floors are a snackable length: a full clear takes longer than a rush to the exit', () => {
    const clear = avg(runs.flatMap(perFloor));
    const rush = avg(rushRuns.flatMap(perFloor));
    expect(clear).toBeGreaterThan(40);
    expect(clear).toBeLessThan(75);
    expect(rush).toBeGreaterThan(25);
    expect(rush).toBeLessThan(55);
    expect(clear).toBeGreaterThan(1.25 * rush);
  });

  it("rushing still progresses: a beeline reaches at least 80% of the full clear's depth by dive 12", () => {
    const rush = avg(rushRuns.map((r) => r[DIVES - 1].endDepth));
    expect(rush).toBeGreaterThanOrEqual(0.8 * endDepthAt(DIVES));
  });

  it('no floor runs out of time: every death is a death', () => {
    for (const r of [...runs, ...frostRuns, ...rushRuns])
      expect(r.map((d) => d.timedOut)).toEqual(r.map(() => 0));
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

  // Re-banded (06-bot-pacing.md): on the room objects' floors a seed's first epic spreads about
  // ±1.6 dives round a mean of 4.8 (16 seeds), so four seeds' mean is held to 5.5, each still by 6.
  it('a first epic (or a legendary) is forged by about dive 5', () => {
    const first = economies.map(firstEpicDive);
    for (const [i, dive] of first.entries()) {
      expect(dive, `seed ${SEEDS[i]}`).toBeGreaterThan(0);
      expect(dive, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
    expect(avg(first)).toBeLessThanOrEqual(5.5);
  });

  // The tutorial spec's target: no essence comes before drops.essenceMinDepth (20).
  it('the first legendary is forged within two Anvil visits of the first essence banking', () => {
    for (const e of economies) expect(legendaryFollowsEssence(e), `seed ${e.seed}`).toBe(true);
  });
});
