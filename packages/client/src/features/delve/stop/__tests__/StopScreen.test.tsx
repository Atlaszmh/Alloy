import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, isBossDepth, SeededRNG, type DiveState, type StopKind } from '@alloy/engine';
import { StopScreen } from '../StopScreen';
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

/**
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's).
 */
function atStop(offers: StopKind[] | null, over: Partial<DiveState> = {}) {
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
    return <StopScreen dive={d} {...props} />;
  };
  render(<Stop />);
  return props;
}

describe('StopScreen (between depths)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("is a kit screen over the arena: the depth cleared, its biome, the bounty and the floor's finds", () => {
    atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-screen-arena-stop');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    expect(screen.getByTestId('floor-counts')).toHaveTextContent('26 scrap bounty2 items3 runes');
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

  it("lists this floor's items with their marks and its runes grouped, banked on leaving", () => {
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
    expect(found).toHaveTextContent('Banked when you leave this stop.');
    fireEvent.click(items[1]);
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it('shows the doors with their art and depth, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
    const dive = store().profile.dive!;
    const first = dive.doorChoices[0];
    const door = screen.getByTestId(`door-${first}`);
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door).toHaveAttribute('data-pad-first');
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
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

  it('has no back at its top level: Esc presses its Menu, which opens the pause', () => {
    const { onMenu } = atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root.querySelector('[data-pad-back]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('data-pad-menu');
    press('Escape');
    expect(onMenu).toHaveBeenCalledOnce();
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
    press('KeyS');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Power-up skipped');
    const first = store().profile.dive!.doorChoices[0];
    expect(screen.getByTestId(`door-${first}`)).toHaveFocus();
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('No power-up at this stop.');
  });

  it('Y (Inspect item) opens the focused find', () => {
    const { onInspect } = atStop(['equip']);
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
