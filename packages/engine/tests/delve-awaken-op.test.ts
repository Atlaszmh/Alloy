import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { awaken, awakenPrice } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { transferMoveset } from '../src/delve/moveset.js';
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
import { defaultChain, heroChains, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, GearSlot, Rarity } from '../src/types/gear.js';

// See the tutorial spec's Awaken: a rare weapon gains the Ultimate, once, for a price.

const registry = createDefaultRegistry();
const price = registry.getDelveBalance().crafting.awaken;
const item = (uid: string, rarity: Rarity, slot: GearSlot = 'weapon', mana = 'frost' as const) =>
  generateItem(
    registry,
    { uid, ilvl: 8, rarity, slot, ...(slot === 'weapon' && { baseId: 'axe' }), mana },
    new SeededRNG(3).fork(uid),
  );
/** A Fire hero with a rare Frost axe in the bag (and an epic, a magic one and a rare helm), and the price to spare. */
function smith(): DelveProfile {
  const p = createDelveProfile(registry, 5, { primary: 'fire' });
  const bag = [item('rare', 'rare'), item('epic', 'epic'), item('magic', 'magic')];
  return {
    ...p,
    bag: [...bag, item('helm', 'rare', 'helm')],
    materials: withMaterial(p.materials, { kind: 'flux', grade: 'epic' }, 2),
    links: 10,
    scrap: 1000,
  };
}
const ultimateOf = (w: GearItem) => movesetOf(registry, w).chains.ultimate;

describe('awakenPrice', () => {
  it("is crafting.awaken, its scrap × the item level's factor", () => {
    const rare = item('rare', 'rare');
    expect(awakenPrice(registry, rare)).toEqual({
      epicFlux: price.epicFlux,
      links: price.links,
      scrap: Math.round(price.scrap * scrapLevelFactor(registry, rare.ilvl)),
    });
  });
});

describe('awaken', () => {
  it("gives a rare weapon the Ultimate's base chain in the pair's primary, for its price", () => {
    const p = smith();
    const res = awaken(registry, p, 'rare');
    expect(res.ok).toBe(true);
    const w = res.item!;
    expect(w.awakened).toBe(true);
    expect(ultimateOf(w)).toEqual(defaultChain(registry, 'ultimate', 'axe', 'fire', 1));
    // Its other chains as they were.
    const before = movesetOf(registry, p.bag[0]);
    expect(w.moveset).toEqual({
      chains: { ...before.chains, ultimate: ultimateOf(w) },
      slots: { ...before.slots, ultimate: 1 },
    });
    const cost = awakenPrice(registry, w);
    expect(res.profile).toMatchObject({ links: 10 - cost.links, scrap: 1000 - cost.scrap });
    expect(res.profile.materials.flux.epic).toBe(2 - cost.epicFlux);
    expect(res.profile.bag.find((i) => i.uid === 'rare')).toEqual(w);
    // Equipped, it fights with the Ultimate.
    const worn = equipItem(registry, res.profile, 'rare');
    expect(heroChains(registry, worn.equipped, worn.pair).ultimate).toEqual(ultimateOf(w));
  });

  it('refuses mid-dive, an unknown item, anything but a rare weapon, an awakened one, and unpaid', () => {
    const p = smith();
    const reason = (q: DelveProfile, uid = 'rare') => awaken(registry, q, uid).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Forge at the Anvil, between dives');
    expect(reason(p, 'nope')).toBe('Item not found');
    for (const uid of ['epic', 'magic', 'helm'])
      expect(reason(p, uid)).toBe('Only a rare weapon awakens');
    expect(reason(awaken(registry, p, 'rare').profile)).toBe('Already awakened');
    const epic = { kind: 'flux', grade: 'epic' } as const;
    expect(reason({ ...p, materials: withMaterial(p.materials, epic, -2) })).toBe(
      'Not enough epic flux',
    );
    expect(reason({ ...p, links: price.links - 1 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 0 })).toBe('Not enough scrap');
    expect(awaken(registry, p, 'helm').profile).toBe(p);
  });

  it('keeps its Ultimate through an upgrade, a reforge, a re-attune and a load', () => {
    const p = awaken(registry, smith(), 'rare').profile;
    const kept = (q: DelveProfile) => {
      const w = q.bag.find((i) => i.uid === 'rare')!;
      return [w.awakened, ultimateOf(w)];
    };
    const done = (r: ProfileActionResult) => {
      expect(r.ok, r.reason).toBe(true);
      return r.profile;
    };
    const want = kept(p);
    expect(kept(done(upgradeGear(registry, p, 'rare')))).toEqual(want);
    expect(kept(done(reforgeGear(registry, p, 'rare', 0)))).toEqual(want);
    expect(kept(done(reattuneItem(registry, { ...p, manaDust: 999 }, 'rare', 'fire')))).toEqual(
      want,
    );
    const json = JSON.parse(JSON.stringify(p));
    expect(kept((parseDelveProfile(registry, json) as { profile: DelveProfile }).profile)).toEqual(
      want,
    );
  });

  it('a transfer: the moveset moves, the target carries what it carries, the awakened rare stays awakened', () => {
    const p = equipItem(registry, awaken(registry, smith(), 'rare').profile, 'rare');
    // Onto an epic: the Ultimate moves with the rest.
    const onEpic = transferMoveset(registry, p, 'epic').profile;
    expect(onEpic.equipped.weapon!.uid).toBe('epic');
    expect(ultimateOf(onEpic.equipped.weapon!)).toEqual(ultimateOf(p.equipped.weapon!));
    // The awakened rare goes to the bag at its base, its Ultimate's base chain in its own mana.
    const back = onEpic.bag.find((i) => i.uid === 'rare')!;
    expect(back.awakened).toBe(true);
    expect(ultimateOf(back)).toEqual(defaultChain(registry, 'ultimate', 'axe', 'frost', 1));
    // Onto a rare that isn't awakened: the Ultimate stays behind.
    const plain = { ...item('plain', 'rare'), uid: 'plain' };
    const onRare = transferMoveset(registry, { ...p, bag: [...p.bag, plain] }, 'plain').profile;
    expect(ultimateOf(onRare.equipped.weapon!)).toBeUndefined();
  });
});
