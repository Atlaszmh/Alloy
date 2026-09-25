import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type {
  ArpgWorld,
  HeroEntity,
  LootContext,
  MonsterEntity,
  MonsterKind,
  StatusState,
} from '../types/arpg.js';
import type { DoorDef, HeroStats, MonsterDef, MonsterTrait } from '../types/delve.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { effectiveSkillSlots, manaPools } from '../delve/hero-stats.js';
import { dist } from './geometry.js';

export interface FloorOptions {
  depth: number;
  door: DoorDef | null;
  stats: HeroStats;
  /** The profile's action bar (locked spells are filtered out). */
  skillSlots: (string | null)[];
  heroHpFrac: number;
  potions: number;
  phoenixAvailable: boolean;
  seed: number;
  loot: LootContext;
}

export function emptyStatus(): StatusState {
  return {
    burnDps: 0,
    burnUntil: 0,
    burnTickAt: 0,
    chillStacks: 0,
    chillUntil: 0,
    freezeUntil: 0,
    shockUntil: 0,
    hexUntil: 0,
    staggerUntil: 0,
    blindUntil: 0,
    brandUntil: 0,
    poisonStacks: 0,
    poisonDps: 0,
    poisonUntil: 0,
    poisonTickAt: 0,
    rootUntil: 0,
    staggerImmuneUntil: 0,
    freezeImmuneUntil: 0,
    rootImmuneUntil: 0,
  };
}

export function isBossFloor(registry: DataRegistry, depth: number): boolean {
  return depth % registry.getDelveBalance().dive.bossEvery === 0;
}

/** How many times the biome list has wrapped at this depth (0 on the first lap). */
export function biomeCycle(registry: DataRegistry, depth: number): number {
  const every = registry.getDelveBalance().dive.bossEvery;
  const biomes = registry.getDelveData().biomes.length;
  return Math.floor((Math.max(1, depth) - 1) / (every * biomes));
}

interface MonsterSpawn {
  id: number;
  def: MonsterDef;
  kind: MonsterKind;
  depth: number;
  door: DoorDef | null;
  element: ManaType;
  x: number;
  y: number;
  packId: number;
}

export function createMonsterEntity(
  registry: DataRegistry,
  spawn: MonsterSpawn,
  rng: SeededRNG,
): MonsterEntity {
  const bal = registry.getDelveBalance();
  const m = bal.monster;
  const d = Math.max(0, spawn.depth - 1);
  const ramp = m.earlyRamp[spawn.depth - 1] ?? 1;
  const def = spawn.def;

  let hp = m.baseHp * Math.pow(bal.growth.monsterHp, d) * def.hp * ramp;
  let damage = m.baseDmg * Math.pow(bal.growth.monsterDmg, d) * def.dmg * ramp;
  let interval = def.interval;
  let speed = m.speed * (def.speed ?? 1);
  let radius = m.radius * (def.size ?? 1);

  if (spawn.kind === 'elite') {
    hp *= m.elite.hp;
    damage *= m.elite.dmg;
    radius *= 1.2;
    speed *= 1.05;
  } else if (spawn.kind === 'boss') {
    hp *= m.boss.hp;
    damage *= m.boss.dmg;
  }

  const traits: MonsterTrait[] = [...(def.traits ?? [])];
  if (spawn.kind === 'elite') {
    const extra = rng.nextInt(m.elite.minTraits, m.elite.maxTraits);
    const pool = registry
      .getDelveData()
      .traits.map((t) => t.id)
      .filter((t) => !traits.includes(t));
    for (let i = 0; i < extra && pool.length > 0; i++)
      traits.push(pool.splice(rng.nextInt(0, pool.length - 1), 1)[0]);
  }
  if (traits.includes('swift')) {
    interval *= m.traits.swiftInterval;
    hp *= m.traits.swiftHp;
    speed *= 1.15;
  }
  if (traits.includes('brute')) {
    damage *= m.traits.bruteDmg;
    interval *= m.traits.bruteInterval;
  }

  const mods = spawn.door?.mods ?? {};
  hp *= 1 + (mods.monsterHp ?? 0);
  damage *= 1 + (mods.monsterDmg ?? 0);

  const ai = def.ai ?? 'melee';
  const cycle = biomeCycle(registry, spawn.depth);
  return {
    id: spawn.id,
    defId: def.id,
    name: cycle > 0 ? `Abyssal ${def.name}` : def.name,
    icon: def.icon,
    kind: spawn.kind,
    element: spawn.element,
    ai,
    traits,
    packId: spawn.packId,
    x: spawn.x,
    y: spawn.y,
    radius,
    speed,
    hp: Math.max(1, Math.round(hp)),
    maxHp: Math.max(1, Math.round(hp)),
    damage: Math.max(1, Math.round(damage)),
    attackInterval: interval,
    attackRange: ai === 'ranged' ? 7.5 : m.meleeRange,
    aggro: false,
    aggroAt: 0,
    nextAttackAt: 0,
    windupUntil: 0,
    windupStart: 0,
    chargeUntil: 0,
    chargeDir: { x: 0, y: 0 },
    chargeHit: false,
    kbx: 0,
    kby: 0,
    status: emptyStatus(),
    lastHitAt: -1,
    nextSpecialAt: 0,
    dead: false,
  };
}

export function createHeroEntity(
  registry: DataRegistry,
  stats: HeroStats,
  skillSlots: (string | null)[],
  opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },
): HeroEntity {
  const pools = manaPools(stats, registry);
  return {
    x: opts.x,
    y: opts.y,
    radius: registry.getDelveBalance().hero.radius,
    facing: { x: 0, y: -1 },
    hp: Math.max(1, stats.maxHp * Math.min(1, opts.hpFrac)),
    stats,
    mana: { ...pools.max },
    manaMax: pools.max,
    manaRegen: pools.regen,
    cooldowns: {},
    skillSlots: effectiveSkillSlots(skillSlots, stats.attunement, registry),
    nextAttackAt: 0,
    attackCount: 0,
    potions: opts.potions,
    invulnUntil: 0,
    phoenixAvailable: opts.phoenixAvailable,
    phoenixUsed: false,
    lastHitAt: -1,
    moving: false,
  };
}

/** Swap in new gear stats mid-floor, keeping the life fraction and current mana. */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  stats: HeroStats,
  skillSlots: (string | null)[],
): void {
  const h = world.hero;
  const frac = h.hp / h.stats.maxHp;
  const pools = manaPools(stats, registry);
  for (const m of MANA_TYPES) {
    if (pools.max[m] <= 0) h.mana[m] = 0;
    else if (h.manaMax[m] <= 0) h.mana[m] = pools.max[m] * 0.5;
    else h.mana[m] = Math.min(h.mana[m], pools.max[m]);
  }
  h.stats = stats;
  h.hp = h.hp > 0 ? Math.max(1, frac * stats.maxHp) : h.hp;
  h.manaMax = pools.max;
  h.manaRegen = pools.regen;
  h.skillSlots = effectiveSkillSlots(skillSlots, stats.attunement, registry);
}

/** Build the arena for one depth: hero at the bottom, monster packs spread above. */
export function createFloorWorld(registry: DataRegistry, opts: FloorOptions): ArpgWorld {
  const bal = registry.getDelveBalance();
  const rng = new SeededRNG(opts.seed);
  const spawnRng = rng.fork('spawn');
  const biome = registry.getBiomeForDepth(opts.depth);
  const { width, height } = bal.arena;
  const heroX = width / 2;
  const heroY = height - 4;

  const world: ArpgWorld = {
    t: 0,
    accumulator: 0,
    rng: rng.fork('combat'),
    // Loot depends on how far the save has progressed, so re-entering a
    // floor re-fights the same monsters but rolls fresh drops.
    lootRng: rng.fork(`loot:${opts.loot.nextUid}`),
    depth: opts.depth,
    biomeId: biome.id,
    element: biome.mana,
    door: opts.door,
    width,
    height,
    hero: createHeroEntity(registry, opts.stats, opts.skillSlots, {
      hpFrac: opts.heroHpFrac,
      potions: opts.potions,
      phoenixAvailable: opts.phoenixAvailable,
      x: heroX,
      y: heroY,
    }),
    monsters: [],
    projectiles: [],
    zones: [],
    summons: [],
    drops: [],
    nextId: 1,
    loot: { ...opts.loot },
    pending: { items: [], scrap: 0, kills: 0, reactions: [] },
    totalMonsters: 0,
    bossId: null,
    queuedCast: null,
    queuedPotion: false,
    kills: 0,
    bossKilled: false,
    cleared: false,
    clearedAt: 0,
    heroDead: false,
  };

  const mods = opts.door?.mods ?? {};
  const boss = isBossFloor(registry, opts.depth);
  const basePacks = boss
    ? 2
    : Math.min(bal.dive.packsMax, bal.dive.packsBase + opts.depth * bal.dive.packsPerDepth);
  const packs = Math.max(1, Math.round(basePacks * (mods.packs ?? 1)));
  const eliteChance = Math.max(bal.dive.eliteChance, mods.eliteChance ?? 0);

  const spawn = (def: MonsterDef, kind: MonsterKind, x: number, y: number, packId: number) => {
    const m = createMonsterEntity(
      registry,
      {
        id: world.nextId++,
        def,
        kind,
        depth: opts.depth,
        door: opts.door,
        element: biome.mana,
        x,
        y,
        packId,
      },
      spawnRng,
    );
    world.monsters.push(m);
    return m;
  };

  if (boss) {
    const b = spawn(biome.boss, 'boss', width / 2, 9, 0);
    world.bossId = b.id;
  }

  const centers: { x: number; y: number }[] = boss ? [{ x: width / 2, y: 9 }] : [];
  for (let p = 0; p < packs; p++) {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = 3 + spawnRng.next() * (width - 6);
      cy = 3 + spawnRng.next() * (height - 13);
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.arena.minPackDistance;
      const farFromPacks = centers.every((c) => dist(c.x, c.y, cx, cy) >= 5.5);
      if (farFromHero && farFromPacks) break;
    }
    centers.push({ x: cx, y: cy });
    const size = spawnRng.nextInt(bal.dive.packSize[0], bal.dive.packSize[1]);
    const elitePack = spawnRng.next() < eliteChance;
    for (let i = 0; i < size; i++) {
      const angle = (Math.PI * 2 * i) / size + spawnRng.next() * 0.6;
      const r = i === 0 && elitePack ? 0 : bal.arena.packSpacing * (0.7 + spawnRng.next() * 0.6);
      const def = biome.monsters[spawnRng.nextInt(0, biome.monsters.length - 1)];
      spawn(
        def,
        i === 0 && elitePack ? 'elite' : 'normal',
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
        p + 1,
      );
    }
  }

  world.totalMonsters = world.monsters.length;
  return world;
}
