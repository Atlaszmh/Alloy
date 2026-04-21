import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { DataRegistry, loadAndValidateData } from '@alloy/engine';
import type { EquippedSlot, GemInstance } from '@alloy/engine';
import { SocketedAffixList } from './SocketedAffixList';

// No project-wide test-util for DataRegistry exists yet; mirror the pattern
// used in src/stores/forgeStore.test.ts — build a real registry from the
// bundled JSON data so affix lookups behave exactly as they do in the app.
const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

function makeSlot(uid: string, affixId: string): EquippedSlot {
  const gem: GemInstance = {
    uid,
    affixId,
    tier: 2,
    rarity: 'uncommon',
    recipeDepth: 0,
    combinable: true,
    tags: [affixId],
  };
  return { gem };
}

describe('SocketedAffixList', () => {
  test('renders one row per slot in socket order with an empty placeholder for the null slot', () => {
    const slots: (EquippedSlot | null)[] = [
      makeSlot('g1', 'fire_damage'),
      null,
      makeSlot('g2', 'armor_penetration'),
    ];
    render(
      <SocketedAffixList
        slots={slots}
        cardId="weapon"
        registry={registry}
      />,
    );

    const rows = screen.getAllByTestId('affix-row');
    expect(rows).toHaveLength(3);

    // Row 0: filled weapon slot carrying a fire-damage gem.
    expect(rows[0].getAttribute('data-empty')).toBe('false');
    const fireAffix = registry.findAffix('fire_damage');
    expect(fireAffix).not.toBeNull();
    expect(rows[0].textContent ?? '').toContain(fireAffix!.name);

    // Row 1: null slot renders as an empty placeholder to preserve grid
    // positions, matching the socket layout 1:1.
    expect(rows[1].getAttribute('data-empty')).toBe('true');

    // Row 2: filled slot carrying an armor-penetration gem.
    expect(rows[2].getAttribute('data-empty')).toBe('false');
    const armorAffix = registry.findAffix('armor_penetration');
    expect(armorAffix).not.toBeNull();
    expect(rows[2].textContent ?? '').toContain(armorAffix!.name);
  });
});
