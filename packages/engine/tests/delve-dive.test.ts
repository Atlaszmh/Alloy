import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import {
  startDepthOptions,
  startDive,
  beginFloor,
  bankWorld,
  completeFloor,
  failFloor,
  chooseDoor,
  extractDive,
  closeDive,
  drinkPotionBetweenFloors,
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
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

function items(n: number, rarity: GearItem['rarity'] = 'magic', start = 500): GearItem[] {
  return Array.from({ length: n }, (_, i) =>
    generateItem(registry, { uid: `x${start + i}`, ilvl: 2, rarity }, new SeededRNG(start + i)),
  );
}

/** Kill everything on the floor and let the loot vacuum in. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  for (let i = 0; i < 150 && world.drops.length > 0; i++) stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
}

function clearDepth(p: DelveProfile): DelveProfile {
  const world = beginFloor(registry, p);
  clearFloor(world);
  return completeFloor(registry, p, world).profile;
}

describe('profile basics', () => {
  it('starts with a fire sword and an earth cuirass, and Fire abilities', () => {
    const p = createDelveProfile(registry, 123);
    expect(p.version).toBe(3);
    expect(p.equipped.weapon?.mana).toBe('fire');
    expect(p.equipped.chest?.mana).toBe('earth');
    expect(p.abilities.primary.elements).toEqual(['fire']);
    expect(p.bag).toHaveLength(0);
    expect(p.dive).toBeNull();
  });

  it('round-trips through JSON and rejects garbage and old saves', () => {
    let p = createDelveProfile(registry, 1);
    p = startDive(registry, p, 1);
    expect(parseDelveProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseDelveProfile({ ...p, version: 1 })).toBeNull();
    expect(parseDelveProfile(null)).toBeNull();
  });
});

describe('dive lifecycle', () => {
  it('starts at depth 1 with potions and offers checkpoints', () => {
    let p = createDelveProfile(registry, 7);
    expect(startDepthOptions(registry, p)).toEqual([1]);
    p = startDive(registry, p, 1);
    expect(p.dive).toMatchObject({ depth: 1, potions: bal.dive.potions, phase: 'fighting', heroHpFrac: 1 });
    expect(p.stats.dives).toBe(1);

    const withCheckpoint = { ...createDelveProfile(registry, 7), checkpoints: [5, 10] };
    expect(startDepthOptions(registry, withCheckpoint)).toEqual([1, 6, 11]);
    expect(() => startDive(registry, withCheckpoint, 3)).toThrow();
    expect(() => startDive(registry, startDive(registry, withCheckpoint, 1), 1)).toThrow();
  });

  it('builds the same floor for the same dive state', () => {
    const p = startDive(registry, createDelveProfile(registry, 99), 1);
    const a = beginFloor(registry, p);
    const b = beginFloor(registry, p);
    expect(a.monsters.map((m) => [m.defId, m.x, m.y])).toEqual(b.monsters.map((m) => [m.defId, m.x, m.y]));
    expect(isBossDepth(registry, 5)).toBe(true);
  });

  it('banking moves pickups, scrap, kills and reactions into the profile', () => {
    const p = startDive(registry, createDelveProfile(registry, 5), 1);
    const world = beginFloor(registry, p);
    world.pending = { items: items(2), scrap: 40, kills: 6, reactions: ['melt'] };
    const res = bankWorld(registry, p, world);
    expect(res.kept).toHaveLength(2);
    expect(res.newReactions).toEqual(['melt']);
    expect(res.profile.bag).toHaveLength(2);
    expect(res.profile.scrap).toBe(40);
    expect(res.profile.stats.kills).toBe(6);
    expect(res.profile.reactionsSeen).toEqual(['melt']);
    expect(res.profile.dive!.kills).toBe(6);
    expect(res.profile.dive!.found.magic).toBe(2);
    expect(world.pending.items).toHaveLength(0);
    expect(bankWorld(registry, res.profile, world).newReactions).toEqual([]);
  });

  it('completing a floor pays bounty, heals, and offers distinct doors', () => {
    let p = startDive(registry, createDelveProfile(registry, 5), 1);
    p = clearDepth(p);
    expect(p.dive!.phase).toBe('choosing');
    expect(p.dive!.bounty).toBeGreaterThan(0);
    expect(p.dive!.depthsCleared).toBe(1);
    expect(p.dive!.doorChoices).toHaveLength(bal.dive.doorsOffered);
    expect(new Set(p.dive!.doorChoices).size).toBe(bal.dive.doorsOffered);
    expect(p.stats.kills).toBeGreaterThan(0);
  });

  it('doors move you deeper and apply their modifiers', () => {
    const choosing = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    const offer = (ids: string[]) => ({ ...choosing, dive: { ...choosing.dive!, doorChoices: ids, heroHpFrac: 0.3 } });

    let p = chooseDoor(registry, offer(['winding', 'shrine', 'plunge']), 'shrine');
    expect(p.dive).toMatchObject({ depth: 2, phase: 'fighting', heroHpFrac: 1 });
    expect(p.dive!.potions).toBe(bal.dive.potions + 1);

    p = chooseDoor(registry, offer(['plunge', 'swarm', 'winding']), 'plunge');
    expect(p.dive!.depth).toBe(4);
    expect(p.bestDepth).toBe(4);

    const swarm = chooseDoor(registry, offer(['plunge', 'swarm', 'winding']), 'swarm');
    const normal = chooseDoor(registry, offer(['plunge', 'swarm', 'winding']), 'winding');
    expect(beginFloor(registry, swarm).monsters.length).toBeGreaterThan(beginFloor(registry, normal).monsters.length);

    expect(() => chooseDoor(registry, offer(['winding']), 'shrine')).toThrow();
  });

  it('extracting pays the bounty', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    const bounty = p.dive!.bounty;
    const scrap = p.scrap;
    p = extractDive(registry, p);
    expect(p.dive!.phase).toBe('extracted');
    expect(p.scrap).toBe(scrap + bounty);
    expect(p.stats.extracts).toBe(1);
    expect(closeDive(p).dive).toBeNull();
  });

  it('dying forfeits the bounty but keeps what was picked up', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 5), 1));
    p = chooseDoor(registry, p, p.dive!.doorChoices[0]);
    const scrap = p.scrap;
    const world = beginFloor(registry, p);
    world.pending.items = items(1);
    world.heroDead = true;
    const res = failFloor(registry, p, world);
    expect(res.profile.dive!.phase).toBe('dead');
    expect(res.profile.scrap).toBe(scrap);
    expect(res.profile.bag).toHaveLength(p.bag.length + 1);
    expect(res.profile.stats.deaths).toBe(1);
  });

  it('the first boss ever drops a legendary, grants a checkpoint and a potion', () => {
    let p = startDive(registry, createDelveProfile(registry, 3), 1);
    p = { ...p, dive: { ...p.dive!, depth: 5, potions: 0 } };
    const world = beginFloor(registry, p);
    expect(world.monsters.some((m) => m.kind === 'boss')).toBe(true);
    clearFloor(world);
    const res = completeFloor(registry, p, world);
    expect(res.bossKilled).toBe(true);
    expect([...res.kept, ...res.salvaged].some((i) => i.rarity === 'legendary')).toBe(true);
    expect(res.newCodex).toHaveLength(1);
    expect(res.profile.checkpoints).toContain(5);
    expect(res.profile.firstBossLegendaryGiven).toBe(true);
    expect(res.profile.dive!.potions).toBe(bal.dive.bossPotionReward);
    expect(res.profile.stats.bossKills).toBe(1);
  });

  it('auto-salvage and a full bag turn pickups into scrap', () => {
    let p = createDelveProfile(registry, 11);
    p = setAutoSalvage(p, 'magic', true);
    p = startDive(registry, p, 1);
    const world = beginFloor(registry, p);
    world.pending.items = items(3, 'magic');
    const res = bankWorld(registry, p, world);
    expect(res.salvaged).toHaveLength(3);
    expect(res.profile.bag).toHaveLength(0);

    const full = { ...startDive(registry, createDelveProfile(registry, 12), 1), bag: items(bal.loot.bagSize, 'common', 900) };
    const w2 = beginFloor(registry, full);
    w2.pending.items = items(2, 'rare');
    const res2 = bankWorld(registry, full, w2);
    expect(res2.bagFull).toBe(true);
    expect(res2.profile.bag).toHaveLength(bal.loot.bagSize);
  });

  it('potions heal between floors and run out', () => {
    let p = clearDepth(startDive(registry, createDelveProfile(registry, 2), 1));
    p = { ...p, dive: { ...p.dive!, heroHpFrac: 0.2, potions: 1 } };
    const healed = drinkPotionBetweenFloors(registry, p)!;
    expect(healed.dive!.heroHpFrac).toBeCloseTo(0.2 + bal.dive.potionHeal);
    expect(healed.dive!.potions).toBe(0);
    expect(drinkPotionBetweenFloors(registry, healed)).toBeNull();
  });
});

describe('gear management', () => {
  function withBag(seed: number, rarity: GearItem['rarity'] = 'magic', n = 3): DelveProfile {
    const p = createDelveProfile(registry, seed);
    const bag = Array.from({ length: n }, (_, i) =>
      generateItem(
        registry,
        { uid: `b${i}`, ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
        new SeededRNG(seed + i),
      ),
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

  it('attunement from new gear grows the mana pool of the next floor', () => {
    let p = createDelveProfile(registry, 4);
    const before = beginFloor(registry, startDive(registry, p, 1)).hero.manaMax;
    const ring = generateItem(registry, { uid: 'fr', ilvl: 1, rarity: 'common', slot: 'ring', mana: 'frost' }, new SeededRNG(1));
    p = equipItem(registry, { ...p, bag: [ring] }, 'fr');
    expect(beginFloor(registry, startDive(registry, p, 1)).hero.manaMax).toBeGreaterThan(before);
  });

  it('unequip moves the item into the bag; the floor still has all three abilities', () => {
    let p = createDelveProfile(registry, 1);
    p = unequipSlot(registry, p, 'chest');
    expect(p.equipped.chest).toBeUndefined();
    expect(p.bag).toHaveLength(1);
    p = startDive(registry, p, 1);
    expect(beginFloor(registry, p).hero.abilities.map((a) => a.name)).toEqual(['Fire Bolt', 'Frost Ward', 'Fire Nova']);
  });

  it('equipBest picks upgrades', () => {
    const r = equipBest(registry, withBag(4));
    expect(r.equipped.length).toBeGreaterThan(0);
  });

  it('salvage grants scrap and skips locked items', () => {
    let p = withBag(2);
    p = toggleLock(p, 'b1');
    const r = salvageItems(registry, p, ['b0', 'b1']);
    expect(r.scrap).toBeGreaterThan(0);
    expect(r.profile.bag.map((i) => i.uid)).toEqual(['b1', 'b2']);
  });

  it('salvageCandidates skips locked items', () => {
    const p = toggleLock(withBag(3, 'common'), 'b2');
    expect(salvageCandidates(registry, p, 'magic')).not.toContain('b2');
  });

  it('upgrading costs scrap and fails when broke', () => {
    let p = createDelveProfile(registry, 3);
    const uid = p.equipped.weapon!.uid;
    expect(upgradeGear(registry, p, uid).ok).toBe(false);
    p = { ...p, scrap: 10_000 };
    const r = upgradeGear(registry, p, uid);
    expect(r.ok).toBe(true);
    expect(r.profile.equipped.weapon!.upgrade).toBe(1);
  });

  it('reforging is deterministic per profile and advances the forge counter', () => {
    const p = { ...withBag(8, 'rare'), scrap: 10_000 };
    const a = reforgeGear(registry, p, 'b0', 0);
    expect(a).toEqual(reforgeGear(registry, p, 'b0', 0));
    expect(a.ok).toBe(true);
    expect(a.profile.forgeCount).toBe(p.forgeCount + 1);
  });

  it('fusion consumes three items and yields one of the next rarity, keeping a mana type', () => {
    const p = { ...withBag(9, 'magic'), scrap: 10_000 };
    const r = fuseGear(registry, p, ['b0', 'b1', 'b2']);
    expect(r.ok).toBe(true);
    expect(r.profile.bag).toHaveLength(1);
    expect(r.profile.bag[0].rarity).toBe('rare');
    expect(r.profile.bag[0].mana).toBe('fire');
  });
});
