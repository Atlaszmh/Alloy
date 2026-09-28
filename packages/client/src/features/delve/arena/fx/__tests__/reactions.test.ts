import { describe, it, expect, vi } from 'vitest';
import type { ArpgWorld, ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { barrierBreakFx, reactionFx, reactionLabel } from '../reactions';
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

describe('reaction labels', () => {
  it('come from the data, so a new reaction never floats "undefined"', () => {
    expect(reactionLabel('melt')).toBe('MELT!');
    expect(reactionLabel('lightning_rod')).toBe('LIGHTNING ROD!');
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
