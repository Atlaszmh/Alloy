import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { worldTutorialEvents } from '../src/arpg/tutorial.js';
import { createMonsterEntity } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { addSlot } from '../src/delve/moveset.js';
import { addLootToBag, createDelveProfile, equipItem } from '../src/delve/profile.js';
import { startTutorial, tutorialSkippable, tutorialText } from '../src/delve/tutorial.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import { TUTORIAL_INPUTS } from '../src/types/tutorial.js';

// The guided start's whole-feature review: each finding's fix.

const registry = createDefaultRegistry();
const fresh = (primary: 'fire' | 'frost' = 'fire') => createDelveProfile(registry, 7, { primary });

describe('auto-salvage waits for the tutorial', () => {
  it('keeps an uncommon set drop with uncommon auto-salvage on, while the tutorial runs', () => {
    const on = fresh();
    const p = { ...on, autoSalvage: { ...on.autoSalvage, uncommon: true } };
    const blade = generateItem(
      registry,
      { uid: 'gB', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    // Banked, the blade's constructs take their uids: the item is the same but for those.
    expect(addLootToBag(registry, startTutorial(registry, p), [blade]).kept.map((i) => i.uid)).toEqual(['gB']);
    expect(addLootToBag(registry, p, [blade]).salvaged.map((i) => i.uid)).toEqual(['gB']);
  });
});

describe('no legendary gear below essenceMinDepth', () => {
  const data = loadAndValidateData();
  const loot = data.balance.delve.loot;
  // Luck so high a boss's roll is all but always legendary where it may be.
  const lucky = new DataRegistry({
    ...data,
    balance: {
      ...data.balance,
      delve: { ...data.balance.delve, loot: { ...loot, bossLuck: 1000 } },
    },
  });
  const roll = (depth: number, seed: number) =>
    rollEncounterDrops(
      lucky,
      { depth, kind: 'boss', gear: 1, nextUid: 1, pair: ['fire'] },
      new SeededRNG(seed),
    ).items.map((i) => i.rarity);
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

  it('a depth-5 boss with huge luck rolls epic at most; from depth 20 a legendary again', () => {
    expect(seeds.flatMap((s) => roll(5, s)).filter((r) => r === 'legendary')).toEqual([]);
    expect(seeds.flatMap((s) => roll(5, s)).filter((r) => r === 'epic').length).toBeGreaterThan(0);
    expect(seeds.flatMap((s) => roll(20, s))).toContain('legendary');
  });
});

/** An uncommon fire sword whose Primary holds `elements`' moves, the first socketed with a rune. */
function blade(elements: ManaType[][], rune = true): GearItem {
  const item = generateItem(
    registry,
    { uid: 'gBlade', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );
  const ms = defaultMoveset(registry, item, 'fire', { primary: elements.length });
  ms.chains.primary!.moves.forEach((m, i) => (m.elements = elements[i]));
  if (rune) ms.chains.primary!.moves[0].runes = [{ id: 'quick', tier: 1 }];
  return { ...item, moveset: ms };
}

/** A lesson's profile: fire and frost bound, well off, at step `step`. */
const atStep = (step: string, p = fresh()): DelveProfile => ({
  ...p,
  pair: { primary: 'fire', secondary: 'frost' },
  links: 5,
  scrap: 500,
  manaDust: 50,
  tutorial: { step, count: 0, misses: 0 },
});

describe('impossible Anvil steps offer "Skip this step"', () => {
  it('the Skills step unarmed, but not with a sword whose Primary can grow to the lesson (the common one starts with two slots)', () => {
    const p = { ...atStep('l1-skills'), runes: { quick: [1, 0, 0, 0, 0] } };
    expect(p.equipped.weapon!.rarity).toBe('common');
    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(false);
    const unarmed = { ...p, equipped: { ...p.equipped, weapon: null } };
    expect(tutorialSkippable(registry, unarmed, p.tutorial!)).toBe(true);
    const armed = { ...p, equipped: { ...p.equipped, weapon: blade([['fire'], ['fire']]) } };
    expect(tutorialSkippable(registry, armed, p.tutorial!)).toBe(false);
  });

  it('the cuirass equip with none owned and no forge to pay for, but not while one can be forged', () => {
    const p = atStep('l1-equip');
    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(false);
    const broke = { ...p, scrap: 0 };
    expect(tutorialSkippable(registry, broke, p.tutorial!)).toBe(true);
  });
});

describe('the Move all step', () => {
  const rare = (primary?: number) => {
    const item = generateItem(
      registry,
      { uid: 'gRare', ilvl: 5, rarity: 'rare', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    return { ...item, moveset: defaultMoveset(registry, item, 'fire', primary ? { primary } : {}) };
  };
  it('a plain Equip of the rare leaves it current; the rare worn holding more than its start completes it (B2 fills Move all; D1 rewires)', () => {
    const p = {
      ...atStep('l2-transfer'),
      equipped: { ...fresh().equipped, weapon: blade([['fire'], ['fire'], ['frost']]) },
      bag: [rare()],
    };
    expect(equipItem(registry, p, 'gRare').tutorial!.step).toBe('l2-transfer');
    const moved = equipItem(registry, { ...p, bag: [rare(4)] }, 'gRare');
    expect(moved.tutorial!.step).not.toBe('l2-transfer');
  });
});

describe('addSlot checks the tutorial', () => {
  it("completes the Skills step when the new slot is the lesson's last move", () => {
    const old = fresh().equipped.weapon!;
    const p = {
      ...atStep('l1-skills'),
      equipped: { ...fresh().equipped, weapon: blade([['fire'], ['frost']]) },
      bag: [old],
    };
    const res = addSlot(registry, p, 'primary');
    expect(res.ok).toBe(true);
    expect(res.profile.tutorial!.step).toBe('l1-salvage');
  });
});

describe('a floor step that needs foes, once they are all dead', () => {
  /** Dive 2's first floor at step `step` (its own step names it). */
  const floorAt = (step: string) => {
    const start = startDive(registry, startTutorial(registry, fresh()), 1);
    const p = { ...atStep(step, start), dive: start.dive };
    return { p, w: beginFloor(registry, p) };
  };
  const killAll = (w: ArpgWorld) => {
    for (const m of [...w.monsters]) killMonster(makeCtx(registry, w, []), m);
    stepWorld(registry, w, { move: { x: 0, y: 0 } }, registry.getDelveBalance().arena.step);
  };

  it('d2-pips offers Skip this step after its seconds, as d2-five does', () => {
    const steps = registry.getTutorialData().steps;
    expect(steps.find((s) => s.id === 'd2-pips')!.skipAfter).toBeGreaterThan(0);
  });

  it('offers Skip this step with every foe dead and no reaction set off, and the skip goes', () => {
    const { p, w } = floorAt('d2-pips');
    expect(w.tutorialFloor).toBe('d2-1');
    expect(tutorialSkippable(registry, p, w.tutorial!, w)).toBe(false);
    killAll(w);
    expect(w.tutorial!.step).toBe('d2-pips');
    expect(tutorialSkippable(registry, p, w.tutorial!, w)).toBe(true);
    worldTutorialEvents(registry, w, [{ type: 'skipStep' }]);
    expect(w.tutorial!.step).not.toBe('d2-pips');
  });
});

describe("a scripted boss's summons", () => {
  it("Grask's diggers take his spawn's life and damage multipliers", () => {
    const start = startDive(registry, startTutorial(registry, fresh()), 1);
    const p = { ...atStep('d2-grask', start), dive: { ...start.dive!, depth: 5 } };
    const w = beginFloor(registry, p);
    const grask = w.monsters.find((m) => m.kind === 'boss')!;
    const spawn = registry
      .getTutorialData()
      .floors.find((f) => f.id === 'd2-5')!
      .spawns.find((s) => s.id === grask.spawnId)!;
    expect(spawn.hpMult).toBeLessThan(1);
    Object.assign(grask, { aggro: true, nextSpecialAt: 0, windupUntil: 0 });
    // The special's roll on its summons (the third), then the summons' own draws as they come.
    const nextInt = w.rng.nextInt.bind(w.rng);
    let first = true;
    w.rng.nextInt = (lo: number, hi: number) => (first ? ((first = false), 2) : nextInt(lo, hi));
    const before = new Set(w.monsters.map((m) => m.id));
    stepWorld(registry, w, { move: { x: 0, y: 0 } }, registry.getDelveBalance().arena.step);
    const adds = w.monsters.filter((m) => !before.has(m.id));
    expect(adds.length).toBe(2);
    for (const add of adds) {
      const def = registry.getBiomeForDepth(5).monsters.find((d) => d.id === add.defId)!;
      const plain = (mult: number | undefined, dmg: number | undefined) =>
        createMonsterEntity(
          registry,
          {
            id: 0,
            def,
            kind: 'normal',
            depth: 5,
            door: w.door,
            element: w.element,
            x: 0,
            y: 0,
            packId: 0,
            hpMult: mult,
            damageMult: dmg,
          },
          new SeededRNG(1),
        );
      const scaled = plain(spawn.hpMult, spawn.damageMult);
      expect([add.maxHp, add.damage]).toEqual([scaled.maxHp, scaled.damage]);
    }
  });
});

describe("every step's text, for every pair", () => {
  const steps = registry.getTutorialData().steps;
  const pairs = MANA_TYPES.flatMap((p) => [
    [p, null] as const,
    ...MANA_TYPES.filter((s) => s !== p).map((s) => [p, s] as const),
  ]);

  it.each(pairs)('%s with %s: every token filled, every input one the client draws', (p, s) => {
    const armed = {
      ...fresh(p),
      pair: { primary: p, secondary: s },
      equipped: { ...fresh(p).equipped, weapon: blade([[p], [p]]) },
    };
    const bad: string[] = [];
    for (const step of steps) {
      const text = tutorialText(registry, armed, step.id);
      for (const part of [...text.line, ...text.objective]) {
        if ('input' in part) {
          if (!(TUTORIAL_INPUTS as readonly string[]).includes(part.input))
            bad.push(`${step.id}: input ${part.input}`);
        } else if (/[{}]|undefined|null|NaN| {2}/.test(part.text))
          bad.push(`${step.id}: "${part.text}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(MANA_TYPES)("%s: on the floor, {primarySkill} names the Primary's next move", (p) => {
    const start = startDive(registry, startTutorial(registry, fresh(p)), 1);
    const armed = {
      ...start,
      equipped: { ...start.equipped, weapon: blade([[p], [p]]) },
      tutorial: { step: 'd1-cast', count: 0, misses: 0 },
      dive: { ...start.dive!, depth: 2 },
    };
    const w = beginFloor(registry, armed);
    const [part] = tutorialText(registry, armed, 'd1-cast', w).line;
    expect(part).toEqual({ text: expect.stringMatching(/carries \S+ \S+\. /) });
  });
});
