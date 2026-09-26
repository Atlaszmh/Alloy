import { describe, it, expect, vi } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { Lifecycles } from '../lifecycles';

const fx = () => ({ burst: vi.fn(), disperse: vi.fn() });
function world(over: Partial<ArpgWorld>): ArpgWorld {
  return {
    t: 1,
    projectiles: [],
    zones: [],
    hero: { x: 0, y: 0, defend: null, abilities: [{ element: 'frost' }, { element: 'frost' }] },
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
    expect(f.burst).toHaveBeenCalledTimes(1);
    expect(l.bornAt(7)).toBe(1);
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(1);
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
          defend: { form: 'ward', until: 5 },
          abilities: [{}, { element: 'frost' }],
        } as never,
      }),
      f as never,
      1,
    );
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(2);
  });
});
