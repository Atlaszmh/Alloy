import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing
// up; `dummy(x, y)` is a sturdy Fire foe that doesn't fight back. A move's runes ride on it
// (`Move.runes`, `Blow.runes`): `R('chain')` is Chain III.

const R = (id: string, tier: RuneTier = 3): RuneRef => ({ id, tier });

/** Sturdy foes, the hero's basic attack stopped (only abilities deal damage). */
function world(monsters: Partial<MonsterEntity>[], opts: ArenaOpts = {}): ArpgWorld {
  return arena(monsters, { noBasic: true, ...opts });
}

/** The skill hits of slot `slot` (the Primary by default). */
const skillHits = (events: ArpgEvent[], slot = 0) =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === 'skill' && e.slot === slot ? [e] : []));

/** Step `w` until an event of `kind` (at most 3 s), returning every event. */
function until(w: ArpgWorld, kind: ArpgEvent['kind']): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 90 && !events.some((e) => e.kind === kind); i++) events.push(...run(w, STEP));
  return events;
}

describe('runes merge into the move they sit on (resolveAbility)', () => {
  it('lists the runes acting on it in socket order, past empty sockets, unknown ids and runes that do not fit', () => {
    const w = world([], {
      primary: { runes: [R('chain'), null, R('nope'), R('widen'), R('leech', 5)] },
    });
    expect(moveOf(w, 0).runes).toEqual([R('chain'), R('leech', 5)]);
    expect(moveOf(w, 1).runes).toEqual([]);
  });

  it("merges each rune's tier after the elements, the fusion and the legendaries: its trade-off too", () => {
    const plain = moveOf(world([]), 0);
    const heavy = moveOf(world([], { primary: { runes: [R('heavy')] } }), 0);
    expect(heavy.power / plain.power).toBeCloseTo(1.3);
    expect(heavy.knobs.applies).toEqual(['burn', 'stagger']);
    const pierce = moveOf(world([], { primary: { runes: [R('pierce', 2)] } }), 0);
    expect(pierce.knobs.pierce).toBe(2);
    expect(pierce.power / plain.power).toBeCloseTo(0.9);
    // Linger under Magma (Fire + Earth: 3 s at 0.25): the longer zone, at the stronger tick.
    const magma = world([], { primary: { elements: ['fire', 'earth'], runes: [R('linger', 5)] } });
    expect(moveOf(magma, 0).knobs.zone).toEqual({ seconds: 3.5, tickPower: 0.25 });
  });

  it('leaves out a Pierce on a move that already passes every foe (an Earth Bolt): dormant, trade-off and all', () => {
    const plain = moveOf(world([], { primary: { elements: ['earth'] } }), 0);
    const w = world([], { primary: { elements: ['earth'], runes: [R('pierce'), R('chain')] } });
    expect(moveOf(w, 0).runes).toEqual([R('chain')]);
    expect(moveOf(w, 0).knobs.pierce).toBe(Infinity);
    expect(moveOf(w, 0).power).toBeCloseTo(plain.power);
  });

  it('Pierce: a Bolt passes that many foes, bursting on each, and dies on the next', () => {
    const w = world([dummy(13, 33), dummy(13, 31), dummy(13, 29), dummy(13, 27)], {
      primary: { runes: [R('pierce', 2)] },
    });
    press(w, 0);
    run(w, 1);
    expect(w.monsters.map((m) => m.hp < m.maxHp)).toEqual([true, true, true, false]);
  });

  it('Chain: the Bolt jumps from the first foe it bursts on', () => {
    const w = world([dummy(13, 30), dummy(16, 30), dummy(19, 30)], {
      primary: { runes: [R('chain')] },
    });
    const events = [...press(w, 0), ...run(w, 1)];
    const chain = events.find((e) => e.kind === 'chain');
    expect(chain?.kind === 'chain' && chain.points.length).toBe(3);
    expect(w.monsters.every((m) => m.hp < m.maxHp)).toBe(true);
  });

  it('Widen: a Nova reaches further (radius × area) at its power cut', () => {
    const at = (runes: RuneRef[]) => {
      const w = world([dummy(13, 28)], { ultimate: { payment: 'mana', runes } });
      press(w, 2);
      return { w, ab: moveOf(w, 2) };
    };
    const plain = at([]);
    const wide = at([R('widen')]);
    expect(wide.ab.radius / plain.ab.radius).toBeCloseTo(1.4);
    expect(wide.ab.power / plain.ab.power).toBeCloseTo(0.9);
    expect(plain.w.monsters[0].hp).toBe(plain.w.monsters[0].maxHp);
    expect(wide.w.monsters[0].hp).toBeLessThan(wide.w.monsters[0].maxHp);
  });

  it('Heavy: its hits stagger', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('heavy')] } });
    press(w, 0);
    run(w, 0.5);
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
  });

  it('Linger: a zone where the move lands, for its seconds', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('linger')] } });
    press(w, 0);
    run(w, 0.5);
    const zone = w.zones.find((z) => z.owner === 'hero' && z.ability);
    expect(zone && zone.until - zone.born).toBeCloseTo(2.5);
  });

  it('Leech: its hits heal a share of their damage', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('leech', 5)] } });
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = [...press(w, 0), ...run(w, 0.5)];
    const dealt = skillHits(events).reduce((a, e) => a + e.amount, 0);
    const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(healed).toBeCloseTo(dealt * (w.hero.stats.lifesteal + 0.06));
  });

  it('a Bolt spawned piercing never bursts at the end of its flight, its count spent or not', () => {
    const w = world([dummy(13, 33)], { primary: { runes: [R('pierce', 1)] } });
    const events = [...press(w, 0), ...until(w, 'hit')];
    // It burst on the foe, passed it, and flies on: its count is spent.
    expect(w.projectiles.filter((p) => p.form === 'bolt')).toHaveLength(1);
    events.push(...run(w, 1.5));
    expect(w.projectiles).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'explode')).toHaveLength(1);
  });
});

describe('basic blows carry their runes (computeHeroStats)', () => {
  const blowsOf = (baseId: string, basic: Blow[]) =>
    computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry, { basic }).weapon.blows;

  it("takes the runes that fit the weapon and act on the blow's kind, merged into its knobs", () => {
    const [light, heavy] = blowsOf('sword', [
      { kind: 'light', element: 'fire', runes: [R('linger'), R('chain')] },
      { kind: 'heavy', element: 'fire', runes: [R('linger'), R('split'), R('chain')] },
    ]);
    // Linger acts on heavy and hold blows only; Split doesn't fit a sword.
    expect(light.runes).toEqual([R('chain')]);
    expect(light.knobs.zone).toBeNull();
    expect(heavy.runes).toEqual([R('linger'), R('chain')]);
    expect(heavy.knobs.zone).toEqual({ seconds: 2.5, tickPower: 0.2 });
    expect(heavy.knobs.chain).toBe(2);
    expect(blowsOf('sword', [{ kind: 'light', element: 'fire' }])[0].knobs).toEqual(NEUTRAL);
  });

  it("leaves a Pierce dormant on a staff's rows that burst", () => {
    const [light, medium] = blowsOf('staff', [
      { kind: 'light', element: 'fire', runes: [R('pierce')] },
      { kind: 'medium', element: 'fire', runes: [R('pierce')] },
    ]);
    expect(light.runes).toEqual([R('pierce')]);
    expect(light.knobs.pierce).toBe(3);
    expect(medium.runes).toEqual([]);
    expect(medium.knobs.pierce).toBe(0);
  });
});

describe('a chain whose sockets change is a changed chain (refreshWorldHero)', () => {
  it('drops the slot’s wind-up when a socket opens or a rune changes; the same sockets keep it', () => {
    const chains = (runes: (RuneRef | null)[]) => ({
      primary: {
        moves: [
          { kind: 'heavy' as const, form: 'bolt' as const, elements: ['fire' as const], runes },
        ],
        payment: 'mana' as const,
      },
    });
    const w = world([dummy(13, 30)], { chains: chains([null]) });
    pressOnly(w, 0);
    expect(w.hero.windup).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, chains([null]));
    expect(w.hero.windup).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, chains([null, null]));
    expect(w.hero.windup).toBeNull();
    pressOnly(w, 0);
    refreshWorldHero(registry, w, w.hero.stats, chains([R('chain'), null]));
    expect(w.hero.windup).toBeNull();
  });
});

describe("the Training Grounds' followBasic keeps blow runes", () => {
  const fire = (weaponBaseId: string) => ({
    weaponBaseId,
    primary: 'fire' as const,
    secondary: null,
  });

  it('a reset to the new default keeps each blow’s sockets by position, minus runes that don’t fit', () => {
    const basic: Blow[] = defaultBasic(registry, 'sword', 'fire').map((b, i) =>
      i === 0 ? { ...b, runes: [R('chain'), null] } : i === 2 ? { ...b, runes: [R('widen')] } : b,
    );
    expect(followBasic(registry, basic, fire('sword'), fire('bow'))).toEqual([
      { kind: 'light', element: 'fire', runes: [R('chain'), null] },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire', runes: [null] },
    ]);
    // The dagger's chain is a blow longer: its fourth has none.
    expect(followBasic(registry, basic, fire('sword'), fire('dagger'))[3]).toEqual({
      kind: 'heavy',
      element: 'fire',
    });
  });
});

const SWORD: EquippedGear = { weapon: gear('fire') };
const light = (runes: (RuneRef | null)[] = []): Blow => ({ kind: 'light', element: 'fire', runes });
/** The basic hits in `events`. */
const basicHits = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === 'basic' ? [e] : []));

/** A world whose hero swings `basic` with `equipped` (the fixture sword by default) at sturdy foes. */
function blowWorld(
  basic: Blow[],
  foes: Partial<MonsterEntity>[] = [dummy(13, 34.5)],
  equipped: EquippedGear = SWORD,
): ArpgWorld {
  const w = arena(foes, { equipped });
  w.hero.stats = computeHeroStats(equipped, registry, { basic });
  return w;
}

describe("a blow's runes where it lands (landBlow)", () => {
  it('Heavy: a blow hits harder at its tier and staggers', () => {
    const blowOf = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)]);
      return { w, hit: basicHits(firstBlow(w))[0] };
    };
    const plain = blowOf([]);
    const heavy = blowOf([R('heavy')]);
    expect(heavy.hit.amount / plain.hit.amount).toBeCloseTo(1.3);
    expect(plain.w.monsters[0].status.staggerUntil).toBe(0);
    expect(heavy.w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const hitOf = (w: ArpgWorld) =>
      blowNumbers(w.hero.stats, bal, w.hero.stats.weapon.blows[0]).hit;
    expect(hitOf(heavy.w) / hitOf(plain.w)).toBeCloseTo(1.3);
  });

  it('Widen: a melee blow reaches further, its arc unchanged', () => {
    const reaches = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 33.4)]);
      landBlow(makeCtx(registry, w, []), w.hero.stats.weapon.blows[0], 'light', { x: 0, y: -1 }, 1);
      return w.monsters[0].hp < w.monsters[0].maxHp;
    };
    expect(reaches([])).toBe(false);
    expect(reaches([R('widen')])).toBe(true);
  });

  it('Leech: a blow heals a share of its damage', () => {
    const w = blowWorld([light([R('leech', 5)])]);
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = firstBlow(w);
    const dealt = basicHits(events).reduce((a, e) => a + e.amount, 0);
    const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(healed).toBeCloseTo(dealt * (w.hero.stats.lifesteal + 0.06));
  });

  it("Pierce: a wand's shot passes that many foes; on a staff's row that bursts it does nothing", () => {
    const line = [dummy(13, 33), dummy(13, 31), dummy(13, 29), dummy(13, 27)];
    const shoot = (baseId: string, blow: Blow) => {
      const w = blowWorld([blow], line, { weapon: gear('fire', 'weapon', baseId) });
      firstBlow(w);
      w.hero.nextAttackAt = 1e9;
      run(w, 1);
      return w.monsters.map((m) => m.hp < m.maxHp);
    };
    expect(shoot('wand', light([R('pierce', 2)]))).toEqual([true, true, true, false]);
    expect(shoot('wand', light())).toEqual([true, false, false, false]);
    const medium: Blow = { kind: 'medium', element: 'fire', runes: [R('pierce', 2)] };
    expect(shoot('staff', medium)).toEqual([true, false, false, false]);
  });

  it("a shot blow's shot carries them: Heavy's power and stagger, Leech's heal", () => {
    const WAND: EquippedGear = { weapon: gear('fire', 'weapon', 'wand') };
    const shot = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 30)], WAND);
      w.hero.hp = w.hero.stats.maxHp / 2;
      const events = [...firstBlow(w), ...until(w, 'hit')];
      const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
      return { w, hit: basicHits(events)[0], healed };
    };
    const plain = shot([]);
    const heavy = shot([R('heavy')]);
    expect(heavy.hit.amount / plain.hit.amount).toBeCloseTo(1.3);
    expect(heavy.w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const leech = shot([R('leech', 5)]);
    expect(leech.healed).toBeCloseTo(leech.hit.amount * (leech.w.hero.stats.lifesteal + 0.06));
  });
});

describe('Quick and Heavy (the quick knob)', () => {
  /** Press the Primary (a medium Fire Bolt with `runes`) and land it: its wind-up, beat and cooldown. */
  const cast = (runes: RuneRef[], opts: ArenaOpts = {}) => {
    const w = world([dummy(13, 30)], { primary: { runes }, ...opts });
    pressOnly(w, 0);
    const windup = w.hero.windup!.until - w.hero.windup!.start;
    press(w, 0);
    return { windup, beat: w.hero.beatUntil[0] - w.t, cooldown: moveOf(w, 0).cooldown };
  };

  it('an ability: Quick shortens its beat and cooldown, Heavy lengthens its beat and wind-up', () => {
    const plain = cast([]);
    const quick = cast([R('quick')]);
    const heavy = cast([R('heavy')]);
    expect(quick.beat / plain.beat).toBeCloseTo(0.8);
    expect(quick.cooldown / plain.cooldown).toBeCloseTo(0.8);
    expect(quick.windup).toBeCloseTo(plain.windup);
    expect(heavy.beat / plain.beat).toBeCloseTo(1.2);
    expect(heavy.windup / plain.windup).toBeCloseTo(1.2);
    expect(heavy.cooldown).toBeCloseTo(plain.cooldown);
    // A cast payment's channel and a charge payment's lockout scale too.
    const castPaid = (runes: RuneRef[]) =>
      moveOf(world([], { primary: { payment: 'cast', runes } }), 0);
    expect(castPaid([R('heavy')]).castTime / castPaid([]).castTime).toBeCloseTo(1.2);
    const nova = (runes: RuneRef[]) => moveOf(world([], { ultimate: { runes } }), 2).cooldown;
    expect(nova([R('quick')])).toBeCloseTo(bal.abilities.chargeLockout * 0.8);
  });

  it("leaves a hold's charge time alone", () => {
    const hold = (runes: RuneRef[]) => {
      const w = world([dummy(13, 30)], { primary: { kind: 'hold', runes } });
      stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
      return w.hero.hold!.full;
    };
    expect(hold([R('heavy')])).toBe(hold([]));
  });

  it('a blow (melee or shot): its cycle × the beat, its startup (from the base cycle) × the wind-up', () => {
    for (const baseId of ['sword', 'wand']) {
      const swing = (runes: RuneRef[]) => {
        const w = blowWorld([light(runes)], [dummy(13, 34.5)], {
          weapon: gear('fire', 'weapon', baseId),
        });
        run(w, STEP);
        const sw = w.hero.swing!;
        return { cycle: sw.cycle, startup: sw.strikeAt - sw.start };
      };
      const plain = swing([]);
      const quick = swing([R('quick')]);
      const heavy = swing([R('heavy')]);
      expect(quick.cycle / plain.cycle).toBeCloseTo(0.8);
      expect(quick.startup).toBeCloseTo(plain.startup);
      expect(heavy.cycle / plain.cycle).toBeCloseTo(1.2);
      expect(heavy.startup / plain.startup).toBeCloseTo(1.2);
    }
  });

  it("a held blow's recomputed cycle takes the same rule: the rest after its strike", () => {
    /** Hold a manual hold blow past full charge, let go, and measure the rest after it strikes. */
    const rest = (runes: RuneRef[]) => {
      const w = blowWorld([{ kind: 'hold', element: 'fire', runes }]);
      const events: ArpgEvent[] = [];
      for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++) {
        const attack = w.t < 1.5;
        events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, attack }, STEP));
      }
      return w.hero.nextAttackAt - w.t;
    };
    const w = blowWorld([{ kind: 'hold', element: 'fire' }]);
    const row = w.hero.stats.weapon.feel.hold;
    const base = w.hero.stats.attackInterval * row.time;
    expect(rest([])).toBeCloseTo(base * (1 - row.startup));
    expect(rest([R('quick')])).toBeCloseTo(base * 0.8 - base * row.startup);
    expect(rest([R('heavy')])).toBeCloseTo((base - base * row.startup) * 1.2);
  });
});

describe('Saturate (the stacksBonus knob)', () => {
  it("an ability: its direct hits apply more stacks; its jumps keep a tick's", () => {
    const stacksOn = (runes: RuneRef[]) => {
      const w = world([dummy(13, 30), dummy(16, 30)], { primary: { runes } });
      press(w, 0);
      run(w, 1);
      return w.monsters.map((m) => m.status.stacks.fire);
    };
    expect(stacksOn([R('chain')])).toEqual([2, 1]);
    expect(stacksOn([R('chain'), R('saturate')])).toEqual([3, 1]);
    expect(moveOf(world([], { primary: { runes: [R('saturate', 4)] } }), 0).stacks).toBe(4);
  });

  it('a blow: its kind’s stacks and the bonus', () => {
    const w = blowWorld([light([R('saturate')])]);
    firstBlow(w);
    expect(w.monsters[0].status.stacks.fire).toBe(2);
    expect(blowNumbers(w.hero.stats, bal, w.hero.stats.weapon.blows[0]).stacks).toBe(2);
  });

  it('a shot blow: its shot brings the bonus', () => {
    const w = blowWorld([light([R('saturate')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    until(w, 'hit');
    expect(w.monsters[0].status.stacks.fire).toBe(2);
  });
});

describe('Multi-shot (the extraShots knob)', () => {
  const primary = (form: 'bolt' | 'volley' | 'lance', runes: RuneRef[] = []) =>
    moveOf(world([], { primary: { form, runes } }), 0);
  const barrage = (runes: RuneRef[] = []) =>
    moveOf(world([], { ultimate: { form: 'barrage', runes } }), 2);

  it('adds to Volley’s darts and Barrage’s impacts; the cut is full on a Bolt, half on Volley, none on Barrage', () => {
    expect(primary('volley', [R('multishot')]).count).toBe(primary('volley').count + 2);
    expect(primary('volley', [R('multishot')]).power / primary('volley').power).toBeCloseTo(0.8625);
    expect(barrage([R('multishot')]).count).toBe(barrage().count + 2);
    expect(barrage([R('multishot')]).power).toBeCloseTo(barrage().power);
    expect(primary('bolt', [R('multishot')]).count).toBe(primary('bolt').count);
    expect(primary('bolt', [R('multishot')]).power / primary('bolt').power).toBeCloseTo(0.725);
  });

  it('a Bolt fans its extra bolts; a Volley fires its extra darts', () => {
    const fired = (form: 'bolt' | 'volley') => {
      const w = world([dummy(13, 28)], { primary: { form, runes: [R('multishot')] } });
      press(w, 0);
      return w.projectiles.filter((p) => p.form === form);
    };
    const bolts = fired('bolt');
    expect(bolts).toHaveLength(3);
    const angles = bolts.map((p) => Math.atan2(p.vy, p.vx));
    expect(angles[1] - angles[0]).toBeCloseTo(0.22);
    expect(angles[2] - angles[1]).toBeCloseTo(0.22);
    expect(fired('volley')).toHaveLength(5);
  });

  it('a Lance fans its beams, which share one hit set and each linger where it hits', () => {
    const near = dummy(13, 34);
    const aside = dummy(13 + 5 * Math.sin(0.22), 36 - 5 * Math.cos(0.22));
    const cast = (runes: RuneRef[]) => {
      const w = world([near, aside], { primary: { form: 'lance', runes } });
      const events = press(w, 0);
      const hitsOn = (i: number) =>
        skillHits(events).filter((e) => e.id === w.monsters[i].id).length;
      return { w, events, near: hitsOn(0), aside: hitsOn(1) };
    };
    expect(cast([])).toMatchObject({ near: 1, aside: 0 });
    const fan = cast([R('multishot'), R('linger')]);
    expect(fan.events.filter((e) => e.kind === 'beam')).toHaveLength(3);
    expect(fan).toMatchObject({ near: 1, aside: 1 });
    expect(fan.w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(2);
  });

  it('a bow or wand blow fires a fan of shots, every one at the cut power', () => {
    const shots = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 30)], {
        weapon: gear('fire', 'weapon', 'wand'),
      });
      firstBlow(w);
      return w.projectiles.filter((p) => p.owner === 'hero');
    };
    const plain = shots([]);
    const fan = shots([R('multishot')]);
    expect(plain).toHaveLength(1);
    expect(fan).toHaveLength(3);
    for (const p of fan) expect(p.damage / plain[0].damage).toBeCloseTo(0.725);
  });

  it("Twin Fang's extra shot stays one, without runes", () => {
    const w = blowWorld([light([R('multishot')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    w.hero.stats.legendaries.twin_fang = 50;
    firstBlow(w);
    const shots = w.projectiles.filter((p) => p.owner === 'hero');
    expect(shots).toHaveLength(4);
    expect(shots.filter((p) => !p.knobs)).toHaveLength(1);
  });
});

describe('Split (the split knob)', () => {
  it("an ability: an impact that hits sheds shards from the hero's way round it, skipping the foes it hit", () => {
    const w = world([dummy(13, 30), dummy(13, 27.5)], { primary: { runes: [R('split')] } });
    press(w, 0);
    const bolt = w.projectiles.find((p) => p.form === 'bolt')!;
    expect(until(w, 'runeFx').find((e) => e.kind === 'runeFx')).toMatchObject({
      effect: 'split',
      element: 'fire',
    });
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(3);
    const angles = shards.map((p) => Math.atan2(p.vy, p.vx));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2);
    expect(angles[1] - angles[0]).toBeCloseTo((2 * Math.PI) / 3);
    for (const p of shards) {
      expect(p.damage).toBeCloseTo(bolt.damage * 0.4);
      expect(p.hitIds).toEqual([w.monsters[0].id]);
      expect(p.ability?.knobs.split).toBeNull();
    }
    run(w, 1);
    expect(w.monsters[1].hp).toBeLessThan(w.monsters[1].maxHp);
  });

  it("shards don't split, scatter, show an explosion, leave a zone or burst at the end of their flight", () => {
    // A Wildfire Bolt scatters and leaves a zone where it lands; its shards do neither.
    const w = world([dummy(13, 30), dummy(13, 27.5)], {
      primary: { elements: ['fire', 'nature'], runes: [R('split')] },
    });
    const events = [...press(w, 0), ...until(w, 'runeFx')];
    // The Bolt's own ground; then its shards fly out and end.
    expect(w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(1);
    const shards = new Set<number>();
    for (let i = 0; i < 15; i++) {
      for (const p of w.projectiles) if (p.form === 'shard') shards.add(p.id);
      events.push(...run(w, STEP));
    }
    expect(shards.size).toBe(3);
    expect(w.projectiles).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'runeFx')).toHaveLength(1);
    // The Bolt's own burst only (Wildfire's Combusts show as Nature).
    expect(events.filter((e) => e.kind === 'explode' && e.element === 'fire')).toHaveLength(1);
    expect(w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(1);
  });

  it('a shot blow: its first hit sheds shards (basic shots) that skip the foe it hit', () => {
    const w = blowWorld([light([R('split')])], [dummy(13, 30), dummy(13, 27.5)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    const shot = w.projectiles.find((p) => p.owner === 'hero')!;
    until(w, 'runeFx');
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(3);
    for (const p of shards) {
      expect(p.ability).toBeNull();
      expect(p.knobs).toBeUndefined();
      expect(p.damage).toBeCloseTo(shot.damage * 0.4);
      expect(p.hitIds).toEqual([w.monsters[0].id]);
    }
    run(w, 1);
    expect(w.monsters[1].hp).toBeLessThan(w.monsters[1].maxHp);
  });

  it('a shot that bursts sheds them after its burst, skipping every foe the burst hit', () => {
    // A staff's heavy shot bursts over both foes.
    const w = blowWorld([{ kind: 'heavy', element: 'fire' }], [dummy(13, 30), dummy(13.8, 30)], {
      weapon: gear('fire', 'weapon', 'staff'),
    });
    const blow = w.hero.stats.weapon.blows[0];
    w.hero.stats.weapon.blows[0] = {
      ...blow,
      knobs: mergeKnobs({ split: { count: 2, power: 0.5 } }),
    };
    firstBlow(w);
    until(w, 'runeFx');
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(2);
    for (const p of shards) expect(p.hitIds).toEqual(w.monsters.map((m) => m.id));
  });
});

describe('Chain on blows (chainJumps)', () => {
  /** The `chain` events' points, and which foes took a basic hit. */
  const chained = (w: ArpgWorld, events: ArpgEvent[]) => ({
    points: events.flatMap((e) => (e.kind === 'chain' ? [e.points.length] : [])),
    hit: w.monsters.map((m) => m.hp < m.maxHp),
  });
  const line = [dummy(13, 34.5), dummy(13, 31.5), dummy(13, 28.5), dummy(13, 25.5)];

  it('a melee blow jumps from the first foe it strikes', () => {
    const w = blowWorld([light([R('chain')])], line);
    expect(chained(w, firstBlow(w))).toEqual({ points: [3], hit: [true, true, true, false] });
    const plain = blowWorld([light()], line);
    expect(chained(plain, firstBlow(plain))).toEqual({
      points: [],
      hit: [true, false, false, false],
    });
  });

  it('with the Storm mastery, 2 jumps more, as an ability’s', () => {
    const w = arena(line, { equipped: SWORD });
    w.hero.stats = computeHeroStats(SWORD, registry, {
      basic: [light([R('chain', 1)])],
      attunement: { storm: bal.mana.masteryThreshold },
    });
    expect(chained(w, firstBlow(w)).points).toEqual([4]);
  });

  it('a shot blow jumps from the foe it hits', () => {
    const w = blowWorld([light([R('chain')])], line.slice(1), {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    const events = [...firstBlow(w), ...until(w, 'chain')];
    expect(chained(w, events)).toEqual({ points: [3], hit: [true, true, true] });
  });
});

describe('Linger on blows (a hero zone with no ability)', () => {
  const heavy = (runes: RuneRef[]): Blow => ({ kind: 'heavy', element: 'fire', runes });
  const lingering = (w: ArpgWorld) => w.zones.filter((z) => z.owner === 'hero' && !z.ability);

  it('a heavy melee blow that connects leaves a zone ahead, at half its reach, ticking as a basic hit', () => {
    const w = blowWorld([heavy([R('linger')])]);
    const hit = basicHits(firstBlow(w))[0];
    w.hero.nextAttackAt = 1e9;
    const [zone] = lingering(w);
    const reach = w.hero.stats.weapon.range + (w.hero.stats.weapon.feel.heavy.reach ?? 0);
    expect(zone).toMatchObject({ x: 13, radius: 1.2, element: 'fire', tick: 0.5 });
    expect(zone.y).toBeCloseTo(w.hero.y - reach / 2);
    expect(zone.until - zone.born).toBeCloseTo(2.5);
    expect(zone.damage).toBeCloseTo(
      w.hero.stats.weaponDamage *
        w.hero.stats.damageMult *
        w.hero.stats.weapon.feel.heavy.power *
        0.2,
    );
    const ticks = basicHits(run(w, 1.05)).filter((e) => !e.crit && e.heft === 0);
    expect(ticks).toHaveLength(2);
    expect(ticks[0].amount).toBeLessThan(hit.amount);
  });

  it('a light blow leaves none: Linger acts on heavy and hold blows only', () => {
    const w = blowWorld([light([R('linger')])]);
    firstBlow(w);
    expect(lingering(w)).toHaveLength(0);
  });

  it('a heavy shot leaves its zone where it hits', () => {
    const w = blowWorld([heavy([R('linger')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    until(w, 'hit');
    const [zone] = lingering(w);
    expect(zone.x).toBeCloseTo(13);
    expect(Math.abs(zone.y - 30)).toBeLessThan(1);
  });
});

describe('Echo (the echo knob)', () => {
  it('an ability: the move again after echoDelay at its fraction, free, with no beat, cast or echo of its own', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('echo')] } });
    const cast = press(w, 0);
    const first = w.projectiles.find((p) => p.form === 'bolt')!;
    const at = w.t;
    const { mana, beatUntil, cooldowns } = w.hero;
    const [beat, cooldown] = [beatUntil[0], cooldowns[0][0]];
    w.hero.facing = { x: 1, y: 0 };
    const events = until(w, 'runeFx');
    expect(w.t - at).toBeCloseTo(bal.runes.echoDelay, 1);
    const echo = w.projectiles.find((p) => p.form === 'bolt' && p.id !== first.id)!;
    expect(echo.damage).toBeCloseTo(first.damage * 0.45);
    expect(echo.ability?.knobs.echo).toBe(0);
    expect(events.find((e) => e.kind === 'runeFx')).toMatchObject({
      effect: 'echo',
      element: 'fire',
    });
    expect([...cast, ...events].filter((e) => e.kind === 'cast')).toHaveLength(1);
    expect(w.hero.mana).toBeGreaterThanOrEqual(mana);
    expect([w.hero.beatUntil[0], w.hero.cooldowns[0][0]]).toEqual([beat, cooldown]);
    expect(w.hero.facing).toEqual({ x: 1, y: 0 });
    expect(w.echoes).toHaveLength(0);
    run(w, 1);
    expect(w.echoes).toHaveLength(0);
  });

  it("a hold's echo repeats the stage that fired", () => {
    const w = world([dummy(13, 30)], { primary: { kind: 'hold', runes: [R('echo')] } });
    holdFor(w, 0, 1.2);
    run(w, 0.3);
    const [first] = w.projectiles.filter((p) => p.form === 'bolt');
    until(w, 'runeFx');
    const echo = w.projectiles.find((p) => p.form === 'bolt' && p.id !== first.id)!;
    expect(first.ability?.stage).toBe(2);
    expect(echo.ability?.stage).toBe(2);
    expect(echo.damage).toBeCloseTo(first.damage * 0.45);
  });

  it('a blow: the blow again where the hero stands, no swing, step, mana or chain step', () => {
    const w = blowWorld([light([R('echo')])]);
    w.hero.stats.critChance = 0;
    const [hit] = basicHits(firstBlow(w));
    w.hero.nextAttackAt = 1e9;
    const { attackCount, mana } = w.hero;
    const events = until(w, 'runeFx');
    expect(basicHits(events)).toHaveLength(1);
    expect(basicHits(events)[0].amount).toBeCloseTo(hit.amount * 0.45);
    expect(events.filter((e) => e.kind === 'basic')).toHaveLength(0);
    expect([w.hero.attackCount, w.hero.mana]).toEqual([attackCount, mana]);
  });

  it("a hold blow's echo replays the stage it struck at", () => {
    const w = blowWorld([{ kind: 'hold', element: 'fire', runes: [R('echo')] }]);
    w.hero.stats.critChance = 0;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
      events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, attack: w.t < 1 }, STEP));
    // Let go at stage 1: it struck as a heavy blow.
    expect(events.find((e) => e.kind === 'basic')).toMatchObject({ moveKind: 'heavy' });
    const [hit] = basicHits(events);
    w.hero.nextAttackAt = 1e9;
    const echo = basicHits(until(w, 'runeFx'));
    expect(echo).toHaveLength(1);
    expect(echo[0].amount).toBeCloseTo(hit.amount * 0.45);
  });

  it('a shot blow: the shot again', () => {
    const w = blowWorld([light([R('echo')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    const [shot] = w.projectiles.filter((p) => p.owner === 'hero');
    until(w, 'runeFx');
    const echo = w.projectiles.filter((p) => p.owner === 'hero' && p.id !== shot.id);
    expect(echo).toHaveLength(1);
    expect(echo[0].damage).toBeCloseTo(shot.damage * 0.45);
  });
});
