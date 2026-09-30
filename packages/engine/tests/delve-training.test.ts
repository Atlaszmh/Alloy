import { describe, it, expect } from 'vitest';
import {
  clearMonsters,
  createSandboxWorld,
  fillCharge,
  resetDummies,
  respawnHero,
  sandboxWeapon,
  setSandboxToggles,
  spawnDummies,
  spawnMonsters,
} from '../src/arpg/sandbox.js';
import { createMonsterEntity, emptyStatus, refreshWorldHero } from '../src/arpg/world.js';
import { hitMonster, hurtHero, killMonster, makeCtx } from '../src/arpg/combat.js';
import { abilityReady, canAfford } from '../src/arpg/abilities/cast.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import {
  computeAttunement,
  computeHeroStats,
  hasMastery,
  manaPool,
  referenceMonster,
} from '../src/delve/hero-stats.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { AbilitySlot } from '../src/types/ability.js';
import type { GearItem } from '../src/types/gear.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, SandboxToggles } from '../src/types/arpg.js';
import {
  STEP,
  bal,
  chainsWith,
  damaged,
  dodge,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ChainOpts,
} from './fixtures/arena.js';

// A sandbox hero stands at heroStart (13, 26) facing up (-y); depth 5 is the Cinder Mines (fire).
// The fixtures' `dummy()` is a sturdy normal foe: this file's dummies come from `spawnDummies`.
const SB = bal.sandbox;
const ALL_ON: SandboxToggles = { infiniteMana: true, noCooldowns: true, invulnerable: true };
const ALL_OFF: SandboxToggles = { infiniteMana: false, noCooldowns: false, invulnerable: false };
/** Where a single dummy stands: straight above heroStart. */
const [HX, HY] = SB.heroStart;
const DUMMY_Y = HY - SB.dummyDistance;

type SlotOpts = Partial<Record<AbilitySlot, ChainOpts>>;

function sandbox(toggles = ALL_OFF, chains: SlotOpts = {}, depth = 5): ArpgWorld {
  return createSandboxWorld(registry, {
    depth,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    chains: chainsWith(chains),
    toggles,
  });
}

function ctxOf(w: ArpgWorld) {
  const events: ArpgEvent[] = [];
  return { ctx: makeCtx(registry, w, events), events };
}

const at = (ms: MonsterEntity[]) => ms.map((m) => [m.x, m.y]);

describe('the sandbox world', () => {
  it('is empty at any depth (a boss floor too), never clears, and starts the hero at heroStart', () => {
    for (const depth of [1, 5]) {
      const w = sandbox(ALL_OFF, {}, depth);
      expect(w.monsters).toHaveLength(0);
      expect(w.bossId).toBeNull();
      expect(w.sandbox).toEqual(ALL_OFF);
      expect([w.hero.x, w.hero.y]).toEqual(SB.heroStart);
      expect(w.hero.facing).toEqual({ x: 0, y: -1 });
      expect(run(w, 1).map((e) => e.kind)).not.toContain('cleared');
      expect(w.cleared).toBe(false);
    }
  });

  it('drops nothing when a real monster dies, but heal on kill still works', () => {
    const w = sandbox();
    const rat = createMonsterEntity(
      registry,
      {
        id: 900,
        def: registry.getBiomeForDepth(5).monsters[0],
        kind: 'elite',
        depth: 5,
        door: null,
        element: 'fire',
        x: 13,
        y: 20,
        packId: 1,
      },
      new SeededRNG(1),
    );
    w.monsters.push(rat);
    w.hero.stats = { ...w.hero.stats, healOnKill: 0.1 };
    w.hero.hp = w.hero.stats.maxHp / 2;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, rat, 1e9, null, { source: 'skill' });
    expect(rat.dead).toBe(true);
    expect(w.drops).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'drop')).toHaveLength(0);
    expect(events.find((e) => e.kind === 'death')).toMatchObject({ scrap: 0 });
    expect(w.pending.scrap).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'heal', source: 'kill' }));
  });
});

describe('training dummies', () => {
  it('stand above the hero in each layout: a normal size-1 foe that never fights, with a lot of life', () => {
    const w = sandbox();
    const [hx, hy] = SB.heroStart;
    const up = SB.dummyDistance;
    const [one] = spawnDummies(registry, w, { layout: 'single', element: null });
    expect(at([one])).toEqual([[hx, hy - up]]);
    expect(one).toMatchObject({
      defId: 'dummy',
      kind: 'normal',
      traits: [],
      speed: 0,
      damage: 0,
      radius: bal.monster.radius,
      element: w.element,
      dummy: { homeX: hx, homeY: hy - up, element: null },
    });
    expect(one.maxHp).toBe(Math.round(referenceMonster(registry, 5).hp * SB.dummyLifeMult));
    const row = at(spawnDummies(registry, w, { layout: 'row', element: null }));
    expect(row).toHaveLength(5);
    row.forEach(([x, y], k) => {
      expect(x).toBe(hx);
      expect(y).toBeCloseTo(hy - (up + k * SB.rowSpacing));
    });
    const clump = at(spawnDummies(registry, w, { layout: 'clump', element: null }));
    expect(clump).toHaveLength(5);
    expect(clump[0][0]).toBe(hx);
    expect(clump[0][1]).toBeCloseTo(hy - (up + 1));
    for (const [x, y] of clump.slice(1))
      expect(Math.hypot(x - hx, y - (hy - (up + 1)))).toBeCloseTo(SB.clumpRadius);
    expect(w.monsters).toHaveLength(11);
  });

  it('stay inside the walls wherever the hero stands', () => {
    for (const [x, y] of [
      [0.5, 0.5],
      [25.5, 39.5],
      [0.5, 39.5],
    ]) {
      const w = sandbox();
      w.hero.x = x;
      w.hero.y = y;
      for (const layout of ['single', 'row', 'clump'] as const) {
        for (const m of spawnDummies(registry, w, { layout, element: null })) {
          expect(m.x).toBeGreaterThanOrEqual(SB.edgeMargin);
          expect(m.x).toBeLessThanOrEqual(w.width - SB.edgeMargin);
          expect(m.y).toBeGreaterThanOrEqual(SB.edgeMargin);
          expect(m.y).toBeLessThanOrEqual(w.height - SB.edgeMargin);
        }
      }
    }
  });

  it("a row fits on screen and mostly within a lance's reach; its dummies neither touch nor block a chain", () => {
    expect(SB.dummyDistance + 4 * SB.rowSpacing).toBeLessThanOrEqual(8);
    expect(SB.rowSpacing).toBeGreaterThanOrEqual(2 * bal.monster.radius);
    expect(SB.rowSpacing).toBeLessThan(bal.abilities.chainRange);
  });

  it('each new group stands beside the last (alternating right and left), not on it', () => {
    const w = sandbox();
    const hx = SB.heroStart[0];
    const G = SB.groupSpacing;
    const xs = [0, 1, 2, 3].map(
      (group) => spawnDummies(registry, w, { layout: 'single', element: null, group })[0].x,
    );
    expect(xs).toEqual([hx, hx + G, hx - G, hx + 2 * G]);
    // Wide enough that two clumps side by side never touch.
    expect(G).toBeGreaterThanOrEqual(2 * SB.clumpRadius + 2 * bal.monster.radius);
    // Replaying a group with its index lands it in the same place.
    const again = spawnDummies(registry, sandbox(), { layout: 'row', element: null, group: 2 });
    expect(again.map((m) => m.x)).toEqual([hx - G, hx - G, hx - G, hx - G, hx - G]);
    // Near a wall the shifted group still moves in as a whole.
    const edge = sandbox();
    edge.hero.x = w.width - 2;
    for (const m of spawnDummies(registry, edge, { layout: 'clump', element: null, group: 1 }))
      expect(m.x).toBeLessThanOrEqual(edge.width - SB.edgeMargin);
  });

  it('near a wall a layout moves in as a group, keeping its spacing', () => {
    const w = sandbox();
    w.hero.y = 0.5; // the row would run off the top wall
    const row = spawnDummies(registry, w, { layout: 'row', element: null });
    expect(row.map((m) => m.x)).toEqual([13, 13, 13, 13, 13]);
    row.forEach((m, k) => {
      expect(m.y).toBeCloseTo(SB.edgeMargin + (4 - k) * SB.rowSpacing);
      expect(m.dummy).toMatchObject({ homeX: m.x, homeY: m.y });
    });
  });

  it('are named Training Dummy at any depth', () => {
    const deep = bal.dive.bossEvery * registry.getDelveData().biomes.length + 1; // an Abyssal cycle
    const [d] = spawnDummies(registry, sandbox(ALL_OFF, {}, deep), {
      layout: 'single',
      element: null,
    });
    expect(d.name).toBe('Training Dummy');
  });

  it("don't count toward a boss summon's monster cap", () => {
    const w = sandbox(ALL_ON);
    for (let i = 0; i < 3; i++) spawnDummies(registry, w, { layout: 'row', element: null });
    const [boss] = spawnMonsters(registry, w, { defId: 'foreman_grask', kind: 'boss', count: 1 });
    boss.nextSpecialAt = w.t;
    w.rng.nextInt = (_lo: number, hi: number) => hi; // the special rolls a summon
    run(w, STEP);
    expect(w.monsters.filter((m) => !m.dummy && m.kind === 'normal')).toHaveLength(2);
  });

  it('reset to full on lethal damage, and the same hit still applies its status', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    d.hp = 1;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, d, 1000, 'fire', { source: 'skill', applies: ['burn'] });
    expect(d.dead).toBe(false);
    expect(d.hp).toBe(d.maxHp);
    expect(d.status.stacks.fire).toBeGreaterThan(0);
    expect(events.map((e) => e.kind)).not.toContain('death');
    expect(w.kills).toBe(0);
    run(w, STEP);
    expect(w.monsters).toContain(d);
  });

  it('are exempt from execute', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    d.hp = d.maxHp * 0.1;
    d.status.freezeUntil = w.t + 5;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, d, 1, null, { source: 'skill', execute: 0.5 });
    expect(events.filter((e) => e.kind === 'hit')).toHaveLength(1);
    expect(d.hp).toBeCloseTo(d.maxHp * 0.1 - 1);
  });

  it('resist as set: a Neutral dummy takes no resist or weakness, a fire dummy resists fire', () => {
    const w = sandbox();
    expect(w.element).toBe('fire');
    const [neutral] = spawnDummies(registry, w, { layout: 'single', element: null });
    const [fire] = spawnDummies(registry, w, { layout: 'single', element: 'fire' });
    expect(neutral.element).toBe('fire'); // the look stays the world's
    const { ctx } = ctxOf(w);
    const dot = (m: MonsterEntity, el: 'fire' | 'frost') =>
      hitMonster(ctx, m, 100, el, { source: 'dot', noReact: true });
    expect(dot(neutral, 'fire')).toBeCloseTo(100);
    expect(dot(neutral, 'frost')).toBeCloseTo(100);
    expect(dot(fire, 'fire')).toBeCloseTo(100 * (1 - bal.monster.resist));
    expect(dot(fire, 'frost')).toBeCloseTo(100 * (1 + bal.monster.weakness));
  });

  it('never move or attack, and the hero walking into one does not push it', () => {
    const w = sandbox();
    w.hero.nextAttackAt = 1e9;
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.y = DUMMY_Y + 1.2; // in a real monster's melee reach
    const hp = w.hero.hp;
    run(w, 3);
    expect(at([d])).toEqual([[HX, DUMMY_Y]]);
    expect(w.hero.hp).toBe(hp);
    expect(d.windupUntil).toBe(0);
    expect(d.aggro).toBe(false); // its AI never ran: it never noticed the hero
    run(w, 1, { x: 0, y: -1 });
    expect(at([d])).toEqual([[HX, DUMMY_Y]]);
    expect(w.hero.y).toBeCloseTo(DUMMY_Y + d.radius + w.hero.radius, 5);
  });

  it('are moved by knockback and pull', () => {
    const w = sandbox();
    w.hero.nextAttackAt = 1e9;
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    hitMonster(ctxOf(w).ctx, d, 1, null, {
      source: 'skill',
      knockback: 1,
      kbFrom: { x: HX, y: HY },
    });
    run(w, 0.3);
    expect(d.y).toBeLessThan(DUMMY_Y - 0.3);
    expect(d.x).toBeCloseTo(HX, 5);

    // Magnetism (storm + earth) pulls: 75% of the way to a Nova at the hero, dummyDistance away.
    const p = sandbox(ALL_ON, {
      ultimate: { elements: ['storm', 'earth'], payment: 'mana' },
    });
    p.hero.nextAttackAt = 1e9;
    const [q] = spawnDummies(registry, p, { layout: 'single', element: null });
    press(p, 2);
    expect(q.y).toBeGreaterThan(DUMMY_Y + 1);
  });

  it("a row's spacing lets a chain jump", () => {
    const w = sandbox(ALL_ON, {
      primary: { elements: ['storm'] },
    });
    w.hero.nextAttackAt = 1e9;
    const row = spawnDummies(registry, w, { layout: 'row', element: null });
    const events = [...press(w, 0), ...run(w, 1)];
    expect(events.some((e) => e.kind === 'chain')).toBe(true);
    expect(damaged(row[1])).toBe(true);
  });

  it('resetDummies puts them home with full life, no statuses and no knockback', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: 'frost' });
    Object.assign(d, { x: 16, y: 30, hp: 5, kbx: 3, kby: -2, lastHitAt: w.t });
    d.status.stacks.fire = 2;
    d.status.stacks.frost = 1;
    resetDummies(w);
    expect(d).toMatchObject({ x: HX, y: DUMMY_Y, hp: d.maxHp, kbx: 0, kby: 0, lastHitAt: -1 });
    expect(d.status).toEqual(emptyStatus());
    expect(d.dummy?.element).toBe('frost');
  });
});

describe('the spawner', () => {
  it('spawns any monster at the depth scaling, with its home element, aggroed, on a ring round the hero', () => {
    const w = sandbox(); // the Cinder Mines: fire
    const wolves = spawnMonsters(registry, w, { defId: 'frost_wolf', kind: 'normal', count: 3 });
    const home = registry.getDelveData().biomes.find((b) => b.id === 'frostvault')!;
    const def = home.monsters.find((m) => m.id === 'frost_wolf')!;
    const ref = createMonsterEntity(
      registry,
      {
        id: 0,
        def,
        kind: 'normal',
        depth: 5,
        door: null,
        element: home.mana,
        x: 0,
        y: 0,
        packId: 0,
      },
      new SeededRNG(1),
    );
    expect(wolves).toHaveLength(3);
    for (const m of wolves) {
      expect(m).toMatchObject({
        defId: 'frost_wolf',
        kind: 'normal',
        element: 'frost',
        maxHp: ref.maxHp,
        damage: ref.damage,
        aggro: true,
        aggroAt: w.t,
        nextSpecialAt: w.t + 4,
        dummy: null,
      });
      expect(Math.hypot(m.x - 13, m.y - 26)).toBeCloseTo(SB.spawnRing, 5);
    }
    expect(w.totalMonsters).toBe(3);
    // The ring starts half a step round, so no monster lands on a row of dummies straight above.
    for (let n = 1; n <= 8; n++) {
      const ring = spawnMonsters(registry, sandbox(), {
        defId: 'frost_wolf',
        kind: 'normal',
        count: n,
      });
      for (const m of ring) expect(m.y < 26 && Math.abs(m.x - 13) < 1).toBe(false);
    }
    const [elite] = spawnMonsters(registry, w, { defId: 'frost_wolf', kind: 'elite', count: 1 });
    expect(elite.kind).toBe('elite');
    expect(w.totalMonsters).toBe(4);
  });

  it('keeps spawns inside the walls, and the count within 1–8', () => {
    const w = sandbox();
    w.hero.x = 1;
    w.hero.y = 1;
    const rats = spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 20 });
    expect(rats).toHaveLength(8);
    for (const m of rats) {
      expect(m.x).toBeGreaterThanOrEqual(SB.edgeMargin);
      expect(m.x).toBeLessThanOrEqual(w.width - SB.edgeMargin);
      expect(m.y).toBeGreaterThanOrEqual(SB.edgeMargin);
      expect(m.y).toBeLessThanOrEqual(w.height - SB.edgeMargin);
    }
    expect(
      spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 0 }),
    ).toHaveLength(1);
  });

  it('a spawned boss takes the boss bar, which then follows the next living boss', () => {
    const w = sandbox();
    const [maw] = spawnMonsters(registry, w, { defId: 'pale_maw', kind: 'boss', count: 1 });
    const [grask] = spawnMonsters(registry, w, { defId: 'foreman_grask', kind: 'boss', count: 1 });
    expect(w.bossId).toBe(grask.id);
    killMonster(ctxOf(w).ctx, grask);
    expect(w.bossId).toBe(maw.id);
    killMonster(ctxOf(w).ctx, maw);
    expect(w.bossId).toBeNull();
  });

  it('clearMonsters removes the real monsters, the dummies or both', () => {
    const w = sandbox();
    spawnDummies(registry, w, { layout: 'row', element: null });
    const [boss] = spawnMonsters(registry, w, { defId: 'pale_maw', kind: 'boss', count: 1 });
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    expect(w.bossId).toBe(boss.id);
    clearMonsters(w, 'monsters');
    expect(w.monsters).toHaveLength(5);
    expect(w.monsters.every((m) => m.dummy)).toBe(true);
    expect(w.bossId).toBeNull();
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    clearMonsters(w, 'dummies');
    expect(w.monsters.map((m) => m.defId)).toEqual(['mine_rat', 'mine_rat']);
    clearMonsters(w, 'all');
    expect(w.monsters).toHaveLength(0);
  });

  it('clearing monsters also removes their telegraphs and shots, so nothing hits after', () => {
    const threatened = () => {
      const w = sandbox();
      const h = w.hero;
      w.zones.push({
        id: w.nextId++,
        owner: 'monster',
        source: null,
        ability: null,
        x: h.x,
        y: h.y,
        radius: 2.6,
        born: w.t,
        until: w.t + 1.3,
        tick: 0,
        nextTick: 0,
        damage: 50,
        element: 'fire',
        detonateAt: w.t + 1.2,
        dead: false,
      });
      spawnProjectile(ctxOf(w).ctx, {
        owner: 'monster',
        form: null,
        ability: null,
        homingId: null,
        x: h.x,
        y: h.y - 3,
        vx: 0,
        vy: 6,
        radius: 0.35,
        damage: 50,
        element: 'fire',
        pierce: false,
        maxDist: 16,
        explodeRadius: 0,
        applies: [],
        knockback: 0,
      });
      return w;
    };
    const hits = (w: ArpgWorld) => run(w, 2).filter((e) => e.kind === 'heroHit');
    expect(hits(threatened())).toHaveLength(2);
    for (const which of ['monsters', 'all'] as const) {
      const w = threatened();
      clearMonsters(w, which);
      expect(hits(w)).toEqual([]);
    }
  });
});

describe('toggles', () => {
  it('infinite mana keeps the pool full', () => {
    const w = sandbox({ ...ALL_OFF, infiniteMana: true });
    w.hero.mana = 0;
    run(w, STEP);
    expect(w.hero.mana).toBe(w.hero.manaMax);
    const off = sandbox();
    off.hero.mana = 0;
    run(off, STEP);
    expect(off.hero.mana).toBeLessThan(1);
  });

  it('infinite mana ignores cost: an Ultimate dearer than the whole pool still casts', () => {
    const heavy = { kind: 'heavy', payment: 'mana' } as const;
    const w = sandbox({ ...ALL_OFF, infiniteMana: true }, { ultimate: heavy });
    expect(moveOf(w, 2).cost).toBeGreaterThan(w.hero.manaMax);
    expect(abilityReady(ctxOf(w).ctx, 2)).toBe(true);
    expect(canAfford(w, moveOf(w, 2))).toBe(true);
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    const off = sandbox(ALL_OFF, { ultimate: heavy });
    off.hero.mana = off.hero.manaMax;
    expect(abilityReady(ctxOf(off).ctx, 2)).toBe(false);
    expect(canAfford(off, moveOf(off, 2))).toBe(false);
    expect(canAfford(off, moveOf(off, 0))).toBe(true);
  });

  it('no cooldowns keeps charge-paid abilities charged, from the start and once switched on', () => {
    const u = sandbox(ALL_ON); // the Ultimate is a charge-paid Nova, never charged by hand
    pressOnly(u, 2);
    expect(u.hero.windup?.slot).toBe(2);
    const w = sandbox();
    expect(w.hero.charge[2]).toBe(0);
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    run(w, STEP);
    expect(w.hero.charge[2]).toBe(moveOf(w, 2).chargeNeed);
  });

  it('no cooldowns: the same ability fires again right after its beat, and charge stays full', () => {
    const on = sandbox({ ...ALL_OFF, noCooldowns: true, infiniteMana: true });
    const off = sandbox({ ...ALL_OFF, infiniteMana: true });
    for (const w of [on, off]) {
      w.hero.nextAttackAt = 1e9;
      spawnDummies(registry, w, { layout: 'single', element: null });
      press(w, 1);
      pressOnly(w, 1);
    }
    // The beat stays on: the press waits for its end.
    expect(on.hero.windup).toBeNull();
    for (const w of [on, off]) run(w, w.hero.beatUntil[1] - w.t);
    expect(on.hero.windup?.slot).toBe(1);
    expect(off.hero.windup).toBeNull(); // a 10 s cooldown

    const u = sandbox({ ...ALL_OFF, noCooldowns: true }); // the Ultimate is a charge-paid Nova
    const need = moveOf(u, 2).chargeNeed;
    press(u, 2);
    expect(u.hero.charge[2]).toBe(need);
    pressOnly(u, 2);
    run(u, u.hero.beatUntil[2] - u.t);
    expect(u.hero.windup?.slot).toBe(2);
  });

  it('switching no cooldowns on frees abilities already cooling down', () => {
    const w = sandbox();
    w.hero.cooldowns = [[5], [5], [5]];
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    expect(w.sandbox).toEqual({ ...ALL_OFF, noCooldowns: true });
    for (const c of w.hero.cooldowns.flat()) expect(c).toBeLessThanOrEqual(w.t);
  });

  it('invulnerable: no life lost, the would-be damage reported as blocked, and a perfect dodge still counts', () => {
    const w = sandbox({ ...ALL_OFF, invulnerable: true });
    const hp = w.hero.hp;
    const { ctx, events } = ctxOf(w);
    hurtHero(ctx, 1e6, 'fire', null);
    expect(w.hero.hp).toBe(hp);
    expect(w.heroDead).toBe(false);
    const hit = events.find(
      (e): e is Extract<ArpgEvent, { kind: 'heroHit' }> => e.kind === 'heroHit',
    )!;
    expect(hit).toMatchObject({ dodged: false, blocked: true });
    expect(hit.amount).toBeGreaterThan(0);

    dodge(w);
    const next = ctxOf(w);
    hurtHero(next.ctx, 50, null, null);
    expect(next.events.map((e) => e.kind)).toContain('perfectDodge');
  });

  it('fill charge fills every charge-paid slot', () => {
    const w = sandbox(ALL_OFF, { defensive: { payment: 'charge' } });
    fillCharge(w);
    expect(w.hero.charge).toEqual([0, moveOf(w, 1).chargeNeed, moveOf(w, 2).chargeNeed]);
  });

  it('respawn restores the hero where it fell and clears its action state', () => {
    const w = sandbox();
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    w.hero.potions = 0;
    w.hero.phoenixUsed = true;
    w.hero.phoenixAvailable = false;
    hurtHero(ctxOf(w).ctx, 1e9, null, null, { unavoidable: true });
    expect(w.heroDead).toBe(true);
    const h = w.hero;
    h.windup = {
      slot: 0,
      aim: null,
      at: { x: 13, y: 20 },
      start: 0,
      until: 1,
      step: 0,
      stage: 0,
      conjureUntil: 1,
      chargePaid: 0,
    };
    h.swing = {
      step: 0,
      dir: { x: 0, y: -1 },
      targetId: null,
      start: 0,
      strikeAt: 1,
      cycle: 1,
      committed: true,
      held: null,
    };
    h.hold = { slot: 0, step: 0, start: 0, aim: null, full: 1, max: 2 };
    h.push = { fromX: 13, fromY: 26, dx: 0, dy: -1, start: 0, until: 1, stopId: null };
    h.recoverUntil = w.t + 5;
    h.dodge = { dir: { x: 1, y: 0 }, fromX: 13, fromY: 26, start: 0, until: 1, perfect: false };
    h.defend = { form: 'ward', until: w.t + 5, move: 0, stage: 0 };
    h.ward = { hp: 10, max: 10 };
    const spot = { x: h.x, y: h.y };
    respawnHero(registry, w);
    expect(w.heroDead).toBe(false);
    expect(h).toMatchObject({
      ...spot,
      hp: h.stats.maxHp,
      potions: bal.dive.potions,
      phoenixAvailable: true,
      phoenixUsed: false,
      windup: null,
      hold: null,
      swing: null,
      push: null,
      dodge: null,
      defend: null,
      ward: null,
    });
    expect(h.recoverUntil).toBeLessThanOrEqual(w.t);
    expect(h.invulnUntil).toBeCloseTo(w.t + 1);
    expect(w.monsters).toHaveLength(2);
  });
});

describe('hit events', () => {
  it('carry their source, and the ability slot for skill hits', () => {
    type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
    const hits = (events: ArpgEvent[]) => events.filter((e): e is Hit => e.kind === 'hit');
    const w = sandbox(ALL_ON);
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.y = DUMMY_Y + 1.5; // the sword reaches the dummy
    const basic = hits(run(w, 1.5)).find((e) => e.source === 'basic');
    expect(basic).toBeDefined();
    expect(basic!.slot).toBeUndefined();

    w.hero.nextAttackAt = 1e9;
    const later = hits([...press(w, 0), ...run(w, 1.5)]); // a Fire Bolt, which burns
    expect(later.find((e) => e.source === 'skill')).toMatchObject({ slot: 0 });
    expect(later.some((e) => e.source === 'dot')).toBe(true);
  });
});

describe('mid-fight build swaps', () => {
  const swap = (w: ArpgWorld, chains: SlotOpts) =>
    refreshWorldHero(registry, w, w.hero.stats, chainsWith(chains));

  it('a new build for the slot winding up cancels the wind-up: cooldown reset, charge back', () => {
    const w = sandbox(); // the Ultimate is a charge-paid Nova (21 charge)
    fillCharge(w);
    const need = moveOf(w, 2).chargeNeed;
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    expect(w.hero.charge[2]).toBe(0);
    swap(w, { ultimate: { form: 'barrage' } });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.cooldowns[2][0]).toBeLessThanOrEqual(w.t);
    expect(w.hero.charge[2]).toBeCloseTo(Math.min(need, moveOf(w, 2).chargeNeed));
    expect(moveOf(w, 2).form.id).toBe('barrage');
  });

  it('the mana spent on a cancelled wind-up stays spent', () => {
    const cast = { payment: 'cast' as const };
    const w = sandbox(ALL_OFF, { primary: cast });
    w.hero.nextAttackAt = 1e9;
    spawnDummies(registry, w, { layout: 'single', element: null }); // the Bolt needs a target
    const mana = w.hero.mana;
    pressOnly(w, 0);
    expect(w.hero.windup?.slot).toBe(0);
    swap(w, { primary: { ...cast, form: 'lance' } });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.mana).toBeLessThan(mana - 1);
  });

  it('a new Defensive ends the Ward at once, without bursting', () => {
    const w = sandbox();
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    swap(w, { defensive: { form: 'armor', elements: ['earth'] } });
    expect(w.hero.ward).toBeNull();
    expect(w.hero.defend).toBeNull();
    expect(run(w, 0.5).map((e) => e.kind)).not.toContain('wardBreak');
  });

  it('unchanged slots carry on', () => {
    const w = sandbox();
    press(w, 1); // a Ward up
    fillCharge(w);
    pressOnly(w, 2); // a Nova winding up
    const windup = { ...w.hero.windup! };
    swap(w, { primary: { form: 'lance' } });
    expect(w.hero.windup).toEqual(windup);
    expect(w.hero.ward).not.toBeNull();
    expect(moveOf(w, 0).form.id).toBe('lance');
  });
});

describe('hero stats overrides', () => {
  const eq = { weapon: gear('fire'), chest: gear('earth', 'chest') };
  /** A bare amulet (no lines) carrying one legendary power at a set value, or none. */
  const amulet = (power: { id: string; value: number } | null): GearItem => {
    const item = generateItem(
      registry,
      { uid: 'amulet', ilvl: 3, rarity: 'legendary', slot: 'amulet', legendaryId: 'prism' },
      new SeededRNG(1),
    );
    const bare: GearItem = { ...item, implicits: [], affixes: [] };
    delete bare.legendary;
    return power ? { ...bare, legendary: { ...power, roll: 1 } } : bare;
  };

  it('extra legendaries apply as gear would, the higher of gear and extra winning', () => {
    const plain = computeHeroStats(eq, registry);
    const glass = computeHeroStats(eq, registry, { legendaries: { glass_cannon: 50 } });
    expect(glass.legendaries.glass_cannon).toBe(50);
    expect(glass.damageMult).toBeCloseTo(plain.damageMult + 0.5);
    expect(glass.maxHp).toBeCloseTo(plain.maxHp * 0.8);
    const worn = { ...eq, amulet: amulet({ id: 'glass_cannon', value: 40 }) };
    const higher = computeHeroStats(worn, registry, { legendaries: { glass_cannon: 50 } });
    const lower = computeHeroStats(worn, registry, { legendaries: { glass_cannon: 30 } });
    expect(higher.legendaries.glass_cannon).toBe(50);
    expect(lower.legendaries.glass_cannon).toBe(40);
  });

  it('extra attunement adds to the gear, before masteries and the mana pool', () => {
    const plain = computeHeroStats(eq, registry);
    expect(hasMastery(registry, plain.attunement, 'earth')).toBe(false);
    const earth = computeHeroStats(eq, registry, { attunement: { earth: 10 } });
    expect(earth.attunement.earth).toBe(plain.attunement.earth + 10);
    expect(hasMastery(registry, earth.attunement, 'earth')).toBe(true);
    expect(earth.maxHp).toBeCloseTo(plain.maxHp * 1.2); // the Earth mastery
    expect(manaPool(earth, registry).max).toBe(
      manaPool(plain, registry).max + 10 * bal.mana.poolPerAttune,
    );
  });

  it('an extra Prism raises every element without stacking on gear Prism', () => {
    const base = computeAttunement({ ...eq, amulet: amulet(null) }, registry);
    const plus = (n: number) =>
      Object.fromEntries(Object.entries(base).map(([m, v]) => [m, v + n]));
    const gear2 = { ...eq, amulet: amulet({ id: 'prism', value: 2 }) };
    const gear1 = { ...eq, amulet: amulet({ id: 'prism', value: 1 }) };
    expect(
      computeAttunement({ ...eq, amulet: amulet(null) }, registry, { legendaries: { prism: 2 } }),
    ).toEqual(plus(2));
    expect(computeAttunement(gear2, registry, { legendaries: { prism: 1 } })).toEqual(plus(2));
    expect(computeAttunement(gear1, registry, { legendaries: { prism: 2 } })).toEqual(plus(2));
    expect(computeHeroStats(gear1, registry, { legendaries: { prism: 2 } }).attunement).toEqual(
      plus(2),
    );
  });
});

describe('the sandbox weapon', () => {
  it('has its base implicits only, scaled by rarity and item level, no legendary, and is deterministic', () => {
    const opts = { baseId: 'staff', mana: 'storm', rarity: 'legendary', ilvl: 5 } as const;
    const a = sandboxWeapon(registry, opts);
    expect(sandboxWeapon(registry, opts)).toEqual(a);
    expect(a).toMatchObject({
      slot: 'weapon',
      baseId: 'staff',
      mana: 'storm',
      rarity: 'legendary',
      ilvl: 5,
      affixes: [],
      upgrade: 0,
    });
    expect(a.legendary).toBeUndefined();
    expect(a.name).toContain('Staff');
    expect(a.implicits.map((s) => s.stat)).toEqual(
      registry.getGearBase('staff').implicits.map((t) => t.stat),
    );
    const plain = sandboxWeapon(registry, { ...opts, rarity: 'common', ilvl: 1 });
    expect(a.implicits[0].value).toBeGreaterThan(plain.implicits[0].value);
    expect(computeAttunement({ weapon: a }, registry).storm).toBe(
      bal.mana.attuneByRarity.legendary,
    );
    const variants = [
      a,
      sandboxWeapon(registry, { ...opts, baseId: 'sword' }),
      sandboxWeapon(registry, { ...opts, mana: 'fire' }),
      sandboxWeapon(registry, { ...opts, rarity: 'rare' }),
      sandboxWeapon(registry, { ...opts, ilvl: 6 }),
    ];
    expect(new Set(variants.map((i) => i.uid)).size).toBe(variants.length);
  });
});
