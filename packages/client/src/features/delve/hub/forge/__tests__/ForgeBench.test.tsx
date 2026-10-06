import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyMaterials,
  forgePowerRange,
  previewForge,
  withMaterial,
  type ForgeRequest,
  type HeroStatKey,
  type MaterialsPouch,
} from '@alloy/engine';
import { ForgeBench } from '../ForgeBench';
import { MaterialsPane } from '../MaterialsPane';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useUIStore } from '@/stores/uiStore';
import { ONBOARDING } from '../../../onboarding';
import { usePrompts, type Prompt } from '../../../kit';
import { formatDelta } from '../../../format';
import { DROPS_FROM, pct, shardName, statRange, valueRange } from '../materials-text';

// The bench runs on the real engine: what it shows is `previewForge`, what it makes is `forge`.

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const withMaterials = (over: Partial<MaterialsPouch>, scrap = 1000) =>
  store().setProfile({
    ...store().profile,
    scrap,
    materials: { ...emptyMaterials(), ...over },
  });
/** One more shard of `stat` at `tier` in the save as it stands (the kit's bars and flux kept). */
const putShard = (stat: HeroStatKey, tier: number) =>
  store().setProfile({
    ...store().profile,
    scrap: 1000,
    materials: withMaterial(store().profile.materials, { kind: 'shard', stat, tier }, 1),
  });
/** The engine's preview of `req` for the profile as it stands. */
const preview = (req: Partial<ForgeRequest> & { baseId: string; metal: ForgeRequest['metal'] }) =>
  previewForge(registry, store().profile, { element: 'fire', shards: [], ...req });
const uses = () => screen.getByTestId('forge-uses');
const right = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'ArrowRight' });
const left = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'ArrowLeft' });
const flux = () => screen.getByTestId('forge-flux');
const metal = () => screen.getByTestId('forge-metal');
const element = () => screen.getByTestId('forge-element');
/** Step a stepper right until its value reads `value`. */
function stepTo(testId: string, value: RegExp) {
  const el = screen.getByTestId(testId);
  for (let i = 0; i < 12 && !value.test(el.getAttribute('aria-valuetext') ?? ''); i++) right(el);
  expect(el.getAttribute('aria-valuetext')).toMatch(value);
}
const stepFluxTo = (grade: string) =>
  stepTo('forge-flux', new RegExp(`^${grade[0].toUpperCase()}${grade.slice(1)}`));

/** The bench as the tab holds it: the chosen pattern is the tab's. */
function Bench(props: { locked?: boolean; setPrompts: (p: Prompt[]) => void }) {
  const [b, setB] = useState<string | null>(null);
  return <ForgeBench locked={props.locked ?? false} setPrompts={props.setPrompts} baseId={b} onBase={setB} />;
}

function bench(locked = false, pane = false) {
  const setPrompts = vi.fn<(p: Prompt[]) => void>();
  render(
    <div style={{ display: 'grid' }}>
      <Bench locked={locked} setPrompts={setPrompts} />
      {pane && <MaterialsPane locked={locked} />}
    </div>,
  );
  return setPrompts;
}

/** The bench with its prompts bound as the hub binds them: Enter forges. */
function Hub() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  usePrompts(prompts);
  return <Bench setPrompts={setPrompts} />;
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

  it('the bench is rows: Flux, Metal and Element steppers over what the save holds, then the Lines, then Forge', () => {
    putShard('maxHp', 1); // a shard held: the lines are buttons (none held folds them: its own test)
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const rows = screen.getByTestId('forge-bench');
    const order = () =>
      [...rows.querySelectorAll<HTMLElement>('[data-testid]')]
        .map((e) => e.dataset.testid!)
        .filter((id) => /^(forge-(flux|metal|element|button)|shard-slot-\d)$/.test(id));
    expect(order()).toEqual(['forge-flux', 'forge-metal', 'forge-element', 'forge-button']); // common: no lines
    // The kit: 5 Rusty bars, 5 uncommon flux. The metal holds Rusty only; the flux None and Uncommon.
    expect(metal()).toHaveAttribute('aria-valuetext', 'Rusty bar ×5');
    expect(Number(metal().getAttribute('aria-valuemax'))).toBe(0);
    expect(flux()).toHaveAttribute('aria-valuetext', 'None');
    right(flux());
    expect(flux()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Uncommon Cuirass');
    expect(order()).toEqual(['forge-flux', 'forge-metal', 'forge-element', 'shard-slot-0', 'forge-button']);
    // The element: the pair first, the others with their Mana Dust.
    expect(element()).toHaveAttribute('aria-valuetext', 'Fire');
    right(element());
    expect(element().getAttribute('aria-valuetext')).toMatch(/· \d+ Mana Dust$/);
  });

  it('what the save lacks is one line under its row, saying where it drops', () => {
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(DROPS_FROM.metal);
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(DROPS_FROM.flux);
    // No bars at all: the Metal row is that line alone, and the forge says why it can't.
    act(() =>
      store().setProfile({
        ...store().profile,
        materials: { ...store().profile.materials, metals: emptyMaterials().metals },
      }),
    );
    expect(screen.queryByTestId('forge-metal')).toBeNull();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('Missing materials');
  });

  it("carries the guided start's trail: the bar and flux rows say they are done from the bench's state", () => {
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('pattern-cuirass')).toHaveAttribute('data-tutorial', 'forge.pattern:cuirass');
    expect(metal()).toHaveAttribute('data-tutorial', 'forge.bar');
    expect(metal()).toHaveAttribute('data-tutorial-done', 'true'); // a held bar is chosen
    expect(flux()).toHaveAttribute('data-tutorial', 'forge.flux');
    expect(flux()).toHaveAttribute('data-tutorial-done', 'false'); // None
    right(flux());
    expect(flux()).toHaveAttribute('data-tutorial-done', 'true');
    // The Lines field: done at once when no shard held fits (the kit holds none).
    const lines = () => document.querySelector('[data-tutorial="forge.shard"]')!;
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
    // With one that fits, done once a line holds it; in the picker's own scope the picker is the target.
    act(() => putShard('maxHp', 1));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
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
    stepFluxTo('uncommon');
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
    const learned = store().profile.patterns;
    for (const id of learned) expect(within(list).getByTestId(`pattern-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('pattern-unknown-bow')).toHaveTextContent(
      'Unknown · salvage a Bow, or find its pattern on elites and bosses',
    );
    expect(within(screen.getByTestId('pattern-unknown-bow')).queryByRole('button')).toBeNull();
    // Nothing is forged from nothing: no preview until a pattern is picked.
    expect(screen.getByTestId('forge-empty')).toHaveTextContent('Pick a pattern to forge');
    // The pad lands on the first learned row while none is picked, on the picked one after.
    const firsts = () => [...list.querySelectorAll('[data-pad-first]')].map((e) => e.getAttribute('data-testid'));
    const top = list.querySelector('[data-testid^="pattern-"]:not([data-testid^="pattern-unknown"])')!;
    expect(firsts()).toEqual([top.getAttribute('data-testid')]);
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(firsts()).toEqual(['pattern-cuirass']);
  });

  it("a pattern shows the engine's preview: the item, the floor, implicits, a weapon's skills, the price", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, iron: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('pattern-sword')).toHaveAttribute('aria-pressed', 'true');
    // The first metal held, the primary, no flux and no shards.
    const prev = preview({ baseId: 'sword', metal: 'iron' });
    expect(metal()).toHaveAttribute('aria-valuetext', 'Iron bar ×2');
    expect(Number(metal().getAttribute('aria-valuemax'))).toBe(0); // the one bar held
    expect(element()).toHaveAttribute('aria-valuetext', 'Fire');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Common Sword');
    expect(screen.getByTestId('forge-preview')).toHaveTextContent(`item level ${prev.ilvl}`);
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
    stepFluxTo('rare');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Rare Sword');
    expect(screen.getByTestId('shard-slot-2')).toHaveTextContent('Line 3 · Random');
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
      `Line 1 · Crit Chance II: ${valueRange(registry, 'critChance', ...line.range!)}`,
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
    stepFluxTo('magic');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-critChance-1'));
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    left(flux());
    expect(flux()).toHaveAttribute('aria-valuetext', 'Uncommon ×1');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Uncommon flux, Crit Chance I$/);
    left(flux());
    expect(flux()).toHaveAttribute('aria-valuetext', 'None');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar$/);
  });

  it("an element outside the pair costs Mana Dust; the engine's refusal turns Forge off and says why", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 1 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const dust = registry.getDelveBalance().crafting.offPairDust;
    expect(element()).toHaveAttribute('aria-valuetext', 'Fire');
    stepTo('forge-element', /^Storm/);
    expect(element()).toHaveAttribute('aria-valuetext', `Storm · ${dust} Mana Dust`);
    expect(element()).toHaveTextContent(`Storm · ${dust} Mana Dust`);
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
    useUIStore.setState({ seen: [] });
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 2 } });
    const setPrompts = bench();
    // A first visit: the forge prompt carries the screen's line, until a forge.
    expect(setPrompts.mock.lastCall![0].find((p) => p.id === 'forge')!.hint).toBe(ONBOARDING.forge);
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const bag = store().profile.bag.length;
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(useUIStore.getState().seen).toContain('forge');
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
    stepFluxTo('magic');
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
    expect(screen.getByTestId('forge-preview')).toHaveTextContent(`item level ${shown.ilvl}`);
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent(
      `Line 1 · Crit Chance II: ${valueRange(registry, 'critChance', ...crit.range!)}rolls 20%–50%`,
    );
    expect(screen.getByTestId('shard-slot-1')).toHaveTextContent('Line 2 · Randomrolls 0%–100%');
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
    expect(screen.queryByTestId('forge-essence')).toBeNull(); // epic flux first
    stepFluxTo('epic');
    expect(screen.getByTestId('forge-essence')).toHaveAttribute('aria-valuetext', 'None');
    stepTo('forge-essence', /^Pyroclasm ×1$/);
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
    render(<Hub />);
    fireEvent.click(screen.getByTestId('pattern-sword'));
    stepFluxTo('epic');
    stepTo('forge-essence', /^Pyroclasm/);
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
    right(metal());
    expect(metal()).toHaveAttribute('aria-valuetext', 'Iron bar ×2');
    left(metal());
    expect(metal()).toHaveAttribute('aria-valuetext', 'Rusty bar ×1');
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(store().profile.materials.metals.rusty).toBe(0);
    expect(metal()).toHaveAttribute('aria-valuetext', 'Iron bar ×2');
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
    stepFluxTo('rare');
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(store().profile.materials.flux.rare).toBe(0);
    expect(flux()).toHaveAttribute('aria-valuetext', 'Uncommon ×2');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Uncommon flux$/);
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Uncommon Cuirass');
    expect(screen.getByTestId('forge-button')).toBeEnabled();
    // The last of every grade forged away: no flux (the row folds to its line), a common item.
    fireEvent.click(screen.getByTestId('forge-button'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(screen.getByTestId('forge-flux-none')).toBeInTheDocument();
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
    stepFluxTo('epic');
    stepTo('forge-essence', /^Pyroclasm/);
    fireEvent.click(screen.getByTestId('forge-button'));
    fireEvent.click(screen.getByTestId('legendary-fanfare'));
    expect(screen.getByTestId('forge-essence')).toHaveAttribute('aria-valuetext', 'None');
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(DROPS_FROM.essence);
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Epic Sword');
    expect(uses()).toHaveTextContent(/^Uses Rusty bar, Epic flux$/);
    expect(screen.getByTestId('forge-button')).toBeEnabled();
  });

  it('a pattern picked moves the focus to the Flux row; a shard picked moves it to Forge, unless refused', () => {
    putShard('maxHp', 1);
    render(<Hub />);
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(flux()).toHaveFocus();
    right(flux());
    expect(flux()).toHaveFocus(); // a step never moves the focus
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    expect(screen.getByTestId('forge-button')).toHaveFocus();
    // Off the pair with no Mana Dust: refused, so a shard pick leaves the focus on its line.
    act(() => store().setProfile({ ...store().profile, manaDust: 0 }));
    element().focus();
    stepTo('forge-element', /Mana Dust$/);
    expect(element()).toHaveFocus();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('Not enough Mana Dust');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    expect(screen.getByTestId('shard-slot-0')).toHaveFocus();
  });

  it('the preview beside the rows shows the item the forge would make, with no stops; it scrolls on the right stick', () => {
    bench();
    expect(screen.getByTestId('forge-preview')).toHaveTextContent('The item you forge shows here.');
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const pane = screen.getByTestId('forge-preview');
    expect(within(pane).getByTestId('forge-title')).toHaveTextContent('Common Cuirass');
    expect(within(pane).getByTestId('forge-implicits')).toBeInTheDocument();
    expect(within(pane).getByTestId('forge-uses')).toHaveTextContent('Rusty bar');
    expect(within(pane).getByTestId('forge-purse')).toBeInTheDocument();
    expect(pane.querySelectorAll('button, [tabindex="0"]')).toHaveLength(0);
    expect(pane.querySelector('[data-pad-scroll]')).not.toBeNull();
    expect(within(screen.getByTestId('forge-bench')).queryByTestId('forge-title')).toBeNull();
  });

  it("shows the item's Power against what is worn as a range, the engine's (forgePowerRange)", () => {
    putShard('maxHp', 1);
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    stepFluxTo('uncommon');
    const req: ForgeRequest = { baseId: 'cuirass', metal: 'rusty', flux: 'uncommon', element: 'fire', shards: [] };
    const random = forgePowerRange(registry, store().profile, req);
    const power = screen.getByTestId('forge-power');
    const span = (r: { low: number; high: number }) =>
      formatDelta(r.low) === formatDelta(r.high)
        ? formatDelta(r.high)
        : `${formatDelta(r.low)} to ${formatDelta(r.high)}`;
    expect(power).toHaveTextContent(`${span(random)} Power against your chest`);
    expect(power).toHaveTextContent('before 1 random line');
    // A shard on the line: the range is the shard's, with no random line left.
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    const shard = forgePowerRange(registry, store().profile, { ...req, shards: [{ stat: 'maxHp', tier: 1 }] });
    expect(power).toHaveTextContent(`${span(shard)} Power against your chest`);
    expect(power).not.toHaveTextContent('random');
  });

  it("a weapon's range says it is valued as a home for your moveset", () => {
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('forge-power')).toHaveTextContent('against your weapon, as a home for your moveset');
  });

  it('mid-dive the forge waits, with Select alone left to the tab', () => {
    const setPrompts = bench(true);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(setPrompts).not.toHaveBeenCalled();
  });

  it('a save with no flux sees one line for Flux, and with no shard the Lines as text; a guided save folds nothing', () => {
    const rusty = { ...emptyMaterials().metals, rusty: 5 };
    withMaterials({ metals: rusty });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.queryByTestId('forge-flux')).toBeNull();
    expect(screen.getByTestId('forge-flux-none')).toHaveTextContent(`Flux: none held. ${DROPS_FROM.flux}`);
    expect(screen.queryByTestId('shard-slot-0')).toBeNull(); // a common cuirass rolls no lines anyway
    cleanup();
    // Uncommon flux and still no shard: the flux row is back, the line is text.
    withMaterials({ metals: rusty, flux: { ...emptyMaterials().flux, uncommon: 1 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-flux')).toBeInTheDocument();
    stepFluxTo('uncommon');
    expect(screen.queryByTestId('shard-slot-0')).toBeNull();
    expect(screen.getByTestId('forge-line-0')).toHaveTextContent(/^Line 1 · Random/);
    expect(screen.getByTestId('forge-lines-none')).toHaveTextContent(DROPS_FROM.shard);
    cleanup();
    // Guided: today's rows, flux or not.
    act(() => store().startTutorial());
    withMaterials({ metals: rusty });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-flux')).toBeInTheDocument();
  });
});
