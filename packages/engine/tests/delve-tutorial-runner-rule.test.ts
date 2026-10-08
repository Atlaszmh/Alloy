import { describe, it, expect } from 'vitest';
import { forge } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, equipItem, replaceItem, salvageItems } from '../src/delve/profile.js';
import { applyQuestEvents, claimQuest, questStates } from '../src/delve/quests.js';
import {
  LESSON_UNFINISHED,
  applyTutorialEvents,
  retryTutorialDepth,
  skipTutorial,
  startTutorial,
  tutorialAdvance,
  tutorialBlocksDive,
  tutorialFloorOf,
  tutorialHolds,
  tutorialSkippable,
} from '../src/delve/tutorial.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import type { TutorialEvent } from '../src/types/tutorial.js';
import { withChains } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { SCRIPT, onStep, script } from './fixtures/tutorial-runner.js';

// See the tutorial spec: "The engine" (state, triggers, "Completion reads what holds", skip,
// retry), on the fixture's short script.

const st = (step: string, count = 0, misses = 0) => ({ step, count, misses });
const stepOf = (id: string) => SCRIPT.find((s) => s.id === id)!;
const kill = (kind: 'normal' | 'elite') =>
  ({ type: 'kill', kind, biome: 'cinder_mines', element: 'fire' }) as const;
const clearFloor: TutorialEvent = {
  type: 'clearFloor',
  biome: 'cinder_mines',
  depth: 1,
  noPotion: true,
  noDamage: true,
};
const CUIRASS = {
  baseId: 'cuirass',
  metal: 'rusty',
  flux: 'uncommon',
  element: 'fire',
  shards: [],
};
const forged = (p: DelveProfile) =>
  forge(script, p, CUIRASS as Parameters<typeof forge>[2]).profile;
const weapon = (rarity: Rarity, uid = `w-${rarity}`) =>
  generateItem(
    script,
    { uid, ilvl: 3, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );

describe('the rule', () => {
  it('starts on the first step; a new save has none', () => {
    const p = createDelveProfile(script, 5, { primary: 'fire' });
    expect(p.tutorial).toBeNull();
    expect(startTutorial(script, p).tutorial).toEqual(st('go'));
  });

  it("counts an event of the trigger's type and filter, and completes at its count", () => {
    expect(tutorialAdvance(script, st('rats'), kill('elite'))).toEqual(st('rats'));
    expect(tutorialAdvance(script, st('rats'), { type: 'ack' })).toEqual(st('rats'));
    expect(tutorialAdvance(script, st('rats'), kill('normal'))).toEqual(st('rats', 1));
    expect(tutorialAdvance(script, st('rats', 1), kill('normal'))).toEqual(st('look'));
    expect(tutorialAdvance(script, st('bye'), { type: 'ack' })).toBeNull();
    expect(tutorialAdvance(script, st('perfect', 0, 9), { type: 'skipStep' })).toEqual(st('exit'));
  });

  it('leaving a floor completes what is left of its steps, and leaving a stop its stop steps', () => {
    expect(tutorialAdvance(script, st('rats'), clearFloor)).toEqual(st('equip'));
    expect(tutorialAdvance(script, st('equip'), { type: 'reachDepth', depth: 2 })).toEqual(
      st('react'),
    );
    expect(tutorialAdvance(script, st('home'), { type: 'extract', depth: 2 })).toEqual(st('claim'));
    expect(tutorialAdvance(script, st('equip'), clearFloor)).toEqual(st('equip'));
    expect(tutorialAdvance(script, st('rats'), { type: 'reachDepth', depth: 2 })).toEqual(
      st('rats'),
    );
  });

  it('a step that completes by state never counts its events', () => {
    expect(tutorialAdvance(script, st('claim'), { type: 'claim', quest: 'first_steps' })).toEqual(
      st('claim'),
    );
    expect(tutorialAdvance(script, st('bind'), { type: 'bind' })).toEqual(st('bind'));
  });
});

describe('applyTutorialEvents', () => {
  it('leaves the profile itself with no tutorial running, or nothing moved', () => {
    const p = createDelveProfile(script, 5, { primary: 'fire' });
    expect(applyTutorialEvents(script, p, [{ type: 'ack' }])).toBe(p);
    const q = onStep('rats');
    expect(applyTutorialEvents(script, q, [{ type: 'ack' }])).toBe(q);
  });

  it('completes in turn each step whose state holds: a forge and a bind made early still count', () => {
    const early = bindSecondary(script, forged(onStep('go')), 'frost').profile;
    expect(early.tutorial).toEqual(st('go'));
    // Claimed what completed (a contract the forge finished, say), an uncommon cuirass made, a
    // secondary bound: on to the Training Grounds.
    let at = { ...early, tutorial: st('claim') };
    for (const q of questStates(script, at).filter((s) => s.status === 'complete'))
      at = claimQuest(script, at, q.id).profile;
    expect(applyTutorialEvents(script, at, []).tutorial).toEqual(st('train'));
  });

  it('takes "Skip this step" only while the step is skippable', () => {
    const p = { ...onStep('perfect'), tutorial: st('perfect', 0, 1) };
    expect(applyTutorialEvents(script, p, [{ type: 'skipStep' }])).toBe(p);
    const q = { ...p, tutorial: st('perfect', 0, 2) };
    expect(applyTutorialEvents(script, q, [{ type: 'skipStep' }]).tutorial).toEqual(st('exit'));
  });

  it("takes the Training Grounds' Defensive cast, and the last beat ends the tutorial", () => {
    const cast = (slot: number) => ({ type: 'cast', slot, step: 0, aimed: false }) as const;
    const p = onStep('train');
    expect(applyTutorialEvents(script, p, [cast(0)]).tutorial).toEqual(st('train'));
    const q = applyTutorialEvents(script, p, [cast(1)]);
    expect(q.tutorial).toEqual(st('bye'));
    expect(applyTutorialEvents(script, q, [{ type: 'ack' }]).tutorial).toBeNull();
  });
});

const lesson = (type: string, filter?: Record<string, string | number>) =>
  ({
    ...stepOf('claim'),
    id: type,
    trigger: { type, count: 1, ...(filter && { filter }) },
  }) as (typeof SCRIPT)[number];
const equipChest = lesson('equip', { slot: 'chest', rarity: 'uncommon' });
const skills = lesson('setChains', { moves: 3 });
const salvage = lesson('salvage', { slot: 'weapon', rarity: 'common' });
const refine = lesson('refine', { metal: 'iron' });
const moveAll = lesson('moveAll', { rarity: 'rare' });
const hone = lesson('hone');

describe('tutorialHolds', () => {
  const holds = (p: DelveProfile, id: string) => tutorialHolds(script, p, stepOf(id));

  it('claim: nothing left to claim', () => {
    const p = onStep('claim');
    expect(holds(p, 'claim')).toBe(true);
    expect(holds(applyQuestEvents(script, p, [{ type: 'reachDepth', depth: 2 }]), 'claim')).toBe(
      false,
    );
  });

  it('forge and equip: an uncommon or better chest made, then worn (the starting one is common)', () => {
    const p = onStep('forge');
    expect([holds(p, 'forge'), tutorialHolds(script, p, equipChest)]).toEqual([false, false]);
    const made = forged(p);
    expect([holds(made, 'forge'), tutorialHolds(script, made, equipChest)]).toEqual([true, false]);
    const worn = equipItem(script, made, made.bag[made.bag.length - 1].uid);
    expect([holds(worn, 'forge'), tutorialHolds(script, worn, equipChest)]).toEqual([true, true]);
  });

  it('bind: a secondary bound', () => {
    const p = onStep('bind');
    expect(holds(p, 'bind')).toBe(false);
    expect(holds(bindSecondary(script, p, 'frost').profile, 'bind')).toBe(true);
  });

  it('setChains: the Primary at its moves, the last in the secondary, a rune in the first', () => {
    const p = bindSecondary(script, onStep('bind'), 'frost').profile;
    const bolt = (elements: ManaType[], rune = false): Move => ({
      kind: 'medium',
      form: 'bolt',
      elements,
      ...(rune && { runes: [{ id: 'chain', tier: 1 }] }),
    });
    const primary = (...moves: Move[]) => withChains(p, { primary: { moves, payment: 'mana' } });
    expect(
      tutorialHolds(script, primary(bolt(['fire'], true), bolt(['fire']), bolt(['frost'])), skills),
    ).toBe(true);
    expect(
      tutorialHolds(script, primary(bolt(['fire'], true), bolt(['fire']), bolt(['fire'])), skills),
    ).toBe(false);
    expect(
      tutorialHolds(script, primary(bolt(['fire']), bolt(['fire']), bolt(['frost'])), skills),
    ).toBe(false);
    expect(tutorialHolds(script, primary(bolt(['fire'], true), bolt(['frost'])), skills)).toBe(
      false,
    );
  });

  it('salvage, refine, Move all and hone: the old sword gone, a bar made, a rare worn with its constructs moved, a line honed', () => {
    const p = onStep('bind');
    const blade = weapon('uncommon');
    const swapped = equipItem(script, { ...p, bag: [blade] }, blade.uid);
    expect(tutorialHolds(script, swapped, salvage)).toBe(false);
    const melted = salvageItems(script, swapped, [p.equipped.weapon!.uid]).profile;
    expect(tutorialHolds(script, melted, salvage)).toBe(true);
    expect(tutorialHolds(script, p, refine)).toBe(false);
    const iron = {
      ...p,
      materials: { ...p.materials, metals: { ...p.materials.metals, iron: 1 } },
    };
    expect(tutorialHolds(script, iron, refine)).toBe(true);
    expect(tutorialHolds(script, swapped, moveAll)).toBe(false);
    // A rare worn with the constructs moved onto it: its Primary past its start (3).
    const rare = (primary: number) => {
      const w = weapon('rare');
      const moveset = defaultMoveset(script, w, 'fire', { primary });
      return { ...p, equipped: { ...p.equipped, weapon: { ...w, moveset } } };
    };
    expect(tutorialHolds(script, rare(3), moveAll)).toBe(false);
    expect(tutorialHolds(script, rare(4), moveAll)).toBe(true);
    expect(tutorialHolds(script, p, hone)).toBe(false);
    expect(tutorialHolds(script, replaceItem(p, { ...p.equipped.chest!, hones: 1 }), hone)).toBe(
      true,
    );
  });

  it('a floor or stop step has no state', () => {
    const p = onStep('rats');
    for (const id of ['walk', 'rats', 'equip', 'home', 'train', 'bye'])
      expect(holds(p, id)).toBe(false);
  });
});

describe('tutorialSkippable', () => {
  it('offers "Skip this step" at the step\'s skipAfter misses, and never without one', () => {
    const p = onStep('perfect');
    expect(tutorialSkippable(script, p, st('perfect', 0, 1))).toBe(false);
    expect(tutorialSkippable(script, p, st('perfect', 0, 2))).toBe(true);
    expect(tutorialSkippable(script, p, st('rats', 0, 99))).toBe(false);
    expect(tutorialSkippable(script, p, st('nowhere'))).toBe(false);
  });

  it("and at the Anvil when the hero can't pay for the step's op", () => {
    const p = onStep('forge');
    expect(tutorialSkippable(script, p, st('forge'))).toBe(false);
    expect(tutorialSkippable(script, { ...p, scrap: 0 }, st('forge'))).toBe(true);
    expect(tutorialSkippable(script, { ...p, scrap: 0 }, st('claim'))).toBe(false);
  });
});

describe("the dive's hooks", () => {
  it('Delve waits while an Anvil or Training lesson runs, not on the step that asks for the dive', () => {
    expect(tutorialBlocksDive(script, createDelveProfile(script, 5))).toBeNull();
    expect(tutorialBlocksDive(script, onStep('go'))).toBeNull();
    expect(tutorialBlocksDive(script, onStep('walk'))).toBeNull();
    expect(tutorialBlocksDive(script, onStep('claim'))).toBe(LESSON_UNFINISHED);
    expect(tutorialBlocksDive(script, onStep('train'))).toBe(LESSON_UNFINISHED);
  });

  it("a floor step names beginFloor's hand-built floor and the state it starts from", () => {
    const p = { ...onStep('rats'), tutorial: st('rats', 1, 0) };
    expect(tutorialFloorOf(script, p)).toEqual({ floor: 'd1-1', state: st('rats', 1, 0) });
    expect(tutorialFloorOf(script, onStep('equip'))).toBeUndefined();
    expect(tutorialFloorOf(script, onStep('claim'))).toBeUndefined();
    expect(tutorialFloorOf(script, createDelveProfile(script, 5))).toBeUndefined();
  });
});

describe('skip and retry', () => {
  /** On step `walk`, diving, its depth's entry held, at a stop whose power-up is required. */
  function guided(): DelveProfile {
    const p = startDive(script, onStep('walk'), 1);
    const { tutorialEntry: _e, ...dive } = p.dive!;
    return {
      ...p,
      dive: {
        ...p.dive!,
        tutorialEntry: { ...p, dive },
        stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true },
      },
    };
  }

  it("skipTutorial drops the profile's state, its depth's entry and the stop's requirement", () => {
    const p = skipTutorial(guided());
    expect(p.tutorial).toBeNull();
    expect(p.dive!.tutorialEntry).toBeNull();
    expect(p.dive!.stop).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: false,
    });
  });

  it("and a floor's: its state gone, its held doors let go (the floor plays out)", () => {
    const w = floorWorld(twoRooms('combat'));
    w.tutorialFloor = 'd1-1';
    w.tutorial = { ...st('walk'), tally: {} };
    w.map.doors[0].held = true;
    skipTutorial(guided(), w);
    expect([w.tutorial, w.tutorialFloor, w.map.doors[0].held]).toEqual([null, 'd1-1', false]);
  });

  it('retryTutorialDepth restores the depth as it was entered, keeping the entry', () => {
    const p = guided();
    const later: DelveProfile = { ...p, scrap: 1, bag: [weapon('rare')], tutorial: st('rats', 1) };
    const back = retryTutorialDepth(script, later);
    expect(back).toEqual({
      ...p.dive!.tutorialEntry!,
      dive: { ...p.dive!.tutorialEntry!.dive, tutorialEntry: p.dive!.tutorialEntry },
    });
    expect(retryTutorialDepth(script, back)).toEqual(back);
    const none = onStep('walk');
    expect(retryTutorialDepth(script, none)).toBe(none);
  });
});
