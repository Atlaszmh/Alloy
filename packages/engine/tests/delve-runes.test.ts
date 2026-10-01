import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import {
  rollRuneDrop,
  rollSockets,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
import { CHAIN_SKILLS, type Blow, type Move } from '../src/types/ability.js';
import type { MonsterKind } from '../src/types/arpg.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

// See the runes spec: sockets, the pouch, the draft's price, fusing, drops and the stop.

const R = bal.runes;

/** Every move and blow of a moveset, chain by chain. */
function allMoves(m: Moveset): (Move | Blow)[] {
  return CHAIN_SKILLS.flatMap((skill) => {
    const chain = m.chains[skill];
    if (!chain) return [];
    return Array.isArray(chain) ? chain : chain.moves;
  });
}

/** A moveset's open sockets, over every chain. */
function openSockets(m: Moveset): number {
  return allMoves(m).reduce((n, x) => n + socketsOf(x).length, 0);
}

/** A moveset without its sockets: what it was before any was rolled. */
function bare(m: Moveset): Moveset {
  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots };
}

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('rune drops: tiers and chances', () => {
  it('gives the highest tier whose depth is reached, one higher a fifth of the time, at most V', () => {
    const tiers = (depth: number) => {
      const rng = new SeededRNG(depth);
      const seen = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 4000; i++) seen[runeTierAt(registry, depth, rng)]++;
      return seen;
    };
    const cases: [number, number][] = [
      [1, 1],
      [6, 1],
      [7, 2],
      [12, 2],
      [13, 3],
      [20, 3],
      [21, 4],
      [30, 4],
    ];
    for (const [depth, tier] of cases) {
      const seen = tiers(depth);
      seen.forEach((n, t) => {
        if (t !== tier && t !== tier + 1) expect(n).toBe(0);
      });
      expect(seen[tier + 1] / 4000).toBeCloseTo(R.tierUp, 1);
    }
    expect(tiers(31)[5]).toBe(4000);
    expect(tiers(90)[5]).toBe(4000);
  });

  it("drops at its kind's chance × the door's multiplier (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, dropMult: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, dropMult }, rng)) got++;
      return got / 20000;
    };
    expect(R.dropChance).toEqual({ normal: 0.03, elite: 0.15, boss: 1 });
    expect(rate('normal', 1)).toBeCloseTo(0.03, 2);
    expect(rate('elite', 1)).toBeCloseTo(0.15, 1);
    expect(rate('elite', 2)).toBeCloseTo(0.3, 1);
    expect(rate('normal', 50)).toBe(1);
    expect(rate('boss', 1)).toBe(1);
    expect(rate('boss', 0.5)).toBe(1);
  });

  it('picks every rune uniformly, at the tier its depth gives', () => {
    const rng = new SeededRNG(5);
    const counts = new Map<string, number>();
    const tiers = new Set<number>();
    for (let i = 0; i < 14000; i++) {
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', dropMult: 1 }, rng)!;
      counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      tiers.add(r.tier);
    }
    expect([...counts.keys()].sort()).toEqual(
      registry
        .getRunes()
        .map((r) => r.id)
        .sort(),
    );
    for (const n of counts.values()) expect(Math.abs(n / 14000 - 1 / 14)).toBeLessThan(0.015);
    expect([...tiers].sort()).toEqual([3, 4]);
  });
});

describe('the socket roll', () => {
  it('rolls on top of the moveset: never changes the one it is given, nor anything but sockets', () => {
    const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    const m = defaultMoveset(registry, { baseId: 'bow', rarity: 'legendary' }, 'fire', slots);
    const before = JSON.stringify(m);
    for (let seed = 1; seed <= 30; seed++) {
      const out = rollSockets(registry, { rarity: 'legendary' }, m, new SeededRNG(seed));
      expect(JSON.stringify(m)).toBe(before);
      expect(bare(out)).toEqual(m);
      expect(openSockets(out)).toBeGreaterThanOrEqual(2);
    }
    // Nothing to open: the moveset itself, untouched.
    expect(rollSockets(registry, { rarity: 'uncommon' }, m, new SeededRNG(1))).toBe(m);
  });
});

describe("a weapon's parts", () => {
  it('a Link for each extra slot and each open socket, and the runes in them; other gear none', () => {
    const w = weapon('rare', 1, 'sword');
    const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 2, defensive: 1 });
    const [first] = moveset.chains.basic!;
    moveset.chains.basic![0] = { ...first, runes: [{ id: 'chain', tier: 2 }, null] };
    const primary = moveset.chains.primary!;
    primary.moves[1] = { ...primary.moves[1], runes: [{ id: 'quick', tier: 1 }] };
    expect(weaponParts(registry, { ...w, moveset })).toEqual({
      links: 2 + 3,
      runes: [
        { id: 'chain', tier: 2 },
        { id: 'quick', tier: 1 },
      ],
    });
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    expect(weaponParts(registry, chest)).toEqual({ links: 0, runes: [] });
  });
});
