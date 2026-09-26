import type { DataRegistry } from '../data/registry.js';
import type {
  ArpgData,
  ArpgEvent,
  ArpgWorld,
  DropKind,
  MonsterEntity,
  ReactionId,
  StatusId,
  Vec,
} from '../types/arpg.js';
import type { DelveBalance } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { rollEncounterDrops } from '../loot/drops.js';
import { scrapLevelFactor } from '../loot/item-generator.js';
import { armorReduction, hasMastery } from '../delve/hero-stats.js';
import { dirTo, dist } from './geometry.js';
import { addCharge, defendingAbility, shieldHero } from './abilities/defend.js';
import { notePerfect } from './dodge.js';

/** Everything a simulation step needs, threaded through the subsystems. */
export interface SimCtx {
  registry: DataRegistry;
  bal: DelveBalance;
  data: ArpgData;
  world: ArpgWorld;
  events: ArpgEvent[];
}

export function makeCtx(registry: DataRegistry, world: ArpgWorld, events: ArpgEvent[]): SimCtx {
  return { registry, bal: registry.getDelveBalance(), data: registry.getArpgData(), world, events };
}

export type HitSource = 'basic' | 'skill' | 'dot' | 'reaction' | 'thorns';

export interface HitOpts {
  source: HitSource;
  canCrit?: boolean;
  /** Pre-rolled crit (e.g. one roll per melee swing). */
  crit?: boolean;
  applies?: StatusId[];
  knockback?: number;
  kbFrom?: Vec;
  noReact?: boolean;
  /** Extra fraction of the damage healed (ability lifesteal). */
  leech?: number;
  /** Frozen foes left below this life fraction shatter. */
  execute?: number;
  /** On a kill, the foe's poison and hex spread to its neighbours (Plague). */
  spread?: boolean;
  /** The ability slot dealing the hit; it doesn't charge itself. */
  slot?: number;
  /** 0–1: how hard the hit lands (client feel; 0 for ticks, DoTs, chains). */
  heft?: number;
}

const KILL_SCRAP_MULT = { normal: 1, elite: 3, boss: 10 } as const;

export function isBurning(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.burnUntil;
}
export function isChilled(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.chillUntil;
}
export function isFrozen(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.freezeUntil;
}
export function isShocked(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.shockUntil;
}
export function isHexed(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.hexUntil;
}
export function isStunned(ctx: SimCtx, m: MonsterEntity): boolean {
  return isFrozen(ctx, m) || ctx.world.t < m.status.staggerUntil;
}
export function isPoisoned(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.poisonUntil && m.status.poisonStacks > 0;
}
export function isRooted(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.rootUntil;
}

/** Poison stack cap (doubled by the Nature mastery). */
function poisonCap(ctx: SimCtx): number {
  return ctx.bal.status.poisonMaxStacks * (mastery(ctx, 'nature') ? 2 : 1);
}

/** Give `m` at least `stacks` poison stacks of `dps` each, refreshing the duration. */
function poison(ctx: SimCtx, m: MonsterEntity, stacks: number, dps: number): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = isPoisoned(ctx, m);
  if (!active) s.poisonTickAt = t + 0.5;
  s.poisonStacks = Math.min(poisonCap(ctx), Math.max(active ? s.poisonStacks : 0, stacks));
  s.poisonDps = active ? Math.max(s.poisonDps, dps) : dps;
  s.poisonUntil = t + ctx.bal.status.poisonDuration;
}

/** Plague: a dying foe's poison and hex pass to its neighbours. */
function spreadAffliction(ctx: SimCtx, m: MonsterEntity): void {
  const r = ctx.bal.reactions.blightRadius;
  for (const o of ctx.world.monsters) {
    if (o.dead || o.id === m.id || dist(o.x, o.y, m.x, m.y) > r + o.radius) continue;
    if (isPoisoned(ctx, m)) poison(ctx, o, m.status.poisonStacks, m.status.poisonDps);
    if (isHexed(ctx, m)) o.status.hexUntil = Math.max(o.status.hexUntil, m.status.hexUntil);
  }
}

function mastery(ctx: SimCtx, mana: ManaType): boolean {
  return hasMastery(ctx.registry, ctx.world.hero.stats.attunement, mana);
}

export function healHero(
  ctx: SimCtx,
  amount: number,
  source: 'lifesteal' | 'potion' | 'kill' | 'orb' | 'soulfire',
): void {
  const h = ctx.world.hero;
  if (ctx.world.heroDead) return;
  const healed = Math.min(h.stats.maxHp - h.hp, amount);
  if (healed <= 0) return;
  h.hp += healed;
  ctx.events.push({ kind: 'heal', amount: healed, source });
}

function aggroPack(ctx: SimCtx, m: MonsterEntity): void {
  const t = ctx.world.t;
  for (const o of ctx.world.monsters) {
    if (!o.dead && !o.aggro && (o.id === m.id || o.packId === m.packId)) {
      o.aggro = true;
      o.aggroAt = t;
    }
  }
}

export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
): void {
  const st = ctx.bal.status;
  const t = ctx.world.t;
  const boss = m.kind === 'boss';
  const ccScale = boss ? 0.4 : 1;
  const s = m.status;
  switch (status) {
    case 'burn': {
      const dps = hitAmount * st.burnDps;
      s.burnDps = t < s.burnUntil ? Math.max(s.burnDps, dps) : dps;
      if (t >= s.burnUntil) s.burnTickAt = t + 0.5;
      s.burnUntil = t + st.burnDuration;
      break;
    }
    case 'chill': {
      s.chillStacks = t < s.chillUntil ? s.chillStacks + 1 : 1;
      s.chillUntil = t + st.chillDuration;
      if (s.chillStacks >= st.chillToFreeze) {
        s.chillStacks = 0;
        freeze(ctx, m, st.freezeDuration);
      }
      break;
    }
    case 'freeze':
      freeze(ctx, m, st.freezeDuration);
      break;
    case 'shock':
      s.shockUntil = t + st.shockDuration;
      break;
    case 'hex':
      s.hexUntil = t + st.hexDuration;
      break;
    case 'stagger':
      if (t < s.staggerImmuneUntil) break;
      s.staggerUntil = Math.max(s.staggerUntil, t + st.staggerDuration * ccScale);
      s.staggerImmuneUntil = s.staggerUntil + st.staggerImmunity;
      m.windupUntil = 0;
      break;
    case 'poison': {
      const active = isPoisoned(ctx, m);
      poison(ctx, m, active ? s.poisonStacks + 1 : 1, hitAmount * st.poisonDps);
      break;
    }
    case 'root':
      if (t < s.rootImmuneUntil) break;
      s.rootUntil = Math.max(s.rootUntil, t + st.rootDuration * (boss ? st.rootBossMult : 1));
      s.rootImmuneUntil = s.rootUntil + st.rootImmunity;
      break;
    case 'blind':
      s.blindUntil = t + st.blindDuration;
      break;
    case 'brand':
      s.brandUntil = t + 8;
      break;
  }
}

export function freeze(ctx: SimCtx, m: MonsterEntity, seconds: number): void {
  const t = ctx.world.t;
  if (t < m.status.freezeImmuneUntil) return;
  const scale = (m.kind === 'boss' ? 0.4 : 1) * (mastery(ctx, 'frost') ? 1.5 : 1);
  m.status.freezeUntil = Math.max(m.status.freezeUntil, t + seconds * scale);
  m.status.freezeImmuneUntil = m.status.freezeUntil + ctx.bal.status.freezeImmunity;
  m.windupUntil = 0;
  m.chargeUntil = 0;
  ctx.events.push({ kind: 'freeze', id: m.id });
}

function noteReaction(ctx: SimCtx, reaction: ReactionId, m: MonsterEntity): void {
  ctx.events.push({ kind: 'reaction', reaction, x: m.x, y: m.y });
  if (!ctx.world.pending.reactions.includes(reaction)) ctx.world.pending.reactions.push(reaction);
}

/**
 * Deal damage to a monster: resistances, crits, statuses, elemental reactions,
 * lifesteal, knockback and death. Returns the damage dealt.
 */
export function hitMonster(
  ctx: SimCtx,
  m: MonsterEntity,
  base: number,
  element: ManaType | null,
  opts: HitOpts,
): number {
  if (m.dead || base <= 0) return 0;
  const { world, bal } = ctx;
  const h = world.hero;
  const stats = h.stats;

  let amount = base;
  let crit = opts.crit ?? false;
  if (opts.crit === undefined && opts.canCrit) crit = world.rng.next() < stats.critChance;
  // Riposte (after a perfect dodge): the next real hit crits and staggers.
  const real =
    (opts.source === 'basic' || opts.source === 'skill') &&
    (opts.crit !== undefined || !!opts.canCrit);
  const riposte = real && world.t < h.riposteUntil;
  if (riposte) {
    crit = true;
    h.riposteUntil = 0;
  }
  if (crit) amount *= stats.critMultiplier;

  if (element) {
    if (opts.source !== 'dot') amount *= 1 + stats.elementPower[element];
    if (element === m.element) amount *= 1 - bal.monster.resist;
    if (element === ctx.data.weakness[m.element]) amount *= 1 + bal.monster.weakness;
  }
  if (opts.source === 'basic' && m.traits.includes('armored'))
    amount *= 1 - bal.monster.traits.armoredReduction;
  if (isShocked(ctx, m)) amount *= 1 + bal.status.shockBonus * (mastery(ctx, 'storm') ? 2 : 1);
  if (isHexed(ctx, m)) amount *= 1 + bal.status.hexBonus;
  if (isFrozen(ctx, m) && mastery(ctx, 'frost')) amount *= 1.3;

  // Elemental reactions: the element of this hit meets a status already on the foe.
  let reaction: ReactionId | undefined;
  if (element && !opts.noReact) {
    const r = bal.reactions;
    const catalyst = 1 + (stats.legendaries.catalyst ?? 0) / 100;
    const s = m.status;
    if (element === 'fire' && (isChilled(ctx, m) || isFrozen(ctx, m))) {
      reaction = 'melt';
      amount *= r.meltMult * catalyst;
      s.chillUntil = 0;
      s.chillStacks = 0;
      s.freezeUntil = 0;
    } else if (element === 'earth' && isFrozen(ctx, m)) {
      reaction = 'shatter';
      amount *= r.shatterMult * catalyst;
      s.freezeUntil = 0;
    } else if (element === 'storm' && isBurning(ctx, m)) {
      reaction = 'overload';
      s.burnUntil = 0;
      const blast = amount * r.overloadMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.overloadRadius,
        element: 'storm',
      });
      for (const o of world.monsters) {
        if (o.dead || o.id === m.id || dist(o.x, o.y, m.x, m.y) > r.overloadRadius + o.radius)
          continue;
        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true });
      }
    } else if (element === 'frost' && isShocked(ctx, m)) {
      reaction = 'superconduct';
      s.shockUntil = 0;
      freeze(ctx, m, r.superconductFreeze);
    } else if (element === 'fire' && isPoisoned(ctx, m)) {
      reaction = 'combust';
      amount *= r.combustMult * catalyst;
      s.poisonStacks = 0;
      s.poisonUntil = 0;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.combustRadius,
        element: 'nature',
      });
      for (const o of world.monsters) {
        if (o.dead || o.id === m.id || dist(o.x, o.y, m.x, m.y) > r.combustRadius + o.radius)
          continue;
        hitMonster(ctx, o, amount, 'fire', { source: 'reaction', noReact: true });
      }
    } else if (element === 'shadow' && isPoisoned(ctx, m)) {
      reaction = 'blight';
      for (const o of world.monsters) {
        if (o.dead || o.id === m.id || dist(o.x, o.y, m.x, m.y) > r.blightRadius + o.radius)
          continue;
        poison(ctx, o, s.poisonStacks, s.poisonDps);
      }
    } else if (element === 'fire' && isHexed(ctx, m)) {
      reaction = 'soulfire';
      amount *= catalyst;
    }
    if (reaction) noteReaction(ctx, reaction, m);
    if (reaction === 'soulfire') healHero(ctx, amount * r.soulfireHeal, 'soulfire');
  }

  m.hp -= amount;
  m.lastHitAt = world.t;
  if (!m.aggro) aggroPack(ctx, m);
  ctx.events.push({
    kind: 'hit',
    id: m.id,
    x: m.x,
    y: m.y,
    amount,
    crit,
    element,
    reaction,
    heft: opts.heft ?? 0,
  });

  if (opts.source === 'basic' || opts.source === 'skill') {
    const shadowGuard = defendingAbility(ctx)?.elements.includes('shadow')
      ? ctx.bal.abilities.defend.shadowLifesteal
      : 0;
    const leech = stats.lifesteal + (opts.leech ?? 0) + shadowGuard;
    if (leech > 0) healHero(ctx, amount * leech, 'lifesteal');
    addCharge(ctx, amount, opts.slot);
  }

  if (
    m.hp > 0 &&
    opts.execute &&
    m.kind !== 'boss' &&
    isFrozen(ctx, m) &&
    m.hp / m.maxHp <= opts.execute
  ) {
    ctx.events.push({
      kind: 'hit',
      id: m.id,
      x: m.x,
      y: m.y,
      amount: m.hp,
      crit: true,
      element,
      reaction: 'shatter',
      heft: 0,
    });
    m.hp = 0;
  }

  if (m.hp <= 0) {
    if (opts.spread) spreadAffliction(ctx, m);
    killMonster(ctx, m);
    return amount;
  }

  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount);
  if (riposte) applyStatus(ctx, m, 'stagger', amount);

  if (opts.knockback && opts.kbFrom) {
    const resist = m.kind === 'boss' ? 0.15 : m.kind === 'elite' ? 0.5 : 1;
    const d = dirTo(opts.kbFrom.x, opts.kbFrom.y, m.x, m.y);
    m.kbx += d.x * opts.knockback * 6 * resist;
    m.kby += d.y * opts.knockback * 6 * resist;
  }

  if (m.traits.includes('spiked') && opts.source !== 'dot' && opts.source !== 'reaction') {
    hurtHero(ctx, amount * bal.monster.traits.spikedFraction, m.element, null, {
      unavoidable: true,
    });
  }
  return amount;
}

function spawnDrop(
  ctx: SimCtx,
  kind: DropKind,
  x: number,
  y: number,
  extra: { item?: GearItem; mana?: ManaType; amount: number },
): void {
  const { world } = ctx;
  const id = world.nextId++;
  world.drops.push({
    id,
    kind,
    x,
    y,
    item: extra.item,
    mana: extra.mana,
    amount: extra.amount,
    born: world.t,
    vacuum: world.cleared,
    dead: false,
  });
  ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: kind, rarity: extra.item?.rarity });
}

export function killMonster(ctx: SimCtx, m: MonsterEntity): void {
  if (m.dead) return;
  const { world, bal, registry } = ctx;
  const h = world.hero;
  const t = world.t;
  m.dead = true;
  m.hp = 0;
  world.kills++;
  world.pending.kills++;
  if (m.kind === 'boss') world.bossKilled = true;

  const scrap = Math.round(
    bal.loot.scrapPerKill *
      scrapLevelFactor(registry, world.depth) *
      KILL_SCRAP_MULT[m.kind] *
      (1 + h.stats.scrapFind / 100),
  );
  world.pending.scrap += scrap;
  ctx.events.push({ kind: 'death', id: m.id, x: m.x, y: m.y, monsterKind: m.kind, scrap });

  if (h.stats.healOnKill > 0) healHero(ctx, h.stats.maxHp * h.stats.healOnKill, 'kill');
  if (t < m.status.hexUntil && mastery(ctx, 'shadow')) healHero(ctx, h.stats.maxHp * 0.04, 'kill');
  // Nightstalker: kills hurry the Defensive along.
  const guard = h.abilities[1];
  if (h.stats.legendaries.nightstalker && guard) {
    if (guard.build.payment === 'charge') h.charge[1] = Math.min(guard.chargeNeed, h.charge[1] + 1);
    else h.cooldowns[1] = Math.max(t, h.cooldowns[1] - 1);
  }

  // Fire mastery: flames spread from burning corpses.
  if (t < m.status.burnUntil && mastery(ctx, 'fire')) {
    for (const o of world.monsters) {
      if (o.dead || dist(o.x, o.y, m.x, m.y) > 2.5) continue;
      o.status.burnDps = Math.max(o.status.burnDps, m.status.burnDps);
      if (t >= o.status.burnUntil) o.status.burnTickAt = t + 0.5;
      o.status.burnUntil = t + bal.status.burnDuration;
    }
  }

  // Loot
  const lootRng = world.lootRng;
  const loot = world.loot;
  const forceLegendary = m.kind === 'boss' && loot.forceLegendary;
  const drops = rollEncounterDrops(
    registry,
    {
      depth: world.depth,
      kind: m.kind,
      magicFind: loot.magicFind,
      pity: loot.pity,
      dropMult: loot.dropMult,
      legendaryBoost: loot.legendaryBoost,
      forceLegendary,
      nextUid: loot.nextUid,
      biomeMana: world.element,
    },
    lootRng,
  );
  loot.pity = drops.pity;
  loot.nextUid = drops.nextUid;
  if (forceLegendary) loot.forceLegendary = false;
  drops.items.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, drops.items.length) + lootRng.next() * 0.8;
    const r = 0.6 + lootRng.next() * 0.9;
    const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
    const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
    spawnDrop(ctx, 'item', x, y, { item, amount: 1 });
  });

  const mote =
    m.kind === 'boss'
      ? bal.mana.bossMote
      : m.kind === 'elite'
        ? bal.mana.eliteMote
        : bal.mana.moteAmount;
  spawnDrop(ctx, 'mote', m.x + (lootRng.next() - 0.5), m.y + (lootRng.next() - 0.5), {
    mana: m.element,
    amount: mote,
  });
  const orbs =
    m.kind === 'boss'
      ? 3
      : m.kind === 'elite'
        ? 1
        : lootRng.next() < bal.dive.healthOrbChance
          ? 1
          : 0;
  for (let i = 0; i < orbs; i++) {
    spawnDrop(ctx, 'orb', m.x + (lootRng.next() - 0.5) * 2, m.y + (lootRng.next() - 0.5) * 2, {
      amount: bal.dive.healthOrbHeal,
    });
  }

  // Hellfire Brand: branded corpses explode and brand their neighbours.
  if (t < m.status.brandUntil) {
    const radius = 2.6;
    const blast = h.stats.weaponDamage * h.stats.damageMult * 1.5;
    ctx.events.push({ kind: 'explode', x: m.x, y: m.y, radius, element: 'fire' });
    for (const o of world.monsters) {
      if (o.dead || dist(o.x, o.y, m.x, m.y) > radius + o.radius) continue;
      hitMonster(ctx, o, blast, 'fire', {
        source: 'skill',
        canCrit: true,
        applies: ['brand', 'burn'],
      });
    }
  }
}

export interface HurtOpts {
  melee?: boolean;
  /** Ignores dodge, blind and invulnerability (spiked reflection). */
  unavoidable?: boolean;
}

/** Monster → hero damage with dodge, blind, armor, thorns, vampirism and death. */
export function hurtHero(
  ctx: SimCtx,
  raw: number,
  element: ManaType | null,
  source: MonsterEntity | null,
  opts: HurtOpts = {},
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  if (world.heroDead || raw <= 0) return;
  if (!opts.unavoidable) {
    if (world.t < h.invulnUntil) {
      notePerfect(ctx);
      return;
    }
    const blind =
      source && world.t < source.status.blindUntil && world.rng.next() < bal.status.blindMiss;
    if (blind || world.rng.next() < h.stats.dodge) {
      ctx.events.push({ kind: 'heroHit', x: h.x, y: h.y, amount: 0, dodged: true, element });
      return;
    }
  }
  let dmg = raw;
  if (!opts.unavoidable) dmg *= 1 - armorReduction(bal, h.stats.armor, world.depth);
  dmg = shieldHero(ctx, dmg, source, !!opts.melee);
  if (dmg <= 0) return;
  h.hp -= dmg;
  h.lastHitAt = world.t;
  ctx.events.push({ kind: 'heroHit', x: h.x, y: h.y, amount: dmg, dodged: false, element });

  if (source && !source.dead) {
    if (source.traits.includes('vampiric')) {
      source.hp = Math.min(source.maxHp, source.hp + dmg * bal.monster.traits.vampiricFraction);
    }
    if (opts.melee && h.stats.thorns > 0) {
      hitMonster(ctx, source, h.stats.thorns, null, { source: 'thorns', noReact: true });
    }
  }

  if (h.hp <= 0) {
    const phoenix = h.stats.legendaries.phoenix_plume ?? 0;
    if (phoenix > 0 && h.phoenixAvailable && !h.phoenixUsed) {
      h.phoenixUsed = true;
      h.hp = h.stats.maxHp * (phoenix / 100);
      h.invulnUntil = world.t + 1.5;
      ctx.events.push({ kind: 'revive', amount: h.hp });
      return;
    }
    h.hp = 0;
    world.heroDead = true;
    ctx.events.push({ kind: 'heroDeath' });
  }
}
