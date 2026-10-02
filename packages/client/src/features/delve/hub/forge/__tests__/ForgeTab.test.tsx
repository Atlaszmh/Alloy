import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ForgeTab } from '../ForgeTab';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import type { HubTabProps } from '../../types';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'helm' | 'weapon'): GearItem =>
  generateItem(
    registry,
    {
      uid,
      ilvl: 3,
      rarity: 'magic',
      slot,
      mana: 'fire',
      baseId: slot === 'weapon' ? 'sword' : undefined,
    },
    new SeededRNG(4),
  );
const props = (over: Partial<HubTabProps> = {}): HubTabProps => ({
  mode: 'anvil',
  setPrompts: vi.fn(),
  setFooterAction: vi.fn(),
  go: vi.fn(),
  onDelve: vi.fn(),
  ...over,
});

describe('ForgeTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('lists what you wear first, then the bag, filtered by kind; a row picks the item to temper', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('w1', 'weapon')] });
    const p = props();
    render(<ForgeTab {...p} />);
    expect(p.setPrompts).toHaveBeenCalledWith([expect.objectContaining({ label: 'Select' })]);
    const worn = Object.values(store().profile.equipped).length;
    const rows = screen.getAllByTestId('temper-row');
    expect(rows).toHaveLength(worn + 2);
    expect(rows.slice(0, worn).every((r) => r.textContent!.includes('Equipped'))).toBe(true);
    // The first item worn is on the bench until another is picked.
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('gear-filter-armor'));
    const armor = screen.getAllByTestId('temper-row');
    expect(armor.at(-1)).toHaveTextContent('Magic Helm');
    expect(armor.some((r) => r.textContent!.includes('Weapon'))).toBe(false);
    fireEvent.click(armor.at(-1)!);
    expect(screen.getByTestId('item-name')).toHaveTextContent(store().profile.bag[0].name);
  });

  it('a link picks its item, and a new link moves it; Alloy Fusion is gone', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('h2', 'helm')] });
    const { rerender } = render(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h1' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-2)).toHaveAttribute('aria-pressed', 'true');
    rerender(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h2' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-1)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('bench-fuse')).toBeNull();
    expect(screen.queryByTestId('fuse-bench')).toBeNull();
  });

  it('mid-dive, and in the pause, the forge waits for the dive to end', () => {
    store().setProfile({ ...store().profile, runes: { split: [3, 0, 0, 0, 0] } });
    store().startDive(1);
    const { unmount } = render(<ForgeTab {...props()} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.getByTestId('rune-fuse-split-1')).toBeDisabled();
    unmount();
    store().resetProfile(1234, 'fire');
    render(<ForgeTab {...props({ mode: 'pause' })} />);
    expect(screen.getByTestId('forge-locked')).toBeInTheDocument();
  });

  it('the rune pane fuses three of a rune into one of the next tier, for scrap', () => {
    store().setProfile({ ...store().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    render(
      <>
        <ForgeTab {...props()} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(within(screen.getByTestId('rune-pouch')).getByTestId('rune-fuse-split-1'));
    expect(store().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(screen.getByText('Fused 3 Split I into Split II')).toBeInTheDocument();
    expect(screen.getByTestId('pouch-split-2')).toHaveTextContent('Split II ×1');
  });
});
