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
import { pressStep } from './abilities/cast.js';
import { chargeCap } from './abilities/resolve.js';
import { notePerfect, refundDodgeCharge } from './dodge.js';
import { dropRune } from './rune-drops.js';
import { dropMaterials } from './material-drops.js';

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
  /** Added to the factor of the reactions this hit sets off (Volatile; see the runes spec). */
  catalyst?: number;
  /** Mana this hit gives per foe while its skill's Drain budget lasts. */
  manaOnHit?: number;
  /** Frozen foes left below this life fraction shatter. */
  execute?: number;
  /** On a kill, the foe's poison and hex spread to its neighbours (Plague). */
  spread?: boolean;
  /** The ability slot dealing the hit; it doesn't charge itself. Its burn, poison and reaction splash carry it too. */
  slot?: number;
  /** 0–1: how hard the hit lands (client feel; 0 for ticks, DoTs, chains). */
  heft?: number;
  /** The source includes Earth: its stagger adds Earth stacks. */
  rattles?: boolean;
  /**
   * Stacks the hit applies of each element status in `applies`, and brings to a pairing
   * (default `stacks.tick`; see the elemental stacks spec).
   */
  stacks?: number;
}

/** The status each element's hits apply: its stacks (Earth's `stagger` only from an Earth source). */
export const BASIC_STATUS: Record<ManaType, StatusId> = {
  fire: 'burn',
  frost: 'chill',
  storm: 'shock',
  earth: 'stagger',
  shadow: 'hex',
  nature: 'poison',
};
/** BASIC_STATUS's inverse: the element whose stacks a status adds. */
const STATUS_ELEMENT: Partial<Record<StatusId, ManaType>> = Object.fromEntries(
  MANA_TYPES.map((e) => [BASIC_STATUS[e], e]),
);

export function isBurning(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.fire > 0;
}
export function isChilled(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.frost > 0;
}
export function isFrozen(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.freezeUntil;
}
export function isShocked(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.storm > 0;
}
export function isHexed(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.shadow > 0;
}
export function isStunned(ctx: SimCtx, m: MonsterEntity): boolean {
  return isFrozen(ctx, m) || ctx.world.t < m.status.staggerUntil;
}
export function isPoisoned(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.nature > 0;
}
export function isRooted(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.rootUntil;
}
export function isRattled(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.earth > 0;
}
export function isSundered(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.sunderUntil;
}

/** Whether `m` has stacks of `element`; for frost, a bare freeze counts too. */
export function hasMark(ctx: SimCtx, m: MonsterEntity, element: ManaType): boolean {
  return m.status.stacks[element] > 0 || (element === 'frost' && isFrozen(ctx, m));
}

/** Most stacks of `element` a foe holds (Nature's doubled by its mastery). */
function stackCap(ctx: SimCtx, element: ManaType): number {
  return ctx.bal.stacks.cap * (element === 'nature' && mastery(ctx, 'nature') ? 2 : 1);
}

/**
 * How strong `n` stacks of a status are, in per-stack units: `stacks.curve[n - 1]`, each stack
 * past the curve's end adding its last step (Plaguebearer's poison).
 */
export function stackIntensity(ctx: SimCtx, n: number): number {
  const c = ctx.bal.stacks.curve;
  if (n <= 0) return 0;
  if (n <= c.length) return c[n - 1];
  const last = c[c.length - 1];
  return last + (n - c.length) * (last - c[c.length - 2]);
}

/**
 * `n` more stacks of `element` on `m` (to the cap), starting the element's timer again. A
 * burn's or poison's `ref` (damage per stack) and `slot` take over when the element had no
 * stacks, or when `ref` is at least the current one. A spread onto a foe that already has as
 * many passes `n` ≤ 0: it adds none, but the timer and the ref still refresh.
 */
function applyStacks(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
  n: number,
  ref: number,
  slot: number | undefined,
): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = s.stacks[element] > 0;
  if (!active && n <= 0) return;
  s.stacks[element] = Math.min(stackCap(ctx, element), s.stacks[element] + Math.max(0, n));
  s.stackUntil[element] = t + ctx.bal.stacks.duration[element];
  if (element === 'fire') {
    if (!active) s.burnTickAt = t + 0.5;
    if (!active || ref >= s.burnRef) {
      s.burnRef = ref;
      s.burnSlot = slot;
    }
  } else if (element === 'nature') {
    if (!active) s.poisonTickAt = t + 0.5;
    if (!active || ref >= s.poisonRef) {
      s.poisonRef = ref;
      s.poisonSlot = slot;
    }
  }
}

/** A spread: `o` takes at least `m`'s stacks of `element`, with its burn's or poison's ref and slot. */
function spreadStacks(ctx: SimCtx, m: MonsterEntity, o: MonsterEntity, element: ManaType): void {
  const s = m.status;
  if (s.stacks[element] <= 0) return;
  const [ref, slot] =
    element === 'fire'
      ? [s.burnRef, s.burnSlot]
      : element === 'nature'
        ? [s.poisonRef, s.poisonSlot]
        : [0, undefined];
  applyStacks(ctx, o, element, s.stacks[element] - o.status.stacks[element], ref, slot);
}

/** Plague's and Blight's spread: the foe's nature and shadow stacks pass to its neighbours. */
function spreadAffliction(ctx: SimCtx, m: MonsterEntity): void {
  for (const o of nearby(ctx, m, ctx.bal.reactions.blightRadius)) {
    spreadStacks(ctx, m, o, 'nature');
    spreadStacks(ctx, m, o, 'shadow');
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

/**
 * Apply `status` outside a hit (a hit's own go through `hitMonster`): `n` stacks of its
 * element (a stagger's Earth stacks only with `rattles`, an Earth source), and frost crossing
 * `stacks.freezeAt` freezes. `slot`: the ability applying it; a burn's or poison's ticks carry
 * it when it sets their damage.
 */
export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles = false,
  slot?: number,
  n = ctx.bal.stacks.tick,
): void {
  const frost = m.status.stacks.frost;
  addStatus(ctx, m, status, hitAmount, rattles, slot, n);
  crossFreeze(ctx, m, frost);
}

/** Frost's count crossing `stacks.freezeAt` since `before` freezes the foe (immunity may refuse). */
function crossFreeze(ctx: SimCtx, m: MonsterEntity, before: number): void {
  const at = ctx.bal.stacks.freezeAt;
  if (before < at && m.status.stacks.frost >= at) freeze(ctx, m, ctx.bal.status.freezeDuration);
}

/** `applyStatus` without the freeze check: a hit checks once, after all of its statuses. */
function addStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles: boolean | undefined,
  slot: number | undefined,
  n: number,
): void {
  const st = ctx.bal.status;
  const t = ctx.world.t;
  const boss = m.kind === 'boss';
  const ccScale = boss ? 0.4 : 1;
  const s = m.status;
  const element = STATUS_ELEMENT[status];
  // The element's stacks; a stagger's Earth stacks only from an Earth source (immunity doesn't refuse them).
  if (element && (status !== 'stagger' || rattles)) {
    const perStack = element === 'fire' ? st.burnDps : element === 'nature' ? st.poisonDps : 0;
    applyStacks(ctx, m, element, n, hitAmount * perStack, slot);
  }
  switch (status) {
    case 'freeze':
      // Glacier: frost up to the threshold, so the hit crosses it.
      applyStacks(ctx, m, 'frost', ctx.bal.stacks.freezeAt - s.stacks.frost, 0, slot);
      break;
    case 'stagger':
      if (t < s.staggerImmuneUntil) break;
      s.staggerUntil = Math.max(s.staggerUntil, t + st.staggerDuration * ccScale);
      s.staggerImmuneUntil = s.staggerUntil + st.staggerImmunity;
      m.windupUntil = 0;
      break;
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

function noteReaction(ctx: SimCtx, reaction: ReactionId, m: MonsterEntity, pairs: number): void {
  ctx.events.push({ kind: 'reaction', reaction, x: m.x, y: m.y, pairs });
  if (!ctx.world.pending.reactions.includes(reaction)) ctx.world.pending.reactions.push(reaction);
}

/** Every other living foe within `radius` of `m` (edge to centre, as Overload always measured). */
function nearby(ctx: SimCtx, m: MonsterEntity, radius: number): MonsterEntity[] {
  return ctx.world.monsters.filter(
    (o) => !o.dead && o.id !== m.id && dist(o.x, o.y, m.x, m.y) <= radius + o.radius,
  );
}

/** The damage reactions: each pair they take adds to the hit (see `react`); the rest fire once. */
const DAMAGE_REACTIONS = new Set<ReactionId>([
  'melt',
  'shatter',
  'overload',
  'combust',
  'crystallize',
]);

/**
 * What a hit of `element` bringing `k` stacks pairs with on `m`: the first other element in
 * MANA_TYPES order with stacks from earlier hits (a bare freeze counts as one frost stack) whose
 * reaction can fire, and `n`, the pairs it takes: all it can for a damage reaction, one for an
 * effect (see the elemental stacks spec); null while the foe's lockout runs, or if nothing pairs.
 */
function findPair(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
  k: number,
): { def: ReactionDef; partner: ManaType; n: number } | null {
  const s = m.status;
  const t = ctx.world.t;
  // This hit's own element pairs from its raw count: a frost hit never pairs a freeze it has no stacks for.
  const total = Math.min(stackCap(ctx, element), s.stacks[element] + k);
  if (total <= 0 || t < s.reactionLockUntil) return null;
  const frozen = isFrozen(ctx, m);
  for (const partner of MANA_TYPES) {
    if (partner === element) continue;
    const before = partner === 'frost' && frozen ? Math.max(1, s.stacks.frost) : s.stacks[partner];
    if (before <= 0) continue;
    // Earth shatters a freeze, not a mere chill.
    if (element === 'earth' && partner === 'frost' && !frozen) continue;
    const def = ctx.registry.getReactionFor(element, partner);
    // A buff reaction on its own cooldown can't fire.
    if (def.cooldown && t < (ctx.world.hero.reactionReadyAt[def.id] ?? 0)) continue;
    // A damage reaction takes every pair; an effect takes one, leaving the rest of both.
    return { def, partner, n: DAMAGE_REACTIONS.has(def.id) ? Math.min(total, before) : 1 };
  }
  return null;
}

/**
 * Take `n` stacks off both sides of a pair (a count stops at 0, and its status with it). A
 * freeze ends when frost was the partner, except under Superconduct, which keeps it.
 */
function consumePairs(
  m: MonsterEntity,
  element: ManaType,
  partner: ManaType,
  n: number,
  reaction: ReactionId,
): void {
  const s = m.status;
  s.stacks[element] = Math.max(0, s.stacks[element] - n);
  s.stacks[partner] = Math.max(0, s.stacks[partner] - n);
  if (partner === 'frost' && reaction !== 'superconduct') s.freezeUntil = 0;
}

/**
 * A reaction's effect on `m` with `n` pairs, before they come off. Returns the
 * hit's amount after it: a damage reaction adds its bonus once per pair, scaled
 * by Catalyst (the legendary's %, plus the hit's Volatile, `volatile`). `slot`:
 * the hit's ability slot, which its splash carries.
 */
function react(
  ctx: SimCtx,
  m: MonsterEntity,
  id: ReactionId,
  amount: number,
  slot: number | undefined,
  n: number,
  volatile: number,
): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100 + volatile;
  const boost = (mult: number) => 1 + (mult - 1) * n * catalyst;
  switch (id) {
    case 'melt':
      return amount * boost(r.meltMult);
    case 'shatter':
      return amount * boost(r.shatterMult);
    case 'overload': {
      const blast = amount * r.overloadMult * n * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.overloadRadius,
        element: 'storm',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.overloadRadius))
        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true, slot });
      return amount;
    }
    case 'superconduct':
      freeze(ctx, m, r.superconductFreeze);
      return amount;
    case 'soulfire':
      return amount * catalyst;
    case 'combust': {
      const hit = amount * boost(r.combustMult);
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.combustRadius,
        element: 'nature',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.combustRadius))
        hitMonster(ctx, o, hit, 'fire', { source: 'reaction', noReact: true, slot });
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
    case 'seedling':
      spawnDrop(ctx, 'orb', m.x, m.y, { amount: r.seedlingHeal, mana: 'nature' });
      return amount;
    case 'siphon': {
      // Three motes round the foe (fixed, no rng), pulled to the hero wherever it stands.
      const each = (r.siphonMana * h.manaMax) / 3;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const x = m.x + Math.cos(a) * 0.4;
        const y = m.y + Math.sin(a) * 0.4;
        spawnDrop(ctx, 'mote', x, y, { amount: each, mana: 'shadow', vacuum: true });
      }
      return amount;
    }
    case 'crystallize': {
      const hit = amount * boost(r.crystallizeMult);
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.crystallizeRadius,
        element: 'frost',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.crystallizeRadius)) applyStatus(ctx, o, 'chill', hit);
      return hit;
    }
    case 'blackout':
      for (const o of [m, ...nearby(ctx, m, r.blackoutRadius)]) applyStatus(ctx, o, 'blind', 0);
      return amount;
    case 'galvanize':
      // Per slot, as Nightstalker does for the Defensive: a unit of charge, or every move's cooldown.
      h.chains.forEach((chain, i) => {
        if (!chain) return;
        if (chain.payment === 'charge') h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + 1);
        else
          h.cooldowns[i] = h.cooldowns[i].map((c) =>
            c > t ? Math.max(t, c - r.galvanizeSeconds) : c,
          );
      });
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
  const stacks = m.status.stacks;
  const tempest = mastery(ctx, 'storm') ? 2 : 1;
  amount *= 1 + bal.stacks.shockPerStack * stackIntensity(ctx, stacks.storm) * tempest;
  amount *= 1 + bal.stacks.hexPerStack * stackIntensity(ctx, stacks.shadow);
  if (isSundered(ctx, m)) amount *= 1 + bal.reactions.sunderBonus;
  if (isFrozen(ctx, m) && mastery(ctx, 'frost')) amount *= 1.3;

  // Elemental reactions: this hit's stacks pair off with another element's from earlier hits.
  const k = opts.stacks ?? bal.stacks.tick;
  const frostBefore = stacks.frost;
  let reaction: ReactionId | undefined;
  const pair = element && !opts.noReact ? findPair(ctx, m, element, k) : null;
  if (pair) {
    reaction = pair.def.id;
    amount = react(ctx, m, reaction, amount, opts.slot, pair.n, opts.catalyst ?? 0);
    m.status.reactionLockUntil = world.t + bal.stacks.reactionLockout;
    if (pair.def.cooldown) h.reactionReadyAt[reaction] = world.t + bal.reactions.reactionCooldown;
    noteReaction(ctx, reaction, m, pair.n);
    // Volatile marks a reaction it scaled: a damage reaction, or Soulfire.
    if (opts.catalyst && (DAMAGE_REACTIONS.has(reaction) || reaction === 'soulfire'))
      ctx.events.push({ kind: 'runeFx', effect: 'volatile', x: m.x, y: m.y, element });
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
    ...(pair ? { pairs: pair.n } : {}),
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
    // Drain: mana per foe hit while the cast's budget lasts (`drainFoes` foe-hits since its
    // skill last fired, and `drainLeft` mana; the basic attack's at index 3).
    const drain = opts.slot ?? 3;
    if (opts.manaOnHit && h.drained[drain] < bal.runes.drainFoes && h.drainLeft[drain] > 0) {
      const gain = Math.min(opts.manaOnHit, h.drainLeft[drain]);
      h.drained[drain]++;
      h.drainLeft[drain] -= gain;
      h.mana = Math.min(h.manaMax, h.mana + gain);
    }
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
  // A kill consumes nothing: what reads the corpse sees its stacks as they were.
  if (m.hp <= 0) {
    if (opts.spread) spreadAffliction(ctx, m);
    killMonster(ctx, m);
    return amount;
  }

  // The hit's own element's stacks, then the pairs come off both sides, then its other
  // statuses; frost freezes only if its final count crossed the threshold from the lowest the
  // hit saw (on entry, or right after the pairs came off: 3 → 0 → 3 crosses, 2 → 0 → 2 doesn't).
  const applies = opts.applies ?? [];
  const own = element ? BASIC_STATUS[element] : null;
  const add = (s: StatusId) => addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k);
  if (own && applies.includes(own)) add(own);
  if (element && pair) consumePairs(m, element, pair.partner, pair.n, pair.def.id);
  const frostLow = Math.min(frostBefore, stacks.frost);
  for (const s of applies) if (s !== own) add(s);
  // The riposte staggers; it adds no stacks.
  if (riposte) addStatus(ctx, m, 'stagger', amount, false, undefined, 0);
  crossFreeze(ctx, m, frostLow);

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
  /** `vacuum`: pulled to the hero from anywhere (default: once the floor is cleared). */
  extra: { item?: GearItem; mana?: ManaType; amount: number; vacuum?: boolean },
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
    vacuum: extra.vacuum ?? world.cleared,
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

  // The Training Grounds drop nothing from kills: no scrap, items, motes, orbs or materials.
  // The kill's scrap bursts out as pickups (`dropMaterials`).
  const scrap = world.sandbox
    ? 0
    : Math.round(
        bal.loot.scrapPerKill *
          scrapLevelFactor(registry, world.depth) *
          bal.drops.scrapByKind[m.kind] *
          (1 + h.stats.scrapFind / 100),
      );
  ctx.events.push({ kind: 'death', id: m.id, x: m.x, y: m.y, monsterKind: m.kind, scrap });

  if (h.stats.healOnKill > 0) healHero(ctx, h.stats.maxHp * h.stats.healOnKill, 'kill');
  if (isHexed(ctx, m) && mastery(ctx, 'shadow')) healHero(ctx, h.stats.maxHp * 0.04, 'kill');
  // Nightstalker: kills hurry the Defensive's next move along.
  const guard = h.chains[1];
  if (h.stats.legendaries.nightstalker && guard) {
    if (guard.payment === 'charge') h.charge[1] = Math.min(chargeCap(guard), h.charge[1] + 1);
    else {
      const step = pressStep(h, 1, t, bal.abilities.comboWindow);
      h.cooldowns[1][step] = Math.max(t, h.cooldowns[1][step] - 1);
    }
  }

  // Fire mastery: flames spread from burning corpses.
  if (isBurning(ctx, m) && mastery(ctx, 'fire')) {
    for (const o of world.monsters)
      if (!o.dead && dist(o.x, o.y, m.x, m.y) <= 2.5) spreadStacks(ctx, m, o, 'fire');
  }

  if (!world.sandbox) {
    dropLoot(ctx, m);
    dropRune(ctx, m);
    dropMaterials(ctx, m, scrap);
  }

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
  const drops = rollEncounterDrops(
    registry,
    {
      depth: world.depth,
      kind: m.kind,
      gear: world.door?.mods.gear ?? 1,
      nextUid: loot.nextUid,
      biomeMana: world.element,
      pair: loot.pair,
    },
    lootRng,
  );
  loot.nextUid = drops.nextUid;
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
