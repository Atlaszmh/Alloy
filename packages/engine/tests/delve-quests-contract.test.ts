import { describe, it, expect } from 'vitest';
import * as engine from '../src/index.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { emptyPending } from '../src/arpg/world.js';
import { bankWorld, beginFloor, extractDive, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { claimQuest, grantRewards } from '../src/delve/quests.js';

// The quests contract (see the quests spec's "Phases and parallel areas"): the
// fields and exports the areas fill in exist from the start.

const registry = createDefaultRegistry();
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

/** The default data with no contract templates: nothing ever calls `refillBoard`. */
function withoutTemplates(): DataRegistry {
  const d = loadAndValidateData();
  return new DataRegistry(
    d.affixes,
    d.combinations,
    d.synergies,
    d.baseItems,
    d.balance,
    d.recipes,
    d.delve,
    d.arpg,
    d.crafting,
    { ...d.quests, contractTemplates: [] },
  );
}

describe('quest events in the arena', () => {
  it('a floor starts with no quest events and its flags down; a bank takes the events', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    expect(world.pending.questEvents).toEqual([]);
    expect([world.potionDrunk, world.hurt]).toEqual([false, false]);
    expect(emptyPending().questEvents).toEqual([]);
    world.pending.questEvents.push({ type: 'perfectDodge' });
    bankWorld(registry, p, world);
    expect(world.pending.questEvents).toEqual([]);
  });
});

describe('the quests contract', () => {
  it('exports every quest op and table from the engine', () => {
    for (const name of [
      // delve/quests.ts (B1)
      'emptyQuests',
      'applyQuestEvents',
      'questStates',
      'claimQuest',
      'grantRewards',
      'trackQuest',
      'markQuestSeen',
      // delve/rewards.ts, delve/contracts.ts (B2)
      'resolveReward',
      'generateContract',
      'refillBoard',
      'rerollContract',
      // data/quests-check.ts
      'questsDataProblems',
    ])
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe('function');
    expect(engine.OBJECTIVE_TYPES).toHaveLength(13);
    expect(engine.REWARD_KINDS).toHaveLength(8);
    expect(engine.CONTRACT_TIERS).toEqual(['easy', 'normal', 'hard']);
  });

  it('without contract templates, a new save and a dive that cleared a depth leave the board empty', () => {
    const bare = withoutTemplates();
    const p = startDive(bare, createDelveProfile(bare, 4, { primary: 'fire' }), 1);
    expect(p.quests.board).toEqual([null, null, null]);
    const cleared = { ...p, dive: { ...p.dive!, phase: 'choosing' as const, depthsCleared: 1 } };
    expect(extractDive(bare, cleared).quests.board).toEqual([null, null, null]);
  });

  it('claims only at the Anvil, between dives', () => {
    const p = diving();
    expect(claimQuest(registry, p, 'first_steps')).toEqual({
      ok: false,
      profile: p,
      reason: 'Claim at the Anvil, between dives',
    });
  });

  it('a claim with no rewards grants nothing, and moves claimCount on', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    const r = grantRewards(registry, p, 'first_steps', []);
    expect(r.granted).toEqual([]);
    expect(r.profile).toEqual({ ...p, quests: { ...p.quests, claimCount: 1 } });
  });
});
