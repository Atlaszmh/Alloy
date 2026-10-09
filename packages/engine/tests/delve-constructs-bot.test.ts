import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { movesOf, setChains } from '../src/delve/moveset.js';
import { addLootToBag, createDelveProfile, equipItem, withMoveset } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { movesetOf } from '../src/loot/moveset.js';
import { pouchCount, socketsOf } from '../src/loot/runes.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { CHAIN_SKILLS, type AbilitySlot, type Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import type { RuneRef } from '../src/types/rune.js';
import { registry } from './fixtures/arena.js';

// See the constructs spec §7: between dives the autopilot opens a skill when it can pay, places
// the bag's constructs where they raise Power, moves all onto a better weapon, fills an empty
// slot, and melts what it doesn't use; a new save's sword has its Primary from the start.

/**
 * A Fire hero after its first dive: nothing to forge (`emptyMaterials` drops the kit's bars and
 * its five uncommon flux on purpose, so no visit forges or opens a skill unless a case hands it
 * the flux), scrap, Dust and two Links to spare.
 */
function veteran(over: Partial<DelveProfile> = {}): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    materials: emptyMaterials(),
    links: 2,
    scrap: 1000,
    manaDust: 50,
    stats: { ...p.stats, dives: 1 },
    ...over,
  };
}
/** A sword of `rarity` banked into `p`'s bag (its constructs' uids minted): the profile and the item. */
function bagged(p: DelveProfile, rarity: Rarity, uid: string): [DelveProfile, GearItem] {
  const sword = generateItem(
    registry,
    { uid, ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(2),
  );
  const next = addLootToBag(registry, p, [sword]).profile;
  return [next, next.bag.find((i) => i.uid === uid)!];
}
/** The worn weapon's `skill` constructs. */
const worn = (p: DelveProfile, skill: AbilitySlot): Move[] =>
  movesetOf(registry, p.equipped.weapon!).chains[skill]?.moves ?? [];
/** Every rune socketed on the worn weapon. */
const wornRunes = (p: DelveProfile): RuneRef[] => {
  const { chains } = movesetOf(registry, p.equipped.weapon!);
  return CHAIN_SKILLS.flatMap((s) => movesOf(chains[s]))
    .flatMap(socketsOf)
    .filter((r): r is RuneRef => r !== null);
};

describe('the autopilot and constructs', () => {
  it("opens a skill it can pay for (a magic sword's Ultimate), and leaves one it can't", () => {
    const [p, magic] = bagged(veteran(), 'magic', 'w');
    const flux = withMaterial(emptyMaterials(), { kind: 'flux', grade: 'magic' }, 1);
    const armed = equipItem(registry, { ...p, materials: flux }, magic.uid);
    expect(movesetOf(registry, armed.equipped.weapon!).slots.ultimate ?? 0).toBe(0);
    const after = betweenDives(registry, armed);
    const { slots, bought } = movesetOf(registry, after.equipped.weapon!);
    expect([slots.ultimate, bought.ultimate, worn(after, 'ultimate').length]).toEqual([1, 1, 1]);
    expect(after.materials.flux.magic).toBe(0);
    const broke = betweenDives(registry, equipItem(registry, p, magic.uid));
    expect(movesetOf(registry, broke.equipped.weapon!).slots.ultimate ?? 0).toBe(0);
  });

  it("places the bag's construct that raises Power, and the plain one it displaces is gone", () => {
    const p = veteran();
    const [first] = worn(p, 'primary');
    const echo: Move = {
      uid: 'cEcho',
      kind: first.kind,
      form: first.form,
      elements: ['fire'],
      runes: [{ id: 'echo', tier: 3 }],
    };
    const after = betweenDives(registry, { ...p, constructs: [echo] });
    expect(worn(after, 'primary').map((m) => m.uid)).toContain('cEcho');
    expect(after.constructs).toEqual([]);
  });

  it('moves all onto the bag weapon that makes the best home, its constructs with it, and melts the old one', () => {
    const p = veteran({ runes: { echo: [0, 0, 1, 0, 0] } });
    const chain = movesetOf(registry, p.equipped.weapon!).chains.primary!;
    const [first, ...rest] = chain.moves;
    const moves = [{ ...first, runes: [{ id: 'echo', tier: 3 as const }] }, ...rest];
    const socketed = setChains(registry, p, { primary: { ...chain, moves } });
    expect(socketed.ok).toBe(true);
    const [withRare] = bagged(socketed.profile, 'rare', 'r');
    const after = betweenDives(registry, withRare);
    expect(after.equipped.weapon!.uid).toBe('r');
    expect(worn(after, 'primary')[0]).toMatchObject({
      uid: first.uid,
      runes: [{ id: 'echo', tier: 3 }],
    });
    // The old sword, refilled plain, was junk: melted, its plain constructs gone with it.
    expect(after.bag.some((i) => i.slot === 'weapon')).toBe(false);
    expect(after.constructs).toEqual([]);
  });

  it("melts a bag construct it can't place (a Bolt on a sword), its rune kept: back in the pouch or socketed", () => {
    const p = veteran();
    const bolt: Move = {
      uid: 'cBolt',
      kind: 'medium',
      form: 'bolt',
      elements: ['fire'],
      runes: [{ id: 'quick', tier: 1 }],
    };
    const after = betweenDives(registry, { ...p, constructs: [bolt] });
    expect(after.constructs).toEqual([]);
    const quick = { id: 'quick', tier: 1 as const };
    const held =
      pouchCount(after.runes, quick) + wornRunes(after).filter((r) => r.id === 'quick').length;
    expect(held).toBe(1);
  });

  it("fills the slots a Move all left empty (the rare's Ultimate) with plain constructs, for Dust", () => {
    const [p, rare] = bagged(veteran(), 'rare', 'r');
    const armed = equipItem(registry, p, rare.uid);
    const ms = movesetOf(registry, armed.equipped.weapon!);
    const ultimate = { ...ms.chains.ultimate!, moves: [] };
    const emptied = withMoveset(armed, { ...ms, chains: { ...ms.chains, ultimate } });
    expect(worn(emptied, 'ultimate')).toEqual([]);
    const after = betweenDives(registry, emptied);
    // Every empty slot filled: this rare rolled an extra Ultimate slot past its start.
    expect(worn(after, 'ultimate').length).toBe(ms.slots.ultimate);
    expect(after.manaDust).toBeLessThan(emptied.manaDust);
  });

  it('reports what each visit placed and melted', () => {
    const report = economySim(registry, 1, 1);
    for (const d of report.dives) {
      expect(Object.keys(d.constructs).sort()).toEqual(['placed', 'salvaged']);
      for (const n of Object.values(d.constructs)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    }
    expect(structuredClone(report.dives)).toEqual(report.dives);
  }, 30000);
});

describe("a new save's bot", () => {
  it('has its Primary from the start (two constructs on the common sword), before any forge', () => {
    for (const primary of ['fire', 'frost'] as const)
      for (const seed of [1, 2]) {
        const { profile } = runAutopilot(registry, { seed, dives: 0, primary });
        expect(worn(profile, 'primary').length, `${primary} ${seed}`).toBeGreaterThanOrEqual(2);
      }
  });
});
