// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GemInspectPanel } from '../GemInspectPanel';
import type { CompoundEffectShape } from '@alloy/engine';

function noop() {}

describe('GemInspectPanel — Trigger Behavior section', () => {
  it('renders structured trigger description for compound gems', () => {
    const compoundDot: CompoundEffectShape = {
      kind: 'compound_dot', element: 'fire', dpsPerTier: 3, duration: 12, tickInterval: 1.0, dotMultiplier: 2.0,
    };
    const { container } = render(
      <GemInspectPanel
        gem={{
          name: 'Ignite',
          description: 'Burn enemies on hit.',
          weaponFlavorText: '',
          armorFlavorText: '',
          tags: ['compound', 'fire', 'trigger'],
          tier: 2,
          rarity: 'common',
        }}
        context="weapon"
        onClose={noop}
        recipe={{
          component1Name: 'Chance on Hit',
          component2Name: 'Fire Damage',
          condition: 'on_hit',
          chance: 0.15,
          compoundEffects: [{ effect: compoundDot }],
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Trigger Behavior');
    expect(text).toContain('On hit');
    expect(text).toContain('15%');
    expect(text.toLowerCase()).toContain('fire');
    expect(text).toContain('12'); // duration
    expect(text).toContain('6'); // dpsPerTier × tier = 3 × 2
  });

  it('does NOT render Trigger Behavior section for non-compound gems (no recipe.compoundEffects)', () => {
    const { container } = render(
      <GemInspectPanel
        gem={{
          name: 'Fire Damage',
          description: 'Adds fire damage.',
          weaponFlavorText: '',
          armorFlavorText: '',
          tags: ['offensive', 'fire'],
          tier: 1,
          rarity: 'common',
        }}
        context="weapon"
        onClose={noop}
      />,
    );
    expect(container.textContent ?? '').not.toContain('Trigger Behavior');
  });
});
