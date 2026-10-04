import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { forge, hone, refine } from '../src/delve/crafting.js';
import { pairElements } from '../src/delve/hero-stats.js';
import { addSlot, setChains, transferMoveset } from '../src/delve/moveset.js';
import { bindSecondary, profileStats } from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipItem,
  salvageItems,
  type ProfileActionResult,
} from '../src/delve/profile.js';
import { addMaterial, emptyHaul, stockHaul } from '../src/loot/materials.js';
import { heroChains, movesetOf } from '../src/loot/moveset.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { Haul } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';

// See the tutorial spec: the Anvil lessons paid from the starter kit and the set drops alone (the
// eight hand-built floors' gear and rune as the engine drops them).

const registry = createDefaultRegistry();
const data = registry.getTutorialData();

/** Hand-built floor `id` for `p`, as `beginFloor` builds a guided depth (no door), at `hp` and `potions`. */
function world(p: DelveProfile, id: string, hp = 1, potions = 3, skills = true): ArpgWorld {
  const stats = profileStats(registry, p);
  return createFloorWorld(registry, {
    depth: data.floors.find((f) => f.id === id)!.depth,
    door: null,
    stats,
    chains: skills ? heroChains(registry, p.equipped, p.pair) : {},
    heroHpFrac: hp,
    potions,
    phoenixAvailable: true,
    seed: 4242,
    layout: 'generated',
    tutorial: { floor: id, state: { step: 'any', count: 0, misses: 0 } },
    loot: {
      nextUid: p.nextUid,
      find: stats.magicFind,
      legendaryBoost: 1,
      firstEssence: false,
      patterns: [...p.patterns],
      dropsGiven: [],
      pair: pairElements(p.pair),
    },
  });
}

/** The world's foe `spawnId` killed: its set drops on the floor. */
function kill(w: ArpgWorld, spawnId: string): ArpgWorld {
  killMonster(makeCtx(registry, w, []), w.monsters.find((m) => m.spawnId === spawnId)!);
  return w;
}
const gearOf = (w: ArpgWorld) => w.drops.flatMap((d) => (d.item ? [d.item] : []));

/** The materials, scrap, Mana Dust and Links of dive `dive`'s set drops. */
function setHaul(dive: number): Haul {
  let haul = emptyHaul();
  for (const d of data.floors.filter((f) => f.dive === dive).flatMap((f) => f.drops))
    if (d.drop.kind === 'material') haul = addMaterial(haul, d.drop.material, d.drop.count);
    else if (d.drop.kind === 'scrap') haul = { ...haul, scrap: haul.scrap + d.drop.count };
  return haul;
}

/** An op's profile; the test fails with its reason when it refuses. */
function ok(res: ProfileActionResult): DelveProfile {
  expect(res.ok ? '' : res.reason).toBe('');
  return res.profile;
}

/** A new save of `primary`. */
const fresh = (primary: ManaType) => createDelveProfile(registry, 7, { primary });

/** `p` wielding d1-1's set weapon (stop 1's Equip), its common sword in the bag. */
function armed(p: DelveProfile): DelveProfile {
  const blade: GearItem = gearOf(kill(world(p, 'd1-1'), 'rat3'))[0];
  const bag = [...p.bag, p.equipped.weapon!];
  return { ...p, nextUid: p.nextUid + 1, equipped: { ...p.equipped, weapon: blade }, bag };
}

/**
 * After dive 1 and Anvil lesson 1, every op of it paid from the kit and dive 1's set drops
 * (less stop 2's adjusted move): the cuirass forged with the shard and worn, the partner bound,
 * a slot added to the Primary, its new move in the partner, the rune in the first move's first
 * socket, the old sword salvaged, three Rusty bars refined.
 */
function afterLesson1(primary: ManaType): DelveProfile {
  const start = fresh(primary);
  let p = armed(start);
  const rune = kill(world(p, 'd1-3'), 'elite1').drops.find((d) => d.rune)!.rune!;
  const runes = { [rune.id]: [1, 2, 3, 4, 5].map((t) => (t === rune.tier ? 1 : 0)) };
  p = stockHaul(p, { ...setHaul(1), runes });
  const { editDust } = registry.getDelveBalance().movesets;
  p = { ...p, bestDepth: 3, stats: { ...p.stats, dives: 1 }, manaDust: p.manaDust - editDust };
  const partner = data.partners[primary];
  const shards = [{ stat: 'maxHp' as const, tier: 1 }];
  const cuirass = forge(registry, p, {
    baseId: 'cuirass',
    metal: 'rusty',
    flux: 'uncommon',
    element: primary,
    shards,
  });
  p = equipItem(registry, ok(cuirass), cuirass.item!.uid);
  p = ok(bindSecondary(registry, p, partner));
  p = ok(addSlot(registry, p, 'primary'));
  const chain = movesetOf(registry, p.equipped.weapon!).chains.primary!;
  const moves = chain.moves.map((m, i) =>
    i === 0 ? { ...m, runes: [rune] } : i === 2 ? { ...m, elements: [partner] } : m,
  );
  p = ok(setChains(registry, p, { primary: { ...chain, moves } }));
  p = salvageItems(registry, p, [start.equipped.weapon!.uid]).profile;
  return ok(refine(registry, p, { kind: 'metal', metal: 'rusty' }));
}

describe('the Anvil lessons', () => {
  it.each(MANA_TYPES)('are paid from the starter kit and the set drops (%s)', (primary) => {
    let p = afterLesson1(primary);
    const crown = gearOf(kill(world(p, 'd2-5'), 'grask'))[0];
    expect([crown.rarity, crown.mana]).toEqual(['rare', primary]);
    p = stockHaul({ ...p, bag: [...p.bag, crown], bestDepth: 5 }, setHaul(2));
    p = ok(transferMoveset(registry, p, crown.uid));
    ok(hone(registry, p, crown.uid, 0));
  });
});
