import { createDefaultRegistry } from '../../src/data/default-registry.js';
import { SeededRNG } from '../../src/rng/seeded-rng.js';
import { createFloorWorld, createMonsterEntity } from '../../src/arpg/world.js';
import { stepWorld } from '../../src/arpg/step.js';
import { withMoveset } from '../../src/delve/profile.js';
import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';
import { generateItem } from '../../src/loot/item-generator.js';
import { heroChains, movesetOf } from '../../src/loot/moveset.js';
import {
  CHAIN_SKILLS,
  type AbilityCast,
  type AbilityPayment,
  type AbilitySlot,
  type Chain,
  type Chains,
  type Move,
} from '../../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../../src/types/arpg.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { EquippedGear } from '../../src/types/gear.js';
import type { ManaType } from '../../src/types/mana.js';

export const registry = createDefaultRegistry();
export const bal = registry.getDelveBalance();
export const STEP = bal.arena.step;

export function gear(
  mana: ManaType,
  slot: 'weapon' | 'chest' = 'weapon',
  baseId = slot === 'weapon' ? 'sword' : 'cuirass',
) {
  return generateItem(
    registry,
    { uid: `${mana}-${slot}`, ilvl: 3, rarity: 'common', slot, baseId, mana },
    new SeededRNG(1),
  );
}

/** The fixture's chains: one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova). */
export const DEFAULT_CHAINS: Pick<Chains, AbilitySlot> = {
  primary: { moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }], payment: 'mana' },
  defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['frost'] }], payment: 'mana' },
  ultimate: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'charge' },
};

/** The hero's chains: its weapon's moveset's (unarmed, the defaults on the pair). */
export function chainsOf(p: DelveProfile): Partial<Chains> {
  return heroChains(registry, p.equipped, p.pair);
}

/**
 * `p` with its weapon holding `chains`, each skill given at least as many slots
 * as moves (a test's shortcut: no price, and any skill, carried or not).
 */
export function withChains(p: DelveProfile, chains: Partial<Chains>): DelveProfile {
  const moveset = movesetOf(registry, p.equipped.weapon!);
  const next = { chains: { ...moveset.chains }, slots: { ...moveset.slots } };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const length = Array.isArray(chain) ? chain.length : chain.moves.length;
    (next.chains as Record<string, unknown>)[skill] = chain;
    next.slots[skill] = Math.max(next.slots[skill] ?? 0, length);
  }
  return withMoveset(p, next);
}

/** A slot's chain in a test: its one move with these parts changed and its payment, or whole `moves`. */
export type ChainOpts = Partial<Move> & { payment?: AbilityPayment; moves?: Move[] };

export function chainOf(base: Chain, o: ChainOpts = {}): Chain {
  const { payment = base.payment, moves, ...move } = o;
  return { moves: moves ?? [{ ...base.moves[0], ...move }], payment };
}

/** The fixture's chains, with each slot's changes (see `ChainOpts`). */
export function chainsWith(
  o: Partial<Record<AbilitySlot, ChainOpts>> = {},
): Pick<Chains, AbilitySlot> {
  return {
    primary: chainOf(DEFAULT_CHAINS.primary, o.primary),
    defensive: chainOf(DEFAULT_CHAINS.defensive, o.defensive),
    ultimate: chainOf(DEFAULT_CHAINS.ultimate, o.ultimate),
  };
}

export interface ArenaOpts {
  equipped?: EquippedGear;
  primary?: ChainOpts;
  defensive?: ChainOpts;
  ultimate?: ChainOpts;
  /** The chains exactly (a skill left out has none), in place of the fixture's and the options above. */
  chains?: Partial<Pick<Chains, AbilitySlot>>;
  /** Stop the hero's automatic basic attack so only abilities deal damage. */
  noBasic?: boolean;
  depth?: number;
}

/** An arena holding exactly the monsters given (defaults: a normal foe at the centre). */
export function arena(monsters: Partial<MonsterEntity>[] = [], opts: ArenaOpts = {}): ArpgWorld {
  const equipped = opts.equipped ?? { weapon: gear('fire'), chest: gear('earth', 'chest') };
  const depth = opts.depth ?? 2;
  const w = createFloorWorld(registry, {
    depth,
    door: null,
    stats: computeHeroStats(equipped, registry),
    chains: opts.chains ?? chainsWith(opts),
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 77,
    loot: {
      nextUid: 100,
      find: 0,
      legendaryBoost: 1,
      patterns: [],
      dropsGiven: [],
      pair: [],
    },
  });
  const biome = registry.getBiomeForDepth(depth);
  w.monsters = monsters.map((m, i) => ({
    ...createMonsterEntity(
      registry,
      {
        id: 1000 + i,
        def: biome.monsters[0],
        kind: 'normal',
        depth,
        door: null,
        element: 'fire',
        x: 13,
        y: 20,
        packId: 1,
      },
      new SeededRNG(i),
    ),
    ...m,
  }));
  w.totalMonsters = w.monsters.length;
  if (opts.noBasic) w.hero.nextAttackAt = 1e9;
  return w;
}

/** A sturdy foe that doesn't fight back, at (x, y). */
export function dummy(
  x: number,
  y: number,
  extra: Partial<MonsterEntity> = {},
): Partial<MonsterEntity> {
  return { x, y, hp: 1e6, maxHp: 1e6, damage: 0, speed: 0, ...extra };
}

export function run(w: ArpgWorld, seconds: number, move = { x: 0, y: 0 }): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) events.push(...stepWorld(registry, w, { move }, STEP));
  return events;
}

/** Press an ability and advance one step (its wind-up is still in progress). */
export function pressOnly(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const cast: AbilityCast = { slot, aim: aim ?? null };
  return stepWorld(registry, w, { move: { x: 0, y: 0 }, cast }, STEP);
}

/**
 * Press an ability (0 Primary, 1 Defensive, 2 Ultimate) and run until its wind-up lands (a press
 * made during its slot's beat waits for the beat's end first), returning every event.
 */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const events = pressOnly(w, slot, aim);
  const waiting = () =>
    w.hero.beatUntil[slot] > w.t + 1e-9 && w.queuedCasts.some((q) => q.cast.slot === slot);
  for (let i = 0; i < 300 && (w.hero.windup || waiting()); i++)
    events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP));
  return events;
}

/**
 * Hold the slot's button for `seconds` (a hold move charges meanwhile), then let
 * go with its release; returns every event.
 */
export function holdFor(
  w: ArpgWorld,
  slot: number,
  seconds: number,
  aim: { x: number; y: number } | null = null,
): ArpgEvent[] {
  const still = { x: 0, y: 0 };
  const events: ArpgEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    events.push(...stepWorld(registry, w, { move: still, holding: slot }, STEP));
  events.push(...stepWorld(registry, w, { move: still, cast: { slot, aim } }, STEP));
  return events;
}

/** The slot's move `step` (its first by default), as the hero resolved it. */
export function moveOf(w: ArpgWorld, slot: number, step = 0) {
  return w.hero.chains[slot].moves[step];
}

export function damaged(m: MonsterEntity): boolean {
  return m.hp < m.maxHp;
}

/**
 * One sturdy foe (in a sword's reach by default), the hero's stats from `extra`;
 * `finisher` starts on the basic chain's last blow.
 */
export function strikeWorld(
  equipped: EquippedGear,
  extra: HeroStatsExtra,
  finisher = false,
  foe: Partial<MonsterEntity> = dummy(13, 34.5),
): ArpgWorld {
  const w = arena([foe], { equipped });
  w.hero.stats = computeHeroStats(equipped, registry, extra);
  if (finisher) {
    w.hero.attackCount = w.hero.stats.weapon.blows.length - 1;
    w.hero.lastBasicAt = 0;
  }
  return w;
}

/** Step until the first blow lands (its `basic` event), returning every event. */
export function firstBlow(w: ArpgWorld): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
    events.push(...run(w, STEP));
  return events;
}

/** Press dodge (moving along `move`, or standing still) and advance one step. */
export function dodge(w: ArpgWorld, move = { x: 0, y: 0 }): ArpgEvent[] {
  return stepWorld(registry, w, { move, dodge: true }, STEP);
}
