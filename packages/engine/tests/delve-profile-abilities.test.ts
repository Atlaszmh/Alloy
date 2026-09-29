import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { defaultChains } from '../src/arpg/abilities/resolve.js';
import { createDelveProfile, parseDelveProfile, setChain } from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import type { Chain, Move } from '../src/types/ability.js';
import { asV4 } from './fixtures/arena.js';

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('profile chains (save v5)', () => {
  it("a new profile starts with its weapon element's default chains and the balance's caps", () => {
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(5);
    expect(p.chains).toEqual(defaultChains(registry, 'fire', 'sword'));
    expect(p.chainCaps).toEqual(registry.getDelveBalance().chains.cap);
  });

  it('setChain takes a valid chain for any skill, and it round-trips', () => {
    const chain: Chain = {
      moves: [
        { kind: 'light', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['fire'] },
      ],
      payment: 'cast',
    };
    let p = setChain(registry, createDelveProfile(registry, 1), 'primary', chain);
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]);
    expect(p.chains.primary).toEqual(chain);
    expect(p.chains.basic).toEqual([{ kind: 'heavy', element: 'nature' }]);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p, fixed: [] });
  });

  it('setChain refuses no moves, more than the cap, an unknown kind, a form from another slot, bad elements or payment', () => {
    const p = createDelveProfile(registry, 1);
    const move: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    const ok: Chain = { moves: [move], payment: 'mana' };
    const set =
      (chain: Chain, profile = p) =>
      () =>
        setChain(registry, profile, 'primary', chain);
    expect(set(ok)).not.toThrow();
    expect(set({ ...ok, moves: [] })).toThrow('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: Array(6).fill(move) })).toThrow('A chain holds 1 to 5 moves');
    const capped = { ...p, chainCaps: { ...p.chainCaps, primary: 2 } };
    expect(set({ ...ok, moves: [move, move, move] }, capped)).toThrow('A chain holds 1 to 2 moves');
    expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toThrow('Bad kind huge');
    expect(set({ ...ok, moves: [{ ...move, form: 'nova' }] })).toThrow(
      'Nova is not a primary form',
    );
    for (const elements of [[], ['fire', 'fire'], ['fire', 'frost', 'storm']] as const)
      expect(set({ ...ok, moves: [{ ...move, elements: [...elements] }] })).toThrow(
        'Pick one or two different elements',
      );
    expect(set({ ...ok, payment: 'gold' as never })).toThrow('Bad payment gold');
    expect(() => setChain(registry, p, 'basic', [])).toThrow('A chain holds 1 to 5 moves');
    expect(() =>
      setChain(registry, p, 'basic', [{ kind: 'light', element: 'gold' as never }]),
    ).toThrow('Unknown element');
  });

  it('chains can only change between dives', () => {
    const diving = startDive(registry, createDelveProfile(registry, 1), 1);
    expect(() => setChain(registry, diving, 'basic', [{ kind: 'light', element: 'fire' }])).toThrow(
      /dive/,
    );
  });

  it("migrates a version 2 save, keeping gear and scrap: its new primary's default chains", () => {
    const p0 = createDelveProfile(registry, 7);
    const { abilities: _abilities, ...rest } = asV4(p0);
    const frost = { ...p0.equipped.weapon!, mana: 'frost' as const };
    const v2 = {
      ...rest,
      version: 2,
      scrap: 321,
      equipped: { ...p0.equipped, weapon: frost },
      skillSlots: ['fireball', null, null],
      reactionsSeen: ['melt'],
    };
    const p = parseDelveProfile(registry, json(v2))?.profile;
    expect(p).toBeDefined();
    expect(p!.version).toBe(5);
    expect(p!.scrap).toBe(321);
    expect(p!.equipped.weapon!.uid).toBe(p0.equipped.weapon!.uid);
    expect(p!.chains).toEqual(defaultChains(registry, 'frost', 'sword'));
    expect('skillSlots' in p!).toBe(false);
  });

  it('remembers the new reactions', () => {
    const p = { ...createDelveProfile(registry, 1), reactionsSeen: ['combust', 'blight'] };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['combust', 'blight']);
  });
});
