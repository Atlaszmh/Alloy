import { describe, it, expect, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { barrierBreakFx, reactionFx, reactionLabel } from '../reactions';
import { drawGuard, drawMonsterMarks } from '../draw-world';
import type { ManaFx } from '../mana-fx';

/** A ManaFx that records which effects were asked for. */
function spyFx() {
  const fx = {
    burst: vi.fn(),
    fling: vi.fn(),
    gather: vi.fn(),
    disperse: vi.fn(),
    ring: vi.fn(),
    bolt: vi.fn(),
    infuse: vi.fn(),
  };
  const calls = () => Object.values(fx).reduce((n, f) => n + f.mock.calls.length, 0);
  return { fx: fx as unknown as ManaFx, spies: fx, calls };
}

const world = { t: 1, hero: { x: 5, y: 8, facing: { x: 0, y: -1 } } } as unknown as ArpgWorld;

/** A Graphics stand-in that counts pixels (`px` draws one rect each). */
function pixels() {
  const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
  return g as unknown as Graphics & { rects: number };
}

describe('reaction labels', () => {
  it('come from the data, so a new reaction never floats "undefined"', () => {
    expect(reactionLabel('melt')).toBe('MELT!');
    expect(reactionLabel('lightning_rod')).toBe('LIGHTNING ROD!');
  });

  it('say how many pairs a reaction took, when it took more than one', () => {
    expect(reactionLabel('melt', 1)).toBe('MELT!');
    expect(reactionLabel('melt', 2)).toBe('MELT! ×2');
  });
});

describe('the moment a reaction fires', () => {
  const OLD: ReactionId[] = [
    'melt',
    'shatter',
    'overload',
    'superconduct',
    'soulfire',
    'combust',
    'blight',
  ];
  const all = getDelveRegistry()
    .getArpgData()
    .reactions.map((r) => r.id);

  it('draws a signature for each of the eight new reactions, and nothing for the seven', () => {
    for (const id of all) {
      const { fx, calls } = spyFx();
      reactionFx(fx, { kind: 'reaction', reaction: id, x: 2, y: 3 }, world);
      if (OLD.includes(id)) expect(calls(), id).toBe(0);
      else expect(calls(), id).toBeGreaterThan(0);
    }
    expect(all.filter((id) => !OLD.includes(id))).toHaveLength(8);
  });

  it('Crystallize bursts frost spikes and Blackout a dark cloud, each as wide as the reaction', () => {
    const r = getDelveRegistry().getDelveBalance().reactions;
    const frost = spyFx();
    reactionFx(frost.fx, { kind: 'reaction', reaction: 'crystallize', x: 2, y: 3 }, world);
    expect(frost.spies.infuse).toHaveBeenCalledWith('blast', 'frost', {
      kind: 'ring',
      x: 2,
      y: 3,
      r: r.crystallizeRadius,
    });
    const dark = spyFx();
    reactionFx(dark.fx, { kind: 'reaction', reaction: 'blackout', x: 2, y: 3 }, world);
    expect(dark.spies.infuse).toHaveBeenCalledWith('blast', 'shadow', {
      kind: 'ring',
      x: 2,
      y: 3,
      r: r.blackoutRadius,
    });
  });

  it("Obsidian's shell shatters where the hero stands", () => {
    const { fx, spies } = spyFx();
    barrierBreakFx(fx, { kind: 'barrierBreak', x: 5, y: 8 });
    expect(spies.disperse).toHaveBeenCalled();
    expect(spies.burst.mock.calls[0].slice(0, 2)).toEqual([5, 8 - 0.3]);
  });
});

describe('lasting states', () => {
  /** The hero's pixels at t = 1, walking up, with no Defensive and no wind-up. */
  const heroPixels = (over: object) => {
    const hero = {
      x: 5,
      y: 8,
      facing: { x: 0, y: -1 },
      moving: true,
      chains: [],
      hold: null,
      defend: null,
      windup: null,
      barrier: null,
      quickUntil: 0,
      ...over,
    };
    const air = pixels();
    drawGuard(air, { t: 1, hero } as unknown as ArpgWorld, 1);
    return air.rects;
  };

  const NO_STACKS = { fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0, nature: 0 };

  /** A plain foe's mark pixels at t = 1, both layers. */
  const markPixels = (status: object) => {
    const foe = {
      id: 1,
      x: 5,
      y: 5,
      radius: 0.55,
      kind: 'normal',
      status: {
        stacks: NO_STACKS,
        rootUntil: 0,
        freezeUntil: 0,
        staggerUntil: 0,
        brandUntil: 0,
        sunderUntil: 0,
        blindUntil: 0,
        ...status,
      },
    };
    const ground = pixels();
    const air = pixels();
    drawMonsterMarks(ground, air, { t: 1, monsters: [foe] } as unknown as ArpgWorld, 1);
    return ground.rects + air.rects;
  };

  it("Obsidian's shell holds while the barrier does, thinning as it drains", () => {
    expect(heroPixels({})).toBe(0);
    const full = heroPixels({ barrier: { hp: 10, max: 10, until: 9 } });
    const worn = heroPixels({ barrier: { hp: 2, max: 10, until: 9 } });
    expect(worn).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(worn);
  });

  it("Lightning Rod's trail follows the hero while it lasts, and only while it walks", () => {
    expect(heroPixels({ quickUntil: 2 })).toBeGreaterThan(0);
    expect(heroPixels({ quickUntil: 0.5 })).toBe(0);
    expect(heroPixels({ quickUntil: 2, moving: false })).toBe(0);
  });

  it('sundered and blinded foes wear their marks only while they last', () => {
    expect(markPixels({})).toBe(0);
    for (const key of ['sunderUntil', 'blindUntil']) {
      expect(markPixels({ [key]: 2 }), key).toBeGreaterThan(0);
      expect(markPixels({ [key]: 0.5 }), key).toBe(0);
    }
  });

  it('a foe wears a pip per stack on a plate per stacked element, five pips at most', () => {
    expect(markPixels({ stacks: { ...NO_STACKS, fire: 3 } })).toBe(1 + 3);
    expect(markPixels({ stacks: { ...NO_STACKS, fire: 3, earth: 2 } })).toBe(1 + 3 + 1 + 2);
    expect(markPixels({ stacks: { ...NO_STACKS, nature: 10 } })).toBe(1 + 5);
  });
});
