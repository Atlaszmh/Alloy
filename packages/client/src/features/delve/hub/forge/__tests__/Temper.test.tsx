import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  emptyMaterials,
  findItem,
  generateItem,
  honeCost,
  imprintCost,
  reforgeCost,
  shardTiersOf,
  upgradeCost,
  SeededRNG,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { Temper } from '../Temper';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana },
    new SeededRNG(4),
  ),
  affixes,
});
/** The bench on `uid` as the store holds it now, as the Forge tab passes it. */
function Bench({ uid }: { uid: string }) {
  const item = useDelveStore((s) => findItem(s.profile, uid)!.item);
  return <Temper item={item} />;
}
const bench = (item: GearItem, over: { scrap?: number; manaDust?: number } = {}) => {
  store().setProfile({ ...store().profile, bag: [item], ...over });
  render(<Bench uid={item.uid} />);
};

describe('Temper', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('upgrades the item for scrap, priced against the purse', () => {
    const item = helm('fire');
    const cost = upgradeCost(registry, item)!;
    bench(item, { scrap: cost - 1 });
    const up = screen.getByTestId('upgrade-button');
    expect(up).toHaveTextContent(`Upgrade +1 · ${cost} scrap`);
    expect(up).toBeDisabled();
    expect(up).toHaveAccessibleDescription(`Needs ${cost} scrap`);
    expect(screen.getByTestId('temper').textContent).toContain(
      `Each forge level adds +${Math.round(registry.getDelveBalance().forge.upgradeStep * 100)}% to every stat`,
    );
    expect(screen.getByTestId('forge-purse')).toHaveTextContent(`In hand: ${cost - 1} scrap`);
    act(() => store().setProfile({ ...store().profile, scrap: cost }));
    fireEvent.click(up);
    expect(store().profile).toMatchObject({ scrap: 0, bag: [{ uid: 'h1', upgrade: 1 }] });
    expect(screen.getByRole('status')).toHaveTextContent('Upgraded to +1');
  });

  it('at the top forge level Upgrade says so', () => {
    const max = registry.getDelveBalance().forge.maxUpgrade;
    bench({ ...helm('fire'), upgrade: max });
    expect(screen.getByTestId('upgrade-button')).toHaveTextContent(`Max +${max}`);
    expect(screen.getByTestId('upgrade-button')).toBeDisabled();
  });

  it('reforges a line picked in its own pad scope; Back leaves it', () => {
    const item = helm('fire', [{ stat: 'fireAttune', value: 2, roll: 0.5 }]);
    const cost = reforgeCost(registry, item);
    bench(item, { scrap: cost });
    fireEvent.click(screen.getByTestId('reforge-open'));
    expect(screen.getByTestId('reforge-pick')).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('reforge-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('reforge-line-0')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('reforge-button')).toBeDisabled();
    expect(screen.getByTestId('reforge-button')).toHaveTextContent('Pick a line');
    fireEvent.click(screen.getByTestId('reforge-line-0'));
    expect(screen.getByTestId('reforge-line-0')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('reforge-button')).toHaveTextContent(`Reforge · ${cost} scrap`);
    act(() => store().setProfile({ ...store().profile, scrap: cost - 1 }));
    expect(screen.getByTestId('reforge-button')).toBeDisabled();
    expect(screen.getByTestId('reforge-button')).toHaveAccessibleDescription(`Needs ${cost} scrap`);
    act(() => store().setProfile({ ...store().profile, scrap: cost }));
    fireEvent.click(screen.getByTestId('reforge-button'));
    expect(store().profile.scrap).toBe(0);
    expect(store().profile.bag[0].reforges).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Reforged!');
    fireEvent.click(screen.getByTestId('reforge-back'));
    expect(screen.queryByTestId('reforge-pick')).toBeNull();
    expect(screen.getByTestId('upgrade-button')).toBeInTheDocument();
  });

  it('an item with no affixes has no Reforge, Hone or Imprint', () => {
    bench(helm('fire'));
    for (const op of ['reforge', 'hone', 'imprint'])
      expect(screen.queryByTestId(`${op}-open`)).toBeNull();
  });

  it('hones a line through the engine, at its price, which grows with each hone', () => {
    const item = { ...helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]), hones: 2 };
    const cost = honeCost(registry, item);
    bench(item, { scrap: cost + 1 });
    fireEvent.click(screen.getByTestId('hone-open'));
    expect(screen.getByTestId('hone-pick')).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('hone-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('hone-count')).toHaveTextContent(
      'Honed 2 times: each hone costs more.',
    );
    expect(screen.getByTestId('hone-button')).toHaveTextContent('Pick a line');
    fireEvent.click(screen.getByTestId('hone-line-0'));
    expect(screen.getByTestId('hone-button')).toHaveTextContent(`Hone · ${cost} scrap`);
    fireEvent.click(screen.getByTestId('hone-button'));
    const honed = store().profile.bag[0];
    expect(store().profile.scrap).toBe(1);
    expect(honed.hones).toBe(3);
    // Rerolled at the rarity's band, the floor applied: a new roll.
    expect(honed.affixes[0].stat).toBe('armor');
    expect(honed.affixes[0].roll).not.toBe(0.3);
    expect(screen.getByRole('status')).toHaveTextContent('Honed!');
    expect(screen.getByTestId('hone-count')).toHaveTextContent('Honed 3 times');
    expect(screen.getByTestId('hone-button')).toHaveTextContent(
      `Hone · ${honeCost(registry, honed)} scrap`,
    );
  });

  it('imprints a held shard over a line: only shards that fit the slot', () => {
    const item = helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]);
    store().setProfile({
      ...store().profile,
      // A helm takes Crit Chance and Armor, not Damage.
      materials: { ...emptyMaterials(), shards: { critChance: [1], damage: [1] } },
    });
    const cost = imprintCost(registry, item);
    bench(item, { scrap: cost });
    fireEvent.click(screen.getByTestId('imprint-open'));
    expect(screen.queryByTestId('shard-picker')).toBeNull(); // a line first
    fireEvent.click(screen.getByTestId('imprint-line-0'));
    expect(screen.getByTestId('imprint-button')).toHaveTextContent('Pick a shard');
    expect(screen.getByTestId('shard-pick-critChance-1')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-damage-1')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-critChance-1'));
    expect(screen.getByTestId('shard-pick-critChance-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('imprint-button')).toHaveTextContent(
      `Imprint Crit Chance I · ${cost} scrap`,
    );
    fireEvent.click(screen.getByTestId('imprint-button'));
    // The engine wrote the shard's affix over the line, in its band, and took the shard and scrap.
    const [band] = shardTiersOf(registry, 'critChance');
    const imprinted = store().profile.bag[0].affixes[0];
    expect(imprinted).toMatchObject({ stat: 'critChance', band: [band.min, band.max] });
    expect(imprinted.roll).toBeGreaterThanOrEqual(band.min);
    expect(imprinted.roll).toBeLessThan(band.max);
    expect(store().profile.materials.shards.critChance).toEqual([0]);
    expect(store().profile.scrap).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent('Imprinted!');
    // The shard is spent: the next imprint picks again.
    expect(screen.getByTestId('imprint-button')).toHaveTextContent('Pick a shard');
  });

  it('a line may take a better shard of its own affix, never one on another line', () => {
    const item = helm('fire', [
      { stat: 'armor', value: 4, roll: 0.1 },
      { stat: 'critChance', value: 1, roll: 0.1 },
    ]);
    store().setProfile({
      ...store().profile,
      materials: { ...emptyMaterials(), shards: { critChance: [1], armor: [0, 1] } },
    });
    bench(item, { scrap: 100 });
    fireEvent.click(screen.getByTestId('imprint-open'));
    fireEvent.click(screen.getByTestId('imprint-line-0'));
    expect(screen.getByTestId('shard-pick-armor-2')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-critChance-1')).toBeNull();
    fireEvent.click(screen.getByTestId('imprint-line-1'));
    expect(screen.getByTestId('shard-pick-critChance-1')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-armor-2')).toBeNull();
  });

  it("re-attunes to the pair's other element for Mana Dust", () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    bench(helm('frost'), { manaDust: pal.reattuneDust.magic });
    expect(screen.getByTestId('reattune-fire')).toHaveTextContent(
      `Fire · ${pal.reattuneDust.magic} Mana Dust`,
    );
    fireEvent.click(screen.getByTestId('reattune-storm'));
    expect(store().profile.bag[0].mana).toBe('storm');
    expect(store().profile.manaDust).toBe(0);
    expect(screen.queryByTestId('reattune-storm')).toBeNull(); // its own element now
    expect(screen.getByTestId('reattune-fire')).toBeDisabled(); // no Dust left
    expect(screen.getByTestId('reattune-fire')).toHaveAccessibleDescription(
      `Needs ${pal.reattuneDust.magic} Mana Dust`,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Attuned to Storm');
  });
});
