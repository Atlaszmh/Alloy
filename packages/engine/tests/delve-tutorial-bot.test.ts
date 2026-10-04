import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { tutorialExitHeld } from '../src/arpg/tutorial.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { skipTutorial, startTutorial } from '../src/delve/tutorial.js';
import { movesetOf } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import { GEAR_SLOTS } from '../src/types/gear.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';

// See the tutorial spec's "The bot" and "Testing": the bot plays a new save's guided start end to
// end, and the runner's script meets the hand-built floors where they join.

const registry = createDefaultRegistry();
const data = registry.getTutorialData();
const STEP = registry.getDelveBalance().arena.step;

/** Every primary with Hesta's partner, and four other pairs (two of them Earth's). */
const PAIRS: [ManaType, ManaType][] = [
  ...MANA_TYPES.map((m): [ManaType, ManaType] => [m, data.partners[m]]),
  ['fire', 'storm'],
  ['frost', 'earth'],
  ['earth', 'nature'],
  ['shadow', 'storm'],
];
const SEEDS = [1, 2, 3, 4];
/** Each floor at its own depth: the dive's depth names it (`tutorialFloorOf`). */
const FLOORS = data.floors.map((f) => `${f.id}@${f.depth}`);
/** Each stop step's power-ups, a stop's first step (one a floor). */
const STOP_KINDS = data.floors.map(
  (f) => data.steps.find((s) => s.where === 'stop' && s.floor === f.id)!.stop!.kinds,
);
/** The steps that offer "Skip this step" after misses. */
const SKIPPABLE = data.steps.filter((s) => s.skipAfter !== undefined).map((s) => s.id);

describe.each(PAIRS)('the bot plays the guided start, %s with %s', (primary, secondary) => {
  it.each(SEEDS)(
    'seed %i: both dives and both lessons, the rare worn with the moveset, the pair bound, no essence',
    (seed) => {
      const opts = { seed, dives: 2, primary, secondary, tutorial: true };
      const { profile: p, reports, tutorial: run } = runAutopilot(registry, opts);
      // Done by completion: no tutorial skipped, no death, every floor once at its depth.
      expect(p.tutorial).toBeNull();
      expect(run).toMatchObject({ floors: FLOORS, retries: 0, skipped: null });
      expect(run!.skippedSteps.filter((s) => !SKIPPABLE.includes(s))).toEqual([]);
      expect(reports.map((d) => [d.result, d.timedOut])).toEqual([
        ['extracted', 0],
        ['extracted', 0],
      ]);
      // Every guided stop offered a power-up where its step names one the hero could take.
      expect(run!.stops.map((o) => o.length > 0)).toEqual(STOP_KINDS.map((k) => k.length > 0));
      // Grask's rare (one Primary slot as it drops), worn, holding the moveset the lessons built:
      // three moves or more (a stop may add one), the rune in the first.
      const weapon = p.equipped.weapon!;
      expect([weapon.rarity, weapon.mana]).toEqual(['rare', primary]);
      const moves = movesetOf(registry, weapon).chains.primary!.moves;
      expect([moves.length >= 3, socketsOf(moves[0])[0] !== null]).toEqual([true, true]);
      expect(p.pair).toEqual({ primary, secondary });
      const items = [...GEAR_SLOTS.flatMap((s) => p.equipped[s] ?? []), ...p.bag];
      expect(items.some((i) => i.rarity === 'legendary')).toBe(false);
      expect([Object.values(p.materials.essences).filter((n) => n > 0), p.essencesSeen]).toEqual([
        [],
        [],
      ]);
    },
  );
});

describe('where the script meets the floors', () => {
  it('a skip mid-floor lets go of the held door and the gates, and the floor stays hand-built', () => {
    const start = startDive(
      registry,
      startTutorial(registry, createDelveProfile(registry, 7, { primary: 'fire' })),
      1,
    );
    const p = {
      ...start,
      tutorial: { step: 'd1-cast', count: 0, misses: 0 },
      dive: { ...start.dive!, depth: 2 },
    };
    const w = beginFloor(registry, p);
    stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect([w.tutorialFloor, w.map.doors[0].held]).toEqual(['d1-2', true]);
    skipTutorial(p, w);
    expect([w.tutorial, w.tutorialFloor, w.map.doors[0].held, tutorialExitHeld(w)]).toEqual([
      null,
      'd1-2',
      false,
      false,
    ]);
  });

  it("the perfect dodge has a way out, and no guided stop's door makes the foes tougher", () => {
    for (const s of data.steps.filter((x) => x.trigger.type === 'perfectDodge'))
      expect(s.skipAfter, s.id).toBeGreaterThan(0);
    for (const id of new Set(data.steps.flatMap((s) => s.stop?.doors ?? []))) {
      const { mods } = registry.getDoor(id);
      expect([(mods.monsterHp ?? 0) > 0, (mods.monsterDmg ?? 0) > 0], id).toEqual([false, false]);
    }
  });
});
