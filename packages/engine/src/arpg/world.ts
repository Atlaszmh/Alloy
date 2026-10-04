import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type {
  ArpgWorld,
  HeroEntity,
  LootContext,
  MonsterEntity,
  MonsterKind,
  StatusState,
  Vec,
  WorldPending,
} from '../types/arpg.js';
import type { DoorDef, HeroStats, MonsterDef, MonsterTrait } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import type { Buff, FloorLayout, Rect } from '../types/floor-map.js';
import type { TutorialState } from '../types/tutorial.js';
import type { RuneRef } from '../types/rune.js';
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { chargeCap, resolveChain } from './abilities/resolve.js';
import { cancelWindup, clearBeat, dropHold, endPushes } from './action.js';
import { dist } from './geometry.js';
import { openRoom, snapToWalkable } from './grid.js';
import { floorPacks, planFloor } from './layout/generate.js';
import { seedSetDrops, tutorialFloorMap } from './tutorial-floor.js';
import { emptyHaul } from '../loot/materials.js';

export interface FloorOptions {
  depth: number;
  door: DoorDef | null;
  stats: HeroStats;
  /**
   * The Primary's, Defensive's and Ultimate's chains (the basic chain is in
   * `stats`); a skill left out has none.
   */
  chains: Partial<Pick<Chains, AbilitySlot>>;
  heroHpFrac: number;
  potions: number;
  phoenixAvailable: boolean;
  seed: number;
  loot: LootContext;
  /** No packs and no boss (the Training Grounds' open arena). */
  empty?: boolean;
  /**
   * The map: `'open'` (the default: today's arena, `openRoom`) or `'generated'` (dives:
   * `planFloor`'s rooms and halls, the packs spawned room by room), which builds the open
   * room too while `delve.layout.generatedDives` is off.
   */
  layout?: FloorLayout;
  /** The dive's blessings (`DiveState.diveBuffs`): the hero wears them from the start (default none). */
  diveBuffs?: Buff[];
  /** The interactables used this dive (`DiveState.used`): a generated floor marks them used (default none). */
  used?: string[];
  /**
   * A guided start's depth (see the tutorial spec): its hand-built floor's id and
   * the tutorial's state as the floor begins (`ArpgWorld.tutorialFloor`, `tutorial`).
   */
  tutorial?: { floor: string; state: TutorialState };
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

/**
 * A depth's growth for foes (see the room objects spec): `growth.monsterHp`
 * and `monsterDmg` to the power depth − 1, and `monster.earlyRamp`. A foe's
 * life is `baseHp × hp × def.hp × ramp`; a crumbling structure's life scales
 * by `hp × ramp` and a hazard's burst by `dmg × ramp`.
 */
export function depthGrowth(
  registry: DataRegistry,
  depth: number,
): { hp: number; dmg: number; ramp: number } {
  const bal = registry.getDelveBalance();
  const d = Math.max(0, depth - 1);
  return {
    hp: Math.pow(bal.growth.monsterHp, d),
    dmg: Math.pow(bal.growth.monsterDmg, d),
    ramp: bal.monster.earlyRamp[depth - 1] ?? 1,
  };
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
  /** Its room on a generated floor (default none). */
  roomId?: number | null;
  /** An elite's traits in place of its random ones (a hand-built floor's; see the tutorial spec). */
  traits?: MonsterTrait[];
  /** Its life and damage × these (a hand-built floor's; default 1). */
  hpMult?: number;
  damageMult?: number;
}

export function createMonsterEntity(
  registry: DataRegistry,
  spawn: MonsterSpawn,
  rng: SeededRNG,
): MonsterEntity {
  const bal = registry.getDelveBalance();
  const m = bal.monster;
  const growth = depthGrowth(registry, spawn.depth);
  const def = spawn.def;

  let hp = m.baseHp * growth.hp * def.hp * growth.ramp;
  let damage = m.baseDmg * growth.dmg * def.dmg * growth.ramp;
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

  const traits: MonsterTrait[] = [...(def.traits ?? []), ...(spawn.traits ?? [])];
  if (spawn.kind === 'elite' && !spawn.traits) {
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
  hp *= spawn.hpMult ?? 1;
  damage *= spawn.damageMult ?? 1;

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
    roomId: spawn.roomId ?? null,
    farSince: null,
    goingHome: false,
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

/**
 * The chain each hero chain was resolved from: `sameChain` compares its raw sockets, which the
 * resolved moves don't keep (their `runes` drop empty and dormant sockets).
 */
// ponytail: a side table, since the contract gives ResolvedChain no field for the raw chain.
const SOURCES = new WeakMap<ResolvedChain, Chain>();

/** Each slot's chain resolved, by slot; null for a skill left out. */
function resolveAll(
  registry: DataRegistry,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  stats: HeroStats,
): (ResolvedChain | null)[] {
  return ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    if (!chain) return null;
    const resolved = resolveChain(registry, stats, slot, chain);
    SOURCES.set(resolved, chain);
    return resolved;
  });
}

export function createHeroEntity(
  registry: DataRegistry,
  unbuffed: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  opts: {
    hpFrac: number;
    potions: number;
    phoenixAvailable: boolean;
    x: number;
    y: number;
    /** The dive's blessings, worn from the start. */
    diveBuffs?: Buff[];
  },
): HeroEntity {
  const diveBuffs = [...(opts.diveBuffs ?? [])];
  const stats = applyBuffs(unbuffed, diveBuffs);
  const pool = manaPool(stats, registry);
  const resolved = resolveAll(registry, chains, stats);
  return {
    x: opts.x,
    y: opts.y,
    radius: registry.getDelveBalance().hero.radius,
    facing: { x: 0, y: -1 },
    hp: Math.max(1, stats.maxHp * Math.min(1, opts.hpFrac)),
    stats,
    baseStats: stats,
    floorBuffs: [],
    diveBuffs,
    mana: pool.max,
    manaMax: pool.max,
    manaRegen: pool.regen,
    chains: resolved,
    cooldowns: resolved.map((c) => c?.moves.map(() => 0) ?? []),
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
    drained: [0, 0, 0, 0],
    drainLeft: [0, 0, 0, 0],
    zonesLeft: [0, 0, 0, 0],
  };
}

/**
 * Swap in new gear stats and chains mid-floor: the chains re-resolve and the
 * pool resizes, keeping the life fraction and current mana (clamped). Charge
 * (clamped to each chain's largest need), combos (clamped to a shortened
 * chain) and each move's cooldown carry over. A slot whose chain changed
 * drops its wind-up (as a dodge does), its hold, its beat, its waiting press
 * and its queued echo, and a new Defensive ends the old one's buff and Ward at once, without
 * bursting. A skill left out has no chain (and so no cooldowns or charge).
 * `unbuffed` is the hero's gear (`profileStats`): its dive's and floor's
 * blessings go back on (see the floor maps spec), so a refresh never wipes them.
 */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  unbuffed: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
): void {
  const h = world.hero;
  const base = applyBuffs(unbuffed, h.diveBuffs);
  const stats = applyBuffs(base, h.floorBuffs);
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
  world.echoes = world.echoes.filter((e) => e.slot === null || !changed[e.slot]);
  if (changed[1]) {
    h.defend = null;
    h.ward = null;
  }
  h.stats = stats;
  h.baseStats = base;
  h.hp = h.hp > 0 ? Math.max(1, frac * stats.maxHp) : h.hp;
  h.manaMax = pool.max;
  h.manaRegen = pool.regen;
  h.mana = Math.min(h.mana, pool.max);
  h.chains = resolveAll(registry, chains, stats);
  h.chains.forEach((chain, i) => {
    h.cooldowns[i] = chain?.moves.map((_, j) => h.cooldowns[i][j] ?? 0) ?? [];
    h.comboStep[i] = chain ? Math.min(h.comboStep[i], chain.moves.length - 1) : 0;
    h.charge[i] = chain ? Math.min(h.charge[i], chargeCap(chain)) : 0;
  });
}

/** Whether a resolved chain is `b` (both absent count as the same), raw sockets included. */
function sameChain(a: ResolvedChain | null, b: Chain | undefined): boolean {
  if (!a || !b) return !a && !b;
  const source = SOURCES.get(a);
  return (
    a.payment === b.payment &&
    a.moves.length === b.moves.length &&
    a.moves.every(
      (m, i) =>
        m.kind === b.moves[i].kind &&
        m.form.id === b.moves[i].form &&
        m.elements.join() === b.moves[i].elements.join() &&
        sameSockets(source?.moves[i]?.runes ?? [], b.moves[i].runes ?? []),
    )
  );
}

/** The same sockets: as many, each empty in both or holding the same rune at the same tier. */
function sameSockets(a: readonly (RuneRef | null)[], b: readonly (RuneRef | null)[]): boolean {
  return a.length === b.length && a.every((r, i) => r?.id === b[i]?.id && r?.tier === b[i]?.tier);
}

/** Nothing collected yet (`newFloor`: the world hasn't banked; see `WorldPending`). */
export function emptyPending(newFloor = false): WorldPending {
  return {
    items: [],
    scrap: 0,
    kills: 0,
    reactions: [],
    runes: [],
    haul: emptyHaul(),
    patterns: [],
    questEvents: [],
    used: [],
    diveBuffs: [],
    newFloor,
  };
}

/**
 * Build the arena for one depth: the open room (the hero at the bottom, packs spread
 * above), a generated floor (`planFloor`: the hero at its start, packs room by room),
 * or a guided start's hand-built floor (`opts.tutorial`: its map and foes as its data has them).
 */
export function createFloorWorld(registry: DataRegistry, opts: FloorOptions): ArpgWorld {
  const bal = registry.getDelveBalance();
  const rng = new SeededRNG(opts.seed);
  const spawnRng = rng.fork('spawn');
  const biome = registry.getBiomeForDepth(opts.depth);
  const built = registry.getTutorialData().floors.find((f) => f.id === opts.tutorial?.floor);
  const plan =
    !built && opts.layout === 'generated' && bal.layout.generatedDives
      ? planFloor(registry, opts.seed, opts.depth, biome, opts.door)
      : null;
  const map = built
    ? tutorialFloorMap(registry, built, opts.depth)
    : (plan?.map ?? openRoom(bal.arena.width, bal.arena.height));
  for (const room of map.rooms)
    if (room.interactable && opts.used?.includes(room.interactable.id))
      room.interactable.used = true;
  const { width, height } = map;
  const { x: heroX, y: heroY } = map.start;

  const world: ArpgWorld = {
    t: 0,
    accumulator: 0,
    rng: rng.fork('combat'),
    // Loot depends on how far the save has progressed, so re-entering a
    // floor re-fights the same monsters but rolls fresh drops.
    lootRng: rng.fork(`loot:${opts.loot.nextUid}`),
    runeRng: rng.fork(`runes:${opts.loot.nextUid}`),
    materialRng: rng.fork(`materials:${opts.loot.nextUid}`),
    depth: opts.depth,
    biomeId: biome.id,
    element: biome.mana,
    door: opts.door,
    map,
    width,
    height,
    fog: new Uint8Array(width * height).fill(map.open ? 2 : 0),
    fogVersion: 0,
    fogAt: 0,
    exitHinted: false,
    flow: { small: null, large: null, nextAt: 0 },
    sealing: null,
    channel: null,
    exited: false,
    hero: createHeroEntity(registry, opts.stats, opts.chains, {
      hpFrac: opts.heroHpFrac,
      potions: opts.potions,
      phoenixAvailable: opts.phoenixAvailable,
      x: heroX,
      y: heroY,
      diveBuffs: opts.diveBuffs,
    }),
    monsters: [],
    projectiles: [],
    zones: [],
    drops: [],
    nextId: 1,
    loot: {
      ...opts.loot,
      // A blessing's Find counts all dive.
      find: (opts.diveBuffs ?? []).reduce((f, b) => f + (b.effect.find ?? 0), opts.loot.find),
      dropsGiven: [...opts.loot.dropsGiven],
    },
    pending: emptyPending(true),
    totalMonsters: 0,
    bossId: null,
    queuedCasts: [],
    echoes: [],
    queuedRelease: null,
    holdDropped: null,
    queuedAttack: null,
    queuedPotion: false,
    queuedDodge: false,
    queuedInteract: false,
    kills: 0,
    bossKilled: false,
    cleared: false,
    clearedAt: 0,
    heroDead: false,
    potionDrunk: false,
    hurt: false,
    sandbox: null,
    tutorialFloor: built?.id ?? null,
    tutorial: opts.tutorial ? { ...opts.tutorial.state, tally: {} } : null,
  };

  const mods = opts.door?.mods ?? {};
  const boss = isBossFloor(registry, opts.depth);
  const packs = opts.empty ? 0 : floorPacks(registry, opts.depth, opts.door);
  const eliteChance = Math.max(bal.dive.eliteChance, mods.eliteChance ?? 0);

  const spawn = (
    def: MonsterDef,
    kind: MonsterKind,
    x: number,
    y: number,
    packId: number,
    roomId: number | null = null,
  ) => {
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
        roomId,
      },
      spawnRng,
    );
    world.monsters.push(m);
    return m;
  };

  /** A pack 3 cells inside `area`, away from the hero and the other `centers`; an elite leads it at `eliteChance` (always when `elite`). */
  const pack = (
    area: Rect,
    centers: Vec[],
    packId: number,
    roomId: number | null,
    elite = false,
  ) => {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = area.x + 3 + spawnRng.next() * (area.w - 6);
      cy = area.y + 3 + spawnRng.next() * (area.h - 6);
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.layout.minPackDistance;
      const farFromPacks = centers.every((c) => dist(c.x, c.y, cx, cy) >= 5.5);
      if (farFromHero && farFromPacks) break;
    }
    centers.push({ x: cx, y: cy });
    const size = spawnRng.nextInt(bal.dive.packSize[0], bal.dive.packSize[1]);
    const elitePack = spawnRng.next() < eliteChance || elite;
    for (let i = 0; i < size; i++) {
      const angle = (Math.PI * 2 * i) / size + spawnRng.next() * 0.6;
      const r = i === 0 && elitePack ? 0 : bal.arena.packSpacing * (0.7 + spawnRng.next() * 0.6);
      const def = biome.monsters[spawnRng.nextInt(0, biome.monsters.length - 1)];
      const at = snapToWalkable(map, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      spawn(def, i === 0 && elitePack ? 'elite' : 'normal', at.x, at.y, packId, roomId);
    }
  };

  // A hand-built floor: each foe where its data puts it (`spawnId`, `script`), a room's foes
  // one pack, the boss the floor's.
  if (built) {
    const defs = registry.getDelveData().biomes.flatMap((b) => [...b.monsters, b.boss]);
    for (const s of built.spawns) {
      const def = defs.find((d) => d.id === s.monster)!;
      const m = createMonsterEntity(
        registry,
        {
          id: world.nextId++,
          def,
          kind: s.boss ? 'boss' : s.elite ? 'elite' : 'normal',
          depth: opts.depth,
          door: opts.door,
          element: biome.mana,
          x: s.at.x,
          y: s.at.y,
          packId: s.room + 1,
          roomId: s.room,
          traits: s.elite?.traits,
          hpMult: s.hpMult,
          damageMult: s.damageMult,
        },
        spawnRng,
      );
      m.spawnId = s.id;
      if (s.script) m.script = s.script;
      world.monsters.push(m);
      if (s.boss) world.bossId = m.id;
    }
    seedSetDrops(world, rng);
    world.totalMonsters = world.monsters.length;
    return world;
  }

  // A generated floor: the boss at its room's centre, each room's packs in it (a den's
  // elite-led), every foe knowing its room.
  if (plan) {
    let packId = 0;
    for (const room of opts.empty ? [] : map.rooms) {
      const { x, y, w, h } = room.rect;
      if (room.kind === 'boss') {
        const at = snapToWalkable(map, x + w / 2, y + h / 2);
        world.bossId = spawn(biome.boss, 'boss', at.x, at.y, 0, room.id).id;
      }
      const centers: Vec[] = [];
      for (let p = 0; p < plan.packs[room.id]; p++)
        pack(room.rect, centers, ++packId, room.id, room.kind === 'den');
    }
    world.totalMonsters = world.monsters.length;
    return world;
  }

  if (boss && !opts.empty) {
    const b = spawn(biome.boss, 'boss', width / 2, 9, 0);
    world.bossId = b.id;
  }

  const centers: { x: number; y: number }[] = boss ? [{ x: width / 2, y: 9 }] : [];
  // The open room: the packs above the hero (the bottom 7 rows kept clear).
  for (let p = 0; p < packs; p++)
    pack({ x: 0, y: 0, w: width, h: height - 7 }, centers, p + 1, null);

  world.totalMonsters = world.monsters.length;
  return world;
}
