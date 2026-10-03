import { describe, it, expect } from 'vitest';
import { applyShrine } from '../src/arpg/interact.js';
import { stepWorld } from '../src/arpg/step.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { FloorMap } from '../src/types/floor-map.js';
import type { DataRegistry } from '../src/data/registry.js';
import { bal, registry, run, STEP } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// The floor flow across banks and replays (see the floor maps spec's S1–S3 and "Anvil alcove").

const shrine = (id: string) => registry.getDelveData().shrines.find((s) => s.id === id)!;
const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
/** A Fire hero at depth 1 with a ring in the bag and scrap: its stops and alcoves offer equip and upgrade. */
const diving = (reg: DataRegistry = registry): DelveProfile =>
  startDive(
    reg,
    {
      ...createDelveProfile(reg, 3, { primary: 'fire' }),
      bag: [ring],
      scrap: 1000,
      manaDust: 0,
      links: 0,
    },
    1,
  );

/**
 * The dive's floor on `map`, its foes gone, the hero beside room 1's
 * interactable; what the dive used starts used (as the generator marks it).
 */
function floorOf(p: DelveProfile, map: FloorMap, reg: DataRegistry = registry): ArpgWorld {
  const w = onMap(beginFloor(reg, p), map);
  w.monsters = [];
  Object.assign(w.hero, { x: 19, y: 7 });
  for (const r of map.rooms)
    if (r.interactable && p.dive!.used.includes(r.interactable.id)) r.interactable.used = true;
  return w;
}
const press = (w: ArpgWorld): ArpgEvent[] =>
  stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);

describe('a bank keeps what the floor used', () => {
  it('writes pending.used and pending.diveBuffs into the dive, with its potions', () => {
    const p = diving();
    const w = floorOf(p, twoRooms('sanctum', { kind: 'shrine', shrine: 'devotion' }, 1));
    w.pending.used.push('1:1');
    applyShrine(registry, w, shrine('devotion'));
    const once = bankWorld(registry, p, w).profile;
    const devotion = { shrine: 'devotion', effect: shrine('devotion').effect };
    expect([once.dive!.used, once.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
    expect([w.pending.used, w.pending.diveBuffs]).toEqual([[], []]);
    const twice = bankWorld(registry, once, w).profile;
    expect([twice.dive!.used, twice.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
  });
});

describe('a replayed floor (S1)', () => {
  it('finds its vault open', () => {
    const p = diving();
    const map = () => twoRooms('vault', { kind: 'chest' }, 1);
    const w = floorOf(p, map());
    expect(press(w).some((e) => e.kind === 'drop')).toBe(true);
    const banked = bankWorld(registry, p, w).profile;
    const again = floorOf(banked, map());
    expect(again.map.rooms[1].interactable!.used).toBe(true);
    expect(press(again).some((e) => e.kind === 'interactPrompt' || e.kind === 'drop')).toBe(false);
  });

  it('finds a shrine spent after its refill banked, the flasks still full', () => {
    const p = diving();
    const map = () => twoRooms('sanctum', { kind: 'shrine', shrine: 'mercy' }, 1);
    const w = floorOf(p, map());
    w.hero.potions = 0;
    press(w);
    run(w, bal.ai.shrineChannel + 0.1);
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    const banked = bankWorld(registry, p, w).profile;
    expect([banked.dive!.potions, banked.dive!.used]).toEqual([bal.dive.maxPotions, ['1:1']]);
    const again = floorOf(banked, map());
    expect([again.hero.potions, again.map.rooms[1].interactable!.used]).toEqual([
      bal.dive.maxPotions,
      true,
    ]);
  });

  it('keeps a dive blessing on the hero from the next world on', () => {
    const p = diving();
    const w = floorOf(p, twoRooms('sanctum', { kind: 'shrine', shrine: 'devotion' }, 1));
    press(w);
    run(w, bal.ai.shrineChannel + 0.1);
    const banked = bankWorld(registry, p, w).profile;
    const again = beginFloor(registry, banked);
    expect(again.hero.diveBuffs.map((b) => b.shrine)).toEqual(['devotion']);
    expect(again.hero.stats.damageMult).toBeCloseTo(
      profileStats(registry, banked).damageMult * 1.1,
      9,
    );
  });
});
