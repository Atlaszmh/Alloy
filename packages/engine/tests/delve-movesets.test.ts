import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import {
  baseSlots,
  carriedFrom,
  carriedSkills,
  defaultChain,
  defaultMoveset,
  extraSlots,
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { CHAIN_SKILLS, type Blow, type Chain } from '../src/types/ability.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

// See the weapon movesets spec.

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('data: movesets', () => {
  it('loads the chains each rarity carries, the extra slots and the prices', () => {
    const m = bal.movesets;
    expect(m.carries.common).toEqual(['basic', 'primary']);
    expect(m.carries.uncommon).toEqual(['basic', 'primary']);
    expect(m.carries.magic).toEqual(['basic', 'primary', 'defensive']);
    expect(m.carries.rare).toEqual(['basic', 'primary', 'defensive']);
    expect(m.carries.epic).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(m.carries.legendary).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(m.extraSlots).toEqual({
      common: [0, 0],
      uncommon: [0, 0],
      magic: [0, 1],
      rare: [1, 2],
      epic: [2, 3],
      legendary: [3, 4],
    });
    expect(m.slotLinks).toEqual([1, 2, 3, 4]);
    expect(m.slotScrap).toEqual([20, 40, 60, 80]);
    expect([m.editDust, m.elementDust, m.transferScrap]).toEqual([5, 15, 30]);
    expect(bal.chains.cap).toEqual({ basic: 5, primary: 5, defensive: 5, ultimate: 5 });
  });

  it('refuses a rarity that carries no basic chain or less than the rarity below, or extra slots that fall', () => {
    const withMovesets = (movesets: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
    });
    const carries = { ...balanceData.delve.movesets.carries, common: ['primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries })).success).toBe(false);
    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic', 'primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: shrinks })).success).toBe(false);
    const extraSlots = { ...balanceData.delve.movesets.extraSlots, rare: [2, 1] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ extraSlots })).success).toBe(false);
    expect(BalanceConfigSchema.safeParse(balanceData).success).toBe(true);
  });
});

describe('base slots and carried chains', () => {
  it("gives the basic chain its weapon's string length (unarmed, the hero's), every other chain 1", () => {
    expect(baseSlots(registry, 'sword', 'basic')).toBe(3);
    expect(baseSlots(registry, 'maul', 'basic')).toBe(2);
    expect(baseSlots(registry, 'dagger', 'basic')).toBe(4);
    expect(baseSlots(registry, null, 'basic')).toBe(3);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const) {
      expect(baseSlots(registry, 'sword', skill)).toBe(1);
      expect(baseSlots(registry, null, skill)).toBe(1);
    }
  });

  it('carries chains by rarity; unarmed carries the basic chain and the Primary', () => {
    for (const r of RARITY_ORDER)
      expect(carriedSkills(registry, r)).toEqual(bal.movesets.carries[r]);
    expect(carriedSkills(registry, null)).toEqual(['basic', 'primary']);
    expect(carriedFrom(registry, 'basic')).toBeNull();
    expect(carriedFrom(registry, 'primary')).toBeNull();
    expect(carriedFrom(registry, 'defensive')).toBe('magic');
    expect(carriedFrom(registry, 'ultimate')).toBe('epic');
  });
});

describe('default moves', () => {
  it("fills a moveset at its base slots: the weapon's string, and each slot's default form's first move", () => {
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'common' }, 'frost');
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
    expect(m.chains).toEqual({
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: [{ kind: 'light', form: 'bolt', elements: ['frost'] }], payment: 'mana' },
    });
    const epic = defaultMoveset(registry, { baseId: 'maul', rarity: 'epic' }, 'fire');
    expect(epic.slots).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 1 });
    expect(epic.chains.defensive).toEqual({
      moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    expect(epic.chains.ultimate).toEqual({
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it('plays the default chain in order, then medium past its end', () => {
    const kinds = (c: Chain) => c.moves.map((m) => m.kind);
    expect(kinds(defaultChain(registry, 'primary', 'sword', 'fire', 5))).toEqual([
      'light',
      'medium',
      'medium',
      'heavy',
      'medium',
    ]);
    expect(kinds(defaultChain(registry, 'ultimate', 'sword', 'fire', 2))).toEqual([
      'medium',
      'medium',
    ]);
    const blows = (b: Blow[]) => b.map((x) => x.kind);
    expect(blows(defaultChain(registry, 'basic', 'maul', 'fire', 4))).toEqual([
      'medium',
      'heavy',
      'medium',
      'medium',
    ]);
  });

  it('gives unarmed its default moveset in the element asked for', () => {
    const m = defaultMoveset(registry, { baseId: null, rarity: null }, 'nature');
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
    expect(m.chains.basic).toEqual(
      bal.hero.defaultChain.map((kind) => ({ kind, element: 'nature' })),
    );
  });
});

describe('drops: extra slots by rarity', () => {
  const EXTRA: Record<Rarity, [number, number]> = {
    common: [0, 0],
    uncommon: [0, 0],
    magic: [0, 1],
    rare: [1, 2],
    epic: [2, 3],
    legendary: [3, 4],
  };

  it("rolls the rarity's extra slots over the chains it carries, every slot a default move in its mana", () => {
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) {
        const w = weapon(rarity, seed);
        const m = w.moveset!;
        expect(Object.keys(m.chains).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        expect(Object.keys(m.slots).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        const extra = extraSlots(registry, w);
        seen.add(extra);
        expect(m).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
        for (const skill of CHAIN_SKILLS) expect(m.slots[skill] ?? 0).toBeLessThanOrEqual(5);
      }
      expect(Math.min(...seen)).toBe(EXTRA[rarity][0]);
      expect(Math.max(...seen)).toBe(EXTRA[rarity][1]);
    }
  });

  it('spreads extra slots over every chain a weapon carries', () => {
    const got = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const w = weapon('rare', seed);
      for (const skill of CHAIN_SKILLS)
        if ((w.moveset!.slots[skill] ?? 0) > baseSlots(registry, w.baseId, skill)) got.add(skill);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary']);
  });

  it('never grows a chain past 5: a dagger basic string of 4 takes at most one extra', () => {
    for (let seed = 1; seed <= 60; seed++)
      expect(weapon('legendary', seed, 'dagger').moveset!.slots.basic).toBeLessThanOrEqual(5);
  });

  it('gives no moveset to gear other than weapons', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 5, rarity: 'legendary', slot: 'chest' },
      new SeededRNG(3),
    );
    expect(chest.moveset).toBeUndefined();
    expect(extraSlots(registry, chest)).toBe(0);
  });
});

describe('determinism', () => {
  it('rolls the same moveset from the same seed', () => {
    expect(weapon('epic', 9).moveset).toEqual(weapon('epic', 9).moveset);
  });

  it('leaves every other item stat, and every later drop, as v0.48.0 rolled them', () => {
    const items: GearItem[] = [];
    for (let seed = 1; seed <= 30; seed++)
      for (const rarity of RARITY_ORDER)
        items.push(
          generateItem(
            registry,
            { uid: `g${seed}`, ilvl: seed, rarity, biomeMana: 'frost', pair: ['fire', 'storm'] },
            new SeededRNG(seed),
          ),
        );
    const rng = new SeededRNG(7);
    let ctx = {
      depth: 5,
      kind: 'boss' as const,
      magicFind: 40,
      pity: 0,
      dropMult: 1,
      legendaryBoost: 1,
      forceLegendary: true,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind, forceLegendary: i === 0 }, rng);
      items.push(...r.items);
      ctx = { ...ctx, pity: r.pity, nextUid: r.nextUid };
    }
    const strip = items.map(({ moveset: _m, ...rest }) => rest);
    let h = 0x811c9dc5;
    for (const c of JSON.stringify(strip)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    // v0.48.0's 291 items, hashed the same way (the plan's scratchpad `items-hash.mjs`).
    expect([items.length, h.toString(16)]).toEqual([291, '49e20fb6']);
  });
});

describe('save schema: a weapon moveset', () => {
  const sword = weapon('common', 1, 'sword');

  it('reads an item with a moveset, and one without (a version 5 save)', () => {
    expect(GearItemSchema.safeParse(sword).success).toBe(true);
    const { moveset: _m, ...old } = sword;
    expect(GearItemSchema.safeParse(old).success).toBe(true);
  });

  it('refuses a chain longer than its slots, a chain without slots, and slots without a chain', () => {
    const m = sword.moveset!;
    const bad = (moveset: object) => GearItemSchema.safeParse({ ...sword, moveset }).success;
    expect(bad({ ...m, slots: { ...m.slots, basic: 2 } })).toBe(false);
    expect(bad({ ...m, slots: { basic: 3 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, defensive: 1 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, primary: 5 } })).toBe(true);
  });
});
