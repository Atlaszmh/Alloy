import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  addMaterial,
  emptyHaul,
  generateItem,
  isBossDepth,
  SeededRNG,
  type DiveState,
  type Haul,
  type StopKind,
} from '@alloy/engine';
import { ARM_MS, StopScreen } from '../StopScreen';
import { doorLoot } from '../DoorPane';
import { padPrompts } from '../../kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'helm' | 'weapon' | 'ring', seed: number) =>
  generateItem(registry, { uid, ilvl: 3, rarity: 'rare', slot, mana: 'fire' }, new SeededRNG(seed));

/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

/** The stop's prompts and buttons wake ARM_MS after it mounts: a press carried from the fight does nothing. */
const arm = () => act(() => vi.advanceTimersByTime(ARM_MS));

/**
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's), and the floor's haul `haul`.
 */
function atStop(
  offers: StopKind[] | null,
  over: Partial<DiveState> = {},
  haul: Haul | null = null,
) {
  store().setProfile({
    ...store().profile,
    bag: [item('h1', 'helm', 4), item('w1', 'weapon', 5), item('r1', 'ring', 6)],
  });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: {
      ...dive,
      phase: 'choosing',
      bounty: 26,
      doorChoices: ['winding', 'gilded'],
      stop: offers ? { offers, taken: false } : null,
      ...over,
    },
  });
  useDelveStore.setState({
    diveDrops: ['w1', 'h1', 'r1'],
    floorDropsFrom: 1,
    diveRunes: [
      { id: 'quick', tier: 1 },
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'widen', tier: 1 },
    ],
    floorRunesFrom: 1,
  });
  const props = {
    onChoose: vi.fn(),
    onExtract: vi.fn(),
    onPotion: vi.fn(),
    onMenu: vi.fn(),
    onInspect: vi.fn(),
  };
  const Stop = () => {
    const d = useDelveStore((s) => s.profile.dive!);
    return <StopScreen dive={d} haul={haul} {...props} />;
  };
  render(<Stop />);
  return props;
}

describe('StopScreen (between depths)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => vi.useRealTimers());

  it("is a kit screen over the arena: the depth cleared, its biome, the bounty and the floor's finds", () => {
    atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-screen-arena-stop');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    expect(screen.getByTestId('floor-counts')).toHaveTextContent(
      '26 scrap bounty0 materials2 items3 runes',
    );
    expect(screen.queryByTestId('boss-slain')).toBeNull();
  });

  it('on a boss floor, says the boss is slain and where the checkpoint is', () => {
    let depth = 1;
    while (!isBossDepth(registry, depth)) depth++;
    atStop(['equip'], { depth });
    expect(screen.getByTestId('boss-slain')).toHaveTextContent(
      `Boss slain · checkpoint at depth ${depth + 1}`,
    );
  });

  it("lists this floor's items with their marks and its runes grouped, over the risk line", () => {
    const { onInspect } = atStop(['equip']);
    const found = screen.getByTestId('floor-finds');
    const items = within(found).getAllByTestId('loot-item');
    // Newest first; the ring was an earlier floor's.
    expect(items.map((b) => b.dataset.uid)).toEqual(['w1', 'h1']);
    expect(items[1]).toHaveTextContent(item('h1', 'helm', 4).name);
    expect(items[1]).toHaveTextContent('▲'); // the helm slot is empty
    const runes = within(within(found).getByTestId('loot-runes')).getAllByTestId('loot-rune');
    expect(runes.map((r) => r.textContent)).toEqual([
      'Quick IRune, to your pouch',
      'Split III ×2Rune, to your pouch',
    ]);
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    expect(within(found).getByTestId('risk-line')).toHaveTextContent(
      `Banked this dive · dying loses ${loss}% of it`,
    );
    fireEvent.click(items[1]);
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it("groups the floor's materials and currencies above its items, its essences below them, and counts them", () => {
    let haul = addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3);
    haul = addMaterial(haul, { kind: 'flux', grade: 'magic' });
    haul = addMaterial(haul, { kind: 'essence', essence: 'twin_fang' });
    haul = addMaterial(haul, { kind: 'links' }, 2);
    atStop(['equip'], {}, haul);
    const found = screen.getByTestId('floor-finds');
    const rows = [
      ...found.querySelectorAll(
        '[data-testid="loot-material"], [data-testid="loot-currency"], [data-testid="loot-item"], [data-testid="loot-essence"]',
      ),
    ];
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'loot-material',
      'loot-material',
      'loot-currency',
      'loot-item',
      'loot-item',
      'loot-essence',
    ]);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Iron bar ×3Material',
      'Magic fluxMaterial',
      'Links ×2Currency',
      expect.any(String),
      expect.any(String),
      'Twin Fang essenceForges a legendary',
    ]);
    // Bars, flux, shards and essences count as materials.
    expect(screen.getByTestId('floor-counts')).toHaveTextContent('5 materials');
  });

  it('shows the doors with their art and depth, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
    const dive = store().profile.dive!;
    const first = dive.doorChoices[0];
    const door = screen.getByTestId(`door-${first}`);
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    // Each door shows its loot multipliers; the plain one has none.
    const loot = (id: string) =>
      [...screen.getByTestId(`door-${id}`).querySelectorAll('[data-door-loot]')].map(
        (el) => el.textContent,
      );
    expect(loot('gilded')).toEqual(doorLoot(registry.getDoor('gilded').mods));
    expect(loot('gilded').length).toBeGreaterThan(0);
    expect(loot('winding')).toEqual([]);
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
    const extract = screen.getByTestId('extract-button');
    expect(extract).toHaveTextContent('Leave with 26 scrap');
    expect(extract.querySelector('[data-sprite="hero"]')).not.toBeNull();
    fireEvent.click(extract);
    expect(onExtract).toHaveBeenCalledOnce();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Life 50% · 2 potions');
    fireEvent.click(screen.getByTestId('door-potion'));
    expect(onPotion).toHaveBeenCalledOnce();
  });

  it("has no back at its top level: Esc and the pad's Menu open the pause; Enter with nothing focused doesn't", () => {
    const { onMenu } = atStop(['equip']);
    press('Escape'); // carried from the fight
    expect(onMenu).not.toHaveBeenCalled();
    arm();
    const root = screen.getByTestId('door-choice');
    expect(root.querySelector('[data-pad-back]')).toBeNull();
    expect(root.querySelector('[data-pad-menu]')).toBeNull();
    press('Enter');
    expect(onMenu).not.toHaveBeenCalled();
    press('Escape');
    expect(onMenu).toHaveBeenCalledOnce();
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    padPrompts(new Set<PadButton>(['menu']), {} as Record<PadButton, boolean>, 0);
    box.mockRestore();
    expect(onMenu).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onMenu).toHaveBeenCalledTimes(3);
  });

  it("with a card's picker open, Esc presses the picker's Back, not the Menu", () => {
    const { onMenu } = atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('S skips the power-up: the cards go and the focus moves to the first door', () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Skip power-up');
    arm();
    press('KeyS');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Power-up skipped');
    const first = store().profile.dive!.doorChoices[0];
    expect(screen.getByTestId(`door-${first}`)).toHaveFocus();
  });

  it('for ARM_MS after it mounts, its prompts and buttons are inert: a press carried from the fight skips nothing', () => {
    const { onInspect } = atStop(['equip', 'upgrade']);
    const main = screen.getByTestId('door-choice').querySelector('main > div')!;
    expect(main).toHaveAttribute('inert');
    press('KeyS');
    within(screen.getByTestId('floor-finds')).getAllByTestId('loot-item')[0].focus();
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    padPrompts(new Set<PadButton>(['y']), {} as Record<PadButton, boolean>, 0);
    box.mockRestore();
    expect(screen.getByTestId('stop')).toBeInTheDocument();
    expect(onInspect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(ARM_MS - 1));
    press('KeyS');
    expect(screen.getByTestId('stop')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(main).not.toHaveAttribute('inert');
    press('KeyS');
    expect(screen.queryByTestId('stop')).toBeNull();
  });

  it("the pad's first focus is the first power-up card while one is on offer, the first door once it is skipped", () => {
    atStop(['equip', 'upgrade']);
    const first = store().profile.dive!.doorChoices[0];
    const door = screen.getByTestId(`door-${first}`);
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    arm();
    press('KeyS');
    expect(door).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
  });

  it('with the power-up taken, or none on offer, the first door is the first focus', () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: true } });
    const first = store().profile.dive!.doorChoices[0];
    expect(screen.getByTestId(`door-${first}`)).toHaveAttribute('data-pad-first');
  });

  it("words a door's loot multipliers from its mods, leaving out what it doesn't change", () => {
    expect(doorLoot({})).toEqual([]);
    expect(
      doorLoot({
        materials: 1.3,
        runes: 0.5,
        gear: 1,
        flux: 1.5,
        essence: 2,
        find: 75,
        shardTier: 0.35,
      }),
    ).toEqual([
      'Materials ×1.3',
      'Runes ×0.5',
      'Flux ×1.5',
      'Essences ×2',
      'Find +75%',
      'Tier up 35%',
    ]);
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('No power-up at this stop.');
  });

  it('Y (Inspect item) opens the focused find', () => {
    const { onInspect } = atStop(['equip']);
    arm();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Inspect item');
    within(screen.getByTestId('floor-finds')).getAllByTestId('loot-item')[1].focus();
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    try {
      padPrompts(new Set<PadButton>(['y']), {} as Record<PadButton, boolean>, 0);
    } finally {
      box.mockRestore();
    }
    expect(onInspect).toHaveBeenCalledWith('h1');
  });
});

describe("StopScreen (a guided start's stops)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a required power-up holds every road, and Skip with them, until it is taken', () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: false, required: true } });
    arm();
    const roads = () => [
      ...store().profile.dive!.doorChoices.map((id) => screen.getByTestId(`door-${id}`)),
      screen.getByTestId('extract-button'),
    ];
    for (const road of roads()) expect(road).toBeDisabled();
    expect(screen.getByTestId('roads-held')).toHaveTextContent('Take the power-up to go on');
    press('KeyS');
    expect(screen.getByTestId('stop')).toBeInTheDocument();
    const dive = store().profile.dive!;
    act(() =>
      store().setProfile({
        ...store().profile,
        dive: { ...dive, stop: { ...dive.stop!, taken: true } },
      }),
    );
    for (const road of roads()) expect(road).toBeEnabled();
    expect(screen.queryByTestId('roads-held')).toBeNull();
  });

  it('with no doors, Extract stands alone, the first focus', () => {
    atStop(null, { doorChoices: [] });
    expect(screen.getByTestId('door-choice')).not.toHaveTextContent('Choose your path');
    expect(screen.getByTestId('door-list')).toBeEmptyDOMElement();
    expect(screen.getByTestId('extract-button')).toHaveAttribute('data-pad-first');
  });

  it("a guided stop whose step doesn't extract offers no Extract", () => {
    const step = (id: string, extract: boolean) => ({
      id,
      where: 'stop' as const,
      floor: id,
      line: 'Hesta.',
      objective: 'Go on',
      trigger: { type: 'ack' as const, count: 1 },
      stop: { kinds: [], doors: ['winding'], extract },
    });
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [step('d1-1', false), step('d1-3', true)],
    });
    const at = (step: string) =>
      act(() =>
        store().setProfile({ ...store().profile, tutorial: { step, count: 0, misses: 0 } }),
      );
    atStop(null);
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
    at('d1-1');
    expect(screen.queryByTestId('extract-button')).toBeNull();
    at('d1-3');
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
  });

  it("a guided stop shows Hesta's strip in the header row, between the title and the counts", () => {
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [
        {
          id: 'take',
          where: 'stop',
          floor: 'd1-1',
          line: 'Hesta speaks.',
          objective: 'Take Equip',
          trigger: { type: 'takeStop', count: 1 },
          stop: { kinds: ['equip'], doors: ['winding'], extract: false },
        },
        {
          id: 'walk',
          where: 'floor',
          floor: 'd1-1',
          line: 'On the floor.',
          objective: 'Walk',
          trigger: { type: 'ack', count: 1 },
        },
      ],
    });
    const on = (step: string) =>
      act(() =>
        store().setProfile({ ...store().profile, tutorial: { step, count: 0, misses: 0 } }),
      );
    atStop(['equip']);
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    on('take');
    const strip = screen.getByTestId('tutorial-panel');
    expect(strip).toHaveAttribute('data-place', 'stop');
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Take Equip');
    expect(screen.getByTestId('tutorial-line')).toHaveTextContent('Hesta speaks.');
    const title = screen.getByRole('heading', { level: 1 });
    const counts = screen.getByTestId('floor-counts');
    expect(strip.parentElement).toBe(counts.parentElement);
    expect(title.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A floor's step is the HUD's strip's, never the stop's.
    on('walk');
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
  });
});
