import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as engine from '../src/index.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { applyTutorialEvents, tutorialFloorOf } from '../src/delve/tutorial.js';
import { tutorialTick } from '../src/arpg/tutorial.js';
import { forge, hone, refine } from '../src/delve/crafting.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { setChains, transferMoveset } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, equipItem, salvageItems } from '../src/delve/profile.js';
import { applyQuestEvents, claimQuest } from '../src/delve/quests.js';
import { generateItem } from '../src/loot/item-generator.js';
import { movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { TutorialEvent } from '../src/types/tutorial.js';
import { arena, run, STEP } from './fixtures/arena.js';

// See the tutorial spec's phases: Phase A's stubs and hooks. Every op the script reads emits its
// event through `applyTutorialEvents`, the tick calls `tutorialTick`, and every hook is inert
// until its area fills it.

vi.mock('../src/delve/tutorial.js', { spy: true });
vi.mock('../src/arpg/tutorial.js', { spy: true });

const registry = createDefaultRegistry();
/** The events of the last `applyTutorialEvents` call. */
const lastEvents = (): readonly TutorialEvent[] => vi.mocked(applyTutorialEvents).mock.lastCall![2];
/** A new Fire save with scrap to spare and a forged uncommon cuirass in the bag. */
function forged(): DelveProfile {
  const p = { ...createDelveProfile(registry, 5, { primary: 'fire' }), scrap: 1000 };
  const req = { baseId: 'cuirass', metal: 'rusty', flux: 'uncommon', element: 'fire', shards: [] };
  return forge(registry, p, req as Parameters<typeof forge>[2]).profile;
}

// A block body: a returned function would run as a cleanup hook, the mock with no arguments.
beforeEach(() => {
  vi.mocked(applyTutorialEvents).mockClear();
});

describe('the stubs', () => {
  it('are exported whole', () => {
    for (const name of [
      'startTutorial',
      'skipTutorial',
      'tutorialAdvance',
      'applyTutorialEvents',
      'tutorialHolds',
      'tutorialText',
      'tutorialSkippable',
      'retryTutorialDepth',
      'tutorialFloorOf',
      'tutorialBlocksDive',
      'tutorialTick',
      'tutorialExitHeld',
      'worldTutorialEvents',
      'tutorialChest',
      'awaken',
      'awakenPrice',
      'essenceAllowed',
      'doorShut',
      'tutorialDataProblems',
      'tutorialFloorProblems',
      'tutorialDoorCount',
    ])
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe('function');
    expect(engine.TutorialDataSchema).toBeDefined();
    expect(engine.TUTORIAL_TRIGGERS).toContain('ack');
  });

  it('the hooks are inert: no tutorial, no gate held, no set drop, every essence allowed', () => {
    const p = createDelveProfile(registry, 5, { primary: 'fire' });
    const w = arena();
    expect(engine.applyTutorialEvents(registry, p, [{ type: 'ack' }])).toBe(p);
    expect(engine.tutorialFloorOf(registry, p)).toBeUndefined();
    expect(engine.tutorialBlocksDive(registry, p)).toBeNull();
    expect(engine.tutorialSkippable(registry, p, { step: 'welcome', count: 0, misses: 0 })).toBe(
      false,
    );
    expect(engine.tutorialExitHeld(w)).toBe(false);
    expect(engine.essenceAllowed(registry, 1)).toBe(true);
  });

  it('the ops left to fill throw', () => {
    const p = createDelveProfile(registry, 5, { primary: 'fire' });
    expect(() => engine.awaken(registry, p, 'g0')).toThrow('awaken: not implemented');
  });
});

describe('the hooks are called', () => {
  it('each tick ends with tutorialTick; beginFloor asks tutorialFloorOf for its floor', () => {
    vi.mocked(tutorialTick).mockClear();
    run(arena(), 3 * STEP);
    expect(tutorialTick).toHaveBeenCalledTimes(3);
    const p = startDive(registry, createDelveProfile(registry, 5, { primary: 'fire' }), 1);
    const w = beginFloor(registry, p);
    expect(tutorialFloorOf).toHaveBeenLastCalledWith(registry, p);
    expect([w.tutorialFloor, w.tutorial]).toEqual([null, null]);
  });

  it('the Anvil ops emit their events: forge, refine, hone, equip, salvage', () => {
    const p = forged();
    expect(lastEvents()).toEqual([{ type: 'forge', rarity: 'uncommon', legendary: false }]);
    const cuirass = p.bag[p.bag.length - 1];
    refine(registry, p, { kind: 'metal', metal: 'rusty' });
    expect(lastEvents()).toEqual([{ type: 'refine' }]);
    expect(hone(registry, p, cuirass.uid, 0).ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'hone' }]);
    equipItem(registry, p, cuirass.uid);
    expect(lastEvents()).toEqual([{ type: 'equip', slot: 'chest' }]);
    salvageItems(registry, p, [cuirass.uid]);
    expect(lastEvents()).toEqual([{ type: 'salvage', slot: 'chest' }]);
  });

  it('the bind, an Apply, a transfer and a claim emit theirs', () => {
    const p = forged();
    bindSecondary(registry, p, 'frost');
    expect(lastEvents()).toEqual([{ type: 'bind' }]);
    const { chains } = movesetOf(registry, p.equipped.weapon!);
    expect(setChains(registry, p, { primary: chains.primary }).ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'setChains' }]);
    const blade = generateItem(
      registry,
      { uid: 'b1', ilvl: 1, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(9),
    );
    expect(transferMoveset(registry, { ...p, bag: [...p.bag, blade] }, 'b1').ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'transfer' }]);
    const done = applyQuestEvents(registry, p, [{ type: 'reachDepth', depth: 2 }]);
    expect(claimQuest(registry, done, 'first_steps').ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'claim', quest: 'first_steps' }]);
  });
});
