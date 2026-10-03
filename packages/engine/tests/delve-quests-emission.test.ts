import { describe, it, expect } from 'vitest';
import {
  BASIC_STATUS,
  applyStatus,
  hitMonster,
  hurtHero,
  killMonster,
  makeCtx,
} from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { forge, refine } from '../src/delve/crafting.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDive,
} from '../src/delve/dive.js';
import { setChains } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, salvageItems } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import { openSocket } from '../src/delve/runes.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { ForgeRequest } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { QuestEvent } from '../src/types/quests.js';
import { STEP, arena, chainsOf, dodge, dummy, registry, run } from './fixtures/arena.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';

// Where quest events come from (see the quests spec's "Quest events (the engine)").

const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);
/** Set off fire + frost's reaction on the world's first foe. */
function react(w: ArpgWorld): void {
  const ctx = ctxOf(w);
  applyStatus(ctx, w.monsters[0], BASIC_STATUS.fire, 100, true);
  hitMonster(ctx, w.monsters[0], 10, 'frost', { source: 'skill' });
}

describe('quest events in the arena', () => {
  it("a kill carries the foe's kind, biome and element; a boss's carries nothing", () => {
    const w = arena([
      dummy(13, 20),
      dummy(15, 20, { kind: 'elite', element: 'frost' }),
      dummy(17, 20, { kind: 'boss' }),
    ]);
    for (const m of [...w.monsters]) killMonster(ctxOf(w), m);
    expect(w.pending.questEvents).toEqual([
      { type: 'kill', kind: 'normal', biome: w.biomeId, element: 'fire' },
      { type: 'kill', kind: 'elite', biome: w.biomeId, element: 'frost' },
    ]);
  });

  it('a reaction and a perfect dodge each add one', () => {
    const w = arena([dummy(13, 20)], { noBasic: true });
    react(w);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([
      { type: 'reaction', reaction: registry.getReactionFor('fire', 'frost').id },
      { type: 'perfectDodge' },
    ]);
  });

  it('the floor flags: damage taken (not a dodged hit) and a potion drunk', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([false, false]);
    run(w, 1);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([true, false]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, potion: true }, STEP);
    expect(w.potionDrunk).toBe(true);
  });

  it('the Training Grounds add none', () => {
    const w = arena([dummy(13, 20), dummy(15, 20)], { noBasic: true });
    w.sandbox = { infiniteMana: false, noCooldowns: false, invulnerable: false };
    react(w);
    killMonster(ctxOf(w), w.monsters[1]);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([]);
  });
});

describe('quest events in a dive', () => {
  const PERFECT: QuestEvent = { type: 'perfectDodge' };
  const BOSS_DEPTH = registry.getDelveBalance().dive.bossEvery;
  const reg = questRegistry([
    quest('kills', [obj('kill', 99)]),
    quest('floors', [obj('clearFloor', 99)]),
    quest('clean', [obj('clearFloor', 99, { filter: { noPotion: true, noDamage: true } })]),
    quest('dry', [obj('clearFloor', 99, { filter: { noPotion: true } })]),
    quest('boss', [
      obj('boss', 99, { filter: { biome: registry.getBiomeForDepth(BOSS_DEPTH).id } }),
    ]),
    quest('depth', [obj('reachDepth', 99, { scope: 'dive' })]),
    quest('out', [obj('extract', 99, { filter: { minDepth: 2 } })]),
    quest('dodges', [obj('perfectDodge', 3, { scope: 'dive' })]),
    quest('dodge', [obj('perfectDodge', 1, { scope: 'dive' })]),
  ]);
  const diving = () => startDive(reg, createDelveProfile(reg, 4, { primary: 'fire' }), 1);
  /** Kill the floor's first `n` foes, banking after each kill or only once, then fall. */
  function killThenFall(p: DelveProfile, n: number, bankEach: boolean): DelveProfile {
    const w = beginFloor(reg, p);
    let q = p;
    for (const m of w.monsters.slice(0, n)) {
      killMonster(makeCtx(reg, w, []), m);
      if (bankEach) q = bankWorld(reg, q, w).profile;
    }
    return failFloor(reg, q, w).profile;
  }
  /** Clear the floor, then take the first door. */
  function nextFloor(p: DelveProfile, flags: Partial<ArpgWorld> = {}): DelveProfile {
    const w = Object.assign(beginFloor(reg, p), flags);
    const cleared = completeFloor(reg, p, w).profile;
    return chooseDoor(reg, cleared, cleared.dive!.doorChoices[0]);
  }

  it("a bank applies the world's quest events and empties them", () => {
    const p = diving();
    const w = beginFloor(reg, p);
    killMonster(makeCtx(reg, w, []), w.monsters[0]);
    w.pending.questEvents.push(PERFECT);
    const banked = bankWorld(reg, p, w).profile;
    expect([value(banked, 'kills'), value(banked, 'dodges')]).toEqual([1, 1]);
    expect(w.pending.questEvents).toEqual([]);
    expect(bankWorld(reg, banked, w).profile.quests).toEqual(banked.quests);
  });

  it('progress counts even when the hero falls, whenever the world banks', () => {
    const once = killThenFall(diving(), 3, false);
    const each = killThenFall(diving(), 3, true);
    expect(once.dive!.phase).toBe('dead');
    expect([value(once, 'kills'), value(each, 'kills')]).toEqual([3, 3]);
    expect(each.quests).toEqual(once.quests);
  });

  it('a cleared floor counts with its flags: a potion or a hit spoils it for noPotion / noDamage', () => {
    let p = nextFloor(diving());
    p = nextFloor(p, { hurt: true });
    p = nextFloor(p, { potionDrunk: true });
    expect(['floors', 'clean', 'dry'].map((id) => value(p, id))).toEqual([3, 1, 2]);
  });

  it("a boss counts once, when its floor completes: a replayed floor's boss doesn't double it", () => {
    const p0 = diving();
    const p = { ...p0, dive: { ...p0.dive!, depth: BOSS_DEPTH } };
    // The boss falls, the world banks, and the hero leaves for the Anvil: the floor replays.
    const first = beginFloor(reg, p);
    killMonster(makeCtx(reg, first, []), first.monsters.find((m) => m.kind === 'boss')!);
    const left = bankWorld(reg, p, first).profile;
    expect(value(left, 'boss')).toBe(0);
    const replay = beginFloor(reg, left);
    killMonster(makeCtx(reg, replay, []), replay.monsters.find((m) => m.kind === 'boss')!);
    const won = completeFloor(reg, left, replay).profile;
    expect([value(won, 'boss'), value(won, 'kills')]).toEqual([1, 0]);
  });

  it('a dive enters its first depth, each door the next; an extract counts with its depth', () => {
    let p = diving();
    expect(value(p, 'depth')).toBe(1);
    p = nextFloor(p);
    expect(value(p, 'depth')).toBe(p.dive!.depth);
    const w = beginFloor(reg, p);
    const out = extractDive(reg, completeFloor(reg, p, w).profile);
    expect(value(out, 'out')).toBe(1);
  });

  it('dive-scoped progress starts afresh when a dive starts and when it settles; a done one stays', () => {
    let p = applyQuestEvents(reg, createDelveProfile(reg, 4, { primary: 'fire' }), [PERFECT]);
    expect([value(p, 'dodges'), value(p, 'dodge')]).toEqual([1, 1]);
    p = startDive(reg, p, 1);
    expect([value(p, 'dodges'), value(p, 'dodge')]).toEqual([0, 1]);
    const w = beginFloor(reg, p);
    w.pending.questEvents.push(PERFECT, PERFECT);
    p = bankWorld(reg, p, w).profile;
    expect(value(p, 'dodges')).toBe(2);
    p = closeDive(reg, p);
    expect([value(p, 'dodges'), value(p, 'depth'), value(p, 'dodge')]).toEqual([0, 0, 1]);
  });
});

describe('quest events at the Anvil', () => {
  const reg = questRegistry([
    quest('forged', [obj('forge', 99)]),
    quest('fine', [obj('forge', 99, { filter: { minRarity: 'uncommon' } })]),
    quest('legend', [obj('forge', 99, { filter: { legendary: true } })]),
    quest('refined', [obj('refine', 99)]),
    quest('bound', [obj('bind', 1)]),
    quest('sockets', [obj('openSocket', 99)]),
    quest('patterns', [obj('knowPatterns', 99)]),
  ]);
  const smith = () => ({
    ...createDelveProfile(reg, 3, { primary: 'fire' }),
    scrap: 9999,
    links: 99,
  });

  it('a forge counts with its rarity, a refine each time', () => {
    const req: ForgeRequest = {
      baseId: 'sword',
      metal: 'rusty',
      flux: 'uncommon',
      element: 'fire',
      shards: [],
    };
    const res = forge(reg, smith(), req);
    expect(res.item!.rarity).toBe('uncommon');
    const p = refine(reg, res.profile, { kind: 'flux', grade: 'uncommon' }).profile;
    expect(['forged', 'fine', 'legend', 'refined'].map((id) => value(p, id))).toEqual([1, 1, 0, 1]);
  });

  it('a bind counts at once', () => {
    expect(value(bindSecondary(reg, smith(), 'frost').profile, 'bound')).toBe(1);
  });

  it("each socket an Apply opens counts once, openSocket's one too", () => {
    const p = smith();
    const basic = chainsOf(p).basic!;
    const opened = setChains(reg, p, { basic: basic.map((b) => ({ ...b, runes: [null] })) });
    expect(opened.ok).toBe(true);
    expect(value(opened.profile, 'sockets')).toBe(basic.length);
    expect(value(openSocket(reg, p, 'primary', 0).profile, 'sockets')).toBe(1);
  });

  it('a pattern learned by salvage counts at once', () => {
    const axe = generateItem(
      reg,
      { uid: 'b0', ilvl: 1, rarity: 'common', slot: 'weapon', baseId: 'axe', mana: 'fire' },
      new SeededRNG(1),
    );
    const p = smith();
    const melted = salvageItems(reg, { ...p, bag: [axe] }, ['b0']).profile;
    expect(melted.patterns).toContain('axe');
    expect(value(melted, 'patterns')).toBe(p.patterns.length + 1);
  });
});
