import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld } from '@alloy/engine';
import { HAND, ManaFx, spawnCount } from '../mana-fx';
import { drawAnticipation, drawProjectiles } from '../draw-world';

/** A Graphics stand-in that counts pixels (`px` draws one rect per pixel). */
function fakeGraphics() {
  const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
  return g;
}
const G = () => fakeGraphics() as unknown as Graphics & { rects: number };
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
    a.draw(G(), 0, 0);
    expect(particles(a)[0].vx).toBe(v0);
    a.draw(G(), 1 / 30, 0);
    b.draw(G(), 1 / 60, 0);
    b.draw(G(), 1 / 60, 0);
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
    fx.draw(G(), 0.1, 0);
    const n = particles(fx).length;
    for (let i = 0; i < 5; i++) fx.draw(G(), 0, 0);
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
