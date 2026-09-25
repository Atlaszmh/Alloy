import { createDefaultRegistry } from '../../src/data/default-registry.js';
import { SeededRNG } from '../../src/rng/seeded-rng.js';
import { createFloorWorld, createMonsterEntity } from '../../src/arpg/world.js';
import { stepWorld } from '../../src/arpg/step.js';
import { computeHeroStats } from '../../src/delve/hero-stats.js';
import { generateItem } from '../../src/loot/item-generator.js';
import type { AbilityBuild, AbilityBuilds, AbilityCast } from '../../src/types/ability.js';
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

export const DEFAULT_BUILDS: AbilityBuilds = {
  primary: { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' },
  defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'mana' },
  ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
};

export interface ArenaOpts {
  equipped?: EquippedGear;
  primary?: Partial<AbilityBuild>;
  defensive?: Partial<AbilityBuild>;
  ultimate?: Partial<AbilityBuild>;
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
    abilities: {
      primary: { ...DEFAULT_BUILDS.primary, ...opts.primary },
      defensive: { ...DEFAULT_BUILDS.defensive, ...opts.defensive },
      ultimate: { ...DEFAULT_BUILDS.ultimate, ...opts.ultimate },
    },
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

/** Press an ability (0 Primary, 1 Defensive, 2 Ultimate) and advance one step. */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const cast: AbilityCast = { slot, aim: aim ?? null };
  return stepWorld(registry, w, { move: { x: 0, y: 0 }, cast }, STEP);
}

export function damaged(m: MonsterEntity): boolean {
  return m.hp < m.maxHp;
}

/** Press dodge (moving along `move`, or standing still) and advance one step. */
export function dodge(w: ArpgWorld, move = { x: 0, y: 0 }): ArpgEvent[] {
  return stepWorld(registry, w, { move, dodge: true }, STEP);
}
