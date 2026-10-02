import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemStatLines } from '../ItemStatLines';
import { LegendaryBox } from '../LegendaryBox';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const helm = (implicits: GearItem['implicits'], affixes: GearItem['affixes']): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  ),
  implicits,
  affixes,
});

describe('ItemStatLines', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('lists the implicits, a rule, then each affix with its quality bar and a PERFECT mark', () => {
    const { container } = render(
      <ItemStatLines
        item={helm(
          [{ stat: 'armor', value: 7, roll: 0.5 }],
          [
            { stat: 'critChance', value: 3, roll: 0.95 },
            { stat: 'maxHp', value: 18, roll: 0.4 },
          ],
        )}
      />,
    );
    expect(screen.getByTestId('item-stat-lines')).toHaveTextContent(
      '+7 Armor+3% Crit ChancePERFECT+18 Max Life',
    );
    expect(container.querySelectorAll('.h-px')).toHaveLength(1);
    const affixes = screen.getAllByTestId('item-affix');
    expect(affixes).toHaveLength(2);
    expect(affixes[1].querySelector('.delve-quality span')).toHaveStyle({ width: '40%' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('greys attunement outside the pair, and draws no rule without both kinds', () => {
    const { container } = render(
      <ItemStatLines
        item={helm(
          [],
          [
            { stat: 'fireAttune', value: 2, roll: 0.5 },
            { stat: 'frostAttune', value: 2, roll: 0.5 },
          ],
        )}
      />,
    );
    expect(screen.getAllByTestId('not-your-element')).toHaveLength(1);
    expect(screen.getAllByTestId('item-affix')[1]).toHaveTextContent(
      '+2 Frost Attunementnot your element',
    );
    expect(container.querySelectorAll('.h-px')).toHaveLength(0);
  });

  it('draws no text under 14 px: the off-pair mark and PERFECT included', () => {
    const { container } = render(
      <ItemStatLines
        item={helm(
          [{ stat: 'frostAttune', value: 2, roll: 0.5 }],
          [{ stat: 'critChance', value: 3, roll: 0.95 }],
        )}
      />,
    );
    expect(container.innerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
  });
});

describe('LegendaryBox', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  const boots = (): GearItem => ({
    ...generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    ),
    legendary: { id: 'nightstalker', value: 30, roll: 0.5 },
  });

  it("names the power and says the skill it needs that the equipped weapon doesn't carry", () => {
    render(<LegendaryBox item={boots()} />);
    expect(document.body).toHaveTextContent(`★ ${registry.getLegendary('nightstalker').name}`);
    expect(document.body).toHaveTextContent('+30% Shadow damage');
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      "Needs a Defensive: your weapon doesn't carry one.",
    );
    expect(document.body.innerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
  });

  it('says nothing more once a weapon carries it, and renders nothing for other gear', () => {
    const p = store().profile;
    const w = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const rare = { ...w, moveset: defaultMoveset(registry, w, 'fire') };
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: rare } });
    const { container, rerender } = render(<LegendaryBox item={boots()} />);
    expect(screen.queryByTestId('legendary-dead')).toBeNull();
    rerender(<LegendaryBox item={helm([], [])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
