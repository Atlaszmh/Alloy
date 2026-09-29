import { createDefaultRegistry } from '../../src/data/default-registry.js';
import { SeededRNG } from '../../src/rng/seeded-rng.js';
import { createFloorWorld, createMonsterEntity } from '../../src/arpg/world.js';
import { stepWorld } from '../../src/arpg/step.js';
import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';
import { generateItem } from '../../src/loot/item-generator.js';
import type {
  AbilityCast,
  AbilityPayment,
  AbilitySlot,
  Chain,
  Chains,
  Move,
} from '../../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../../src/types/arpg.js';
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
    chains: chainsWith(opts),
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 77,
    loot: {
      pity: 0,
      nextUid: 100,
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
      forceLegendary: false,
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

/** Press an ability (0 Primary, 1 Defensive, 2 Ultimate) and run until its wind-up lands, returning every event. */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const events = pressOnly(w, slot, aim);
  for (let i = 0; i < 300 && w.hero.windup; i++)
    events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP));
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
 * `finisher` starts on the string's last blow.
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
    w.hero.attackCount = w.hero.stats.weapon.combo.length - 1;
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
