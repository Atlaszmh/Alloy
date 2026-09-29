import { describe, it, expect, vi } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { MANA_HEX } from '../../palette';
import { Lifecycles } from '../lifecycles';

const fx = () => ({ burst: vi.fn(), disperse: vi.fn() });
/** A one-move Frost chain; the Defensive's is up while `defend` names its move. */
const frost = { moves: [{ element: 'frost' }], hold: [null] };
const ward = { form: 'ward', until: 5, move: 0, stage: 0 };
function world(over: Partial<ArpgWorld>): ArpgWorld {
  return {
    t: 1,
    projectiles: [],
    zones: [],
    hero: { x: 0, y: 0, defend: null, chains: [frost, frost] },
    ...over,
  } as unknown as ArpgWorld;
}
const shot = { id: 7, owner: 'hero', x: 1, y: 2, radius: 0.3, element: 'fire', dead: false };
const zone = { id: 9, owner: 'hero', x: 3, y: 3, radius: 2, element: 'storm', detonateAt: 0 };

describe('Lifecycles', () => {
  it('sparks a new shot at the hand and dissolves it when it goes', () => {
    const l = new Lifecycles();
    const f = fx();
    l.update(world({ projectiles: [shot] as never }), f as never, 1);
    expect(f.burst).toHaveBeenCalledWith(1, 2, MANA_HEX.fire, 4, 3);
    expect(l.bornAt(7)).toBe(1);
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(1);
    expect(f.disperse).toHaveBeenCalledWith(1, 2, 0.3, MANA_HEX.fire, 6);
  });

  it('dissolves a lingering zone and a guard when they end', () => {
    const l = new Lifecycles();
    const f = fx();
    l.update(
      world({
        zones: [zone] as never,
        hero: {
          x: 0,
          y: 0,
          defend: ward,
          chains: [frost, frost],
        } as never,
      }),
      f as never,
      1,
    );
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(2);
    expect(f.disperse).toHaveBeenCalledWith(3, 3, 2, MANA_HEX.storm, 28);
    expect(f.disperse).toHaveBeenCalledWith(0, -0.3, 1, MANA_HEX.frost, 30);
  });

  it("a guard dissolves in its own element, not the next Defensive move's winding up", () => {
    const l = new Lifecycles();
    const f = fx();
    const guarded = {
      x: 0,
      y: 0,
      defend: ward,
      chains: [frost, { moves: [{ element: 'frost' }, { element: 'fire' }], hold: [null, null] }],
      windup: { slot: 1, step: 1, stage: 0 },
    };
    l.update(world({ hero: guarded as never }), f as never, 1);
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledWith(0, -0.3, 1, MANA_HEX.frost, 30);
  });

  it('leaves a landing Burst or Barrage (they explode) and a guard that stays up', () => {
    const l = new Lifecycles();
    const f = fx();
    const guarded = {
      x: 0,
      y: 0,
      defend: ward,
      chains: [frost, frost],
    } as never;
    l.update(
      world({ zones: [{ ...zone, detonateAt: 1.4 }] as never, hero: guarded }),
      f as never,
      1,
    );
    l.update(world({ hero: guarded }), f as never, 1.1);
    expect(f.disperse).not.toHaveBeenCalled();
  });
});
