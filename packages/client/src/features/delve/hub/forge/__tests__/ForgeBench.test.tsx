import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { emptyMaterials, forge, previewForge, type MaterialsPouch } from '@alloy/engine';
import { ForgeBench } from '../ForgeBench';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { Prompt } from '../../../kit';
import { FAKE, fakeCrafting } from './crafting-fakes';

// Stage 4c's B2 fills the crafting ops: until then the bench runs on fakes.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  ...Object.fromEntries(
    ['previewForge', 'forge', 'refineCost', 'refine', 'buyShard']
      .concat(['honeCost', 'hone', 'imprintCost', 'imprint'])
      .map((k) => [k, vi.fn()]),
  ),
}));

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const lastRequest = () => vi.mocked(previewForge).mock.lastCall?.[2];
const withMaterials = (over: Partial<MaterialsPouch>) =>
  store().setProfile({
    ...store().profile,
    scrap: 100,
    materials: { ...emptyMaterials(), ...over },
  });

function bench(locked = false) {
  const setPrompts = vi.fn<(p: Prompt[]) => void>();
  render(
    <div style={{ display: 'grid' }}>
      <ForgeBench locked={locked} setPrompts={setPrompts} />
    </div>,
  );
  return setPrompts;
}

describe('ForgeBench', () => {
  beforeAll(() => {
    // jsdom has no Web Animations; the fanfare's entrance is cosmetic.
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });

  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.setState({ device: 'keyboard' });
    vi.clearAllMocks();
    fakeCrafting();
  });

  it('lists the learned patterns, then the unknown ones greyed with where they come from', () => {
    bench();
    const list = screen.getByTestId('pattern-list');
    for (const id of store().profile.patterns)
      expect(within(list).getByTestId(`pattern-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('pattern-unknown-bow')).toHaveTextContent(
      'Unknown · salvage a Bow, or find its pattern on elites and bosses',
    );
    expect(within(screen.getByTestId('pattern-unknown-bow')).queryByRole('button')).toBeNull();
    // Nothing is forged from nothing: no preview until a pattern is picked.
    expect(screen.getByTestId('forge-empty')).toHaveTextContent('Pick a pattern to forge');
    expect(previewForge).not.toHaveBeenCalled();
  });

  it("a pattern shows the engine's preview: the item, the floor, implicits, a weapon's skills, the price", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, iron: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('pattern-sword')).toHaveAttribute('aria-pressed', 'true');
    // The first metal held, the primary, no flux and no shards.
    expect(lastRequest()).toEqual({ baseId: 'sword', metal: 'iron', element: 'fire', shards: [] });
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Common Sword');
    expect(screen.getByTestId('metal-iron')).toHaveTextContent('Iron bar ×2');
    expect(screen.getByTestId('metal-rusty')).toBeDisabled();
    expect(
      screen.getByText('A common item rolls no lines: add flux for some.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('forge-floor')).toHaveTextContent(
      'Your Fire attunement lifts every roll: each starts at least 12% up its band.',
    );
    expect(screen.getByTestId('forge-implicits')).toHaveTextContent('+3 to +5 Armor');
    expect(screen.getByTestId('forge-weapon')).toHaveTextContent(
      'Carries Basic, Primary · extra slots: Primary +1 · 1 open socket',
    );
    expect(screen.getByTestId('forge-uses')).toHaveTextContent('Uses Iron bar');
    expect(screen.getByTestId('forge-button')).toHaveTextContent(`Forge · ${FAKE.forge} scrap`);
    expect(screen.getByTestId('forge-button')).toBeEnabled();
  });

  it('flux sets the rarity; a line takes a shard picked from those that fit the slot', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, rare: 1 },
      // Crit Chance and Fire Damage fit a sword; Armor doesn't.
      shards: { critChance: [0, 2], firePower: [1], armor: [3] },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-rare'));
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Rare Sword');
    expect(screen.getByTestId('shard-slot-2')).toHaveTextContent('Random line');
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent('rolls 10%–100%');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    const pick = screen.getByTestId('shard-pick');
    expect(pick).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('shard-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('shard-random')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('shard-pick-critChance-2')).toHaveTextContent(
      'Crit Chance II ×2rolls 20%–50%',
    );
    expect(screen.queryByTestId('shard-pick-armor-1')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-critChance-2'));
    expect(lastRequest()).toMatchObject({
      flux: 'rare',
      shards: [{ stat: 'critChance', tier: 2 }],
    });
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent('Crit Chance II: +2% to +4%');
    expect(screen.getByTestId('forge-uses')).toHaveTextContent(
      'Uses Rusty bar, Rare flux, Crit Chance II',
    );
    // The next line can't take the same affix again.
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    expect(screen.queryByTestId('shard-pick-critChance-2')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    expect(lastRequest()!.shards).toHaveLength(2);
    // A line set back to random drops its shard; the others move up.
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-random'));
    expect(lastRequest()!.shards).toEqual([{ stat: 'firePower', tier: 1 }]);
  });

  it('a lower flux keeps only the shards its lines can hold', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, uncommon: 1, magic: 1 },
      shards: { critChance: [1], firePower: [1] },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-magic'));
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-critChance-1'));
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    fireEvent.click(screen.getByTestId('flux-uncommon'));
    expect(lastRequest()).toMatchObject({
      flux: 'uncommon',
      shards: [{ stat: 'critChance', tier: 1 }],
    });
    fireEvent.click(screen.getByTestId('flux-none'));
    expect(lastRequest()).toEqual({ baseId: 'sword', metal: 'rusty', element: 'fire', shards: [] });
  });

  it("an element outside the pair costs Mana Dust; the engine's refusal turns Forge off and says why", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 1 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const dust = registry.getDelveBalance().crafting.offPairDust;
    expect(screen.getByTestId('element-fire')).toHaveTextContent(/^Fire$/);
    expect(screen.getByTestId('element-storm')).toHaveTextContent(`Storm · ${dust} Mana Dust`);
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(lastRequest()).toMatchObject({ element: 'storm' });
    expect(screen.queryByTestId('forge-floor')).toBeNull();
    expect(screen.getByTestId('forge-button')).toHaveTextContent(
      `Forge · ${FAKE.forge} scrap · ${dust} Mana Dust`,
    );
    act(() => withMaterials({}));
    expect(screen.getByTestId('forge-button')).toBeDisabled();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('You have no such bar');
    expect(screen.getByTestId('forge-button')).toHaveAccessibleDescription('You have no such bar');
  });

  it('Forge (or Enter) forges: the item comes marked new, and the bench says so', () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 2 } });
    const setPrompts = bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(forge).toHaveBeenCalledWith(registry, expect.anything(), {
      baseId: 'cuirass',
      metal: 'rusty',
      element: 'fire',
      shards: [],
    });
    const made = store().profile.bag.at(-1)!;
    expect(store().newUids[made.uid]).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Forged ${made.name}: it waits in your bag`,
    );
    // The keys' prompts: Select, and Enter to forge; the pad presses the focused button.
    const prompts = setPrompts.mock.lastCall![0];
    expect(prompts.map((p) => p.label)).toEqual(['Select', 'Forge']);
    act(() => prompts[1].onPress!());
    expect(forge).toHaveBeenCalledTimes(2);
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(setPrompts.mock.lastCall![0].map((p) => p.label)).toEqual(['Select']);
  });

  it('epic flux and an essence forge a legendary: the patterns say which it fits, and the fanfare plays', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, epic: 1 },
      essences: { pyroclasm: 1 },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.queryByTestId('essence-pyroclasm')).toBeNull(); // epic flux first
    fireEvent.click(screen.getByTestId('flux-epic'));
    fireEvent.click(screen.getByTestId('essence-pyroclasm'));
    expect(lastRequest()).toMatchObject({ flux: 'epic', essence: 'pyroclasm' });
    // Pyroclasm fits a weapon, an amulet or a helm.
    expect(screen.getByTestId('pattern-sword')).toHaveTextContent('Fits the essence');
    expect(screen.getByTestId('pattern-cuirass')).toHaveTextContent('The essence does not fit');
    const def = registry.getLegendary('pyroclasm');
    expect(screen.getByTestId('forge-legendary')).toHaveTextContent(`${def.name}:`);
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Legendary Sword');
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(screen.getByTestId('legendary-fanfare')).toHaveTextContent('New codex entry!');
    fireEvent.click(screen.getByTestId('legendary-fanfare'));
    expect(screen.queryByTestId('legendary-fanfare')).toBeNull();
  });

  it('mid-dive the forge waits, with Select alone left to the tab', () => {
    const setPrompts = bench(true);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(setPrompts).not.toHaveBeenCalled();
  });
});
