import type { DataRegistry } from '../data/registry.js';
import type {
  ArpgData,
  ArpgEvent,
  ArpgWorld,
  DropKind,
  HitSource,
  MonsterEntity,
  ReactionDef,
  ReactionId,
  StatusId,
  Vec,
} from '../types/arpg.js';
import type { DelveBalance } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { rollEncounterDrops } from '../loot/drops.js';
import { scrapLevelFactor } from '../loot/item-generator.js';
import { armorReduction, hasMastery } from '../delve/hero-stats.js';
import { dirTo, dist } from './geometry.js';
import { addCharge, defendingAbility, shieldHero } from './abilities/defend.js';
import { notePerfect, refundDodgeCharge } from './dodge.js';

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
  /** The source includes Earth: a stagger it applies rattles the foe (Earth's mark). */
  rattles?: boolean;
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
export function isRattled(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.rattledUntil;
}
export function isSundered(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.sunderUntil;
}

/** Whether `m` carries `element`'s mark: the status a reaction of that element needs. */
export function hasMark(ctx: SimCtx, m: MonsterEntity, element: ManaType): boolean {
  switch (element) {
    case 'fire':
      return isBurning(ctx, m);
    case 'frost':
      return isChilled(ctx, m) || isFrozen(ctx, m);
    case 'storm':
      return isShocked(ctx, m);
    case 'earth':
      return isRattled(ctx, m);
    case 'shadow':
      return isHexed(ctx, m);
    case 'nature':
      return isPoisoned(ctx, m);
  }
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

/**
 * Plague's and Blight's spread: the foe's poison and hex (each only if it has
 * it) pass to its neighbours.
 */
function spreadAffliction(ctx: SimCtx, m: MonsterEntity): void {
  for (const o of nearby(ctx, m, ctx.bal.reactions.blightRadius)) {
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

/** Apply `status`; with `rattles` (an Earth source) a stagger also rattles the foe. */
export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles = false,
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
      // Earth's mark outlasts the stagger, and immunity doesn't refuse it.
      if (rattles) s.rattledUntil = t + st.rattleDuration;
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

/** Every other living foe within `radius` of `m` (edge to centre, as Overload always measured). */
function nearby(ctx: SimCtx, m: MonsterEntity, radius: number): MonsterEntity[] {
  return ctx.world.monsters.filter(
    (o) => !o.dead && o.id !== m.id && dist(o.x, o.y, m.x, m.y) <= radius + o.radius,
  );
}

/**
 * The reaction a hit of `element` sets off on `m`: the first other element's
 * mark on it, in MANA_TYPES order, whose reaction can fire now; else null.
 */
function findReaction(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
): { def: ReactionDef; mark: ManaType } | null {
  for (const mark of MANA_TYPES) {
    if (mark === element || !hasMark(ctx, m, mark)) continue;
    // Earth shatters a freeze, not a mere chill.
    if (element === 'earth' && mark === 'frost' && !isFrozen(ctx, m)) continue;
    const def = ctx.registry.getReactionFor(element, mark);
    // A buff reaction on its own cooldown can't fire.
    if (!def.cooldown || ctx.world.t >= (ctx.world.hero.reactionReadyAt[def.id] ?? 0))
      return { def, mark };
  }
  return null;
}

/**
 * Clear the mark that set `reaction` off. Earth's Shatter breaks only the
 * freeze; Storm's Superconduct takes only the chill (the freeze it would
 * add again is refused by immunity, so the foe stays frozen).
 */
function useUpMark(m: MonsterEntity, mark: ManaType, reaction: ReactionId): void {
  const s = m.status;
  switch (mark) {
    case 'fire':
      s.burnUntil = 0;
      break;
    case 'frost':
      if (reaction !== 'shatter') {
        s.chillUntil = 0;
        s.chillStacks = 0;
      }
      if (reaction !== 'superconduct') s.freezeUntil = 0;
      break;
    case 'storm':
      s.shockUntil = 0;
      break;
    case 'earth':
      s.rattledUntil = 0;
      break;
    case 'shadow':
      s.hexUntil = 0;
      break;
    case 'nature':
      s.poisonStacks = 0;
      s.poisonUntil = 0;
      break;
  }
}

/**
 * A reaction's effect on `m` (its mark already used up). Returns the hit's
 * amount after it: the damage multipliers, times Catalyst.
 */
function react(ctx: SimCtx, m: MonsterEntity, id: ReactionId, amount: number): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100;
  switch (id) {
    case 'melt':
      return amount * r.meltMult * catalyst;
    case 'shatter':
      return amount * r.shatterMult * catalyst;
    case 'overload': {
      const blast = amount * r.overloadMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.overloadRadius,
        element: 'storm',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.overloadRadius))
        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true });
      return amount;
    }
    case 'superconduct':
      freeze(ctx, m, r.superconductFreeze);
      return amount;
    case 'soulfire':
      return amount * catalyst;
    case 'combust': {
      const hit = amount * r.combustMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.combustRadius,
        element: 'nature',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.combustRadius))
        hitMonster(ctx, o, hit, 'fire', { source: 'reaction', noReact: true });
      return hit;
    }
    case 'blight':
      spreadAffliction(ctx, m);
      return amount;
    case 'obsidian': {
      // The larger barrier wins; a smaller one only extends it.
      const hp = Math.min(amount * r.obsidianSoak, h.stats.maxHp * r.obsidianCap);
      if (!h.barrier || hp > h.barrier.hp)
        h.barrier = { hp, max: hp, until: t + r.obsidianDuration };
      else h.barrier.until = t + r.obsidianDuration;
      return amount;
    }
    case 'lightning_rod':
      refundDodgeCharge(ctx);
      h.quickUntil = t + r.lightningRodDuration;
      return amount;
    case 'sunder':
      // Later hits only: this one's multipliers are already in.
      m.status.sunderUntil = t + r.sunderDuration;
      return amount;
    default:
      // The new eight's effects arrive in their own tasks.
      return amount;
  }
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

  // A dummy resists as its own setting says (Neutral: nothing); its `element` is only its look.
  const resists = m.dummy ? m.dummy.element : m.element;
  if (element) {
    if (opts.source !== 'dot') amount *= 1 + stats.elementPower[element];
    if (resists && element === resists) amount *= 1 - bal.monster.resist;
    if (resists && element === ctx.data.weakness[resists]) amount *= 1 + bal.monster.weakness;
  }
  if (opts.source === 'basic' && m.traits.includes('armored'))
    amount *= 1 - bal.monster.traits.armoredReduction;
  if (isShocked(ctx, m)) amount *= 1 + bal.status.shockBonus * (mastery(ctx, 'storm') ? 2 : 1);
  if (isHexed(ctx, m)) amount *= 1 + bal.status.hexBonus;
  if (isSundered(ctx, m)) amount *= 1 + bal.reactions.sunderBonus;
  if (isFrozen(ctx, m) && mastery(ctx, 'frost')) amount *= 1.3;

  // Elemental reactions: this hit's element meets another element's mark on the foe.
  let reaction: ReactionId | undefined;
  const found = element && !opts.noReact ? findReaction(ctx, m, element) : null;
  if (found) {
    reaction = found.def.id;
    if (found.def.consumes !== false) useUpMark(m, found.mark, reaction);
    amount = react(ctx, m, reaction, amount);
    if (found.def.cooldown) h.reactionReadyAt[reaction] = world.t + bal.reactions.reactionCooldown;
    noteReaction(ctx, reaction, m);
    if (reaction === 'soulfire') healHero(ctx, amount * bal.reactions.soulfireHeal, 'soulfire');
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
    source: opts.source,
    slot: opts.slot,
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
    !m.dummy &&
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
      source: opts.source,
      slot: opts.slot,
    });
    m.hp = 0;
  }

  // A training dummy never dies: lethal damage puts it back to full, and the hit carries on.
  if (m.dummy && m.hp <= 0) m.hp = m.maxHp;
  if (m.hp <= 0) {
    if (opts.spread) spreadAffliction(ctx, m);
    killMonster(ctx, m);
    return amount;
  }

  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount, opts.rattles);
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

/** The latest living boss's id, or null: the boss bar follows it. */
export function livingBossId(world: ArpgWorld): number | null {
  for (let i = world.monsters.length - 1; i >= 0; i--) {
    const m = world.monsters[i];
    if (!m.dead && m.kind === 'boss') return m.id;
  }
  return null;
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
  if (m.id === world.bossId) world.bossId = livingBossId(world);

  // The Training Grounds drop nothing: no scrap, items, motes or orbs.
  const scrap = world.sandbox
    ? 0
    : Math.round(
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

  if (!world.sandbox) dropLoot(ctx, m);

  // Hellfire Brand: branded corpses explode and brand their neighbours.
  if (t < m.status.brandUntil) {
    const radius = 2.6;
    const blast = h.stats.weaponDamage * h.stats.damageMult * 1.5;
    ctx.events.push({ kind: 'explode', x: m.x, y: m.y, radius, element: 'fire', infusion: null });
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

/** Items, a mana mote and health orbs burst from a dying foe. */
function dropLoot(ctx: SimCtx, m: MonsterEntity): void {
  const { world, bal, registry } = ctx;
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
      pair: loot.pair,
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
  // Invulnerable (Training Grounds): the hit lands and reports its damage, but takes no life.
  const blocked = !!world.sandbox?.invulnerable;
  if (!blocked) h.hp -= dmg;
  h.lastHitAt = world.t;
  ctx.events.push({
    kind: 'heroHit',
    x: h.x,
    y: h.y,
    amount: dmg,
    dodged: false,
    element,
    ...(blocked ? { blocked: true } : {}),
  });

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
