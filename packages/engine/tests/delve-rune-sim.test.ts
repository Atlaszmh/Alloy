import { describe, it, expect } from 'vitest';
import { NEUTRAL, blowNumbers, defaultBasic, followBasic } from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
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
