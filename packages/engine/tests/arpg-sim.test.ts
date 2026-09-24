import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { createFloorWorld, createMonsterEntity, type FloorOptions } from '../src/arpg/world.js';
import { stepWorld } from '../src/arpg/step.js';
import { applyStatus, hitMonster, makeCtx } from '../src/arpg/combat.js';
import { castSkill } from '../src/arpg/skills.js';
import { botInput } from '../src/arpg/bot.js';
import { computeHeroStats, isSkillUnlocked, unlockedSkills } from '../src/delve/hero-stats.js';
import { generateItem } from '../src/loot/item-generator.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const STEP = bal.arena.step;

function gear(mana: ManaType, slot: 'weapon' | 'chest' = 'weapon', baseId = slot === 'weapon' ? 'sword' : 'cuirass') {
  return generateItem(registry, { uid: `${mana}-${slot}`, ilvl: 3, rarity: 'common', slot, baseId, mana }, new SeededRNG(1));
}

function world(opts: Partial<FloorOptions> & { equipped?: EquippedGear } = {}): ArpgWorld {
  const equipped = opts.equipped ?? { weapon: gear('fire'), chest: gear('earth', 'chest') };
  return createFloorWorld(registry, {
    depth: 2,
    door: null,
    stats: computeHeroStats(equipped, registry),
    skillSlots: ['fireball', 'boulder', null],
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 77,
    loot: { pity: 0, nextUid: 100, magicFind: 0, legendaryBoost: 1, dropMult: 1, forceLegendary: false },
    ...opts,
  });
}

/** An empty arena with exactly the monsters we place. */
function arena(monsters: Partial<MonsterEntity>[] = [], equipped?: EquippedGear): ArpgWorld {
  const w = world({ equipped });
  const biome = registry.getBiomeForDepth(2);
  w.monsters = monsters.map((m, i) => ({
    ...createMonsterEntity(
      registry,
      { id: 1000 + i, def: biome.monsters[0], kind: 'normal', depth: 2, door: null, element: 'fire', x: 13, y: 20, packId: 1 },
      new SeededRNG(i),
    ),
    ...m,
  }));
  w.totalMonsters = w.monsters.length;
  return w;
}

function run(w: ArpgWorld, seconds: number, move = { x: 0, y: 0 }): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) events.push(...stepWorld(registry, w, { move }, STEP));
  return events;
}

describe('floor generation', () => {
  it('is deterministic per seed', () => {
    const a = world();
    const b = world();
    expect(a.monsters.map((m) => [m.defId, m.x, m.y, m.hp])).toEqual(b.monsters.map((m) => [m.defId, m.x, m.y, m.hp]));
  });

  it('spawns packs away from the hero, and a boss on boss depths', () => {
    const w = world();
    expect(w.monsters.length).toBeGreaterThanOrEqual(bal.dive.packSize[0] * 2);
    const h = w.hero;
    for (const m of w.monsters) expect(Math.hypot(m.x - h.x, m.y - h.y)).toBeGreaterThan(5);
    const boss = world({ depth: 5 });
    expect(boss.monsters.filter((m) => m.kind === 'boss')).toHaveLength(1);
    expect(boss.bossId).not.toBeNull();
  });

  it('re-entering a floor meets the same monsters but rolls fresh loot', () => {
    const loot = { pity: 0, magicFind: 0, legendaryBoost: 1, dropMult: 1, forceLegendary: false };
    const first = world({ loot: { ...loot, nextUid: 100 } });
    const again = world({ loot: { ...loot, nextUid: 140 } });
    const layout = (w: ArpgWorld) => w.monsters.map((m) => [m.defId, m.x, m.y, m.hp]);
    expect(layout(again)).toEqual(layout(first));
    const rolls = (w: ArpgWorld) => Array.from({ length: 5 }, () => w.lootRng.next());
    expect(rolls(again)).not.toEqual(rolls(first));
  });

  it('monsters carry the biome element', () => {
    expect(world({ depth: 7 }).monsters.every((m) => m.element === 'frost')).toBe(true);
  });
});

describe('simulation basics', () => {
  it('is deterministic for the same inputs', () => {
    const a = world();
    const b = world();
    const evA: ArpgEvent[] = [];
    const evB: ArpgEvent[] = [];
    for (let i = 0; i < 600; i++) {
      evA.push(...stepWorld(registry, a, botInput(registry, a), STEP));
      evB.push(...stepWorld(registry, b, botInput(registry, b), STEP));
    }
    expect(evA).toEqual(evB);
    expect(a.hero.hp).toBe(b.hero.hp);
  });

  it('uses fixed steps regardless of frame size', () => {
    const a = world();
    const b = world();
    for (let i = 0; i < 90; i++) stepWorld(registry, a, { move: { x: 0.3, y: -1 } }, STEP);
    for (let i = 0; i < 30; i++) stepWorld(registry, b, { move: { x: 0.3, y: -1 } }, STEP * 3);
    expect(b.t).toBeCloseTo(a.t, 6);
    expect(b.hero.x).toBeCloseTo(a.hero.x, 6);
    expect(b.hero.y).toBeCloseTo(a.hero.y, 6);
  });

  it('moves the hero at move speed and keeps it inside the arena', () => {
    const w = arena();
    const x0 = w.hero.x;
    run(w, 1, { x: 1, y: 0 });
    expect(w.hero.x - x0).toBeCloseTo(w.hero.stats.moveSpeed, 0);
    run(w, 20, { x: 1, y: 0 });
    expect(w.hero.x).toBeLessThanOrEqual(w.width - w.hero.radius + 1e-9);
  });

  it('auto-attacks foes in reach and builds weapon mana', () => {
    const w = arena([{ x: 13, y: 34.8, maxHp: 1e6, hp: 1e6, aggro: false }]);
    w.hero.mana.fire = 0;
    const events = run(w, 1);
    expect(events.some((e) => e.kind === 'basic')).toBe(true);
    expect(w.monsters[0].hp).toBeLessThan(1e6);
    expect(w.hero.mana.fire).toBeGreaterThan(0);
  });

  it('does not attack foes out of reach', () => {
    const w = arena([{ x: 13, y: 10, aggro: false }]);
    expect(run(w, 1).some((e) => e.kind === 'basic')).toBe(false);
  });
});

describe('spells', () => {
  it('casting spends mana, starts the cooldown, and misses nothing when out of mana', () => {
    const w = arena([{ x: 13, y: 30, maxHp: 1e6, hp: 1e6 }]);
    const fire0 = w.hero.mana.fire;
    const events = stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: 0 }, STEP);
    expect(events.some((e) => e.kind === 'cast' && e.skillId === 'fireball')).toBe(true);
    expect(w.hero.mana.fire).toBeLessThan(fire0 + 1);
    expect(w.hero.cooldowns.fireball).toBeGreaterThan(w.t);
    run(w, 1.5);
    expect(w.monsters[0].hp).toBeLessThan(1e6);
    expect(w.monsters[0].status.burnUntil).toBeGreaterThan(0);

    w.hero.mana.fire = 0;
    w.hero.cooldowns.fireball = 0;
    const dry = stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: 0 }, STEP);
    expect(dry.some((e) => e.kind === 'noMana')).toBe(true);
  });

  it('a cast tap between steps is not lost', () => {
    const w = arena([{ x: 13, y: 30 }]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: 0 }, STEP / 4);
    const later = stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(later.some((e) => e.kind === 'cast')).toBe(true);
  });

  it('chain lightning arcs between several foes', () => {
    const storm = { weapon: gear('storm') };
    const w = arena(
      [
        { x: 13, y: 31, maxHp: 1e6, hp: 1e6 },
        { x: 15, y: 30, maxHp: 1e6, hp: 1e6 },
        { x: 17, y: 29, maxHp: 1e6, hp: 1e6 },
      ],
      storm,
    );
    w.hero.skillSlots = ['chain_lightning', null, null];
    const ctx = makeCtx(registry, w, []);
    expect(castSkill(ctx, 0)).toBe(true);
    const chain = ctx.events.find((e) => e.kind === 'chain');
    expect(chain && chain.kind === 'chain' && chain.points.length).toBe(4);
    expect(w.monsters.every((m) => m.hp < 1e6)).toBe(true);
  });

  it('ground spells need a target in range', () => {
    const w = arena([{ x: 13, y: 2 }]);
    w.hero.skillSlots = ['magma_eruption', null, null];
    w.hero.mana.fire = 100;
    w.hero.mana.earth = 100;
    const ctx = makeCtx(registry, w, []);
    expect(castSkill(ctx, 0)).toBe(false);
    expect(w.hero.mana.fire).toBe(100);
  });

  it('frost nova chills twice to freeze', () => {
    const w = arena([{ x: 13, y: 34, maxHp: 1e6, hp: 1e6 }], { weapon: gear('frost') });
    w.hero.skillSlots = ['frost_nova', null, null];
    const ctx = makeCtx(registry, w, []);
    castSkill(ctx, 0);
    expect(w.monsters[0].status.chillStacks).toBe(1);
    w.hero.cooldowns.frost_nova = 0;
    castSkill(ctx, 0);
    expect(w.monsters[0].status.freezeUntil).toBeGreaterThan(w.t);
  });

  it('grave golem fights alongside the hero', () => {
    const w = arena([{ x: 13, y: 31, maxHp: 1e6, hp: 1e6 }]);
    w.hero.skillSlots = ['grave_golem', null, null];
    w.hero.mana.earth = 100;
    w.hero.mana.shadow = 100;
    const ctx = makeCtx(registry, w, []);
    expect(castSkill(ctx, 0)).toBe(true);
    expect(w.summons).toHaveLength(1);
    w.hero.nextAttackAt = 1e9;
    run(w, 4);
    expect(w.monsters[0].hp).toBeLessThan(1e6);
  });
});

describe('elemental reactions', () => {
  function target(element: ManaType = 'shadow'): { ctx: ReturnType<typeof makeCtx>; m: MonsterEntity; w: ArpgWorld } {
    const w = arena([{ x: 13, y: 20, maxHp: 1e6, hp: 1e6, element }]);
    return { ctx: makeCtx(registry, w, []), m: w.monsters[0], w };
  }
  const reactionOf = (events: ArpgEvent[]) => events.find((e) => e.kind === 'reaction');

  it('Melt: fire on a chilled foe deals double damage and clears the chill', () => {
    const plain = target();
    const base = hitMonster(plain.ctx, plain.m, 100, 'fire', { source: 'skill' });
    const { ctx, m } = target();
    applyStatus(ctx, m, 'chill', 0);
    const melted = hitMonster(ctx, m, 100, 'fire', { source: 'skill' });
    expect(melted).toBeCloseTo(base * bal.reactions.meltMult);
    expect(reactionOf(ctx.events)).toMatchObject({ reaction: 'melt' });
    expect(m.status.chillUntil).toBe(0);
  });

  it('Shatter: earth on a frozen foe', () => {
    const { ctx, m } = target();
    applyStatus(ctx, m, 'freeze', 0);
    hitMonster(ctx, m, 100, 'earth', { source: 'skill' });
    expect(reactionOf(ctx.events)).toMatchObject({ reaction: 'shatter' });
  });

  it('Overload: storm on a burning foe blasts its neighbours', () => {
    const w = arena([
      { x: 13, y: 20, maxHp: 1e6, hp: 1e6, element: 'shadow' },
      { x: 14.5, y: 20, maxHp: 1e6, hp: 1e6, element: 'shadow' },
    ]);
    const ctx = makeCtx(registry, w, []);
    applyStatus(ctx, w.monsters[0], 'burn', 100);
    hitMonster(ctx, w.monsters[0], 100, 'storm', { source: 'skill' });
    expect(reactionOf(ctx.events)).toMatchObject({ reaction: 'overload' });
    expect(w.monsters[1].hp).toBeLessThan(1e6);
  });

  it('Superconduct: frost on a shocked foe freezes it', () => {
    const { ctx, m, w } = target();
    applyStatus(ctx, m, 'shock', 0);
    hitMonster(ctx, m, 10, 'frost', { source: 'skill' });
    expect(reactionOf(ctx.events)).toMatchObject({ reaction: 'superconduct' });
    expect(m.status.freezeUntil).toBeGreaterThan(w.t);
  });

  it('Soulfire: fire on a hexed foe heals the hero', () => {
    const { ctx, m, w } = target();
    w.hero.hp = 10;
    applyStatus(ctx, m, 'hex', 0);
    hitMonster(ctx, m, 100, 'fire', { source: 'skill' });
    expect(reactionOf(ctx.events)).toMatchObject({ reaction: 'soulfire' });
    expect(w.hero.hp).toBeGreaterThan(10);
    expect(w.pending.reactions).toContain('soulfire');
  });

  it('monsters resist their own element and are weak to their counter', () => {
    const own = target('fire');
    const weak = target('frost');
    const resisted = hitMonster(own.ctx, own.m, 100, 'fire', { source: 'skill' });
    const boosted = hitMonster(weak.ctx, weak.m, 100, 'fire', { source: 'skill' });
    expect(resisted).toBeCloseTo(100 * (1 - bal.monster.resist));
    expect(boosted).toBeCloseTo(100 * (1 + bal.monster.weakness));
  });
});

describe('monsters', () => {
  it('melee monsters wind up, then hit a hero in reach', () => {
    const w = arena([{ x: 13, y: 34.8, aggro: true, damage: 20 }]);
    w.hero.nextAttackAt = 1e9;
    const hp = w.hero.hp;
    run(w, 1.5);
    expect(w.hero.hp).toBeLessThan(hp);
  });

  it('stepping away during the wind-up dodges the blow', () => {
    const w = arena([{ x: 13, y: 34.9, aggro: true, damage: 20, speed: 0.01 }]);
    w.hero.nextAttackAt = 1e9;
    run(w, 0.1);
    expect(w.monsters[0].windupUntil).toBeGreaterThan(0);
    const hp = w.hero.hp;
    run(w, 1, { x: 0, y: 1 });
    expect(w.hero.hp).toBe(hp);
  });

  it('kills drop mana motes and items, which the hero picks up', () => {
    const w = arena([{ x: 13, y: 33, hp: 1, maxHp: 1 }]);
    w.loot.dropMult = 20;
    const events = run(w, 3);
    expect(events.some((e) => e.kind === 'death')).toBe(true);
    expect(events.some((e) => e.kind === 'drop' && e.dropKind === 'mote')).toBe(true);
    expect(events.some((e) => e.kind === 'pickup')).toBe(true);
    expect(w.pending.kills).toBe(1);
    expect(w.pending.scrap).toBeGreaterThan(0);
  });

  it('clearing the floor vacuums up the loot', () => {
    const w = arena([{ x: 13, y: 20, hp: 1, maxHp: 1 }]);
    w.loot.dropMult = 20;
    const ctx = makeCtx(registry, w, []);
    hitMonster(ctx, w.monsters[0], 10, null, { source: 'skill' });
    const events = run(w, 3);
    expect(events.some((e) => e.kind === 'cleared')).toBe(true);
    expect(w.cleared).toBe(true);
    expect(w.drops).toHaveLength(0);
    expect(w.pending.items.length).toBeGreaterThan(0);
  });

  it('boss slams hurt only inside the telegraph', () => {
    const w = arena();
    w.zones.push({
      id: 1, owner: 'monster', skillId: null, x: w.hero.x, y: w.hero.y - 10, radius: 2.6, born: 0, until: 2,
      tick: 0, nextTick: 0, damage: 50, element: 'fire', applies: [], detonateAt: 0.5, dead: false,
    });
    const hp = w.hero.hp;
    run(w, 1);
    expect(w.hero.hp).toBe(hp);
    w.zones.push({
      id: 2, owner: 'monster', skillId: null, x: w.hero.x, y: w.hero.y, radius: 2.6, born: w.t, until: w.t + 2,
      tick: 0, nextTick: 0, damage: 50, element: 'fire', applies: [], detonateAt: w.t + 0.5, dead: false,
    });
    run(w, 1);
    expect(w.hero.hp).toBeLessThan(hp);
  });
});

describe('hero survival', () => {
  it('potions heal and are consumed', () => {
    const w = arena();
    w.hero.hp = 10;
    stepWorld(registry, w, { move: { x: 0, y: 0 }, potion: true }, STEP);
    expect(w.hero.hp).toBeGreaterThan(10);
    expect(w.hero.potions).toBe(2);
  });

  it('dies at zero life, or rises once with Phoenix Plume', () => {
    const w = arena([{ x: 13, y: 34.8, aggro: true, damage: 1e6 }]);
    w.hero.nextAttackAt = 1e9;
    const events = run(w, 2);
    expect(events.some((e) => e.kind === 'heroDeath')).toBe(true);
    expect(w.heroDead).toBe(true);

    const phoenixGear = {
      chest: { ...gear('fire', 'chest'), rarity: 'legendary' as const, legendary: { id: 'phoenix_plume', value: 50, roll: 0.5 } },
    };
    const p = arena([{ x: 13, y: 34.8, aggro: true, damage: 1e6 }], phoenixGear);
    p.hero.nextAttackAt = 1e9;
    const ev = run(p, 1.2);
    expect(ev.some((e) => e.kind === 'revive')).toBe(true);
  });
});

describe('spell unlocks from attunement', () => {
  it('one point unlocks the signature spell; combos need both types at the threshold', () => {
    const t = bal.mana.comboThreshold;
    const magma = registry.getSkill('magma_eruption');
    expect(isSkillUnlocked(magma, { fire: t, frost: 0, storm: 0, earth: t, shadow: 0 }, registry)).toBe(true);
    expect(isSkillUnlocked(magma, { fire: t, frost: 0, storm: 0, earth: t - 1, shadow: 0 }, registry)).toBe(false);
    const ids = unlockedSkills({ fire: 1, frost: 0, storm: 0, earth: 1, shadow: 0 }, registry).map((s) => s.id);
    expect(ids).toEqual(['fireball', 'boulder']);
  });
});
