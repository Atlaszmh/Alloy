import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  awaken,
  awakenPrice,
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
import { FOCUSABLE } from '@/features/gamepad/use-gamepad-nav';
import { Temper } from '../Temper';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

// Awaken's price and dry run (the tutorial's B3 fills them): each test says what they give.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  awaken: vi.fn(),
  awakenPrice: vi.fn(),
}));

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A sword of `rarity`. */
const sword = (rarity: GearItem['rarity']): GearItem =>
  generateItem(
    registry,
    { uid: 'w1', ilvl: 3, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
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
  return render(<Bench uid={item.uid} />);
};

describe('Temper', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    vi.mocked(awaken).mockReset();
    vi.mocked(awakenPrice).mockReset();
  });

  it("lists the six operations as rows, each with its price; one it can't do is off and says why on its row", () => {
    const lines = [{ stat: 'armor' as const, value: 5, roll: 0.5 }];
    bench(helm('fire', lines), { scrap: 0, manaDust: 0 });
    const rows = screen.getAllByTestId(/^temper-op-/).map((r) => r.dataset.testid);
    expect(rows).toEqual([
      'temper-op-upgrade',
      'temper-op-reforge',
      'temper-op-hone',
      'temper-op-imprint',
      'temper-op-reattune',
      'temper-op-awaken',
    ]);
    const item = store().profile.bag[0];
    const op = (id: string) => screen.getByTestId(`temper-op-${id}`);
    const why = (id: string) => document.getElementById(op(id).getAttribute('aria-describedby')!);
    expect(op('upgrade')).toHaveTextContent(`${upgradeCost(registry, item)} scrap`);
    expect(op('upgrade')).toBeDisabled();
    expect(why('upgrade')).toHaveTextContent(`Needs ${upgradeCost(registry, item)} scrap`);
    expect(op('hone')).toHaveTextContent(`${honeCost(registry, item)} scrap`);
    expect(op('reforge')).toHaveTextContent(`${reforgeCost(registry, item)} scrap`);
    // No shard held fits a helm line: Imprint says so.
    expect(why('imprint')).toHaveTextContent('No shard you hold fits a helm');
    // A pair of one element: nothing to re-attune to.
    expect(why('reattune')).toHaveTextContent('Bind a second element first');
    // Not a rare weapon.
    expect(why('awaken')).toHaveTextContent('Only a rare weapon awakens');
    // The reason sits in the row itself, beside its button.
    expect(op('awaken').closest('[data-temper-row]')!.contains(why('awaken'))).toBe(true);
  });

  it("an item with no lines can't Reforge, Hone or Imprint: each row says so", () => {
    bench(helm('fire'), { scrap: 1000 });
    for (const id of ['reforge', 'hone', 'imprint']) {
      const row = screen.getByTestId(`temper-op-${id}`);
      expect(row).toBeDisabled();
      expect(document.getElementById(row.getAttribute('aria-describedby')!)).toHaveTextContent(
        'No lines to work',
      );
    }
  });

  it("the item's detail sits beside the list, with no stops", () => {
    bench(helm('fire', [{ stat: 'armor', value: 5, roll: 0.5 }]));
    const detail = screen.getByTestId('temper-detail');
    expect(detail).toHaveTextContent(store().profile.bag[0].name);
    // No D-pad stops: whatever could take the focus (the header's tile) sits under data-pad-skip.
    const stops = [...detail.querySelectorAll<HTMLElement>(FOCUSABLE)];
    expect(stops.filter((el) => !el.closest('[data-pad-skip]'))).toHaveLength(0);
    expect(detail.querySelector('[data-pad-scroll]')).not.toBeNull();
  });

  it('upgrades the item for scrap, priced against the purse', () => {
    const item = helm('fire');
    const cost = upgradeCost(registry, item)!;
    bench(item, { scrap: cost - 1 });
    const up = screen.getByTestId('temper-op-upgrade');
    expect(up).toHaveTextContent('Upgrade +1');
    expect(up).toHaveTextContent(`${cost} scrap`);
    expect(up).toBeDisabled();
    expect(up).toHaveAccessibleDescription(`Needs ${cost} scrap`);
    expect(screen.getByTestId('temper-detail').textContent).toContain(
      `Each forge level adds +${Math.round(registry.getDelveBalance().forge.upgradeStep * 100)}% to every stat`,
    );
    expect(screen.getByTestId('forge-purse')).toHaveTextContent(`In hand: ${cost - 1} scrap`);
    act(() => store().setProfile({ ...store().profile, scrap: cost }));
    fireEvent.click(up);
    expect(store().profile).toMatchObject({ scrap: 0, bag: [{ uid: 'h1', upgrade: 1 }] });
    expect(screen.getByRole('status')).toHaveTextContent('Upgraded to +1');
  });

  it('at the top forge level Upgrade says so on its row', () => {
    const max = registry.getDelveBalance().forge.maxUpgrade;
    bench({ ...helm('fire'), upgrade: max });
    const up = screen.getByTestId('temper-op-upgrade');
    expect(up).toBeDisabled();
    expect(up).toHaveAccessibleDescription(`At the top forge level, +${max}`);
  });

  it('reforges a line picked in its own pad scope; Back leaves it', () => {
    const item = helm('fire', [{ stat: 'fireAttune', value: 2, roll: 0.5 }]);
    const cost = reforgeCost(registry, item);
    bench(item, { scrap: cost });
    fireEvent.click(screen.getByTestId('temper-op-reforge'));
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
    expect(screen.getByTestId('temper-op-upgrade')).toBeInTheDocument();
  });

  it("Hone's picker carries the guided start's trail: its lines, done once one is picked, then its confirm", () => {
    bench(helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]), { scrap: 10_000 });
    fireEvent.click(screen.getByTestId('temper-op-hone'));
    const lines = document.querySelector('[data-tutorial="temper.line"]')!;
    expect(lines).toContainElement(screen.getByTestId('hone-line-0'));
    expect(lines).toHaveAttribute('data-tutorial-done', 'false');
    expect(screen.getByTestId('hone-button')).toHaveAttribute('data-tutorial', 'temper.go');
    expect(screen.getByTestId('hone-button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('hone-line-0'));
    expect(lines).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('hone-button')).toBeEnabled();
    // Reforge's picker is no lesson's.
    fireEvent.click(screen.getByTestId('hone-back'));
    fireEvent.click(screen.getByTestId('temper-op-reforge'));
    expect(document.querySelector('[data-tutorial="temper.line"]')).toBeNull();
    expect(screen.getByTestId('reforge-button')).not.toHaveAttribute('data-tutorial');
  });

  it('hones a line through the engine, at its price, which grows with each hone', () => {
    const item = { ...helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]), hones: 2 };
    const cost = honeCost(registry, item);
    bench(item, { scrap: cost + 1 });
    // The guided start's Anvil lesson highlights it.
    expect(screen.getByTestId('temper-op-hone')).toHaveAttribute('data-tutorial', 'temper.hone');
    fireEvent.click(screen.getByTestId('temper-op-hone'));
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
    fireEvent.click(screen.getByTestId('temper-op-imprint'));
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
    fireEvent.click(screen.getByTestId('temper-op-imprint'));
    fireEvent.click(screen.getByTestId('imprint-line-0'));
    expect(screen.getByTestId('shard-pick-armor-2')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-critChance-1')).toBeNull();
    fireEvent.click(screen.getByTestId('imprint-line-1'));
    expect(screen.getByTestId('shard-pick-critChance-1')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-armor-2')).toBeNull();
  });

  it("re-attunes to the pair's other element for Mana Dust: a row each off the pair, one in it", () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    bench(helm('frost'), { manaDust: pal.reattuneDust.magic });
    // Off the pair: a row for each element of it.
    expect(screen.queryByTestId('temper-op-reattune')).toBeNull();
    const fire = screen.getByTestId('temper-op-reattune-fire');
    expect(fire).toHaveTextContent('Re-attune to Fire');
    expect(fire).toHaveTextContent(`${pal.reattuneDust.magic} Mana Dust`);
    fireEvent.click(screen.getByTestId('temper-op-reattune-storm'));
    expect(store().profile.bag[0].mana).toBe('storm');
    expect(store().profile.manaDust).toBe(0);
    // In the pair now: one row, to the other element, off for want of Dust.
    expect(screen.queryByTestId('temper-op-reattune-storm')).toBeNull();
    const row = screen.getByTestId('temper-op-reattune');
    expect(row).toHaveTextContent('Re-attune to Fire');
    expect(row).toBeDisabled();
    expect(row).toHaveAccessibleDescription(`Needs ${pal.reattuneDust.magic} Mana Dust`);
    expect(screen.getByRole('status')).toHaveTextContent('Attuned to Storm');
  });

  it("awakens a rare weapon at the engine's price, as its dry run allows, and says why not", () => {
    const price = { epicFlux: 1, links: 2, scrap: 150 };
    vi.mocked(awakenPrice).mockReturnValue(price);
    // The engine's rule stands in: 150 scrap awakens the sword.
    vi.mocked(awaken).mockImplementation((_registry, p, uid) =>
      p.scrap < price.scrap
        ? { ok: false, profile: p, reason: 'Needs 150 scrap' }
        : {
            ok: true,
            profile: {
              ...p,
              scrap: p.scrap - price.scrap,
              bag: p.bag.map((i) => (i.uid === uid ? { ...i, awakened: true } : i)),
            },
          },
    );
    bench(sword('rare'), { scrap: 149 });
    expect(awakenPrice).toHaveBeenCalledWith(
      registry,
      expect.objectContaining({ uid: 'w1', rarity: 'rare' }),
    );
    const button = screen.getByTestId('temper-op-awaken');
    expect(button).toHaveTextContent('Awaken');
    expect(button).toHaveTextContent('1 Epic flux · 2 Links · 150 scrap');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Needs 150 scrap');
    act(() => store().setProfile({ ...store().profile, scrap: 150 }));
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    fireEvent.click(button);
    expect(awaken).toHaveBeenLastCalledWith(
      registry,
      expect.objectContaining({ scrap: 150 }),
      'w1',
    );
    expect(store().profile).toMatchObject({ scrap: 0, bag: [{ uid: 'w1', awakened: true }] });
    expect(screen.getByRole('status')).toHaveTextContent('Awakened!');
    // Once: the row and the detail say so.
    expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
    expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
      'Awakened: it carries the Ultimate',
    );
    expect(screen.getByTestId('awakened')).toHaveTextContent('Awakened: it carries the Ultimate.');
  });

  it('Awaken is enabled only on a rare weapon not yet awakened, as the dry run allows; an awakened one says it is', () => {
    for (const item of [
      sword('magic'),
      sword('epic'),
      { ...helm('fire'), rarity: 'rare' as const },
    ]) {
      const { unmount } = bench(item);
      expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
      expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
        'Only a rare weapon awakens',
      );
      expect(screen.queryByTestId('awakened')).toBeNull();
      unmount();
    }
    bench({ ...sword('rare'), awakened: true });
    expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
    expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
      'Awakened: it carries the Ultimate',
    );
    expect(screen.getByTestId('awakened')).toBeInTheDocument();
    // The engine is asked for neither the price nor a dry run.
    expect(awakenPrice).not.toHaveBeenCalled();
    expect(awaken).not.toHaveBeenCalled();
  });
});
