import type { DataRegistry } from '../../data/registry.js';
import {
  HOLD_STAGE_KINDS,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type Knobs,
  type KnobsData,
  type Move,
  type MoveKind,
  type ResolvedAbility,
  type ResolvedChain,
} from '../../types/ability.js';
import type { ManaType } from '../../types/mana.js';
import { DEFAULT_FORMS, weaponString } from '../../loot/moveset.js';
import type {
  DelveBalance,
  DelveProfile,
  HeroBlow,
  HeroStats,
  ManaPair,
} from '../../types/delve.js';

/** Knobs that change nothing: every merge starts from them (never mutate it). */
export const NEUTRAL: Knobs = {
  power: 1,
  area: 1,
  applies: [],
  chain: 0,
  pierce: 0,
  knockback: 0,
  lifesteal: 0,
  zone: null,
  pull: false,
  execute: 0,
  scatter: 0,
  spread: false,
  split: null,
  extraShots: null,
  echo: 0,
  quick: { beat: 1, cooldown: 1, windup: 1 },
  stacksBonus: 0,
  catalyst: 0,
  manaOnHit: 0,
  guardOnLand: 0,
};

/**
 * Combine knob sets (see the runes spec's knob table): multipliers multiply,
 * counts add (`pierce` true adds Infinity), flags OR, statuses union, a zone
 * takes the longer seconds and the larger tick power, `split` the larger count
 * with its power, `extraShots` adds counts and multiplies powers, `echo` the
 * largest, and each part of `quick` multiplies.
 */
export function mergeKnobs(...parts: KnobsData[]): Knobs {
  const k: Knobs = { ...NEUTRAL, applies: [], quick: { ...NEUTRAL.quick } };
  for (const p of parts) {
    if (p.power !== undefined) k.power *= p.power;
    if (p.area !== undefined) k.area *= p.area;
    for (const s of p.applies ?? []) if (!k.applies.includes(s)) k.applies.push(s);
    k.chain += p.chain ?? 0;
    k.pierce += p.pierce === true ? Infinity : p.pierce || 0;
    k.knockback += p.knockback ?? 0;
    k.lifesteal += p.lifesteal ?? 0;
    if (p.zone)
      k.zone = {
        seconds: Math.max(k.zone?.seconds ?? 0, p.zone.seconds),
        tickPower: Math.max(k.zone?.tickPower ?? 0, p.zone.tickPower),
      };
    k.pull ||= p.pull ?? false;
    k.execute = Math.max(k.execute, p.execute ?? 0);
    k.scatter = Math.max(k.scatter, p.scatter ?? 0);
    k.spread ||= p.spread ?? false;
    if (p.split && (!k.split || p.split.count > k.split.count)) k.split = { ...p.split };
    if (p.extraShots)
      k.extraShots = {
        count: (k.extraShots?.count ?? 0) + p.extraShots.count,
        power: (k.extraShots?.power ?? 1) * p.extraShots.power,
      };
    k.echo = Math.max(k.echo, p.echo ?? 0);
    k.quick.beat *= p.quick?.beat ?? 1;
    k.quick.cooldown *= p.quick?.cooldown ?? 1;
    k.quick.windup *= p.quick?.windup ?? 1;
    k.stacksBonus += p.stacksBonus ?? 0;
    k.catalyst += p.catalyst ?? 0;
    k.manaOnHit += p.manaOnHit ?? 0;
    k.guardOnLand += p.guardOnLand ?? 0;
  }
  return k;
}

/** The weight a move resolves at: its kind's (`chains.kindWeight`), a hold's by its stage. */
export function moveWeight(bal: DelveBalance, kind: Move['kind'], stage = 0): number {
  const c = bal.chains;
  return kind === 'hold' ? c.holdStageWeight[stage] : c.kindWeight[kind];
}

/**
 * Compile one move into the numbers and knobs the combat code reads: at its
 * kind's weight (a hold's at `stage`), paid with `payment`. It resolves as the
 * first move of a chain; `resolveChain` places it.
 */
export function resolveAbility(
  registry: DataRegistry,
  slot: AbilitySlot,
  move: Move,
  payment: AbilityPayment,
  stats: HeroStats,
  stage = 0,
): ResolvedAbility {
  const data = registry.getArpgData();
  const bal = registry.getDelveBalance();
  const ab = bal.abilities;
  const form = registry.getForm(move.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const [element, second] = move.elements;
  const fusion =
    second && second !== element ? (registry.getFusion(element, second) ?? null) : null;
  const L = stats.legendaries;

  const legendary: KnobsData[] = [];
  if (L.stormcaller && move.elements.includes('storm'))
    legendary.push({ chain: Math.round(L.stormcaller) });
  if (L.bedrock && move.elements.includes('earth'))
    legendary.push({ area: 1.4, applies: ['stagger'] });
  if (L.rimeheart && move.form === 'nova' && move.elements.includes('frost')) {
    legendary.push({ zone: { seconds: 3, tickPower: 0.15 } });
  }
  const knobs = mergeKnobs(
    ...move.elements.map((e) => data.elementTraits[e].knobs),
    fusion?.knobs ?? {},
    ...legendary,
  );

  const w = moveWeight(bal, move.kind, stage);
  const W = ab.weight;
  const s = ab.slots[slot];
  const cast = payment === 'cast';
  const payPower = cast ? ab.castPowerMult : 1;
  const avgAttune =
    move.elements.reduce((sum, e) => sum + stats.attunement[e], 0) / move.elements.length;
  // Gear `<Element> Damage` applies per hit by damage element (hitMonster), not here.
  const attunePower = 1 + bal.mana.powerPerAttune * avgAttune;
  const manaCost = s.cost * (1 + W.cost * w) * (1 - (L.manaweaver ?? 0) / 100);
  const size = 1 + W.size * w;
  // A hold needs its full charge's worth before it starts (see the moves and chains spec).
  const needWeight = move.kind === 'hold' ? moveWeight(bal, 'hold', 2) : w;
  // Volley's darts by kind; a hold's stages count as medium, heavy and hold.
  const countKind = move.kind === 'hold' ? HOLD_STAGE_KINDS[stage] : move.kind;

  const F = bal.feel;
  const wi = w + 2;
  const conjure = F.conjure[wi] * F.conjureSlot[slot];
  const channel = cast ? s.castTime * (1 + W.castTime * w) : 0;

  return {
    slot,
    kind: move.kind,
    weight: w,
    stage: move.kind === 'hold' ? stage : 0,
    payment,
    index: 0,
    last: false,
    form,
    name: `${fusion ? fusion.name : data.mana[element].name} ${form.name}`,
    icon: form.icon,
    element,
    elements: [...move.elements],
    fusion,
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower,
    effect: (form.effect ?? 0) * (1 + W.power * w) * payPower,
    cost: payment === 'charge' ? 0 : cast ? manaCost * ab.castManaMult : manaCost,
    cooldown:
      payment === 'charge'
        ? ab.chargeLockout
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult,
    castTime: conjure + channel,
    conjure,
    recovery: slot === 'defensive' ? 0 : F.recovery[wi],
    channel,
    heft: Math.min(1, F.heft[wi] + (slot === 'ultimate' ? 0.2 : 0)),
    heavyKnockback: Math.max(0, w) * F.heavyKnockback,
    heavyStagger: w >= 2,
    stacks: bal.stacks.byWeight[wi],
    motion: (form.motion ?? 0) * (1 + F.motionPerWeight * w),
    chargeNeed: payment === 'charge' ? s.cost * (1 + W.cost * needWeight) * ab.chargeRatio : 0,
    range: form.range ?? 0,
    radius: (form.radius ?? 0) * size * knobs.area,
    speed: (form.speed ?? 0) * (1 - W.speed * w),
    count: form.countByKind?.[countKind] ?? form.count ?? 1,
    duration: form.duration ?? 0,
    tick: form.tick ?? 0.5,
    arc: form.arc ?? 360,
    knobs,
    runes: [],
  };
}

/**
 * Compile a slot's chain: each move at its kind's weight with the chain's
 * payment, placed in the chain (its `index`, and `last` on the last of 2+),
 * and each hold move's three stages (`moves[i]` is its stage 0).
 */
export function resolveChain(
  registry: DataRegistry,
  stats: HeroStats,
  slot: AbilitySlot,
  chain: Chain,
): ResolvedChain {
  const n = chain.moves.length;
  const at = (move: Move, index: number, stage = 0): ResolvedAbility => ({
    ...resolveAbility(registry, slot, move, chain.payment, stats, stage),
    index,
    last: n > 1 && index === n - 1,
  });
  return {
    moves: chain.moves.map((m, i) => at(m, i)),
    payment: chain.payment,
    hold: chain.moves.map((m, i) => (m.kind === 'hold' ? [0, 1, 2].map((s) => at(m, i, s)) : null)),
  };
}

/** Move `step` of a chain as it fires: a hold move at `stage`, any other as it is. */
export function chainMove(chain: ResolvedChain, step: number, stage = 0): ResolvedAbility {
  return chain.hold[step]?.[stage] ?? chain.moves[step];
}

/** The most charge a chain's meter holds: its largest need. */
export function chargeCap(chain: ResolvedChain): number {
  return Math.max(...chain.moves.map((m) => m.chargeNeed));
}

/** The step bonus of the move at `index`: its power and size factors. */
export function stepBonus(bal: DelveBalance, index: number): { power: number; size: number } {
  const b = bal.chains.stepBonus * index;
  return { power: 1 + b, size: 1 + b / 2 };
}

/** The kind a move plays as: a hold's stage's (`HOLD_STAGE_KINDS`: a tap on one plays as a medium). */
export function playedKind(ab: ResolvedAbility): MoveKind {
  return ab.kind === 'hold' ? HOLD_STAGE_KINDS[ab.stage] : ab.kind;
}

/**
 * The beat after a move lands: the seconds its slot waits before the chain's
 * next move can start, by the kind it played as (`playedKind`), its slot and
 * the hero's tempo (see the chain feel spec).
 */
export function beatFor(
  bal: DelveBalance,
  slot: AbilitySlot,
  kind: MoveKind,
  tempo: number,
): number {
  return bal.chains.beat[kind] * bal.chains.beatSlot[slot] * tempo;
}

/**
 * The beat after `ab` lands (`beatFor` by the kind it played as) times its
 * `quick.beat`: Quick shortens it, Heavy lengthens it (see the runes spec).
 */
export function moveBeat(bal: DelveBalance, ab: ResolvedAbility, tempo: number): number {
  return beatFor(bal, ab.slot, playedKind(ab), tempo) * ab.knobs.quick.beat;
}

/** Seconds a hold (an ability's or a hold blow's) takes to reach full charge at `tempo`. */
export function holdFull(bal: DelveBalance, tempo: number): number {
  return bal.chains.holdTime * tempo;
}

/**
 * A move's numbers as the sim uses them: its hit before the foe's modifiers
 * (weapon damage × damage × power, with the step bonus's power, but for a
 * Ward's burst and an Armor's strike-back), and its radius (with the step's
 * size for a Bolt's explosion and a Burst).
 */
export function moveNumbers(
  stats: HeroStats,
  bal: DelveBalance,
  ab: ResolvedAbility,
): { hit: number; radius: number } {
  const step = stepBonus(bal, ab.index);
  const f = ab.form.id;
  const power = f === 'ward' || f === 'armor' ? 1 : step.power;
  return {
    hit: stats.weaponDamage * stats.damageMult * ab.power * power,
    radius: ab.radius * (f === 'bolt' || f === 'burst' ? step.size : 1),
  };
}

/**
 * A basic blow's numbers as the sim uses them: its hit before the foe's
 * modifiers (weapon damage × damage × its element's attunement power × its
 * kind's row), and the stacks its kind applies.
 */
export function blowNumbers(
  stats: HeroStats,
  bal: DelveBalance,
  blow: HeroBlow,
): { hit: number; stacks: number } {
  return {
    hit: stats.weaponDamage * stats.damageMult * blow.attunePower * blow.power,
    stacks: bal.stacks.basicByKind[blow.kind],
  };
}

/** How hard a move lands: its heft, +0.2 on the last move of a chain of 2 or more. */
export function stepHeft(ab: ResolvedAbility): number {
  return Math.min(1, ab.heft + (ab.last ? 0.2 : 0));
}

/**
 * The weapon's default basic chain on the pair: every blow the primary, the
 * last the secondary when one is bound (unarmed: the hero's default chain).
 */
export function defaultBasic(
  registry: DataRegistry,
  weaponBaseId: string | null,
  primary: ManaType,
  secondary: ManaType | null = null,
): Blow[] {
  const kinds = weaponString(registry, weaponBaseId);
  return kinds.map((kind, i) => ({
    kind,
    element: secondary && i === kinds.length - 1 ? secondary : primary,
  }));
}

/** A weapon and a pair: what a default basic chain is made of (see `defaultBasic`). */
export interface BasicLoadout {
  weaponBaseId: string | null;
  primary: ManaType;
  secondary: ManaType | null;
}

/** A hero's weapon and pair as a `BasicLoadout`; null before the choice. */
export function basicLoadout({
  equipped,
  pair,
}: Pick<DelveProfile, 'equipped' | 'pair'>): BasicLoadout | null {
  const { primary, secondary } = pair;
  return primary ? { weaponBaseId: equipped.weapon?.baseId ?? null, primary, secondary } : null;
}

/** Whether `basic` is still `on`'s default chain: the same kinds and elements. */
export function isDefaultBasic(registry: DataRegistry, basic: Blow[], on: BasicLoadout): boolean {
  const def = defaultBasic(registry, on.weaponBaseId, on.primary, on.secondary);
  return (
    def.length === basic.length &&
    def.every((b, i) => b.kind === basic[i].kind && b.element === basic[i].element)
  );
}

/**
 * Each element's heir once a pair op takes an element of `before`'s out of the
 * pair (`after`): the old primary's the new primary, the old secondary's the
 * new secondary (the primary without one), and any other element itself while
 * it's in the pair, else the primary. Null when nothing left the pair (a swap,
 * a bind).
 */
export function roleHeir(
  before: ManaPair,
  after: { primary: ManaType; secondary: ManaType | null },
): ((e: ManaType) => ManaType) | null {
  const kept = (e: ManaType) => e === after.primary || e === after.secondary;
  if (![before.primary, before.secondary].some((e) => e && !kept(e))) return null;
  return (e) => {
    if (e === before.primary) return after.primary;
    if (e === before.secondary) return after.secondary ?? after.primary;
    return kept(e) ? e : after.primary;
  };
}

/**
 * The basic chain after its weapon or pair changes from `before` to `after`:
 * one still on its default becomes the new default; otherwise, once an element
 * leaves the pair, each blow takes its element's heir (`roleHeir`); else it
 * stays as it is.
 */
export function followBasic(
  registry: DataRegistry,
  basic: Blow[],
  before: BasicLoadout,
  after: BasicLoadout,
): Blow[] {
  if (isDefaultBasic(registry, basic, before))
    return defaultBasic(registry, after.weaponBaseId, after.primary, after.secondary);
  const heir = roleHeir(before, after);
  return heir ? basic.map((b) => ({ ...b, element: heir(b.element) })) : basic;
}

/**
 * A new (or reset) hero's chains, all of `element`: each slot's default form's
 * whole default chain with its payment (`DEFAULT_FORMS`: a Bolt, a Ward and a
 * charged Nova), and the weapon's default basic chain.
 */
export function defaultChains(
  registry: DataRegistry,
  element: ManaType,
  weaponBaseId: string | null,
): Chains {
  const chain = (slot: AbilitySlot): Chain => {
    const { form, payment } = DEFAULT_FORMS[slot];
    const moves = registry.getForm(form).defaultChain.map((kind) => ({
      kind,
      form,
      elements: [element],
    }));
    return { moves, payment };
  };
  return {
    basic: defaultBasic(registry, weaponBaseId, element),
    primary: chain('primary'),
    defensive: chain('defensive'),
    ultimate: chain('ultimate'),
  };
}
