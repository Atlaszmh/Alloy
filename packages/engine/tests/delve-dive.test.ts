import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import {
  startDepthOptions,
  startDive,
  beginFight,
  resolveFight,
  chooseDoor,
  extractDive,
  closeDive,
  drinkPotion,
  encounterKind,
  isBossDepth,
} from '../src/delve/dive.js';
import {
  createDelveProfile,
  equipItem,
  unequipSlot,
  equipBest,
  salvageItems,
  toggleLock,
  upgradeGear,
  reforgeGear,
  fuseGear,
  setAutoSalvage,
  parseDelveProfile,
  findItem,
  salvageCandidates,
} from '../src/delve/profile.js';
import type { DelveProfile, FightState } from '../src/types/delve.js';

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

function win(fight: FightState): FightState {
  fight.over = true;
  fight.winner = 'hero';
  fight.monsterHp = 0;
  return fight;
}

function lose(fight: FightState): FightState {
  fight.over = true;
  fight.winner = 'monster';
  fight.heroHp = 0;
  return fight;
}

/** Win every encounter in the current depth. */
function clearDepth(p: DelveProfile): DelveProfile {
  while (p.dive!.phase === 'fighting') {
    p = resolveFight(registry, p, win(beginFight(registry, p))).profile;
  }
  return p;
}

describe('profile basics', () => {
  it('starts with a rusty sword and cuirass', () => {
    const p = createDelveProfile(registry, 123);
    expect(p.equipped.weapon?.rarity).toBe('common');
    expect(p.equipped.weapon?.baseId).toBe('sword');
    expect(p.equipped.chest?.slot).toBe('chest');
    expect(p.bag).toHaveLength(0);
    expect(p.scrap).toBe(0);
    expect(p.dive).toBeNull();
  });

  it('round-trips through JSON and rejects garbage', () => {
    let p = createDelveProfile(registry, 1);
    p = startDive(registry, p, 1);
    const parsed = parseDelveProfile(JSON.parse(JSON.stringify(p)));
    expect(parsed).toEqual(p);
    expect(parseDelveProfile({ version: 1, nonsense: true })).toBeNull();
    expect(parseDelveProfile(null)).toBeNull();
  });
});

describe('dive lifecycle', () => {
  it('starts at depth 1 with potions and offers checkpoints', () => {
    let p = createDelveProfile(registry, 7);
    expect(startDepthOptions(registry, p)).toEqual([1]);
    p = startDive(registry, p, 1);
    expect(p.dive).toMatchObject({ depth: 1, encounterIndex: 0, potions: bal.dive.potions, phase: 'fighting', heroHpFrac: 1 });
    expect(p.diveCount).toBe(1);
    expect(p.stats.dives).toBe(1);
    expect(p.bestDepth).toBe(1);

    const withCheckpoint = { ...createDelveProfile(registry, 7), checkpoints: [5, 10] };
    expect(startDepthOptions(registry, withCheckpoint)).toEqual([1, 6, 11]);
    expect(() => startDive(registry, withCheckpoint, 3)).toThrow();
    expect(startDive(registry, withCheckpoint, 11).dive!.depth).toBe(11);
  });

  it('refuses to start a second dive', () => {
    const p = startDive(registry, createDelveProfile(registry, 7), 1);
    expect(() => startDive(registry, p, 1)).toThrow();
  });

  it('creates the same monster for the same dive state', () => {
    const p = startDive(registry, createDelveProfile(registry, 99), 1);
    expect(beginFight(registry, p).monster).toEqual(beginFight(registry, p).monster);
  });

  it('puts a boss at the end of every boss depth', () => {
    const p = startDive(registry, createDelveProfile(registry, 1), 1);
    expect(isBossDepth(registry, 5)).toBe(true);
    expect(isBossDepth(registry, 4)).toBe(false);
    const dive = { ...p.dive!, depth: 5, encounterIndex: bal.dive.fightsPerDepth - 1 };
    expect(encounterKind(registry, dive)).toBe('boss');
    expect(encounterKind(registry, { ...dive, encounterIndex: 0 })).not.toBe('boss');
  });

  it('advances encounters, drops loot into the bag, and counts kills', () => {
    let p = startDive(registry, createDelveProfile(registry, 5), 1);
    const res = resolveFight(registry, p, win(beginFight(registry, p)));
    p = res.profile;
    expect(res.outcome.victory).toBe(true);
    expect(p.dive!.encounterIndex).toBe(1);
    expect(p.dive!.kills).toBe(1);
    expect(p.stats.kills).toBe(1);
    expect(p.bag.length).toBe(res.outcome.drops.length);
    expect(res.outcome.scrap).toBeGreaterThan(0);
    expect(p.scrap).toBe(res.outcome.scrap);
  });

  it('clearing a depth grows the bounty and offers distinct doors', () => {
    let p = startDive(registry, createDelveProfile(registry, 5), 1);
    p = clearDepth(p);
    expect(p.dive!.phase).toBe('choosing');
    expect(p.dive!.bounty).toBeGreaterThan(0);
    expect(p.dive!.depthsCleared).toBe(1);
    expect(p.dive!.doorChoices).toHaveLength(bal.dive.doorsOffered);
    expect(new Set(p.dive!.doorChoices).size).toBe(bal.dive.doorsOffered);
  });

  it('doors move you deeper and apply their modifiers', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    const choosing = p;

    p = chooseDoor(registry, { ...choosing, dive: { ...choosing.dive!, doorChoices: ['winding', 'shrine', 'plunge'], heroHpFrac: 0.3 } }, 'shrine');
    expect(p.dive).toMatchObject({ depth: 2, encounterIndex: 0, phase: 'fighting', heroHpFrac: 1 });
    expect(p.dive!.potions).toBe(bal.dive.potions + 1);
    expect(p.dive!.door?.id).toBe('shrine');

    p = chooseDoor(registry, { ...choosing, dive: { ...choosing.dive!, doorChoices: ['plunge', 'swarm', 'winding'] } }, 'plunge');
    expect(p.dive!.depth).toBe(4);
    expect(p.bestDepth).toBe(4);

    p = chooseDoor(registry, { ...choosing, dive: { ...choosing.dive!, doorChoices: ['plunge', 'swarm', 'winding'] } }, 'swarm');
    expect(p.dive!.encountersInDepth).toBe(5);

    expect(() => chooseDoor(registry, { ...choosing, dive: { ...choosing.dive!, doorChoices: ['winding'] } }, 'shrine')).toThrow();
  });

  it('extracting pays the bounty', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    const bounty = p.dive!.bounty;
    const scrapBefore = p.scrap;
    p = extractDive(registry, p);
    expect(p.dive!.phase).toBe('extracted');
    expect(p.scrap).toBe(scrapBefore + bounty);
    expect(p.stats.extracts).toBe(1);
    p = closeDive(p);
    expect(p.dive).toBeNull();
  });

  it('dying forfeits the bounty but keeps the loot', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    p = chooseDoor(registry, p, p.dive!.doorChoices[0]);
    const bag = p.bag.length;
    const scrap = p.scrap;
    const res = resolveFight(registry, p, lose(beginFight(registry, p)));
    p = res.profile;
    expect(res.outcome.victory).toBe(false);
    expect(p.dive!.phase).toBe('dead');
    expect(p.scrap).toBe(scrap);
    expect(p.bag.length).toBe(bag);
    expect(p.stats.deaths).toBe(1);
  });

  it('the first boss ever drops a legendary, grants a checkpoint and a potion', () => {
    let p = startDive(registry, createDelveProfile(registry, 3), 1);
    p = { ...p, dive: { ...p.dive!, depth: 5, encounterIndex: bal.dive.fightsPerDepth - 1, potions: 0 } };
    const res = resolveFight(registry, p, win(beginFight(registry, p)));
    p = res.profile;
    expect(res.outcome.bossKilled).toBe(true);
    expect(res.outcome.drops.concat(res.outcome.salvaged)[0].rarity).toBe('legendary');
    expect(res.outcome.newCodex).toHaveLength(1);
    expect(Object.keys(p.codex)).toHaveLength(1);
    expect(p.checkpoints).toContain(5);
    expect(p.firstBossLegendaryGiven).toBe(true);
    expect(p.dive!.potions).toBe(bal.dive.bossPotionReward);
    expect(p.stats.bossKills).toBe(1);
  });

  it('auto-salvage turns chosen rarities into scrap', () => {
    let p = createDelveProfile(registry, 11);
    for (const r of ['common', 'uncommon', 'magic', 'rare', 'epic'] as const) p = setAutoSalvage(p, r, true);
    p = startDive(registry, p, 1);
    let salvaged = 0;
    for (let i = 0; i < 3; i++) {
      const res = resolveFight(registry, p, win(beginFight(registry, p)));
      p = res.profile;
      salvaged += res.outcome.salvaged.length;
      expect(res.outcome.drops.every((d) => d.rarity === 'legendary')).toBe(true);
    }
    expect(p.bag.every((i) => i.rarity === 'legendary')).toBe(true);
    expect(salvaged).toBeGreaterThanOrEqual(0);
  });

  it('salvages drops when the bag is full', () => {
    let p = createDelveProfile(registry, 13);
    const filler = Array.from({ length: bal.loot.bagSize }, (_, i) =>
      generateItem(registry, { uid: `f${i}`, ilvl: 1, rarity: 'common' }, new SeededRNG(i)),
    );
    p = startDive(registry, { ...p, bag: filler }, 1);
    let bagFull = false;
    for (let i = 0; i < 3 && p.dive!.phase === 'fighting'; i++) {
      const res = resolveFight(registry, p, win(beginFight(registry, p)));
      p = res.profile;
      if (res.outcome.salvaged.length > 0) bagFull = bagFull || res.outcome.bagFull;
    }
    expect(p.bag.length).toBe(bal.loot.bagSize);
    expect(bagFull).toBe(true);
  });

  it('potions heal between fights and run out', () => {
    let p = startDive(registry, createDelveProfile(registry, 2), 1);
    p = { ...p, dive: { ...p.dive!, heroHpFrac: 0.2, potions: 1 } };
    let res = drinkPotion(registry, p, null);
    expect(res.profile.dive!.heroHpFrac).toBeCloseTo(0.2 + bal.dive.potionHeal);
    expect(res.profile.dive!.potions).toBe(0);
    res = drinkPotion(registry, res.profile, null);
    expect(res.event).toBeNull();
  });

  it('potions heal mid-fight', () => {
    let p = startDive(registry, createDelveProfile(registry, 2), 1);
    const fight = beginFight(registry, p);
    fight.heroHp = 10;
    const res = drinkPotion(registry, p, fight);
    p = res.profile;
    expect(res.event).toMatchObject({ kind: 'heal', source: 'potion' });
    expect(fight.heroHp).toBeGreaterThan(10);
    expect(p.dive!.potions).toBe(bal.dive.potions - 1);
  });
});

describe('gear management', () => {
  function withBag(seed: number, rarity: 'common' | 'magic' | 'rare' = 'magic', n = 3): DelveProfile {
    const p = createDelveProfile(registry, seed);
    const bag = Array.from({ length: n }, (_, i) =>
      generateItem(registry, { uid: `b${i}`, ilvl: 6, rarity, slot: 'weapon', baseId: 'sword' }, new SeededRNG(seed + i)),
    );
    return { ...p, bag };
  }

  it('equip swaps the old item into the bag', () => {
    let p = withBag(1);
    const old = p.equipped.weapon!;
    p = equipItem(registry, p, 'b0');
    expect(p.equipped.weapon!.uid).toBe('b0');
    expect(p.bag.find((i) => i.uid === old.uid)).toBeDefined();
    expect(findItem(p, 'b0')?.where).toBe('equipped');
  });

  it('unequip moves the item into the bag', () => {
    let p = createDelveProfile(registry, 1);
    p = unequipSlot(registry, p, 'chest');
    expect(p.equipped.chest).toBeUndefined();
    expect(p.bag).toHaveLength(1);
  });

  it('equipBest picks upgrades', () => {
    const r = equipBest(registry, withBag(4));
    expect(r.equipped.length).toBeGreaterThan(0);
    expect(r.profile.equipped.weapon!.uid).not.toBe(createDelveProfile(registry, 4).equipped.weapon!.uid);
  });

  it('salvage grants scrap and skips locked items', () => {
    let p = withBag(2);
    p = toggleLock(p, 'b1');
    const r = salvageItems(registry, p, ['b0', 'b1']);
    expect(r.scrap).toBeGreaterThan(0);
    expect(r.profile.bag.map((i) => i.uid)).toEqual(['b1', 'b2']);
    expect(r.profile.scrap).toBe(r.scrap);
  });

  it('salvageCandidates only lists unlocked non-upgrades up to a rarity', () => {
    const p = toggleLock(withBag(3, 'common'), 'b2');
    const junk = salvageCandidates(registry, p, 'magic');
    expect(junk).not.toContain('b2');
  });

  it('upgrading costs scrap and fails when broke', () => {
    let p = createDelveProfile(registry, 3);
    const uid = p.equipped.weapon!.uid;
    let r = upgradeGear(registry, p, uid);
    expect(r.ok).toBe(false);
    p = { ...p, scrap: 10_000 };
    r = upgradeGear(registry, p, uid);
    expect(r.ok).toBe(true);
    expect(r.profile.equipped.weapon!.upgrade).toBe(1);
    expect(r.profile.scrap).toBeLessThan(10_000);
  });

  it('reforging is deterministic per profile and advances the forge counter', () => {
    const p = { ...withBag(8, 'rare'), scrap: 10_000 };
    const a = reforgeGear(registry, p, 'b0', 0);
    const b = reforgeGear(registry, p, 'b0', 0);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    expect(a.profile.forgeCount).toBe(p.forgeCount + 1);
  });

  it('fusion consumes three items and yields one of the next rarity', () => {
    const p = { ...withBag(9, 'magic'), scrap: 10_000 };
    const r = fuseGear(registry, p, ['b0', 'b1', 'b2']);
    expect(r.ok).toBe(true);
    expect(r.profile.bag).toHaveLength(1);
    expect(r.profile.bag[0].rarity).toBe('rare');
    expect(r.profile.stats.itemsFound.rare).toBe(1);
  });
});
