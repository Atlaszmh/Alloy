import { describe, it, expect } from 'vitest';
import { computeHeroStats, resolveChain } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, blowText, chainText, moveText } from '../chains/chain-text';

const registry = getDelveRegistry();

describe('chain text', () => {
  it('names each move with its kind and its element or fusion', () => {
    const chain = resolveChain(registry, computeHeroStats({}, registry), 'primary', {
      moves: [
        { kind: 'light', form: 'bolt', elements: ['fire'] },
        { kind: 'medium', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['frost'] },
      ],
      payment: 'mana',
    });
    expect(chainText(chain.moves.map(moveText))).toBe(
      'light Fire Bolt · medium Wildfire Burst · held Frost Lance',
    );
    expect(blowText(registry, { kind: 'heavy', element: 'storm' })).toBe('heavy Storm blow');
    expect(Object.values(KIND_ICON)).toEqual(['▪', '▪▪', '▪▪▪', '◉']);
  });
});
