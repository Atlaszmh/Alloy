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
import type { ManaType } from '../types/mana.js';
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { manaPool } from '../delve/hero-stats.js';
import { chargeCap, resolveChain } from './abilities/resolve.js';
import { cancelWindup, clearBeat, dropHold, endPushes } from './action.js';
import { dist } from './geometry.js';

export interface FloorOptions {
  depth: number;
  door: DoorDef | null;
  stats: HeroStats;
  /** The Primary's, Defensive's and Ultimate's chains (the basic chain is in `stats`). */
  chains: Pick<Chains, AbilitySlot>;
  heroHpFrac: number;
  potions: number;
  phoenixAvailable: boolean;
  seed: number;
  loot: LootContext;
  /** No packs and no boss (the Training Grounds' open arena). */
  empty?: boolean;
}

export function emptyStatus(): StatusState {
  const none = () => ({ fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0, nature: 0 });
  return {
    stacks: none(),
    stackUntil: none(),
    burnRef: 0,
    burnTickAt: 0,
    burnSlot: undefined,
    freezeUntil: 0,
    staggerUntil: 0,
    sunderUntil: 0,
    blindUntil: 0,
    brandUntil: 0,
    poisonRef: 0,
    poisonTickAt: 0,
    poisonSlot: undefined,
    rootUntil: 0,
    staggerImmuneUntil: 0,
    freezeImmuneUntil: 0,
    rootImmuneUntil: 0,
    reactionLockUntil: 0,
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
    dummy: null,
  };
}

function resolveAll(
  registry: DataRegistry,
  chains: Pick<Chains, AbilitySlot>,
  stats: HeroStats,
): ResolvedChain[] {
  return ABILITY_SLOTS.map((slot) => resolveChain(registry, stats, slot, chains[slot]));
}

export function createHeroEntity(
  registry: DataRegistry,
  stats: HeroStats,
  chains: Pick<Chains, AbilitySlot>,
  opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },
): HeroEntity {
  const pool = manaPool(stats, registry);
  const resolved = resolveAll(registry, chains, stats);
  return {
    x: opts.x,
    y: opts.y,
    radius: registry.getDelveBalance().hero.radius,
    facing: { x: 0, y: -1 },
    hp: Math.max(1, stats.maxHp * Math.min(1, opts.hpFrac)),
    stats,
    mana: pool.max,
    manaMax: pool.max,
    manaRegen: pool.regen,
    chains: resolved,
    cooldowns: resolved.map((c) => c.moves.map(() => 0)),
    charge: [0, 0, 0],
    comboStep: [0, 0, 0],
    comboAt: [-Infinity, -Infinity, -Infinity],
    beatFrom: [0, 0, 0],
    beatUntil: [0, 0, 0],
    windup: null,
    hold: null,
    swing: null,
    pushes: [],
    recoverUntil: 0,
    defend: null,
    ward: null,
    barrier: null,
    quickUntil: 0,
    reactionReadyAt: {},
    dodgeCharges: registry.getDelveBalance().dodge.charges,
    dodgeRechargeAt: 0,
    dodge: null,
    riposteUntil: 0,
    nextAttackAt: 0,
    attackCount: 0,
    lastBasicAt: -1e9,
    potions: opts.potions,
    invulnUntil: 0,
    phoenixAvailable: opts.phoenixAvailable,
    phoenixUsed: false,
    lastHitAt: -1,
    moving: false,
    swaySide: 1,
  };
}

/**
 * Swap in new gear stats and chains mid-floor: the chains re-resolve and the
 * pool resizes, keeping the life fraction and current mana (clamped). Charge
 * (clamped to each chain's largest need), combos (clamped to a shortened
 * chain) and each move's cooldown carry over. A slot whose chain changed
 * drops its wind-up (as a dodge does), its hold, its beat and its waiting
 * press, and a new Defensive ends the old one's buff and Ward at once, without
 * bursting.
 */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  stats: HeroStats,
  chains: Pick<Chains, AbilitySlot>,
): void {
  const h = world.hero;
  const frac = h.hp / h.stats.maxHp;
  const pool = manaPool(stats, registry);
  // A different weapon, or a basic chain whose blows changed (their kinds or number), starts
  // its own string: a blow in progress (and its lunge) is dropped and the weapon is ready.
  // Other changes leave the swing alone.
  const kinds = (s: HeroStats) => s.weapon.blows.map((b) => b.kind).join();
  if (stats.weapon.baseId !== h.stats.weapon.baseId || kinds(stats) !== kinds(h.stats)) {
    if (h.swing) {
      h.swing = null;
      endPushes(h, 'lunge');
    }
    h.attackCount = 0;
    h.nextAttackAt = Math.min(h.nextAttackAt, world.t);
  }
  const changed = ABILITY_SLOTS.map((slot, i) => !sameChain(h.chains[i], chains[slot]));
  if (h.windup && changed[h.windup.slot]) {
    cancelWindup(h, world.t);
    endPushes(h, 'stepIn'); // its step-in goes with it
  }
  // A changed slot's hold is dropped, unpaid, and its beat and waiting press go.
  if (h.hold && changed[h.hold.slot]) dropHold(world);
  changed.forEach((c, i) => {
    if (c) clearBeat(world, i);
  });
  if (changed[1]) {
    h.defend = null;
    h.ward = null;
  }
  h.stats = stats;
  h.hp = h.hp > 0 ? Math.max(1, frac * stats.maxHp) : h.hp;
  h.manaMax = pool.max;
  h.manaRegen = pool.regen;
  h.mana = Math.min(h.mana, pool.max);
  h.chains = resolveAll(registry, chains, stats);
  h.chains.forEach((chain, i) => {
    h.cooldowns[i] = chain.moves.map((_, j) => h.cooldowns[i][j] ?? 0);
    h.comboStep[i] = Math.min(h.comboStep[i], chain.moves.length - 1);
    h.charge[i] = Math.min(h.charge[i], chargeCap(chain));
  });
}

function sameChain(a: ResolvedChain | undefined, b: Chain): boolean {
  return (
    !!a &&
    a.payment === b.payment &&
    a.moves.length === b.moves.length &&
    a.moves.every(
      (m, i) =>
        m.kind === b.moves[i].kind &&
        m.form.id === b.moves[i].form &&
        m.elements.join() === b.moves[i].elements.join(),
    )
  );
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
    hero: createHeroEntity(registry, opts.stats, opts.chains, {
      hpFrac: opts.heroHpFrac,
      potions: opts.potions,
      phoenixAvailable: opts.phoenixAvailable,
      x: heroX,
      y: heroY,
    }),
    monsters: [],
    projectiles: [],
    zones: [],
    drops: [],
    nextId: 1,
    loot: { ...opts.loot },
    pending: { items: [], scrap: 0, kills: 0, reactions: [] },
    totalMonsters: 0,
    bossId: null,
    queuedCasts: [],
    queuedRelease: null,
    holdDropped: null,
    queuedAttack: null,
    queuedPotion: false,
    queuedDodge: false,
    kills: 0,
    bossKilled: false,
    cleared: false,
    clearedAt: 0,
    heroDead: false,
    sandbox: null,
  };

  const mods = opts.door?.mods ?? {};
  const boss = isBossFloor(registry, opts.depth);
  const basePacks = boss
    ? 2
    : Math.min(bal.dive.packsMax, bal.dive.packsBase + opts.depth * bal.dive.packsPerDepth);
  const packs = opts.empty ? 0 : Math.max(1, Math.round(basePacks * (mods.packs ?? 1)));
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

  if (boss && !opts.empty) {
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
