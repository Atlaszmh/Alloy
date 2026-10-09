import { describe, it, expect } from 'vitest';
import { makeCtx, hurtHero, hitMonster } from '../src/arpg/combat.js';
import { computeHeroStats, damagePerUse, expectedHit } from '../src/delve/hero-stats.js';
import { hitOpts, cleaveBehind } from '../src/arpg/abilities/impact.js';
import {
  moveNumbers,
  NEUTRAL,
  mergeKnobs,
  resolveAbility,
  resolveChain,
  stepBonus,
} from '../src/arpg/abilities/resolve.js';
import { surgeMult, surgeTick } from '../src/arpg/abilities/defend.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { Chain } from '../src/types/ability.js';
import {
  arena,
  bal,
  damaged,
  dummy,
  gear,
  moveOf,
  press,
  registry,
  run,
  STEP,
} from './fixtures/arena.js';

// The constructs spec §2 (forms), §2.3 (Detonate), §4 (cast styles). The hero starts at
// (13, 36) facing up (−y); the fixture's weapon is a sword (melee).

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
const hits = (events: ArpgEvent[], id: number) =>
  events.filter((e): e is Hit => e.kind === 'hit' && e.id === id);
const DETONATE = { id: 'detonate', tier: 3 } as const;

describe('Detonate (impact.ts)', () => {
  it("a Strike's contact hit blasts the foes round the foe it struck, never the foe itself twice", () => {
    const w = arena([dummy(13, 32.8), dummy(13, 31.3), dummy(13, 24)], {
      noBasic: true,
      primary: { form: 'strike', runes: [DETONATE] },
    });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events = press(w, 0);
    const [near, behind, far] = w.monsters;
    // The sweep reaches the near foe only; its blast reaches the one behind it.
    expect(hits(events, near.id)).toHaveLength(1);
    expect(hits(events, behind.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    const k = moveOf(w, 0).knobs.detonate;
    expect(k).toBeGreaterThan(0);
    expect(hits(events, behind.id)[0].amount).toBeCloseTo(hits(events, near.id)[0].amount * k, 6);
  });

  it('a Bolt (no fit) and a tick never detonate; Power counts it', () => {
    const w = arena([dummy(13, 30), dummy(13, 28.2)], {
      noBasic: true,
      primary: { form: 'bolt', runes: [DETONATE] },
    });
    expect(moveOf(w, 0).knobs.detonate).toBe(0);
    const chain = (runes: (typeof DETONATE)[]): Chain => ({
      moves: [{ kind: 'medium', form: 'strike', elements: ['fire'], runes }],
      payment: 'mana',
    });
    const stats = w.hero.stats;
    const value = (c: Chain) =>
      damagePerUse(resolveChain(registry, stats, 'primary', c), expectedHit(stats), stats, bal);
    // Its blasts outweigh the rune's 0.9 power.
    expect(value(chain([DETONATE]))).toBeGreaterThan(value(chain([])));
  });
});

describe('Whirl (forms.ts performTick)', () => {
  const whirl = { kind: 'medium', form: 'whirl', elements: ['fire'] } as const;

  it('spins: a sweep all round now and every tick for its duration, the hero walking slowed meanwhile', () => {
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], { noBasic: true, primary: { ...whirl } });
    const form = registry.getForm('whirl');
    const beats = Math.round(form.duration! / form.tick!);
    // A short walk (at `actionMove`, as a swing's), then standing: every beat still reaches both.
    const events = [
      ...press(w, 0),
      ...run(w, 0.2, { x: 1, y: 0 }),
      ...run(w, form.duration! - 0.1, { x: 0, y: 0 }),
    ];
    // The sweeps' own hits (the burn's ticks come as `dot` hits beside them).
    for (const m of w.monsters)
      expect(hits(events, m.id).filter((e) => e.source === 'skill')).toHaveLength(beats);
    const walked = w.hero.x - 13;
    expect(walked).toBeGreaterThan(0.3);
    expect(walked).toBeLessThan(w.hero.stats.moveSpeed * 0.2 * bal.feel.actionMove + 0.1);
    expect(w.hero.perform ?? null).toBeNull();
    expect(events.filter((e) => e.kind === 'slash' && e.arc === 360)).toHaveLength(beats);
  });

  it("its hits are direct (a chain's first move's stacks), and a second press starts the spin over", () => {
    const w = arena([dummy(13, 34.4)], { noBasic: true, primary: { ...whirl } });
    const events = press(w, 0);
    expect(w.monsters[0].status.stacks.fire).toBe(moveOf(w, 0).stacks);
    expect(hits(events, w.monsters[0].id)[0].source).toBe('skill');
    run(w, 0.3);
    w.hero.cooldowns[0][0] = 0;
    w.hero.beatUntil[0] = 0;
    press(w, 0);
    expect(w.hero.perform?.struck).toBe(1);
  });
});

describe('Repel (forms.ts)', () => {
  it('pulses: the foes round the hero are hit, knocked back and chilled; the Defensive up ends', () => {
    const w = arena([dummy(13, 34), dummy(13, 24)], {
      noBasic: true,
      weapon: 'staff',
      defensive: {
        moves: [
          { kind: 'medium', form: 'ward', elements: ['fire'] },
          { kind: 'medium', form: 'repel', elements: ['fire'] },
        ],
      },
    });
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    run(w, bal.chains.beat.medium * bal.chains.beatSlot.defensive + 0.1);
    w.hero.cooldowns[1][1] = 0;
    const events = press(w, 1);
    const [near, far] = w.monsters;
    expect(w.hero.ward).toBeNull();
    expect(w.hero.defend).toBeNull();
    expect(hits(events, near.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    expect(near.kby).toBeLessThan(0);
    expect(near.status.stacks.frost).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'explode' && e.x === w.hero.x)).toBe(true);
  });
});

describe('Onslaught (forms.ts performTick, combat.ts hurtHero)', () => {
  const onslaught = { form: 'onslaught', payment: 'mana' } as const;
  const form = () => registry.getForm('onslaught');

  it('darts between the foes in the area, striking count times, never the same foe twice running', () => {
    const w = arena([dummy(13, 29), dummy(15, 28), dummy(13, 16)], {
      noBasic: true,
      ultimate: { ...onslaught },
    });
    const events = [...press(w, 2, { x: 13, y: 28 }), ...run(w, form().duration! + 0.1)];
    const [a, b, far] = w.monsters;
    // The darts' own hits (the burn's ticks come as `dot` hits beside them).
    const struck = (id: number) => hits(events, id).filter((e) => e.source === 'skill').length;
    expect(struck(a.id) + struck(b.id)).toBe(form().count);
    expect(struck(a.id)).toBeGreaterThan(0);
    expect(struck(b.id)).toBeGreaterThan(0);
    expect(damaged(far)).toBe(false);
    expect(events.filter((e) => e.kind === 'dash')).toHaveLength(form().count);
    expect(w.hero.perform ?? null).toBeNull();
    // It stands by its last foe.
    const gaps = w.monsters.slice(0, 2).map((m) => Math.hypot(m.x - w.hero.x, m.y - w.hero.y));
    expect(Math.min(...gaps)).toBeLessThan(2);
  });

  it('is invulnerable while darting, then takes effect less damage for onslaughtGuard seconds', () => {
    const w = arena([dummy(13, 29)], { noBasic: true, ultimate: { ...onslaught } });
    press(w, 2, { x: 13, y: 29 });
    const ctx = makeCtx(registry, w, []);
    const hp = w.hero.hp;
    hurtHero(ctx, 30, null, null);
    expect(w.hero.hp).toBe(hp);
    run(w, form().duration! + STEP);
    const guard = w.hero.onslaughtGuard!;
    expect(guard.until).toBeCloseTo(w.t + bal.abilities.defend.onslaughtGuard, 1);
    const plain = arena([dummy(13, 29)], { noBasic: true });
    hurtHero(makeCtx(registry, plain, []), 30, null, null, { unavoidable: true });
    hurtHero(ctx, 30, null, null, { unavoidable: true });
    const lost = (x: ArpgWorld) => x.hero.stats.maxHp - x.hero.hp;
    expect(lost(w)).toBeCloseTo(lost(plain) * (1 - moveOf(w, 2).effect), 6);
  });
});

describe('the melee versions (forms.ts): a Lance lunge, a Burst eruption, a Maelstrom that follows', () => {
  it('a melee Lance lunges the line, striking every foe it passes; a ranged one beams as before', () => {
    // The lunge stops at 31; the beam reaches 28.5, so the foe at 29 tells them apart.
    const foes = () => [dummy(13, 33), dummy(13, 31.5), dummy(13, 29), dummy(18, 31)];
    const melee = arena(foes(), { noBasic: true, primary: { form: 'lance' } });
    const events = press(melee, 0);
    expect(melee.monsters.slice(0, 2).every(damaged)).toBe(true);
    expect(damaged(melee.monsters[2])).toBe(false);
    expect(damaged(melee.monsters[3])).toBe(false);
    expect(events.some((e) => e.kind === 'dash')).toBe(true);
    expect(events.some((e) => e.kind === 'beam')).toBe(false);
    expect(36 - melee.hero.y).toBeCloseTo(registry.getForm('lance').melee!.range!, 0);
    expect(melee.hero.invulnUntil).toBeLessThanOrEqual(melee.t);
    const ranged = arena(foes(), { noBasic: true, weapon: 'staff', primary: { form: 'lance' } });
    const beam = press(ranged, 0);
    expect(ranged.monsters.slice(0, 3).every(damaged)).toBe(true);
    expect(beam.some((e) => e.kind === 'beam')).toBe(true);
    // Lance's own recoil (−0.3) is all that moves a ranged caster.
    expect(ranged.hero.y).toBeCloseTo(36, 0);
  });

  it('a melee Burst erupts at the aim point at once, within its range; a ranged one is thrown', () => {
    const melee = arena([dummy(13, 31)], { noBasic: true, primary: { form: 'burst' } });
    press(melee, 0, { x: 13, y: 31 });
    expect(damaged(melee.monsters[0])).toBe(true);
    expect(melee.zones.some((z) => z.source === 'burst')).toBe(false);
    const ranged = arena([dummy(13, 31)], {
      noBasic: true,
      weapon: 'staff',
      primary: { form: 'burst' },
    });
    press(ranged, 0, { x: 13, y: 31 });
    expect(damaged(ranged.monsters[0])).toBe(false);
    expect(ranged.zones.some((z) => z.source === 'burst')).toBe(true);
  });

  it('a melee Maelstrom rides the hero; a ranged one stays where it was placed', () => {
    // Off the hero's path, so no separation push shifts the hero after the zone has moved.
    const melee = arena([dummy(15, 24)], {
      noBasic: true,
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(melee, 2);
    const z = melee.zones.find((q) => q.source === 'maelstrom')!;
    expect(z.follow).toBe(true);
    expect([z.x, z.y]).toEqual([melee.hero.x, melee.hero.y]);
    const events = run(melee, 3, { x: 0, y: -1 });
    expect(melee.hero.y).toBeLessThan(28);
    expect(z.y).toBeCloseTo(melee.hero.y, 3);
    expect(hits(events, melee.monsters[0].id).length).toBeGreaterThan(0);
    const ranged = arena([dummy(13, 28)], {
      noBasic: true,
      weapon: 'staff',
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(ranged, 2);
    run(ranged, 1, { x: 1, y: 0 });
    expect(ranged.zones.find((q) => q.source === 'maelstrom')!.x).toBe(13);
  });
});

describe('Surge (defend.ts surgeMult, surgeTick)', () => {
  const surged = () => {
    const w = arena([dummy(13, 30)], { noBasic: true, defensive: { form: 'surge' } });
    press(w, 1);
    return w;
  };

  it('is 1 + its effect while up, 1 without', () => {
    const w = surged();
    expect(surgeMult(makeCtx(registry, w, []))).toBeCloseTo(1 + moveOf(w, 1).effect, 9);
    expect(surgeMult(makeCtx(registry, arena([], { noBasic: true }), []))).toBe(1);
  });

  it('advances the running cooldowns, beats, a wind-up and the dodge recharge, never its own cooldown', () => {
    const w = surged();
    const ctx = makeCtx(registry, w, []);
    const mult = surgeMult(ctx);
    const t = w.t;
    w.hero.cooldowns[0][0] = t + 2;
    w.hero.beatUntil[0] = t + 1;
    w.hero.comboAt[0] = t + 1;
    w.hero.dodgeRechargeAt = t + 1.6;
    const own = w.hero.cooldowns[1][0];
    surgeTick(ctx, 0.1);
    const extra = 0.1 * (mult - 1);
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(t + 2 - extra, 9);
    expect(w.hero.beatUntil[0]).toBeCloseTo(t + 1 - extra, 9);
    expect(w.hero.comboAt[0]).toBeCloseTo(t + 1 - extra, 9);
    expect(w.hero.dodgeRechargeAt).toBeCloseTo(t + 1.6 - extra, 9);
    expect(w.hero.cooldowns[1][0]).toBe(own);
  });

  it('mana regen and move speed run faster', () => {
    const effect = registry.getForm('surge').effect!;
    const regen = (surge: boolean) => {
      const w = surge ? surged() : arena([dummy(13, 30)], { noBasic: true });
      w.hero.mana = 0;
      run(w, 1);
      return w.hero.mana;
    };
    expect(regen(true)).toBeCloseTo(regen(false) * (1 + effect), 1);
    const walked = (surge: boolean) => {
      const w = surge ? surged() : arena([], { noBasic: true });
      const y = w.hero.y;
      run(w, 0.5, { x: 0, y: 1 });
      return w.hero.y - y;
    };
    expect(walked(true) / walked(false)).toBeCloseTo(1 + effect, 1);
  });
});

describe('Blink (arpg.json)', () => {
  it('is untouchable through its dash and 0.5 s after landing', () => {
    const w = arena([dummy(13, 20)], { noBasic: true, defensive: { form: 'blink' } });
    press(w, 1, { x: 13, y: 20 });
    expect(w.hero.invulnUntil - w.t).toBeGreaterThanOrEqual(0.9 - STEP);
    expect(registry.getForm('blink').effect).toBe(0.9);
  });
});

/** A move resolved on a plain Fire weapon of `baseId`. */
function on(baseId: string, move: { kind: 'medium'; form: 'bolt' | 'strike'; elements: ['fire'] }) {
  const stats = computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry, {
    pair: { primary: 'fire', secondary: null },
  });
  return resolveAbility(registry, registry.getForm(move.form).slot, move, 'mana', stats);
}
const BOLT = { kind: 'medium', form: 'bolt', elements: ['fire'] } as const;
const STRIKE = { kind: 'medium', form: 'strike', elements: ['fire'] } as const;

describe('the cast styles (delve.json, resolve.ts)', () => {
  it("a dagger's Bolt is quicker, shorter and weaker than a staff's; a bow's flies further and faster", () => {
    const [dagger, staff, bow] = ['dagger', 'staff', 'bow'].map((b) => on(b, BOLT));
    const dn = registry.getGearBase('dagger').style!.numbers;
    const sn = registry.getGearBase('staff').style!.numbers;
    expect(dagger.conjure / staff.conjure).toBeCloseTo(dn.windup / sn.windup, 9);
    expect(dagger.cooldown / staff.cooldown).toBeCloseTo(dn.cooldown / sn.cooldown, 9);
    expect(dagger.power / staff.power).toBeCloseTo(dn.power / sn.power, 9);
    expect(dagger.range / staff.range).toBeCloseTo(dn.range / sn.range, 9);
    expect(bow.range).toBeGreaterThan(staff.range);
    expect(bow.speed).toBeGreaterThan(staff.speed);
    expect(dagger.look).toBe('blade');
    expect(bow.look).toBe('arrow');
  });

  it("an axe's Strike sweeps a wider arc and radius; a maul's lands harder, later", () => {
    const [sword, axe, maul] = ['sword', 'axe', 'maul'].map((b) => on(b, STRIKE));
    expect(axe.arc).toBeCloseTo(Math.min(360, sword.arc * 1.2), 9);
    expect(axe.radius / sword.radius).toBeCloseTo(1.2, 9);
    expect(maul.power / sword.power).toBeCloseTo(1.25, 9);
    expect(maul.conjure / sword.conjure).toBeCloseTo(1.3, 9);
    expect(maul.knobs.applies).toContain('stagger');
  });

  it('every weapon base names its trait for the item header', () => {
    for (const base of registry.getGearBasesForSlot('weapon'))
      expect(base.style!.text.length).toBeGreaterThan(0);
  });
});

describe('style motion (action.ts styleMotion)', () => {
  /** Where the hero stands as its Bolt lands, and `stepSeconds` later, aimed up at a far foe. */
  const path = (weapon: string) => {
    const w = arena([dummy(13, 26)], { noBasic: true, weapon, primary: { moves: [{ ...BOLT }] } });
    press(w, 0, { x: 13, y: 26 });
    const landed = { x: w.hero.x, y: w.hero.y };
    run(w, bal.feel.stepSeconds + STEP);
    return { landed, after: { x: w.hero.x, y: w.hero.y } };
  };

  it('a dagger darts toward the aim as it winds up; a bow steps back on release; a staff sways aside; a wand circles', () => {
    const dagger = path('dagger');
    // The dart lands before the move does; Bolt's own recoil follows it.
    expect(36 - dagger.landed.y).toBeGreaterThan(bal.feel.styleMove.dart * 0.5);
    const bow = path('bow');
    expect(bow.after.y - bow.landed.y).toBeGreaterThan(bal.feel.styleMove.back * 0.5);
    const staff = path('staff');
    expect(Math.abs(staff.after.x - 13)).toBeGreaterThan(bal.feel.styleMove.sway * 0.5);
    const wand = path('wand');
    expect(Math.abs(wand.after.x - 13)).toBeGreaterThan(bal.feel.styleMove.orbit * 0.5);
  });

  it('a sword steps in on release; a self-centred form moves nothing', () => {
    const sword = path('sword');
    expect(sword.landed.y - sword.after.y).toBeGreaterThan(bal.feel.styleMove.step * 0.5);
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      weapon: 'dagger',
      ultimate: { payment: 'mana', moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }] },
    });
    press(w, 2);
    run(w, bal.feel.stepSeconds + STEP);
    expect([w.hero.x, w.hero.y]).toEqual([13, 36]);
  });
});

describe('the traits (impact.ts, combat.ts, step.ts, resolve.ts)', () => {
  it("critBonus: a dagger's hits roll crit with its bonus; a bonus of 1 always crits", () => {
    const dagger = on('dagger', STRIKE);
    expect(hitOpts(dagger, { x: 0, y: 0 }).critBonus).toBeCloseTo(0.15, 9);
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill', canCrit: true, critBonus: 1 });
    expect(hits(events, w.monsters[0].id)[0].crit).toBe(true);
  });

  it('cleave: a single-target hit on an axe cleaves the foes just behind its foe for half', () => {
    const w = arena([dummy(13, 30), dummy(13, 29), dummy(13, 26)], {
      noBasic: true,
      weapon: 'axe',
    });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const ab = moveOf(w, 0);
    expect(ab.knobs.cleave).toBeGreaterThan(0);
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill', crit: false, stacks: 0 });
    const full = hits(events, w.monsters[0].id)[0].amount;
    cleaveBehind(ctx, ab, w.monsters[0], 10);
    // Half the hit, read as a ratio to the same hit on the struck foe (resists and stacks alike).
    expect(hits(events, w.monsters[1].id)[0].amount / full).toBeCloseTo(0.5, 2);
    expect(damaged(w.monsters[2])).toBe(false);
    expect(hits(events, w.monsters[0].id)).toHaveLength(1);
  });

  it("homing: a wand's Bolt aimed a little beside a foe turns into it; a staff's misses", () => {
    const flies = (weapon: string) => {
      const w = arena([dummy(13, 28)], { noBasic: true, weapon, primary: { ...BOLT } });
      press(w, 0, { x: 15.2, y: 20 });
      run(w, 1.5);
      return damaged(w.monsters[0]);
    };
    expect(flies('wand')).toBe(true);
    expect(flies('staff')).toBe(false);
  });

  it("stepBonus: a sword's chain steps 5% harder; the knob merges by adding; the Anvil's numbers see it", () => {
    expect(mergeKnobs({ stepBonus: 0.05 }, { stepBonus: 0.02 }).stepBonus).toBeCloseTo(0.07, 12);
    expect(NEUTRAL.stepBonus).toBe(0);
    expect(on('sword', STRIKE).knobs.stepBonus).toBeCloseTo(0.05, 9);
    const stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
    });
    const chain = resolveChain(registry, stats, 'primary', {
      moves: [STRIKE, STRIKE],
      payment: 'mana',
    });
    const second = chain.moves[1];
    expect(moveNumbers(stats, bal, second).hit).toBeCloseTo(
      stats.weaponDamage * stats.damageMult * second.power * stepBonus(bal, 1, 0.05).power,
      6,
    );
  });
});
