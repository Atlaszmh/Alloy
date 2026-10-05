import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { emptyMaterials, refineCost, type MaterialsPouch } from '@alloy/engine';
import { MaterialsPane } from '../MaterialsPane';
import { getDelveRegistry } from '../../../registry';
import { affixLabel, DROPS_FROM } from '../materials-text';
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

  it("keys each bar's Refine by its metal for the guided start (forge.refine), and no other row's", () => {
    held({
      metals: { ...emptyMaterials().metals, rusty: 5 },
      flux: { ...emptyMaterials().flux, uncommon: 3 },
    });
    pane();
    expect(screen.getByTestId('refine-metal-rusty')).toHaveAttribute(
      'data-tutorial',
      'forge.refine:rusty',
    );
    expect(screen.getByTestId('refine-flux-uncommon')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('materials-bars')).toHaveAttribute('data-tutorial', 'forge.refine');
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
    // A row is one line: the name and count, then its Refine, side by side.
    const rusty = screen.getByTestId('material-metal-rusty');
    expect(rusty).toHaveClass('items-center');
    expect(within(rusty).getByTestId('refine-metal-rusty')).toBeInTheDocument();
    expect(within(rusty).getByText('Rusty bar ×5').parentElement).toBe(rusty);
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
    expect(screen.getByTestId('bench-buy')).toBeDisabled();
  });

  it("says where each kind it lacks drops", () => {
    const depth = registry.getDelveBalance().drops.essenceMinDepth;
    expect(DROPS_FROM.essence).toContain(`depth ${depth}`);
    held({});
    pane();
    expect(screen.getByTestId('materials-bars')).toHaveTextContent(`None yet: ${DROPS_FROM.metal}`);
    expect(screen.getByTestId('materials-flux')).toHaveTextContent(`None yet: ${DROPS_FROM.flux}`);
    expect(screen.getByTestId('materials-shards')).toHaveTextContent(`None yet: ${DROPS_FROM.shard}`);
    expect(screen.getByTestId('materials-essences')).toHaveTextContent(
      `None yet: ${DROPS_FROM.essence}`,
    );
  });

  it('the shard bench steps through every affix and buys a tier I shard of the one shown', () => {
    store().setProfile({ ...store().profile, scrap: 1000, manaDust: 1000 });
    pane();
    const affix = screen.getByTestId('bench-affix');
    expect(affix).toHaveAttribute('role', 'spinbutton');
    const first = registry.getDelveData().affixes[0];
    expect(affix).toHaveAttribute('aria-valuetext', affixLabel(registry, first.stat));
    fireEvent.keyDown(affix, { key: 'ArrowRight' });
    const second = registry.getDelveData().affixes[1];
    expect(affix).toHaveAttribute('aria-valuetext', affixLabel(registry, second.stat));
    const price = registry.getDelveBalance().crafting.shardBench;
    expect(screen.getByTestId('bench-buy')).toHaveTextContent(
      `Buy ${affixLabel(registry, second.stat)} I · ${price.scrap} scrap · ${price.dust} Mana Dust`,
    );
    const before = store().profile.materials.shards[second.stat]?.[0] ?? 0;
    fireEvent.click(screen.getByTestId('bench-buy'));
    expect(store().profile.materials.shards[second.stat]?.[0]).toBe(before + 1);
    expect(store().profile).toMatchObject({ scrap: 1000 - price.scrap, manaDust: 1000 - price.dust });
    expect(screen.queryAllByTestId(/^bench-affix-/)).toHaveLength(0); // the chips are gone
  });
});
