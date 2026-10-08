import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { openSkill, openSkillPrice } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { reattuneItem } from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  reforgeGear,
  upgradeGear,
  type ProfileActionResult,
} from '../src/delve/profile.js';
import { generateItem, scrapLevelFactor } from '../src/loot/item-generator.js';
import { withMaterial } from '../src/loot/materials.js';
import { heroChains, moveAllPreview, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, GearSlot, Rarity } from '../src/types/gear.js';
import { withUids } from './fixtures/arena.js';

// See the constructs spec §3.2: Open a skill (Awaken generalised) gives a skill at 0 slots its
// first slot, bought, holding a plain construct, for its rarity's price.

const registry = createDefaultRegistry();
const table = registry.getDelveBalance().movesets.openSkill;
const item = (uid: string, rarity: Rarity, slot: GearSlot = 'weapon', mana = 'frost' as const) =>
  generateItem(
    registry,
    { uid, ilvl: 8, rarity, slot, ...(slot === 'weapon' && { baseId: 'axe' }), mana },
    new SeededRNG(3).fork(uid),
  );
/** A Fire hero with a magic Frost axe in the bag (and a common one and a rare helm), and the price to spare. */
function smith(): DelveProfile {
  const p = createDelveProfile(registry, 5, { primary: 'fire' });
  const bag = [item('magic', 'magic'), item('common', 'common')];
  return withUids({
    ...p,
    bag: [...bag, item('helm', 'rare', 'helm')],
    materials: withMaterial(p.materials, { kind: 'flux', grade: 'magic' }, 2),
    links: 10,
    scrap: 1000,
  });
}
const ultimateOf = (w: GearItem) => movesetOf(registry, w).chains.ultimate;

describe('openSkillPrice', () => {
  it("is movesets.openSkill by rarity, its scrap × the item level's factor", () => {
    const magic = item('magic', 'magic');
    expect(openSkillPrice(registry, magic)).toEqual({
      flux: table.magic.flux,
      links: table.magic.links,
      scrap: Math.round(table.magic.scrap * scrapLevelFactor(registry, magic.ilvl)),
    });
    expect(openSkillPrice(registry, item('common', 'common')).flux).toEqual({ uncommon: 2 });
  });
});

describe('openSkill', () => {
  it("gives a magic axe its Ultimate: one bought slot holding a plain Nova in the pair's primary, for its price", () => {
    const p = smith();
    const res = openSkill(registry, p, 'magic', 'ultimate');
    expect(res.ok, res.reason).toBe(true);
    const w = res.item!;
    const before = movesetOf(registry, p.bag[0]);
    expect(ultimateOf(w)).toEqual({
      moves: [
        { uid: expect.stringMatching(/^c\d+$/), kind: 'medium', form: 'nova', elements: ['fire'] },
      ],
      payment: 'charge',
    });
    expect(w.moveset).toEqual({
      chains: { ...before.chains, ultimate: ultimateOf(w) },
      slots: { ...before.slots, ultimate: 1 },
      bought: { ...before.bought, ultimate: 1 },
    });
    const cost = openSkillPrice(registry, w);
    expect(res.profile).toMatchObject({ links: 10 - cost.links, scrap: 1000 - cost.scrap });
    expect(res.profile.materials.flux.magic).toBe(2 - (cost.flux.magic ?? 0));
    expect(res.profile.bag.find((i) => i.uid === 'magic')).toEqual(w);
    // Equipped, it fights with the Ultimate.
    const worn = equipItem(registry, res.profile, 'magic');
    expect(heroChains(registry, worn.equipped, worn.pair).ultimate).toEqual(ultimateOf(w));
  });

  it('refuses mid-dive, an unknown item, other gear, a skill with slots, a ceiling of 0, and unpaid', () => {
    const p = smith();
    const reason = (
      q: DelveProfile,
      uid = 'magic',
      skill: 'primary' | 'defensive' | 'ultimate' = 'ultimate',
    ) => openSkill(registry, q, uid, skill).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Forge at the Anvil, between dives');
    expect(reason(p, 'nope')).toBe('Item not found');
    expect(reason(p, 'helm')).toBe('Only a weapon opens a skill');
    expect(reason(p, 'magic', 'primary')).toBe('This skill is open already');
    expect(reason(p, 'magic', 'defensive')).toBe('This skill is open already');
    expect(reason(p, 'common')).toBe("A common weapon can't open its ultimate");
    const flux = { kind: 'flux', grade: 'magic' } as const;
    expect(reason({ ...p, materials: withMaterial(p.materials, flux, -2) })).toBe(
      'Not enough magic flux',
    );
    expect(reason({ ...p, links: table.magic.links - 1 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 0 })).toBe('Not enough scrap');
    expect(openSkill(registry, p, 'helm', 'ultimate').profile).toBe(p);
  });

  it('keeps its Ultimate through an upgrade, a reforge, a re-attune and a load', () => {
    const p = openSkill(registry, smith(), 'magic', 'ultimate').profile;
    const kept = (q: DelveProfile) => {
      const w = q.bag.find((i) => i.uid === 'magic')!;
      return [movesetOf(registry, w).bought.ultimate, ultimateOf(w)];
    };
    const done = (r: ProfileActionResult) => {
      expect(r.ok, r.reason).toBe(true);
      return r.profile;
    };
    const want = kept(p);
    expect(kept(done(upgradeGear(registry, p, 'magic')))).toEqual(want);
    expect(kept(done(reforgeGear(registry, p, 'magic', 0)))).toEqual(want);
    expect(kept(done(reattuneItem(registry, { ...p, manaDust: 999 }, 'magic', 'fire')))).toEqual(
      want,
    );
    const json = JSON.parse(JSON.stringify(p));
    expect(kept((parseDelveProfile(registry, json) as { profile: DelveProfile }).profile)).toEqual(
      want,
    );
  });

  it('Move all: the opened skill is a slot of the frame, its bought count staying with the weapon', () => {
    const opened = openSkill(registry, smith(), 'magic', 'ultimate').profile;
    const p = equipItem(registry, opened, 'magic');
    const worn = p.equipped.weapon!;
    // Onto a common axe (no Ultimate slot): the Nova goes to the bag; the magic axe keeps its
    // bought slot, refilled plain.
    const prev = moveAllPreview(registry, worn, p.bag.find((i) => i.uid === 'common')!);
    expect(prev.moveset.chains.ultimate).toBeUndefined();
    expect(prev.toBag.some((c) => 'form' in c && c.form === 'nova')).toBe(true);
    expect(prev.old.bought).toEqual({ ultimate: 1 });
    // Its bought slot stays, empty (the constructs spec §3.3: only the starts refill).
    expect(prev.old.slots.ultimate).toBe(1);
    expect(prev.old.chains.ultimate!.moves).toHaveLength(0);
  });
});
