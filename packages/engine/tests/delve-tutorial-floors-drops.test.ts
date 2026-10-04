import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { baseSlots } from '../src/loot/moveset.js';
import { runeFits } from '../src/loot/runes.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { TutorialFloorDef } from '../src/types/tutorial-floor.js';
import { STEP } from './fixtures/arena.js';
import { builtWorld, TEST_FLOOR, withFloors } from './fixtures/tutorial-floors.js';

// See the tutorial spec's "Set drops": a hand-built floor's foes, boss and chest drop what its
// data names (gear in the pair's element on the fork `tutorial:<dropId>`, a rune that fits the
// Primary's first move, counts of the rest), and nothing at random but materials.

const FLOOR: TutorialFloorDef = {
  ...TEST_FLOOR,
  id: 't-2',
  drops: [
    {
      id: 'blade',
      on: 'spawn:champ',
      drop: {
        kind: 'gear',
        base: 'sword',
        rarity: 'uncommon',
        element: 'primary',
        slots: { primary: 2 },
      },
    },
    {
      id: 'ore',
      on: 'spawn:champ',
      drop: { kind: 'material', material: { kind: 'metal', metal: 'rusty' }, count: 2 },
    },
    { id: 'charm', on: 'spawn:brute', drop: { kind: 'rune', rune: 'fitsPrimary', tier: 2 } },
    {
      id: 'crown',
      on: 'boss',
      drop: { kind: 'gear', base: 'sword', rarity: 'rare', element: 'secondary', sockets: 2 },
    },
    { id: 'dust', on: 'chest', drop: { kind: 'material', material: { kind: 'dust' }, count: 15 } },
    { id: 'coin', on: 'chest', drop: { kind: 'scrap', count: 40 } },
  ],
};
const registry = withFloors(FLOOR);

/** Foe `spawnId` of `w` killed; the events. */
function kill(w: ArpgWorld, spawnId: string): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  killMonster(makeCtx(registry, w, events), w.monsters.find((m) => m.spawnId === spawnId)!);
  return events;
}
/** The world's drops of what only set drops give on a hand-built floor: gear, runes, patterns. */
const set = (w: ArpgWorld) =>
  w.drops.filter((d) => d.kind === 'item' || d.kind === 'rune' || d.kind === 'pattern');

describe("a hand-built floor's set drops", () => {
  it("a foe's death drops its gear, in the pair's primary at the data's slots, in its room", () => {
    const w = builtWorld(registry, 't-2');
    kill(w, 'champ');
    expect(set(w).length).toBe(1);
    const [blade] = set(w);
    expect(blade.item).toMatchObject({
      uid: 'g100',
      baseId: 'sword',
      rarity: 'uncommon',
      mana: 'fire',
      ilvl: 3,
    });
    const { chains, slots } = blade.item!.moveset!;
    expect(slots).toEqual({ basic: baseSlots(registry, 'sword', 'basic'), primary: 2 });
    expect(chains.primary!.moves.map((m) => [m.form, m.elements, m.runes])).toEqual([
      ['bolt', ['fire'], undefined],
      ['bolt', ['fire'], undefined],
    ]);
    expect([blade.roomId, w.loot.nextUid, w.loot.dropsGiven]).toEqual([1, 101, [1]]);
    const ore = w.drops.filter((d) => d.material?.kind === 'metal' && d.amount === 2);
    expect(ore.map((d) => d.material)).toEqual([{ kind: 'metal', metal: 'rusty' }]);
  });

  it('the same whatever the fight did before it, and its gear once a dive', () => {
    const a = builtWorld(registry, 't-2');
    kill(a, 'champ');
    const b = builtWorld(registry, 't-2');
    for (const rng of [b.rng, b.lootRng, b.materialRng, b.runeRng]) rng.next();
    kill(b, 'grask');
    kill(b, 'champ');
    const blade = set(b).find((d) => d.item?.rarity === 'uncommon')!;
    expect([blade.x, blade.y, blade.item!.affixes]).toEqual([
      set(a)[0].x,
      set(a)[0].y,
      set(a)[0].item!.affixes,
    ]);
    const c = builtWorld(registry, 't-2');
    c.loot.dropsGiven.push(c.monsters.find((m) => m.spawnId === 'champ')!.id);
    kill(c, 'champ');
    expect(set(c)).toEqual([]);
    expect(c.drops.some((d) => d.material?.kind === 'metal' && d.amount === 2)).toBe(true);
  });

  it("a rune fits the hero's Primary's first move as it is, at the data's tier", () => {
    const fits = (w: ArpgWorld, form: 'bolt' | 'strike') => {
      kill(w, 'brute');
      const [charm] = set(w);
      return [charm.rune!.tier, runeFits(registry.getRune(charm.rune!.id), { form })];
    };
    expect(fits(builtWorld(registry, 't-2'), 'bolt')).toEqual([2, true]);
    const strike = {
      kind: 'medium' as const,
      form: 'strike' as const,
      elements: ['fire' as const],
    };
    const chains = { primary: { moves: [strike], payment: 'mana' as const } };
    expect(fits(builtWorld(registry, 't-2', { chains }), 'strike')).toEqual([2, true]);
  });

  it("the boss drops its gear in the pair's secondary with its sockets open, and nothing at random", () => {
    const w = builtWorld(registry, 't-2');
    const events = kill(w, 'grask');
    expect(set(w).map((d) => [d.item?.rarity, d.item?.mana])).toEqual([['rare', 'frost']]);
    const { chains } = set(w)[0].item!.moveset!;
    expect([chains.primary!.moves[0].runes, chains.basic![0].runes]).toEqual([[null], [null]]);
    expect(events.filter((e) => e.kind === 'drop' && e.dropKind === 'item').length).toBe(1);
  });

  it("the chest bursts its set drops in place of a vault's", () => {
    const w = builtWorld(registry, 't-2');
    Object.assign(w.hero, { x: 8.5, y: 3.6 });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
    expect(w.drops.map((d) => [d.kind, d.material, d.amount, d.roomId])).toEqual([
      ['material', { kind: 'dust' }, 15, undefined],
      ['scrap', undefined, 40, undefined],
    ]);
  });

  it('a skipped tutorial leaves the floor its set drops', () => {
    const w = builtWorld(registry, 't-2');
    w.tutorial = null;
    kill(w, 'champ');
    expect(set(w).map((d) => d.item?.rarity)).toEqual(['uncommon']);
  });
});
