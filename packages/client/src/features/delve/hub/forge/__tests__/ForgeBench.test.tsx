import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyMaterials,
  previewForge,
  type ForgeRequest,
  type MaterialsPouch,
} from '@alloy/engine';
import { ForgeBench } from '../ForgeBench';
import { MaterialsPane } from '../MaterialsPane';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { usePrompts, type Prompt } from '../../../kit';
import { pct, shardName, statRange, valueRange } from '../materials-text';

// The bench runs on the real engine: what it shows is `previewForge`, what it makes is `forge`.

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const withMaterials = (over: Partial<MaterialsPouch>, scrap = 1000) =>
  store().setProfile({
    ...store().profile,
    scrap,
    materials: { ...emptyMaterials(), ...over },
  });
/** The engine's preview of `req` for the profile as it stands. */
const preview = (req: Partial<ForgeRequest> & { baseId: string; metal: ForgeRequest['metal'] }) =>
  previewForge(registry, store().profile, { element: 'fire', shards: [], ...req });
const uses = () => screen.getByTestId('forge-uses');

function bench(locked = false, pane = false) {
  const setPrompts = vi.fn<(p: Prompt[]) => void>();
  render(
    <div style={{ display: 'grid' }}>
      <ForgeBench locked={locked} setPrompts={setPrompts} />
      {pane && <MaterialsPane locked={locked} />}
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
  });

  it("carries the guided start's trail: a keyed pattern, bar and flux, and the Lines field done once a line holds a shard", () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 5 },
      flux: { ...emptyMaterials().flux, uncommon: 2 },
      shards: { maxHp: [1] },
    });
    bench();
    const pattern = screen.getByTestId('pattern-cuirass');
    expect(pattern).toHaveAttribute('data-tutorial', 'forge.pattern:cuirass');
    fireEvent.click(pattern);
    expect(pattern).toHaveAttribute('aria-pressed', 'true');
    // The first bar held is the bench's own pick: chosen from the start.
    expect(screen.getByTestId('metal-rusty')).toHaveAttribute('data-tutorial', 'forge.bar:rusty');
    expect(screen.getByTestId('metal-rusty')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('flux-none')).not.toHaveAttribute('data-tutorial');
    const flux = screen.getByTestId('flux-uncommon');
    expect(flux).toHaveAttribute('data-tutorial', 'forge.flux:uncommon');
    fireEvent.click(flux);
    expect(screen.getByTestId('flux-uncommon')).toHaveAttribute('aria-checked', 'true');
    const lines = () => document.querySelector('[data-tutorial="forge.shard"]')!;
    expect(lines()).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    // In the picker's own scope the picker is the target.
    expect(lines()).toBe(screen.getByTestId('shard-picker'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
  });

  it('the Lines field is done at once when no shard held fits the item: the forge needs none', () => {
    // A Crit Chance shard fits no cuirass; a Max Life one does.
    const holding = (shards: MaterialsPouch['shards']) =>
      withMaterials({
        metals: { ...emptyMaterials().metals, rusty: 5 },
        flux: { ...emptyMaterials().flux, uncommon: 2 },
        shards,
      });
    holding({ critChance: [2] });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('flux-uncommon'));
    const lines = () => document.querySelector('[data-tutorial="forge.shard"]')!;
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('forge-button')).toBeEnabled();
    act(() => holding({ critChance: [2], maxHp: [1] }));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'false');
    act(() => holding({}));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
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
  });

  it("a pattern shows the engine's preview: the item, the floor, implicits, a weapon's skills, the price", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, iron: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('pattern-sword')).toHaveAttribute('aria-pressed', 'true');
    // The first metal held, the primary, no flux and no shards.
    const prev = preview({ baseId: 'sword', metal: 'iron' });
    expect(screen.getByTestId('metal-iron')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('element-fire')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Common Sword');
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(`item level ${prev.ilvl}`);
    expect(screen.getByTestId('metal-iron')).toHaveTextContent('Iron bar ×2');
    expect(screen.getByTestId('metal-rusty')).toBeDisabled();
    expect(
      screen.getByText('A common item rolls no lines: add flux for some.'),
    ).toBeInTheDocument();
    expect(prev.floor).toBeGreaterThan(0);
    expect(screen.getByTestId('forge-floor')).toHaveTextContent(
      `Your Fire attunement lifts every roll: each starts at least ${pct(prev.floor)} up its band.`,
    );
    for (const im of prev.implicits)
      expect(screen.getByTestId('forge-implicits')).toHaveTextContent(
        statRange(registry, im.stat, im.min, im.max),
      );
    // A common weapon carries the basic chain alone.
    expect(screen.getByTestId('forge-weapon')).toHaveTextContent('Carries Basic');
    expect(screen.getByTestId('forge-weapon')).not.toHaveTextContent('Primary');
    expect(uses()).toHaveTextContent('Uses Iron bar');
    expect(screen.getByTestId('forge-button')).toHaveTextContent(
      `Forge · ${prev.price.scrap} scrap`,
    );
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
    const minRare = registry.getDelveBalance().loot.minRoll.rare;
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent(`rolls ${pct(minRare)}–100%`);
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
    const crit = { stat: 'critChance' as const, tier: 2 };
    const [line] = preview({ baseId: 'sword', metal: 'rusty', flux: 'rare', shards: [crit] }).lines;
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent(
      `Crit Chance II: ${valueRange(registry, 'critChance', ...line.range!)}`,
    );
    expect(uses()).toHaveTextContent('Uses Rusty bar, Rare flux, Crit Chance II');
    // The next line can't take the same affix again.
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    expect(screen.queryByTestId('shard-pick-critChance-2')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    const fire = shardName(registry, { stat: 'firePower', tier: 1 });
    expect(uses()).toHaveTextContent(`Uses Rusty bar, Rare flux, Crit Chance II, ${fire}`);
    // A line set back to random drops its shard; the others move up.
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-random'));
    expect(uses()).toHaveTextContent(`Uses Rusty bar, Rare flux, ${fire}`);
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent(fire);
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
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Uncommon flux, Crit Chance I$/);
    fireEvent.click(screen.getByTestId('flux-none'));
    expect(uses()).toHaveTextContent(/^Uses Rusty bar$/);
  });

  it("an element outside the pair costs Mana Dust; the engine's refusal turns Forge off and says why", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 1 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const dust = registry.getDelveBalance().crafting.offPairDust;
    expect(screen.getByTestId('element-fire')).toHaveTextContent(/^Fire$/);
    expect(screen.getByTestId('element-storm')).toHaveTextContent(`Storm · ${dust} Mana Dust`);
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(screen.queryByTestId('forge-floor')).toBeNull();
    const prev = preview({ baseId: 'cuirass', metal: 'rusty', element: 'storm' });
    expect(screen.getByTestId('forge-button')).toHaveTextContent(
      `Forge · ${prev.price.scrap} scrap · ${dust} Mana Dust`,
    );
    act(() => withMaterials({}));
    expect(screen.getByTestId('forge-button')).toBeDisabled();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('Missing materials');
    expect(screen.getByTestId('forge-button')).toHaveAccessibleDescription('Missing materials');
  });

  it('Forge (or Enter) forges: the item comes marked new, and the bench says so', () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 2 } });
    const setPrompts = bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const bag = store().profile.bag.length;
    fireEvent.click(screen.getByTestId('forge-button'));
    const made = store().profile.bag.at(-1)!;
    expect(store().profile.bag).toHaveLength(bag + 1);
    expect(made).toMatchObject({ baseId: 'cuirass', rarity: 'common', mana: 'fire' });
    expect(store().newUids[made.uid]).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Forged ${made.name}: it waits in your bag`,
    );
    // The keys' prompts: Select, and Enter to forge; the pad presses the focused button.
    const prompts = setPrompts.mock.lastCall![0];
    expect(prompts.map((p) => p.label)).toEqual(['Select', 'Forge']);
    act(() => prompts[1].onPress!());
    expect(store().profile.bag).toHaveLength(bag + 2);
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(setPrompts.mock.lastCall![0].map((p) => p.label)).toEqual(['Select']);
  });

  it('forges a magic item through the engine: the bag gets what the bench showed, and the materials go', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, iron: 2 },
      flux: { ...emptyMaterials().flux, magic: 2 },
      shards: { critChance: [0, 2] },
    });
    bench(false, true);
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-magic'));
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-critChance-2'));
    const req: ForgeRequest = {
      baseId: 'sword',
      metal: 'iron',
      flux: 'magic',
      element: 'fire',
      shards: [{ stat: 'critChance', tier: 2 }],
    };
    const shown = previewForge(registry, store().profile, req);
    const [crit, random] = shown.lines;
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Magic Sword');
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(`item level ${shown.ilvl}`);
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent(
      `Crit Chance II: ${valueRange(registry, 'critChance', ...crit.range!)}rolls 20%–50%`,
    );
    expect(screen.getByTestId('shard-slot-1')).toHaveTextContent('Random linerolls 0%–100%');
    const scrap = store().profile.scrap;
    fireEvent.click(screen.getByTestId('forge-button'));

    const item = store().profile.bag.at(-1)!;
    expect(item).toMatchObject({ baseId: 'sword', rarity: 'magic', ilvl: shown.ilvl });
    expect(item.affixes).toHaveLength(2);
    expect(item.affixes[0]).toMatchObject({ stat: 'critChance', band: crit.band });
    expect(item.affixes[0].value).toBeGreaterThanOrEqual(crit.range![0]);
    expect(item.affixes[0].value).toBeLessThanOrEqual(crit.range![1]);
    expect(item.affixes[0].roll).toBeGreaterThanOrEqual(
      crit.band[0] + (crit.band[1] - crit.band[0]) * shown.floor,
    );
    expect(item.affixes[1].stat).not.toBe('critChance');
    expect(item.affixes[1].band).toBeUndefined();
    expect(item.affixes[1].roll).toBeGreaterThanOrEqual(random.band[0]);
    expect(store().profile.scrap).toBe(scrap - shown.price.scrap);
    expect(screen.getByTestId('material-metal-iron')).toHaveTextContent('Iron bar ×1');
    expect(screen.getByTestId('material-flux-magic')).toHaveTextContent('Magic flux ×1');
    expect(screen.getByTestId('material-shard-critChance-2')).toHaveTextContent(
      'Crit Chance II ×1',
    );
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
    expect(uses()).toHaveTextContent('Uses Rusty bar, Epic flux, Pyroclasm essence');
    // Pyroclasm fits a weapon, an amulet or a helm.
    expect(screen.getByTestId('pattern-sword')).toHaveTextContent('Fits the essence');
    expect(screen.getByTestId('pattern-cuirass')).toHaveTextContent('The essence does not fit');
    const def = registry.getLegendary('pyroclasm');
    const { range } = preview({
      baseId: 'sword',
      metal: 'rusty',
      flux: 'epic',
      essence: 'pyroclasm',
    }).legendary!;
    // The engine's range (the floor lifting its low end), not the data's.
    expect(range[0]).toBeGreaterThan(def.min);
    expect(screen.getByTestId('forge-legendary')).toHaveTextContent(
      `${def.name}: ${def.text.replace('{v}', range.join('–'))}`,
    );
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Legendary Sword');
    fireEvent.click(screen.getByTestId('forge-button'));
    const made = store().profile.bag.at(-1)!;
    expect(made.legendary!.id).toBe('pyroclasm');
    expect(made.legendary!.value).toBeGreaterThanOrEqual(range[0]);
    expect(made.legendary!.value).toBeLessThanOrEqual(range[1]);
    expect(screen.getByTestId('legendary-fanfare')).toHaveTextContent('New codex entry!');
    fireEvent.click(screen.getByTestId('legendary-fanfare'));
    expect(screen.queryByTestId('legendary-fanfare')).toBeNull();
  });

  it('the fanfare takes the focus in its own pad scope: Enter dismisses it and never forges again', async () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 2 },
      flux: { ...emptyMaterials().flux, epic: 2 },
      essences: { pyroclasm: 2 },
    });
    // The bench's prompts bound as the hub binds them: Enter forges.
    function Hub() {
      const [prompts, setPrompts] = useState<Prompt[]>([]);
      usePrompts(prompts);
      return <ForgeBench locked={false} setPrompts={setPrompts} />;
    }
    render(<Hub />);
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-epic'));
    fireEvent.click(screen.getByTestId('essence-pyroclasm'));
    const bag = store().profile.bag.length;
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(store().profile.bag).toHaveLength(bag + 1);
    const fanfare = screen.getByTestId('legendary-fanfare');
    // Portalled to the body, it covers the viewport in its own pad scope.
    expect(fanfare.closest('[data-pad-scope]')).toHaveClass('fixed', 'inset-0');
    expect(screen.getByTestId('forge-bench').contains(fanfare)).toBe(false);
    expect(fanfare.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByTestId('legendary-fanfare')).toBeNull();
    expect(store().profile.bag).toHaveLength(bag + 1);
  });

  it('the metal follows the stock: forging away the last bar picked falls back to the first held', () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 1, iron: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('metal-iron'));
    fireEvent.click(screen.getByTestId('metal-rusty'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(store().profile.materials.metals.rusty).toBe(0);
    expect(screen.getByTestId('metal-iron')).toHaveAttribute('aria-checked', 'true');
    expect(uses()).toHaveTextContent(/^Uses Iron bar$/);
    expect(screen.getByTestId('forge-button')).toBeEnabled();
  });

  it("the forge's result shows right after the Forge button, where the eye is, not scrolled out of view", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const button = screen.getByTestId('forge-button');
    fireEvent.click(button);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Forged /);
    expect(button.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.nextElementSibling).toBe(status);
  });

  it('the flux follows the stock: forging away the last of a grade falls back to the first held', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 3 },
      flux: { ...emptyMaterials().flux, uncommon: 2, rare: 1 },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('flux-rare'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(store().profile.materials.flux.rare).toBe(0);
    expect(screen.getByTestId('flux-uncommon')).toHaveAttribute('aria-checked', 'true');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Uncommon flux$/);
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Uncommon Cuirass');
    expect(screen.getByTestId('forge-button')).toBeEnabled();
    // The last of every grade forged away: no flux, a common item.
    fireEvent.click(screen.getByTestId('forge-button'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(screen.getByTestId('flux-none')).toHaveAttribute('aria-checked', 'true');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar$/);
  });

  it('forging away the last of an essence clears it: the bench is back on epic', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 2 },
      flux: { ...emptyMaterials().flux, epic: 2 },
      essences: { pyroclasm: 1 },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-epic'));
    fireEvent.click(screen.getByTestId('essence-pyroclasm'));
    fireEvent.click(screen.getByTestId('forge-button'));
    fireEvent.click(screen.getByTestId('legendary-fanfare'));
    expect(screen.queryByTestId('essence-pyroclasm')).toBeNull();
    expect(screen.getByTestId('essence-none')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Epic Sword');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Epic flux$/);
    expect(screen.getByTestId('forge-button')).toBeEnabled();
  });

  it('a pick moves the focus to Forge, so Enter forges next; a refused forge leaves it where it was', async () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 2, iron: 1 },
      flux: { ...emptyMaterials().flux, rare: 1 },
      shards: { armor: [1] },
    });
    store().setProfile({ ...store().profile, manaDust: 0 });
    function Hub() {
      const [prompts, setPrompts] = useState<Prompt[]>([]);
      usePrompts(prompts);
      return <ForgeBench locked={false} setPrompts={setPrompts} />;
    }
    render(<Hub />);
    const forgeButton = () => screen.getByTestId('forge-button');
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(forgeButton()).toHaveFocus();
    // Off the pair with no Mana Dust: refused, so the focus stays on the pick.
    screen.getByTestId('element-storm').focus();
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('Not enough Mana Dust');
    expect(screen.getByTestId('element-storm')).toHaveFocus();
    fireEvent.click(screen.getByTestId('element-fire'));
    expect(forgeButton()).toHaveFocus();
    screen.getByTestId('flux-rare').focus();
    fireEvent.click(screen.getByTestId('flux-rare'));
    expect(forgeButton()).toHaveFocus();
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-armor-1'));
    expect(forgeButton()).toHaveFocus();
    // A metal picked with the keys: Enter picks it, the next Enter forges.
    screen.getByTestId('metal-iron').focus();
    const bag = store().profile.bag.length;
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('metal-iron')).toHaveAttribute('aria-checked', 'true');
    expect(forgeButton()).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(store().profile.bag).toHaveLength(bag + 1);
    expect(store().profile.bag.at(-1)).toMatchObject({ baseId: 'cuirass', rarity: 'rare' });
  });

  it('mid-dive the forge waits, with Select alone left to the tab', () => {
    const setPrompts = bench(true);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(setPrompts).not.toHaveBeenCalled();
  });
});
