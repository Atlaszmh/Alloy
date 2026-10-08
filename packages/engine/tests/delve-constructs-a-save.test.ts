import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';

// The constructs spec §3.1 (Save): version 14; every saved construct carries its uid; a save of
// any other version resets (no migration, as ever).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save v14', () => {
  it('a new save is version 14, its constructs minted, and round-trips, mid-dive too', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(p.version).toBe(14);
    const sword = p.equipped.weapon!.moveset!;
    const uids = [...sword.chains.basic!, ...sword.chains.primary!.moves].map((c) => c.uid);
    expect(uids).toHaveLength(5);
    expect(new Set(uids).size).toBe(5);
    expect(uids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    // The kit's sword is minted, then rebuilt and minted again by the mana choice: c5 to c9.
    expect(p.nextConstructUid).toBe(10);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
  });

  it('a version 13 save resets; a saved construct without its uid, worn, in the bag or in the move bag, is refused', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(parseDelveProfile(registry, json({ ...p, version: 13 }))).toEqual({ reset: true });
    const sword = p.equipped.weapon!;
    const strip = (c: { uid?: string }) => {
      const { uid: _u, ...rest } = c;
      return rest;
    };
    const chains = sword.moveset!.chains;
    const bare = {
      ...sword,
      moveset: {
        ...sword.moveset!,
        chains: { ...chains, primary: { ...chains.primary!, moves: chains.primary!.moves.map(strip) } },
      },
    };
    expect(parseDelveProfile(registry, json({ ...p, equipped: { ...p.equipped, weapon: bare } }))).toBeNull();
    const bagged = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'axe', mana: 'fire' },
      new SeededRNG(2),
    );
    expect(parseDelveProfile(registry, json({ ...p, bag: [bagged] }))).toBeNull(); // unminted
    const loose: DelveProfile = { ...p, constructs: [strip(chains.primary!.moves[0]) as never] };
    expect(parseDelveProfile(registry, json(loose))).toBeNull();
    // A blow without its uid is refused the same way.
    const blows = { ...sword, moveset: { ...sword.moveset!, chains: { ...chains, basic: chains.basic!.map(strip) } } };
    expect(parseDelveProfile(registry, json({ ...p, equipped: { ...p.equipped, weapon: blows } }))).toBeNull();
  });
});
