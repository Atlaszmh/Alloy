import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { AbilitySlot, Chains } from '../types/ability.js';
import type {
  ArpgWorld,
  DummyLayout,
  MonsterEntity,
  MonsterKind,
  SandboxToggles,
  Vec,
} from '../types/arpg.js';
import type { HeroStats, MonsterDef, SandboxBalance } from '../types/delve.js';
import type { GearItem, Rarity } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { baseDisplayName, generateItem } from '../loot/item-generator.js';
import { clearBeat } from './action.js';
import { livingBossId } from './combat.js';
import { chargeCap } from './abilities/resolve.js';
import { clamp } from './geometry.js';
import { AGGRO_SPECIAL_DELAY } from './step.js';
import { createFloorWorld, createMonsterEntity, emptyStatus } from './world.js';

/**
 * The Training Grounds: an open arena at any depth for trying builds. Its
 * world never clears and drops nothing (but the orbs and motes reactions
 * make: Seedling, Siphon), training dummies soak hits without
 * acting or dying, any monster can be spawned, and toggles bend the rules
 * (`ArpgWorld.sandbox`, checked where each rule lives). The client only asks
 * for things through these functions. See the Training Grounds spec.
 * Kills and reactions still accrue in `pending`, harmlessly: a sandbox world is never banked.
 */

export interface SandboxWorldOptions {
  depth: number;
  stats: HeroStats;
  /** The Primary's, Defensive's and Ultimate's chains (the basic chain is in `stats`). */
  chains: Pick<Chains, AbilitySlot>;
  toggles: SandboxToggles;
}

/** An empty arena at `depth` (its biome and monster scaling), the hero at `heroStart` facing up. */
export function createSandboxWorld(registry: DataRegistry, o: SandboxWorldOptions): ArpgWorld {
  const bal = registry.getDelveBalance();
  const world = createFloorWorld(registry, {
    depth: o.depth,
    door: null,
    stats: o.stats,
    chains: o.chains,
    heroHpFrac: 1,
    potions: bal.dive.potions,
    phoenixAvailable: true,
    seed: 1,
    loot: {
      pity: 0,
      nextUid: 1,
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
      forceLegendary: false,
      pair: [],
    },
    empty: true,
  });
  [world.hero.x, world.hero.y] = bal.sandbox.heroStart;
  world.hero.facing = { x: 0, y: -1 };
  setSandboxToggles(world, o.toggles);
  return world;
}

/** A dummy is a monster of this definition: its `hp` becomes `dummyLifeMult` (see `spawnDummies`). */
const DUMMY: MonsterDef = {
  id: 'dummy',
  name: 'Training Dummy',
  icon: '🎯',
  hp: 1,
  dmg: 1,
  interval: 1,
};
/** Dummies share a pack no monster uses, so hitting one never wakes anything else. */
const DUMMY_PACK = -1;

function inside(world: ArpgWorld, margin: number, x: number, y: number): Vec {
  return { x: clamp(x, margin, world.width - margin), y: clamp(y, margin, world.height - margin) };
}

/** Where a layout's dummies stand, relative to the hero (up is −y). */
function layoutOffsets(sb: SandboxBalance, layout: DummyLayout): Vec[] {
  const up = sb.dummyDistance;
  if (layout === 'single') return [{ x: 0, y: -up }];
  if (layout === 'row') return [0, 1, 2, 3, 4].map((k) => ({ x: 0, y: -(up + k * sb.rowSpacing) }));
  const c = -(up + 1);
  const r = sb.clumpRadius;
  return [
    { x: 0, y: c },
    { x: r, y: c },
    { x: -r, y: c },
    { x: 0, y: c - r },
    { x: 0, y: c + r },
  ];
}

/** A group's sideways shift: 0, then `groupSpacing` right, left, twice right, twice left… */
function groupShift(sb: SandboxBalance, group: number): number {
  return Math.ceil(group / 2) * (group % 2 === 1 ? 1 : -1) * sb.groupSpacing;
}

/**
 * Stand a group of training dummies above the hero. The `group`-th group (from
 * 0) stands beside the earlier ones (`groupShift`), so a replay with the same
 * index lands in the same place. Near a wall the group moves in as a whole
 * (keeping its spacing) to stay `edgeMargin` inside. A dummy
 * is a normal size-1 foe with the reference monster's life × `dummyLifeMult`
 * that never acts or dies; `element` is what it resists (null = Neutral).
 */
export function spawnDummies(
  registry: DataRegistry,
  world: ArpgWorld,
  o: { layout: DummyLayout; element: ManaType | null; group?: number },
): MonsterEntity[] {
  const sb = registry.getDelveBalance().sandbox;
  const h = world.hero;
  const side = groupShift(sb, o.group ?? 0);
  const spots = layoutOffsets(sb, o.layout).map((off) => ({
    x: h.x + side + off.x,
    y: h.y + off.y,
  }));
  // The shift that brings the whole group inside (0 when it already fits).
  const xs = spots.map((p) => p.x);
  const ys = spots.map((p) => p.y);
  const e = sb.edgeMargin;
  const dx = clamp(0, e - Math.min(...xs), world.width - e - Math.max(...xs));
  const dy = clamp(0, e - Math.min(...ys), world.height - e - Math.max(...ys));
  return spots.map((s) => {
    const p = { x: s.x + dx, y: s.y + dy };
    const m = createMonsterEntity(
      registry,
      {
        id: world.nextId++,
        def: { ...DUMMY, hp: sb.dummyLifeMult },
        kind: 'normal',
        depth: world.depth,
        door: null,
        element: world.element,
        x: p.x,
        y: p.y,
        packId: DUMMY_PACK,
      },
      world.rng,
    );
    m.name = DUMMY.name; // no Abyssal prefix at depth
    m.speed = 0;
    m.damage = 0;
    m.dummy = { homeX: p.x, homeY: p.y, element: o.element };
    world.monsters.push(m);
    return m;
  });
}

/** Every dummy back home, with full life, no statuses, no knockback and no hit flash. */
export function resetDummies(world: ArpgWorld): void {
  for (const m of world.monsters) {
    if (!m.dummy) continue;
    m.x = m.dummy.homeX;
    m.y = m.dummy.homeY;
    m.hp = m.maxHp;
    m.status = emptyStatus();
    m.kbx = 0;
    m.kby = 0;
    m.lastHitAt = -1;
  }
}

/** A monster definition from any biome (a monster or a boss), with its home biome's mana. */
function findMonster(registry: DataRegistry, defId: string): { def: MonsterDef; mana: ManaType } {
  for (const b of registry.getDelveData().biomes) {
    const def = b.boss.id === defId ? b.boss : b.monsters.find((m) => m.id === defId);
    if (def) return { def, mana: b.mana };
  }
  throw new Error(`Monster not found: ${defId}`);
}

/**
 * Spawn `count` (1–8) monsters of any biome's definition, as `kind`, scaled to
 * the world's depth and in their home element, evenly round a ring about the
 * hero (inside the walls) and already aggroed. A boss takes the boss bar.
 */
export function spawnMonsters(
  registry: DataRegistry,
  world: ArpgWorld,
  o: { defId: string; kind: MonsterKind; count: number },
): MonsterEntity[] {
  const sb = registry.getDelveBalance().sandbox;
  const { def, mana } = findMonster(registry, o.defId);
  const n = Math.max(1, Math.min(8, Math.round(o.count)));
  const h = world.hero;
  const out: MonsterEntity[] = [];
  for (let i = 0; i < n; i++) {
    // Half a step round from straight up, so none lands on a row of dummies.
    const a = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / n;
    const p = inside(
      world,
      sb.edgeMargin,
      h.x + Math.cos(a) * sb.spawnRing,
      h.y + Math.sin(a) * sb.spawnRing,
    );
    const m = createMonsterEntity(
      registry,
      {
        id: world.nextId++,
        def,
        kind: o.kind,
        depth: world.depth,
        door: null,
        element: mana,
        x: p.x,
        y: p.y,
        packId: 0,
      },
      world.rng,
    );
    m.aggro = true;
    m.aggroAt = world.t;
    m.nextSpecialAt = world.t + AGGRO_SPECIAL_DELAY;
    world.monsters.push(m);
    if (o.kind === 'boss') world.bossId = m.id;
    out.push(m);
  }
  world.totalMonsters += n;
  return out;
}

/**
 * Remove the real monsters, the dummies, or all; the boss bar moves to the next
 * living boss. Clearing the monsters also removes their telegraphs and shots.
 */
export function clearMonsters(world: ArpgWorld, which: 'monsters' | 'dummies' | 'all'): void {
  world.monsters = world.monsters.filter((m) =>
    which === 'all' ? false : which === 'dummies' ? !m.dummy : !!m.dummy,
  );
  if (which !== 'dummies') {
    world.zones = world.zones.filter((z) => z.owner !== 'monster');
    world.projectiles = world.projectiles.filter((p) => p.owner !== 'monster');
  }
  if (!world.monsters.some((m) => m.id === world.bossId)) world.bossId = livingBossId(world);
}

/** Change the toggles (the client never writes `world.sandbox` itself). */
export function setSandboxToggles(world: ArpgWorld, toggles: SandboxToggles): void {
  world.sandbox = { ...toggles };
  // Switching No cooldowns on frees every move and charges every chain at once (the tick keeps them so).
  if (toggles.noCooldowns) {
    world.hero.cooldowns = world.hero.cooldowns.map((cs) => cs.map((c) => Math.min(c, world.t)));
    fillCharge(world);
  }
}

/** Fill every charge-paid chain to its largest need (for when No cooldowns is off). */
export function fillCharge(world: ArpgWorld): void {
  const h = world.hero;
  h.chains.forEach((chain, i) => {
    if (chain.payment === 'charge') h.charge[i] = chargeCap(chain);
  });
}

/**
 * The hero fell with Invulnerable off: back at once where it fell, with full
 * life and potions and Phoenix ready, every action, beat, waiting press and
 * buff cleared, and a second of invulnerability so a crowd can't kill it again
 * at once. Monsters stay.
 */
export function respawnHero(registry: DataRegistry, world: ArpgWorld): void {
  const h = world.hero;
  const t = world.t;
  world.heroDead = false;
  h.hp = h.stats.maxHp;
  h.potions = registry.getDelveBalance().dive.potions;
  h.phoenixAvailable = true;
  h.phoenixUsed = false;
  h.windup = null;
  h.hold = null;
  h.swing = null;
  h.pushes = [];
  h.swaySide = 1;
  h.recoverUntil = t;
  h.dodge = null;
  h.defend = null;
  h.ward = null;
  h.barrier = null;
  h.quickUntil = 0;
  h.reactionReadyAt = {};
  h.invulnUntil = t + 1;
  h.chains.forEach((_, i) => clearBeat(world, i));
}

/**
 * A clean weapon: the base's implicits only, scaled by rarity and item level,
 * with no random affixes and no legendary power (powers come from the
 * toggles). A fixed seed, so the same choice always gives the same item; it
 * attunes to its element by rarity, as any weapon does.
 */
export function sandboxWeapon(
  registry: DataRegistry,
  o: { baseId: string; mana: ManaType; rarity: Rarity; ilvl: number },
): GearItem {
  const item = generateItem(
    registry,
    {
      uid: `sandbox-${o.baseId}-${o.mana}-${o.rarity}-${o.ilvl}`,
      ilvl: o.ilvl,
      rarity: o.rarity,
      slot: 'weapon',
      baseId: o.baseId,
      mana: o.mana,
    },
    new SeededRNG(1),
  );
  item.affixes = [];
  delete item.legendary;
  item.name = baseDisplayName(registry, item);
  return item;
}
