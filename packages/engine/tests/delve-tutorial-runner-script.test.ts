import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { tutorialDataProblems } from '../src/data/tutorial-check.js';
import { forge, hone, refine } from '../src/delve/crafting.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { moveAll } from '../src/delve/constructs.js';
import { addSlot, setChains } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, equipItem, salvageItems } from '../src/delve/profile.js';
import { applyQuestEvents, claimQuest, questStates } from '../src/delve/quests.js';
import { takeStop } from '../src/delve/stops.js';
import {
  LESSON_UNFINISHED,
  applyTutorialEvents,
  startTutorial,
  tutorialBlocksDive,
  tutorialText,
} from '../src/delve/tutorial.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Blow, Chain, Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { MANA_TYPES } from '../src/types/mana.js';
import type { TutorialStep } from '../src/types/tutorial.js';
import { withChains } from './fixtures/arena.js';

// See the tutorial spec's "The player's path": the script itself, run through its gates and its
// Anvil lessons by the real ops.

const registry = createDefaultRegistry();
const data = registry.getTutorialData();
const st = (step: string) => ({ step, count: 0, misses: 0 });
const sword = (rarity: Rarity, uid: string) =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(9),
  );
/** `item` with a uid on each of its constructs (`<uid>:<skill><i>`), as a banked weapon has. */
function withUids(item: GearItem): GearItem {
  const ms = movesetOf(registry, item);
  const chains = Object.fromEntries(
    Object.entries(ms.chains).map(([skill, chain]) => {
      const tag = (m: Move | Blow, i: number) => ({ ...m, uid: `${item.uid}:${skill}${i}` });
      return [
        skill,
        Array.isArray(chain) ? chain.map(tag) : { ...chain, moves: chain.moves.map(tag) },
      ];
    }),
  ) as Moveset['chains'];
  return { ...item, moveset: { ...ms, chains } };
}
/** Every quest and contract that waits, claimed. */
function claimAll(p: DelveProfile): DelveProfile {
  for (const q of questStates(registry, p).filter((s) => s.status === 'complete'))
    p = claimQuest(registry, p, q.id).profile;
  return p;
}

describe('the script', () => {
  it('passes its checks, and walks the eight floors in order: each its floor steps, its exit, its stop', () => {
    expect(tutorialDataProblems(registry)).toEqual([]);
    const onFloors = data.steps.filter((s) => s.floor);
    expect([...new Set(onFloors.map((s) => s.floor))]).toEqual(data.floors.map((f) => f.id));
    for (const f of data.floors) {
      const of = onFloors.filter((s) => s.floor === f.id);
      const firstStop = of.findIndex((s) => s.where === 'stop');
      expect(
        of.slice(firstStop).every((s) => s.where === 'stop'),
        f.id,
      ).toBe(true);
      expect(of[firstStop - 1].trigger.type, f.id).toBe('clearFloor');
      expect(of[firstStop].stop, f.id).toBeDefined();
    }
  });

  it('stops as the spec lays out: Equip, Adjust a move, home; then one power-up twice, two doors, home', () => {
    // Every step of a stop carries its stop (the client reads it), the same for each.
    const first = (floor?: string) =>
      data.steps.find((s) => s.where === 'stop' && s.floor === floor)!;
    for (const s of data.steps.filter((x) => x.where === 'stop'))
      expect(s.stop, s.id).toEqual(first(s.floor).stop);
    const stops = data.floors
      .map((f) => first(f.id).stop!)
      .map((s, i) => [data.floors[i].id, s.kinds, s.doors.length, s.extract]);
    expect(stops).toEqual([
      ['d1-1', ['equip'], 1, false],
      ['d1-2', ['move'], 1, false],
      ['d1-3', [], 0, true],
      ['d2-1', ['upgrade'], 1, false],
      ['d2-2', ['slot', 'move'], 1, false],
      ['d2-3', [], 2, false],
      ['d2-4', [], 1, false],
      ['d2-5', [], 0, true],
    ]);
  });

  it('starts by asking for the dive, holds it through each lesson, and ends on a beat', () => {
    expect(data.steps[0]).toMatchObject({ where: 'anvil', trigger: { type: 'reachDepth' } });
    expect(data.steps[data.steps.length - 1]).toMatchObject({ where: 'anvil', beat: true });
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    for (const s of data.steps.filter((x) => x.where === 'anvil' || x.where === 'training'))
      expect(tutorialBlocksDive(registry, { ...p, tutorial: st(s.id) }), s.id).toBe(
        s.trigger.type === 'reachDepth' ? null : LESSON_UNFINISHED,
      );
  });

  it('fills every line for every primary, before and after the bind', () => {
    for (const primary of MANA_TYPES) {
      const p = createDelveProfile(registry, 3, { primary });
      const bound = bindSecondary(registry, p, data.partners[primary]).profile;
      for (const s of data.steps)
        for (const q of [p, bound]) {
          const { line, objective } = tutorialText(registry, q, s.id);
          const text = [...line, ...objective].map((part) => ('text' in part ? part.text : ''));
          expect(text.join(''), s.id).not.toMatch(/[{}]/);
        }
    }
  });
});

describe('tutorialDataProblems on the order', () => {
  const step = (id: string, floor: string, stop?: TutorialStep['stop']): TutorialStep => ({
    id,
    where: stop ? 'stop' : 'floor',
    floor,
    line: id,
    objective: id,
    trigger: { type: 'clearFloor', count: 1 },
    ...(stop && { stop }),
  });
  const problems = (...steps: TutorialStep[]) =>
    tutorialDataProblems(
      new DataRegistry({ ...loadAndValidateData(), tutorial: { ...data, steps } }),
    );

  it('names a step back on an earlier floor, and a stop with both roads home and on, or neither', () => {
    expect(problems(step('a', 'd1-1'), step('b', 'd1-2'))).toEqual([]);
    expect(problems(step('a', 'd1-2'), step('b', 'd1-1'))).toEqual(['b: back to floor d1-1']);
    const stop = (doors: string[], extract: boolean) =>
      step('s', 'd1-1', { kinds: [], doors, extract });
    expect(problems(stop(['winding'], false))).toEqual([]);
    expect(problems(stop([], true))).toEqual([]);
    expect(problems(stop(['winding'], true))).toEqual(['s: doors or Extract, one of them']);
    expect(problems(stop([], false))).toEqual(['s: doors or Extract, one of them']);
  });
});

describe('the guided path', () => {
  it("dive 1's first floor: the floor's steps, then a stop of Equip alone, required, one door", () => {
    const p = startDive(
      registry,
      startTutorial(registry, createDelveProfile(registry, 7, { primary: 'fire' })),
      1,
    );
    expect(p.tutorial).toEqual(st('d1-walk'));
    const w = beginFloor(registry, p);
    expect(w.tutorialFloor).toBe('d1-1');
    w.pending.items.push(sword('uncommon', 'b1'));
    const stopped = completeFloor(registry, p, w).profile;
    expect(stopped.tutorial).toEqual(st('s1-equip'));
    expect(stopped.dive!.stop).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: true,
    });
    expect(stopped.dive!.doorChoices).toEqual(['winding']);
    const taken = takeStop(registry, stopped, { kind: 'equip', uid: 'b1' }).profile;
    expect(taken.tutorial).toEqual(st('s1-door'));
    const next = chooseDoor(registry, taken, 'winding');
    expect([next.tutorial, beginFloor(registry, next).tutorialFloor]).toEqual([
      st('d1-cast'),
      'd1-2',
    ]);
  });

  it('Anvil lesson 1, op by op: claim, forge, equip, bind, the Primary, salvage, refine, claim', () => {
    // The blade as the stop equips it: banked (uids), a sword's Strike in its two Primary slots.
    const strike = (uid: string, elements: Move['elements']): Move => ({
      uid,
      kind: 'medium',
      form: 'strike',
      elements,
    });
    let p = createDelveProfile(registry, 7, { primary: 'fire' });
    const old = p.equipped.weapon!;
    p = withChains(
      { ...p, equipped: { ...p.equipped, weapon: withUids(sword('uncommon', 'b1')) } },
      {
        primary: { moves: [strike('b1:p0', ['fire']), strike('b1:p1', ['fire'])], payment: 'mana' },
      },
    );
    p = applyQuestEvents(registry, p, [
      { type: 'reachDepth', depth: 3 },
      { type: 'extract', depth: 3 },
    ]);
    p = {
      ...p,
      bag: [old],
      links: 3,
      manaDust: 20,
      scrap: 500,
      runes: { chain: [1, 0, 0, 0, 0] },
      tutorial: st('l1-claim'),
    };
    expect(tutorialBlocksDive(registry, p)).toBe(LESSON_UNFINISHED);
    p = claimAll(p);
    expect(p.tutorial).toEqual(st('l1-forge'));
    const req = {
      baseId: 'cuirass',
      metal: 'rusty',
      flux: 'uncommon',
      element: 'fire',
      shards: [],
    };
    p = forge(registry, p, req as Parameters<typeof forge>[2]).profile;
    expect(p.tutorial).toEqual(st('l1-equip'));
    p = equipItem(registry, p, p.bag[p.bag.length - 1].uid);
    expect(p.tutorial).toEqual(st('l1-bind'));
    p = bindSecondary(registry, p, 'frost').profile;
    expect(p.tutorial).toEqual(st('l1-skills'));
    p = addSlot(registry, p, 'primary').profile;
    const [first, second, added] = (movesetOf(registry, p.equipped.weapon!).chains.primary as Chain)
      .moves;
    const primary = {
      moves: [
        { ...first, runes: [{ id: 'chain', tier: 1 }] },
        second,
        { ...added, elements: ['frost'] },
      ],
      payment: 'mana',
    } as Chain;
    const applied = setChains(registry, p, { primary });
    expect(applied.ok).toBe(true);
    p = applied.profile;
    expect(p.tutorial).toEqual(st('l1-salvage'));
    p = salvageItems(registry, p, [old.uid]).profile;
    expect(p.tutorial).toEqual(st('l1-refine'));
    p = claimAll(refine(registry, p, { kind: 'metal', metal: 'rusty' }).profile);
    expect(p.tutorial).toEqual(st('delve-2'));
    expect(tutorialBlocksDive(registry, p)).toBeNull();
  });

  it('Anvil lesson 2: the compare beat, Move all, hone, claim, the board, the Training Grounds, farewell', () => {
    // The blade as lesson 1 leaves it: its first construct socketed (what the Move all hold reads).
    const blade = withUids(sword('uncommon', 'b1'));
    const [first, ...rest] = blade.moveset!.chains.primary!.moves;
    blade.moveset!.chains.primary!.moves = [{ ...first, runes: [null] }, ...rest];
    const rare = withUids(sword('rare', 'r1'));
    let p = createDelveProfile(registry, 7, { primary: 'fire' });
    p = {
      ...p,
      equipped: { ...p.equipped, weapon: blade },
      bag: [rare],
      scrap: 500,
      tutorial: st('l2-compare'),
    };
    p = applyTutorialEvents(registry, p, [{ type: 'ack' }]);
    expect(p.tutorial).toEqual(st('l2-transfer'));
    p = moveAll(registry, p, 'r1').profile;
    expect(p.tutorial).toEqual(st('l2-hone'));
    // Every construct the blade held sits on the rare now, the socket with it.
    expect(movesetOf(registry, p.equipped.weapon!).chains.primary!.moves[0]).toMatchObject({
      uid: first.uid,
      runes: [null],
    });
    p = claimAll(hone(registry, p, 'r1', 0).profile);
    expect(p.tutorial).toEqual(st('l2-board'));
    p = applyTutorialEvents(registry, p, [{ type: 'ack' }]);
    expect([p.tutorial, tutorialBlocksDive(registry, p)]).toEqual([
      st('l2-train'),
      LESSON_UNFINISHED,
    ]);
    p = applyTutorialEvents(registry, p, [{ type: 'cast', slot: 1, step: 0, aimed: false }]);
    expect(p.tutorial).toEqual(st('l2-bye'));
    p = applyTutorialEvents(registry, p, [{ type: 'ack' }]);
    expect([p.tutorial, tutorialBlocksDive(registry, p)]).toEqual([null, null]);
  });
});
