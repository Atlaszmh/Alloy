import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { emptyMaterials, refineCost, type MaterialsPouch } from '@alloy/engine';
import { MaterialsPane } from '../MaterialsPane';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
const registry = getDelveRegistry();
/** The engine's price to refine Rusty bars. */
const RUSTY = refineCost(registry, { kind: 'metal', metal: 'rusty' })!;
const store = () => useDelveStore.getState();
const held = (over: Partial<MaterialsPouch>, scrap = 100, manaDust = 0) =>
  store().setProfile({
    ...store().profile,
    scrap,
    manaDust,
    materials: { ...emptyMaterials(), ...over },
  });
const pane = (locked = false) =>
  render(
    <>
      <MaterialsPane locked={locked} />
      <ToastContainer />
    </>,
  );

describe('MaterialsPane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists what's held by kind, shards by family and tier, and refines 3 → 1 at the engine's price", () => {
    held({
      metals: { ...emptyMaterials().metals, rusty: 5, iron: 1, voidforged: 3 },
      flux: { ...emptyMaterials().flux, uncommon: 3, epic: 3 },
      shards: { critChance: [3, 1], armor: [0, 0, 0, 0, 3] },
      essences: { prism: 1 },
    });
    pane();
    expect(screen.getByTestId('material-metal-rusty')).toHaveTextContent('Rusty bar ×5');
    expect(screen.getByTestId('refine-metal-rusty')).toHaveTextContent(
      `Refine ${RUSTY.count} → 1 · ${RUSTY.scrap} scrap`,
    );
    // Too few to refine, or the top grade: no Refine.
    expect(screen.queryByTestId('refine-metal-iron')).toBeNull();
    expect(screen.queryByTestId('refine-metal-voidforged')).toBeNull();
    expect(screen.queryByTestId('refine-flux-epic')).toBeNull();
    expect(screen.getByTestId('refine-flux-uncommon')).toBeEnabled();
    const offense = screen.getByTestId('shards-offense');
    expect(offense).toHaveTextContent('Offense');
    expect(within(offense).getByTestId('material-shard-critChance-1')).toHaveTextContent(
      'Crit Chance I ×3',
    );
    expect(within(offense).getByTestId('material-shard-critChance-2')).toHaveTextContent(
      'Crit Chance II ×1',
    );
    expect(
      within(screen.getByTestId('shards-defense')).getByTestId('material-shard-armor-5'),
    ).toHaveTextContent('Armor V ×3');
    expect(screen.queryByTestId('refine-shard-armor-5')).toBeNull();
    expect(screen.getByTestId('material-essence-prism')).toHaveTextContent(
      `${registry.getLegendary('prism').name} essence ×1`,
    );
    expect(screen.queryByTestId('refine-essence-prism')).toBeNull();
    // The engine refines: the counts move and the purse pays its price.
    fireEvent.click(screen.getByTestId('refine-metal-rusty'));
    expect(store().profile.scrap).toBe(100 - RUSTY.scrap);
    expect(screen.getByTestId('material-metal-rusty')).toHaveTextContent(
      `Rusty bar ×${5 - RUSTY.count}`,
    );
    expect(screen.getByTestId('material-metal-iron')).toHaveTextContent('Iron bar ×2');
    expect(screen.getByText(`Refined ${RUSTY.count} × Rusty bar`)).toBeInTheDocument();
  });

  it("a refine the purse can't pay is off and says what it needs; mid-dive refining and buying wait", () => {
    held({ metals: { ...emptyMaterials().metals, rusty: 3 } }, RUSTY.scrap - 1);
    const { unmount } = pane();
    expect(screen.getByTestId('refine-metal-rusty')).toBeDisabled();
    expect(screen.getByTestId('refine-metal-rusty')).toHaveAccessibleDescription(
      `Needs ${RUSTY.scrap} scrap`,
    );
    unmount();
    held({ metals: { ...emptyMaterials().metals, rusty: 3 } });
    pane(true);
    expect(screen.getByTestId('materials-locked')).toHaveTextContent(
      'refine and buy between dives',
    );
    expect(screen.getByTestId('refine-metal-rusty')).toBeDisabled();
    fireEvent.click(screen.getByTestId('bench-affix-armor'));
    expect(screen.getByTestId('bench-buy')).toBeDisabled();
  });

  it('the shard bench sells a tier I shard of the affix picked', () => {
    const price = registry.getDelveBalance().crafting.shardBench;
    held({}, price.scrap, price.dust);
    pane();
    expect(screen.getByTestId('materials-shards')).toHaveTextContent('None yet');
    expect(screen.getByTestId('bench-buy')).toHaveTextContent('Pick an affix');
    expect(screen.getByTestId('bench-buy')).toBeDisabled();
    // Two affixes share "Damage": the percent one says so.
    expect(screen.getByTestId('bench-affix-damagePct')).toHaveTextContent('Damage %');
    fireEvent.click(screen.getByTestId('bench-affix-armor'));
    expect(screen.getByTestId('bench-affix-armor')).toHaveAttribute('aria-pressed', 'true');
    const buy = screen.getByTestId('bench-buy');
    expect(buy).toHaveTextContent(`Buy Armor I · ${price.scrap} scrap · ${price.dust} Mana Dust`);
    fireEvent.click(buy);
    expect(store().profile).toMatchObject({ scrap: 0, manaDust: 0 });
    expect(screen.getByText('Bought Armor I')).toBeInTheDocument();
    expect(screen.getByTestId('material-shard-armor-1')).toHaveTextContent('Armor I ×1');
  });
});
