import { describe, it, expect } from 'vitest';
import {
  clearMonsters,
  createSandboxWorld,
  fillCharge,
  resetDummies,
  respawnHero,
  setSandboxToggles,
  spawnDummies,
  spawnMonsters,
} from '../src/arpg/sandbox.js';
import { createMonsterEntity, emptyStatus } from '../src/arpg/world.js';
import { hitMonster, hurtHero, killMonster, makeCtx } from '../src/arpg/combat.js';
import { computeHeroStats, referenceMonster } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { AbilityBuilds } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, SandboxToggles } from '../src/types/arpg.js';
import {
  DEFAULT_BUILDS,
  STEP,
  bal,
  damaged,
  dodge,
  gear,
  press,
  pressOnly,
  registry,
  run,
} from './fixtures/arena.js';

// A sandbox hero stands at heroStart (13, 26) facing up (-y); depth 5 is the Cinder Mines (fire).
// The fixtures' `dummy()` is a sturdy normal foe: this file's dummies come from `spawnDummies`.
const SB = bal.sandbox;
const ALL_ON: SandboxToggles = { infiniteMana: true, noCooldowns: true, invulnerable: true };
const ALL_OFF: SandboxToggles = { infiniteMana: false, noCooldowns: false, invulnerable: false };

function sandbox(toggles = ALL_OFF, builds: Partial<AbilityBuilds> = {}, depth = 5): ArpgWorld {
  return createSandboxWorld(registry, {
    depth,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    abilities: { ...DEFAULT_BUILDS, ...builds },
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
    const [one] = spawnDummies(registry, w, { layout: 'single', element: null });
    expect(at([one])).toEqual([[13, 22]]);
    expect(one).toMatchObject({
      defId: 'dummy',
      kind: 'normal',
      traits: [],
      speed: 0,
      damage: 0,
      radius: bal.monster.radius,
      element: w.element,
      dummy: { homeX: 13, homeY: 22, element: null },
    });
    expect(one.maxHp).toBe(Math.round(referenceMonster(registry, 5).hp * SB.dummyLifeMult));
    expect(at(spawnDummies(registry, w, { layout: 'row', element: null }))).toEqual([
      [13, 22],
      [13, 20],
      [13, 18],
      [13, 16],
      [13, 14],
    ]);
    const clump = at(spawnDummies(registry, w, { layout: 'clump', element: null }));
    expect(clump).toHaveLength(5);
    expect(clump[0]).toEqual([13, 21]);
    for (const [x, y] of clump.slice(1))
      expect(Math.hypot(x - 13, y - 21)).toBeCloseTo(SB.clumpRadius);
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

  it('reset to full on lethal damage, and the same hit still applies its status', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    d.hp = 1;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, d, 1000, 'fire', { source: 'skill', applies: ['burn'] });
    expect(d.dead).toBe(false);
    expect(d.hp).toBe(d.maxHp);
    expect(d.status.burnUntil).toBeGreaterThan(w.t);
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
    w.hero.y = 23.2; // in a real monster's melee reach
    const hp = w.hero.hp;
    run(w, 3);
    expect(at([d])).toEqual([[13, 22]]);
    expect(w.hero.hp).toBe(hp);
    expect(d.windupUntil).toBe(0);
    expect(d.aggro).toBe(false); // its AI never ran: it never noticed the hero
    run(w, 1, { x: 0, y: -1 });
    expect(at([d])).toEqual([[13, 22]]);
    expect(w.hero.y).toBeCloseTo(22 + d.radius + w.hero.radius, 5);
  });

  it('are moved by knockback and pull', () => {
    const w = sandbox();
    w.hero.nextAttackAt = 1e9;
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    hitMonster(ctxOf(w).ctx, d, 1, null, {
      source: 'skill',
      knockback: 1,
      kbFrom: { x: 13, y: 26 },
    });
    run(w, 0.3);
    expect(d.y).toBeLessThan(22 - 0.3);
    expect(d.x).toBeCloseTo(13, 5);

    // Magnetism (storm + earth) pulls: 75% of the way to a Nova at the hero, 4 units away.
    const p = sandbox(ALL_ON, {
      ultimate: { form: 'nova', elements: ['storm', 'earth'], weight: 0, payment: 'mana' },
    });
    p.hero.nextAttackAt = 1e9;
    const [q] = spawnDummies(registry, p, { layout: 'single', element: null });
    press(p, 2);
    expect(q.y).toBeGreaterThan(23);
  });

  it("a row's spacing lets a chain jump", () => {
    const w = sandbox(ALL_ON, {
      primary: { form: 'bolt', elements: ['storm'], weight: 0, payment: 'mana' },
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
    d.status.burnUntil = w.t + 3;
    d.status.chillStacks = 1;
    resetDummies(w);
    expect(d).toMatchObject({ x: 13, y: 22, hp: d.maxHp, kbx: 0, kby: 0, lastHitAt: -1 });
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

  it('no cooldowns: the same ability fires again right after it lands, and charge refills as it lands', () => {
    const on = sandbox({ ...ALL_OFF, noCooldowns: true, infiniteMana: true });
    const off = sandbox({ ...ALL_OFF, infiniteMana: true });
    for (const w of [on, off]) {
      w.hero.nextAttackAt = 1e9;
      spawnDummies(registry, w, { layout: 'single', element: null });
      press(w, 0);
      pressOnly(w, 0);
    }
    expect(on.hero.windup?.slot).toBe(0);
    expect(off.hero.windup).toBeNull(); // 0.45 s cooldown

    const u = sandbox({ ...ALL_OFF, noCooldowns: true }); // the Ultimate is a charge-paid Nova
    fillCharge(u);
    const need = u.hero.abilities[2].chargeNeed;
    press(u, 2);
    expect(u.hero.charge[2]).toBe(need);
    pressOnly(u, 2);
    expect(u.hero.windup?.slot).toBe(2);
  });

  it('switching no cooldowns on frees abilities already cooling down', () => {
    const w = sandbox();
    w.hero.cooldowns = [5, 5, 5];
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    expect(w.sandbox).toEqual({ ...ALL_OFF, noCooldowns: true });
    for (const c of w.hero.cooldowns) expect(c).toBeLessThanOrEqual(w.t);
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
    const w = sandbox(ALL_OFF, {
      defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'charge' },
    });
    fillCharge(w);
    const [, guard, ult] = w.hero.abilities;
    expect(w.hero.charge).toEqual([0, guard.chargeNeed, ult.chargeNeed]);
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
    };
    h.push = { fromX: 13, fromY: 26, dx: 0, dy: -1, start: 0, until: 1, stopId: null };
    h.recoverUntil = w.t + 5;
    h.dodge = { dir: { x: 1, y: 0 }, fromX: 13, fromY: 26, start: 0, until: 1, perfect: false };
    h.defend = { form: 'ward', until: w.t + 5 };
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
    w.hero.y = 23.5; // the sword reaches the dummy at (13, 22)
    const basic = hits(run(w, 1.5)).find((e) => e.source === 'basic');
    expect(basic).toBeDefined();
    expect(basic!.slot).toBeUndefined();

    w.hero.nextAttackAt = 1e9;
    const later = hits([...press(w, 0), ...run(w, 1.5)]); // a Fire Bolt, which burns
    expect(later.find((e) => e.source === 'skill')).toMatchObject({ slot: 0 });
    expect(later.some((e) => e.source === 'dot')).toBe(true);
  });
});
