import { describe, it, expect } from 'vitest';
import arpgJson from '../src/data/arpg.json';
import { ArpgDataSchema } from '../src/data/schemas.js';
import { applyStatus, hasMark, hitMonster, isRattled, makeCtx } from '../src/arpg/combat.js';
import { shieldHero } from '../src/arpg/abilities/defend.js';
import { hitOpts } from '../src/arpg/abilities/impact.js';
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES } from '../src/types/mana.js';
import {
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
} from './fixtures/arena.js';

/** Sturdy foes (one at (13, 20) by default), the hero's basic attack stopped; `m` is the first. */
function setup(monsters: Partial<MonsterEntity>[] = [dummy(13, 20)], opts: ArenaOpts = {}) {
  const w = arena(monsters, { noBasic: true, ...opts });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events), m: w.monsters[0] };
}

/** Whether the world's first foe is rattled now. */
const rattled = (w: ArpgWorld) => isRattled(makeCtx(registry, w, []), w.monsters[0]);

describe('the reaction table', () => {
  it('has one reaction per pair of elements, found in either order', () => {
    expect(registry.getArpgData().reactions).toHaveLength(15);
    for (const a of MANA_TYPES)
      for (const b of MANA_TYPES) {
        if (a === b) continue;
        const r = registry.getReactionFor(a, b);
        expect([...r.elements].sort()).toEqual([a, b].sort());
        expect(registry.getReactionFor(b, a)).toBe(r);
      }
    expect(registry.getReactionFor('earth', 'storm').name).toBe('Lightning Rod');
  });

  it('Soulfire and Blight keep their mark; the five buff reactions have a cooldown', () => {
    const reactions = registry.getArpgData().reactions;
    expect(reactions.filter((r) => r.consumes === false).map((r) => r.id)).toEqual([
      'soulfire',
      'blight',
    ]);
    expect(reactions.filter((r) => r.cooldown).map((r) => r.id)).toEqual([
      'obsidian',
      'lightning_rod',
      'seedling',
      'siphon',
      'galvanize',
    ]);
  });

  it('refuses a reaction set that misses or repeats a pair', () => {
    expect(ArpgDataSchema.safeParse(arpgJson).success).toBe(true);
    const repeat = arpgJson.reactions.map((r) =>
      r.id === 'galvanize' ? { ...r, elements: ['fire', 'frost'] } : r,
    );
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: repeat }).success).toBe(false);
    const missing = arpgJson.reactions.filter((r) => r.id !== 'galvanize');
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: missing }).success).toBe(false);
  });
});

describe('balance: the reactions', () => {
  it("loads the new eight's numbers, their cooldown and Earth's rattle", () => {
    expect(bal.reactions).toMatchObject({
      obsidianSoak: 0.5,
      obsidianCap: 0.3,
      obsidianDuration: 5,
      lightningRodDuration: 2,
      lightningRodMove: 0.3,
      sunderDuration: 4,
      sunderBonus: 0.25,
      seedlingHeal: 0.08,
      siphonMana: 0.15,
      crystallizeMult: 1.8,
      crystallizeRadius: 2,
      blackoutRadius: 2.5,
      galvanizeSeconds: 1,
      reactionCooldown: 1.5,
    });
    expect(bal.status.rattleDuration).toBe(2);
  });
});

describe('marks', () => {
  it("each element's mark is its status: frost is chilled or frozen, earth is rattled", () => {
    const { ctx, m } = setup();
    const marks = () => MANA_TYPES.filter((e) => hasMark(ctx, m, e));
    expect(marks()).toEqual([]);
    applyStatus(ctx, m, 'burn', 10);
    applyStatus(ctx, m, 'shock', 0);
    applyStatus(ctx, m, 'hex', 0);
    expect(marks()).toEqual(['fire', 'storm', 'shadow']);
    applyStatus(ctx, m, 'freeze', 0);
    applyStatus(ctx, m, 'stagger', 0, true);
    applyStatus(ctx, m, 'poison', 10);
    expect(marks()).toEqual([...MANA_TYPES]);
  });

  it('an Earth stagger rattles, even when immunity refuses the stagger; it lapses after rattleDuration', () => {
    const { w, ctx, m } = setup([dummy(13, 20), dummy(16, 20)]);
    const plain = w.monsters[1];
    m.status.staggerImmuneUntil = 1e9;
    applyStatus(ctx, m, 'stagger', 0, true);
    expect(m.status.staggerUntil).toBe(0);
    expect(m.status.rattledUntil).toBeCloseTo(w.t + bal.status.rattleDuration);
    applyStatus(ctx, plain, 'stagger', 0);
    expect(plain.status.staggerUntil).toBeGreaterThan(w.t);
    expect(isRattled(ctx, plain)).toBe(false);
    run(w, bal.status.rattleDuration + 0.1);
    expect(isRattled(ctx, m)).toBe(false);
  });

  it("a fused ability with Earth second rattles, and so does an Earth finisher's discharge", () => {
    const { w, ctx, m } = setup([dummy(13, 20)], { primary: { elements: ['fire', 'earth'] } });
    const opts = hitOpts(w.hero.abilities[0], { x: 13, y: 20 });
    expect(opts.rattles).toBe(true);
    hitMonster(ctx, m, 10, 'fire', opts);
    expect(isRattled(ctx, m)).toBe(true);

    const fin = strikeWorld(
      { weapon: gear('fire') },
      { pair: { primary: 'fire', secondary: 'earth' } },
      true,
    );
    firstBlow(fin);
    expect(rattled(fin)).toBe(true);
  });

  it('a ranged Earth blow rattles, its shot and its burst, and so does any blow under an Earth Surge', () => {
    const shot = strikeWorld(
      { weapon: gear('earth', 'weapon', 'staff') },
      { pair: { primary: 'earth', secondary: null } },
      false,
      dummy(13, 30),
    );
    firstBlow(shot);
    const p = shot.projectiles.find((q) => q.owner === 'hero')!;
    expect(p).toMatchObject({ element: 'earth', rattles: true });
    p.applies = ['stagger']; // its 18% roll, made certain
    shot.hero.nextAttackAt = 1e9;
    run(shot, 1);
    expect(rattled(shot)).toBe(true);

    const burst = strikeWorld(
      { weapon: gear('fire', 'weapon', 'staff') },
      { pair: { primary: 'fire', secondary: 'earth' } },
      true,
      dummy(13, 30),
    );
    firstBlow(burst);
    burst.hero.nextAttackAt = 1e9;
    run(burst, 1);
    expect(rattled(burst)).toBe(true);

    const surge = strikeWorld(
      { weapon: gear('fire') },
      { pair: { primary: 'fire', secondary: null } },
    );
    const build = { form: 'surge', elements: ['earth'], weight: 0, payment: 'mana' } as const;
    surge.hero.abilities[1] = resolveAbility(registry, 'defensive', build, surge.hero.stats);
    surge.hero.defend = { form: 'surge', until: 1e9 };
    firstBlow(surge);
    expect(rattled(surge)).toBe(true);
  });

  it("a Maul finisher discharging a non-Earth secondary, Crushing weight and a riposte stagger but don't rattle", () => {
    const maul = strikeWorld(
      { weapon: gear('earth', 'weapon', 'maul') },
      { pair: { primary: 'earth', secondary: 'fire' } },
      true,
    );
    firstBlow(maul);
    expect(maul.monsters[0].status.staggerUntil).toBeGreaterThan(maul.t);
    expect(rattled(maul)).toBe(false);

    const heavy = setup([dummy(13, 20)], { primary: { weight: 2 } });
    const opts = hitOpts(heavy.w.hero.abilities[0], { x: 13, y: 20 });
    hitMonster(heavy.ctx, heavy.m, 10, 'fire', opts);
    expect(heavy.m.status.staggerUntil).toBeGreaterThan(heavy.w.t);
    expect(isRattled(heavy.ctx, heavy.m)).toBe(false);

    // An Earth source's hit with no statuses of its own: only the riposte staggers, without a rattle.
    const riposte = setup();
    riposte.w.hero.riposteUntil = 1e9;
    const earthHit = { source: 'skill', canCrit: true, rattles: true } as const;
    hitMonster(riposte.ctx, riposte.m, 10, 'earth', earthHit);
    expect(riposte.m.status.staggerUntil).toBeGreaterThan(riposte.w.t);
    expect(isRattled(riposte.ctx, riposte.m)).toBe(false);
  });

  it("an Earth Defensive's retaliation rattles, with Earth first or second", () => {
    const cases = [
      ['armor', ['earth', 'fire']],
      ['ward', ['fire', 'earth']],
    ] as const;
    for (const [form, elements] of cases) {
      const { w, ctx, m } = setup([dummy(13, 35)], {
        defensive: { form, elements: [...elements] },
      });
      w.hero.defend = { form, until: 1e9 };
      shieldHero(ctx, 10, m, true);
      expect(isRattled(ctx, m), form).toBe(true);
    }
  });
});

describe('saves remember every reaction', () => {
  it('a version 4 save that has seen a new reaction parses', () => {
    const p = {
      ...createDelveProfile(registry, 1),
      reactionsSeen: ['melt', 'sunder', 'lightning_rod'],
    };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['melt', 'sunder', 'lightning_rod']);
  });

  it('a version 3 save with the seven still migrates', () => {
    const fresh = createDelveProfile(registry, 1, { primary: 'fire' });
    const { pair: _pair, manaDust: _dust, ...rest } = fresh;
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 4,
      reactionsSeen: ['melt', 'blight'],
    });
  });
});
