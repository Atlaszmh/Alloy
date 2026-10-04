import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { addLootToBag, createDelveProfile } from '../src/delve/profile.js';
import { startTutorial, tutorialSkippable } from '../src/delve/tutorial.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';

// The guided start's whole-feature review: each finding's fix.

const registry = createDefaultRegistry();
const fresh = (primary: 'fire' | 'frost' = 'fire') =>
  createDelveProfile(registry, 7, { primary });

describe('auto-salvage waits for the tutorial', () => {
  it('keeps an uncommon set drop with uncommon auto-salvage on, while the tutorial runs', () => {
    const on = fresh();
    const p = { ...on, autoSalvage: { ...on.autoSalvage, uncommon: true } };
    const blade = generateItem(
      registry,
      { uid: 'gB', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    expect(addLootToBag(registry, startTutorial(registry, p), [blade]).kept).toEqual([blade]);
    expect(addLootToBag(registry, p, [blade]).salvaged).toEqual([blade]);
  });
});

describe('no legendary gear below essenceMinDepth', () => {
  const data = loadAndValidateData();
  const loot = data.balance.delve.loot;
  // Luck so high a boss's roll is all but always legendary where it may be.
  const lucky = new DataRegistry({
    ...data,
    balance: { ...data.balance, delve: { ...data.balance.delve, loot: { ...loot, bossLuck: 1000 } } },
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
  it('the Skills step with a weapon that carries no Primary, or none at all', () => {
    const p = { ...atStep('l1-skills'), runes: { quick: [1, 0, 0, 0, 0] } };
    expect(p.equipped.weapon!.rarity).toBe('common');
    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(true);
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
