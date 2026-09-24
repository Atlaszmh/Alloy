import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DoorDef, MonsterInstance, MonsterKind, MonsterTrait } from '../types/delve.js';

export interface MonsterOptions {
  depth: number;
  kind: MonsterKind;
  door: DoorDef | null;
}

/** How many times the biome list has wrapped at this depth (0 on the first lap). */
export function biomeCycle(registry: DataRegistry, depth: number): number {
  const every = registry.getDelveBalance().dive.bossEvery;
  const biomes = registry.getDelveData().biomes.length;
  return Math.floor((Math.max(1, depth) - 1) / (every * biomes));
}

export function createMonster(registry: DataRegistry, opts: MonsterOptions, rng: SeededRNG): MonsterInstance {
  const bal = registry.getDelveBalance();
  const biome = registry.getBiomeForDepth(opts.depth);
  const def = opts.kind === 'boss' ? biome.boss : biome.monsters[rng.nextInt(0, biome.monsters.length - 1)];
  const d = Math.max(0, opts.depth - 1);

  const ramp = bal.monster.earlyRamp[opts.depth - 1] ?? 1;
  let hp = bal.monster.baseHp * Math.pow(bal.growth.monsterHp, d) * def.hp * ramp;
  let damage = bal.monster.baseDmg * Math.pow(bal.growth.monsterDmg, d) * def.dmg * ramp;
  let interval = def.interval;

  if (opts.kind === 'elite') {
    hp *= bal.monster.elite.hp;
    damage *= bal.monster.elite.dmg;
  } else if (opts.kind === 'boss') {
    hp *= bal.monster.boss.hp;
    damage *= bal.monster.boss.dmg;
  }

  const traits: MonsterTrait[] = [...(def.traits ?? [])];
  if (opts.kind === 'elite') {
    const extra = rng.nextInt(bal.monster.elite.minTraits, bal.monster.elite.maxTraits);
    const pool = registry
      .getDelveData()
      .traits.map((t) => t.id)
      .filter((t) => !traits.includes(t));
    for (let i = 0; i < extra && pool.length > 0; i++) {
      traits.push(pool.splice(rng.nextInt(0, pool.length - 1), 1)[0]);
    }
  }

  const t = bal.monster.traits;
  if (traits.includes('swift')) {
    interval *= t.swiftInterval;
    hp *= t.swiftHp;
  }
  if (traits.includes('brute')) {
    damage *= t.bruteDmg;
    interval *= t.bruteInterval;
  }

  const mods = opts.door?.mods ?? {};
  hp *= 1 + (mods.monsterHp ?? 0);
  damage *= 1 + (mods.monsterDmg ?? 0);

  const cycle = biomeCycle(registry, opts.depth);
  return {
    id: def.id,
    name: cycle > 0 ? `Abyssal ${def.name}` : def.name,
    icon: def.icon,
    kind: opts.kind,
    depth: opts.depth,
    biomeId: biome.id,
    maxHp: Math.max(1, Math.round(hp)),
    damage: Math.max(1, Math.round(damage)),
    attackInterval: interval,
    traits,
  };
}
