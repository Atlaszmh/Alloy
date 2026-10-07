import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { emptyQuests } from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Contract } from '../src/types/quests.js';

// See the quests spec: "Profile v9" (older saves reset; no migration).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const fresh = () => createDelveProfile(registry, 7, { primary: 'fire' });

const contract: Contract = {
  id: 'contract:0',
  template: 'cull',
  tier: 'hard',
  name: 'Cull',
  line: 'A line.',
  objectives: [
    {
      id: 'o',
      type: 'kill',
      filter: { kind: 'elite', biome: 'cinder_mines' },
      count: 12,
      scope: 'total',
      text: 'Slay 12 elites in the Cinder Mines',
    },
  ],
  rewards: [
    { kind: 'scrap', count: 60 },
    { kind: 'essence', id: 'fit', count: 1 },
  ],
  progress: [{ value: 4, done: false }],
};
/** A save mid-way: a quest under way, tracked and seen, one claimed, a contract on the board. */
const underWay = (p: DelveProfile): DelveProfile => ({
  ...p,
  quests: {
    ...p.quests,
    progress: { first_steps: [{ value: 1, done: false }] },
    unlocked: ['first_steps', 'old'],
    claimed: ['old'],
    tracked: ['first_steps', 'contract:0'],
    seen: ['first_steps'],
    board: [contract, null, null],
    boardCount: 1,
    contractsClaimed: 2,
    rerollUsed: true,
    claimCount: 3,
  },
});

describe('save v9', () => {
  it("starts empty: nothing unlocked, tracked or claimed, and the board's three slots empty", () => {
    expect(emptyQuests(registry)).toEqual({
      progress: {},
      unlocked: [],
      claimed: [],
      tracked: [],
      seen: [],
      board: [null, null, null],
      boardCount: 0,
      contractsClaimed: 0,
      rerollUsed: false,
      claimCount: 0,
    });
    const p = fresh();
    expect(p.version).toBe(13);
    expect(p.quests.board).toHaveLength(registry.getDelveBalance().quests.contracts.slots);
  });

  it('round-trips the quests, the board and its contracts, mid-dive too', () => {
    const p = underWay(fresh());
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
  });

  it('resets a version 8 save; a version 13 save without its quests, or a bad contract, is refused', () => {
    const p = underWay(fresh());
    expect(parseDelveProfile(registry, json({ ...p, version: 8 }))).toEqual({ reset: true });
    const { quests: _q, ...noQuests } = p;
    expect(parseDelveProfile(registry, json(noQuests))).toBeNull();
    const board = (c: object) => json({ ...p, quests: { ...p.quests, board: [c, null, null] } });
    expect(parseDelveProfile(registry, board({ ...contract, tier: 'epic' }))).toBeNull();
    expect(parseDelveProfile(registry, board({ ...contract, objectives: [] }))).toBeNull();
    const forgeInADive = { ...contract.objectives[0], type: 'forge', filter: {}, scope: 'dive' };
    expect(
      parseDelveProfile(registry, board({ ...contract, objectives: [forgeInADive] })),
    ).toBeNull();
  });
});
