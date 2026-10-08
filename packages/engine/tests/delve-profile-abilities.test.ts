import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { OPEN_SKILL_TEXT, setChain } from '../src/delve/moveset.js';
import { createDelveProfile, parseDelveProfile, unequipSlot } from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import type { Chain, Move } from '../src/types/ability.js';
import { chainsOf, withChains } from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
/** `x` without its constructs' uids (the shape a default moveset has before it is minted). */
const bare = (x: unknown) =>
  JSON.parse(
    JSON.stringify(x, (k, v) =>
      k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v,
    ),
  );

describe('chains on the weapon', () => {
  it("a new profile's common sword holds its slot table's defaults in the weapon's element: the basic chain and a two-slot Primary, minted", () => {
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(14);
    const sword = p.equipped.weapon!;
    expect(bare(sword.moveset)).toEqual(defaultMoveset(registry, sword, 'fire'));
    expect(sword.moveset!.slots).toEqual({ basic: 3, primary: 2 });
    expect(sword.moveset!.chains.primary!.moves.every((m) => /^c\d+$/.test(m.uid!))).toBe(true);
  });

  it('setChain takes a valid chain for a skill the weapon has slots for, and it round-trips', () => {
    const chain: Chain = {
      moves: [
        { kind: 'light', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['fire'] },
      ],
      payment: 'cast',
    };
    const roomy = withChains(armed(registry, createDelveProfile(registry, 1)), { primary: chain });
    let p = setChain(registry, roomy, 'primary', chainsOf(roomy).primary!).profile;
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]).profile;
    expect(bare(chainsOf(p).primary)).toEqual(chain);
    expect(bare(chainsOf(p).basic)).toEqual([{ kind: 'heavy', element: 'nature' }]);
    expect(p.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2, defensive: 1 });
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('setChain refuses more than the slots, no blow, an unknown kind, a form from another slot or class, bad elements or payment', () => {
    const fresh = armed(registry, createDelveProfile(registry, 1));
    const move: Move = { kind: 'medium', form: 'lance', elements: ['fire'] };
    const ok: Chain = { moves: [move], payment: 'mana' };
    const p = withChains(fresh, {
      basic: Array(5).fill({ kind: 'light', element: 'fire' }),
      primary: { ...ok, moves: Array(5).fill(move) },
    });
    const set = (chain: Chain, profile = p) => setChain(registry, profile, 'primary', chain).reason;
    expect(set(ok)).toBeUndefined();
    expect(set({ ...ok, moves: [] })).toBeUndefined(); // an empty ability chain plays as none
    expect(set({ ...ok, moves: Array(6).fill(move) })).toBe('A chain holds 0 to 5 moves');
    expect(set({ ...ok, moves: [move, move, move] }, fresh)).toBe('A chain holds 0 to 2 moves');
    expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toBe('Bad kind huge');
    expect(set({ ...ok, moves: [{ ...move, form: 'nova' }] })).toBe('Nova is not a primary form');
    expect(set({ ...ok, moves: [{ ...move, form: 'bolt' }] })).toBe("A sword can't express Bolt");
    for (const elements of [[], ['fire', 'fire'], ['fire', 'frost', 'storm']] as const)
      expect(set({ ...ok, moves: [{ ...move, elements: [...elements] }] })).toBe(
        'Pick one or two different elements',
      );
    expect(set({ ...ok, payment: 'gold' as never })).toBe('Bad payment gold');
    expect(set({ ...ok, moves: [{ ...move, form: 'axe' as never }] })).toBe('Unknown form axe');
    expect(set([{ kind: 'light', element: 'fire' }] as never)).toBe('Not a primary chain');
    expect(setChain(registry, p, 'basic', []).reason).toBe('A chain holds 1 to 5 moves');
    expect(
      setChain(registry, p, 'basic', [{ kind: 'light', element: 'gold' as never }]).reason,
    ).toBe('Unknown element');
    const nova: Chain = { moves: [{ ...move, form: 'nova' }], payment: 'charge' };
    expect(setChain(registry, p, 'ultimate', nova).reason).toBe(OPEN_SKILL_TEXT);
    expect(set(ok, unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
  });

  it('chains can only change between dives', () => {
    const diving = startDive(registry, createDelveProfile(registry, 1), 1);
    const res = setChain(registry, diving, 'basic', [{ kind: 'light', element: 'fire' }]);
    expect(res).toEqual({
      ok: false,
      profile: diving,
      reason: 'Chains can only change between dives',
    });
  });

  it('remembers the new reactions', () => {
    const p = { ...createDelveProfile(registry, 1), reactionsSeen: ['combust', 'blight'] };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['combust', 'blight']);
  });
});
