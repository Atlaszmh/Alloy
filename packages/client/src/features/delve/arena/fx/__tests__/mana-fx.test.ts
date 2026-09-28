import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld } from '@alloy/engine';
import { HAND, ManaFx, spawnCount } from '../mana-fx';
import { drawAnticipation, drawInfusions, drawProjectiles } from '../draw-world';
import { INFUSION_BUDGET, type PathShape } from '../infusion';

/** A Graphics stand-in that counts pixels (`px` draws one rect per pixel). */
function fakeGraphics() {
  const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
  return g;
}
const G = () => fakeGraphics() as unknown as Graphics & { rects: number };
/** Both pixel layers, for `ManaFx.draw`. */
const L = () => ({ air: G(), ground: G() });
const B = () => ({ left: INFUSION_BUDGET });
const particles = (fx: ManaFx) => (fx as unknown as { particles: { vx: number }[] }).particles;

afterEach(() => vi.restoreAllMocks());

describe('ManaFx', () => {
  it('sparks keep their speed through a frozen frame, and slow the same at any frame rate', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = new ManaFx();
    const b = new ManaFx();
    a.burst(0, 0, 0xffffff, 1, 4);
    b.burst(0, 0, 0xffffff, 1, 4);
    const v0 = particles(a)[0].vx;
    a.draw(L(), 0, 0, B());
    expect(particles(a)[0].vx).toBe(v0);
    a.draw(L(), 1 / 30, 0, B());
    b.draw(L(), 1 / 60, 0, B());
    b.draw(L(), 1 / 60, 0, B());
    expect(particles(a)[0].vx).toBeCloseTo(particles(b)[0].vx, 10);
  });

  it('spawns a rate per 60 Hz frame: none while frozen, the fraction by chance', () => {
    expect(spawnCount(3, 0)).toBe(0);
    expect(spawnCount(2, 1 / 60, () => 0.99)).toBe(2);
    expect(spawnCount(2, 1 / 30, () => 0.99)).toBe(4);
    expect(spawnCount(1.5, 1 / 60, () => 0.4)).toBe(2);
    expect(spawnCount(1.5, 1 / 60, () => 0.6)).toBe(1);
  });

  it('a fading lance sheds nothing while the display is frozen', () => {
    const fx = new ManaFx();
    fx.beam(0, 0, 5, 0, 0.3, 0xffffff);
    fx.draw(L(), 0.1, 0, B());
    const n = particles(fx).length;
    for (let i = 0; i < 5; i++) fx.draw(L(), 0, 0, B());
    expect(particles(fx).length).toBe(n);
  });
});

describe('the hand', () => {
  const windup = {
    t: 1,
    hero: {
      x: 5,
      y: 5,
      facing: { x: 1, y: 0 },
      swing: null,
      abilities: [{ element: 'frost', heft: 0.45, combo: [1] }],
      windup: {
        slot: 0,
        aim: null,
        at: { x: 9, y: 5 },
        start: 0.9,
        until: 1.3,
        step: 0,
        conjureUntil: 1.3,
        chargePaid: 0,
      },
      stats: { weapon: { combo: [], element: null } },
    },
  } as unknown as ArpgWorld;

  it('mana gathers at the hand, as much per second at any frame rate, and none while frozen', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const fx = { gather: vi.fn() };
    drawAnticipation(G(), fx as never, windup, 0, 0);
    expect(fx.gather.mock.calls.every((c) => c[3] === 0)).toBe(true);
    drawAnticipation(G(), fx as never, windup, 0, 1 / 60);
    drawAnticipation(G(), fx as never, windup, 0, 1 / 30);
    const [slow, fast] = fx.gather.mock.calls.slice(-2);
    expect(fast[3]).toBe(2 * slow[3]);
    expect(slow[0]).toBeCloseTo(5 + HAND);
    expect(slow[1]).toBeCloseTo(5 - 0.3);
  });
});

describe('basic shots', () => {
  it('draw at their size (the staff’s great orb is bigger than a plain shot)', () => {
    const shot = (radius: number) =>
      ({
        t: 1,
        projectiles: [
          { id: 1, owner: 'hero', form: null, ability: null, x: 3, y: 3, radius, element: 'fire' },
        ],
      }) as unknown as ArpgWorld;
    const small = G();
    const big = G();
    drawProjectiles(small, shot(0.3), 0, new Map(), () => undefined);
    drawProjectiles(big, shot(0.54), 0, new Map(), () => undefined);
    expect(big.rects).toBeGreaterThan(small.rects);
  });
});

describe('infused transient carriers', () => {
  const TRAIL: PathShape = {
    kind: 'path',
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ],
    width: 0.4,
    progress: 0,
  };
  /** Motif elements one frame spends (the other effects spend nothing). */
  const used = (fx: ManaFx, dt: number) => {
    const budget = { left: 1e6 };
    fx.draw(L(), dt, 0, budget);
    return 1e6 - budget.left;
  };

  const CARRIERS: { name: string; add: (fx: ManaFx) => void }[] = [
    {
      name: 'a swing',
      add: (fx) => fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff, { infusion: 'storm' }),
    },
    { name: 'a beam', add: (fx) => fx.beam(0, 0, 5, 0, 0.55, 0xffffff, 'nature') },
    {
      name: 'a blast',
      add: (fx) => fx.infuse('blast', 'fire', { kind: 'ring', x: 3, y: 3, r: 1.5 }),
    },
    {
      name: 'a finisher',
      add: (fx) => fx.infuse('finisher', 'frost', { kind: 'ring', x: 1, y: 0, r: 0.9 }),
    },
    { name: 'a blink trail', add: (fx) => fx.infuse('dash', 'shadow', TRAIL) },
  ];

  it.each(CARRIERS)('keeps $name while it lasts, then lets it go', ({ add }) => {
    const fx = new ManaFx();
    add(fx);
    expect(used(fx, 0.05)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) used(fx, 0.1);
    expect(used(fx, 0.1)).toBe(0);
  });

  it('draws no motif for a plain swing or beam', () => {
    const fx = new ManaFx();
    fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff);
    fx.beam(0, 0, 5, 0, 0.55, 0xffffff);
    expect(used(fx, 0.05)).toBe(0);
  });

  it('clear() lets every infused carrier go', () => {
    const fx = new ManaFx();
    fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff, { infusion: 'storm' });
    fx.beam(0, 0, 5, 0, 0.55, 0xffffff, 'nature');
    fx.infuse('blast', 'fire', { kind: 'ring', x: 3, y: 3, r: 1.5 });
    fx.clear();
    expect(used(fx, 0.05)).toBe(0);
  });

  it('gives the ground layer only to blasts and blink trails', () => {
    const ground = (add: (fx: ManaFx) => void) => {
      const fx = new ManaFx();
      add(fx);
      const layers = L();
      fx.draw(layers, 0.05, 0, { left: 1e6 });
      return layers.ground.rects;
    };
    expect(
      ground((fx) => fx.infuse('blast', 'shadow', { kind: 'ring', x: 3, y: 3, r: 1.5 })),
    ).toBeGreaterThan(0);
    expect(ground((fx) => fx.infuse('dash', 'shadow', TRAIL))).toBeGreaterThan(0);
    expect(
      ground((fx) => fx.infuse('finisher', 'shadow', { kind: 'ring', x: 1, y: 0, r: 0.9 })),
    ).toBe(0);
    expect(
      ground((fx) => fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff, { infusion: 'shadow' })),
    ).toBe(0);
    expect(ground((fx) => fx.beam(0, 0, 5, 0, 0.55, 0xffffff, 'shadow'))).toBe(0);
  });

  it('spends the budget in priority order: a finisher before a blink trail', () => {
    const fx = new ManaFx();
    fx.infuse('dash', 'shadow', TRAIL);
    fx.infuse('finisher', 'fire', { kind: 'ring', x: 0, y: 0, r: 1 });
    const layers = { air: G(), ground: G() };
    // The fire finisher at 1.5: round(1.6 × 2π × 1.5) = 15 elements; the trail's 5 no longer fit.
    const budget = { left: 16 };
    fx.draw(layers, 0.001, 0, budget);
    expect(budget.left).toBe(1);
    expect(layers.air.rects).toBeGreaterThan(0);
    expect(layers.ground.rects).toBe(0); // the trail's dark smoke was left out
  });
});

describe('the infusion pass: persistent carriers', () => {
  const two = { elements: ['fire', 'storm'] };
  const one = { elements: ['fire'] };
  const plainHero = {
    x: 5,
    y: 5,
    defend: null,
    ward: null,
    abilities: [one, one],
    stats: { weapon: { infusion: null } },
  };
  const world = (over: object) =>
    ({ t: 1, projectiles: [], zones: [], hero: plainHero, ...over }) as unknown as ArpgWorld;
  /** Motif elements the pass spends on a world. */
  const used = (w: ArpgWorld) => {
    const budget = { left: 1e6 };
    drawInfusions(L(), w, 0, budget);
    return 1e6 - budget.left;
  };
  const shot = (o: object) => ({
    id: 1,
    owner: 'hero',
    form: 'bolt',
    ability: two,
    x: 3,
    y: 3,
    vx: 8,
    vy: 0,
    radius: 0.3,
    ...o,
  });

  it("draws an ability shot's second element; nothing for one element, an ember or a monster shot", () => {
    expect(used(world({ projectiles: [shot({})] }))).toBeGreaterThan(0);
    expect(used(world({ projectiles: [shot({ ability: one })] }))).toBe(0);
    expect(used(world({ projectiles: [shot({ form: 'ember' })] }))).toBe(0);
    expect(
      used(world({ projectiles: [shot({ owner: 'monster', form: null, ability: null })] })),
    ).toBe(0);
  });

  it("gives a basic shot the weapon's infusion", () => {
    const basic = shot({ form: null, ability: null });
    expect(used(world({ projectiles: [basic] }))).toBe(0);
    const infused = { ...plainHero, stats: { weapon: { infusion: 'nature' } } };
    expect(used(world({ projectiles: [basic], hero: infused }))).toBeGreaterThan(0);
  });

  it("draws a fusion's lingering ground and a thrown Burst in flight, not a Barrage target", () => {
    const zone = {
      id: 9,
      owner: 'hero',
      source: 'plasma',
      ability: two,
      x: 8,
      y: 8,
      radius: 2,
      born: 0.5,
      until: 4,
      detonateAt: 0,
    };
    expect(used(world({ zones: [zone] }))).toBeGreaterThan(0);
    expect(used(world({ zones: [{ ...zone, ability: one }] }))).toBe(0);
    expect(used(world({ zones: [{ ...zone, owner: 'monster', ability: null }] }))).toBe(0);
    const lob = { ...zone, source: 'burst', detonateAt: 1.5, fromX: 2, fromY: 2 };
    expect(used(world({ zones: [lob] }))).toBeGreaterThan(0);
    expect(used(world({ zones: [{ ...lob, source: 'barrage' }] }))).toBe(0);
  });

  it("rings the hero with the Defensive's second element while its buff lasts", () => {
    const guarded = {
      ...plainHero,
      defend: { form: 'ward', until: 3 },
      ward: { hp: 1, max: 1 },
      abilities: [one, two],
    };
    expect(used(world({ hero: guarded }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, ward: null } }))).toBe(0); // a broken Ward
    expect(
      used(world({ hero: { ...guarded, defend: { form: 'blink', until: 3 } } })),
    ).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, defend: { form: 'blink', until: 0.5 } } }))).toBe(0);
  });
});
