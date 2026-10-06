import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  generateItem,
  salvageYield,
  SeededRNG,
  type GearItem,
  type GearSlot,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { formatNumber } from '../../../format';
import { padPrompts } from '../../../kit/prompts';
import { JunkSheet } from '../JunkSheet';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const gear = (uid: string, slot: GearSlot, rarity: Rarity = 'common', seed = 4): GearItem =>
  generateItem(registry, { uid, ilvl: 3, rarity, slot, mana: 'fire' }, new SeededRNG(seed));
const rows = () => screen.getAllByTestId('junk-row');
const row = (uid: string) => rows().find((r) => r.dataset.uid === uid)!;
/** Run `fn` with every element given a box (jsdom lays nothing out). */
const boxed = (fn: () => void) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fn();
  } finally {
    box.mockRestore();
  }
};
let padClock = 0;
/** A pad button's tap as the prompts hear it (pressed, then let go). */
const padPress = (button: PadButton) => {
  const held = (on?: PadButton) =>
    Object.fromEntries(PAD_BUTTONS.map((b) => [b, b === on])) as Record<PadButton, boolean>;
  boxed(() =>
    act(() => {
      padPrompts(new Set([button]), held(button), (padClock += 1000));
      padPrompts(new Set(), held(), padClock + 50);
    }),
  );
};

describe('JunkSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    const p = armed(store().profile);
    // An epic helm worn: the bag's common helms are all worse (salvageCandidates' junk).
    store().setProfile({
      ...p,
      scrap: 0,
      equipped: { ...p.equipped, helm: gear('h0', 'helm', 'epic') },
      bag: [
        gear('h1', 'helm', 'common', 1),
        gear('h2', 'helm', 'common', 2),
        gear('h3', 'helm', 'common', 3),
      ],
    });
  });

  it('lists each candidate with what it gives, and the total of what Salvage would give', () => {
    render(<JunkSheet uids={['h1', 'h2', 'h3']} onClose={vi.fn()} />);
    expect(rows().map((r) => r.dataset.uid)).toEqual(['h1', 'h2', 'h3']);
    const scrapOf = (uid: string) =>
      salvageYield(registry, store().profile, store().profile.bag.find((i) => i.uid === uid)!)
        .scrap;
    expect(row('h1')).toHaveTextContent(`+${formatNumber(scrapOf('h1'))} scrap`);
    const total = scrapOf('h1') + scrapOf('h2') + scrapOf('h3');
    expect(screen.getByTestId('junk-total')).toHaveTextContent(`+${formatNumber(total)} scrap`);
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 3');
  });

  it('A on a row keeps it back (pressed), again lets it go; the total and the count follow', () => {
    render(<JunkSheet uids={['h1', 'h2', 'h3']} onClose={vi.fn()} />);
    fireEvent.click(row('h2'));
    expect(row('h2')).toHaveAttribute('aria-pressed', 'true');
    expect(row('h2')).toHaveTextContent('Kept');
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 2');
    fireEvent.click(row('h2'));
    expect(row('h2')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 3');
  });

  it('Y salvages the rest through the store (its Undo offered), then closes and says what it gave', () => {
    const onClose = vi.fn();
    render(
      <>
        <JunkSheet uids={['h1', 'h2', 'h3']} onClose={onClose} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(row('h2'));
    padPress('y');
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['h2']);
    expect(store().profile.scrap).toBeGreaterThan(0);
    expect(store().undo).not.toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/^Salvaged 2 items · \+\d+ scrap/)).toBeInTheDocument();
  });

  it('keeping every one back turns Salvage off and says why; Back closes and melts nothing', () => {
    const onClose = vi.fn();
    render(<JunkSheet uids={['h1']} onClose={onClose} />);
    fireEvent.click(row('h1'));
    expect(screen.getByTestId('junk-salvage')).toBeDisabled();
    expect(screen.getByTestId('junk-sheet')).toHaveTextContent('Everything is kept back');
    fireEvent.click(
      within(screen.getByTestId('junk-sheet')).getByRole('button', { name: /back/i }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(store().profile.bag).toHaveLength(3);
  });

  it('the sheet is a wrapping list, its first row the first focus', () => {
    render(<JunkSheet uids={['h1', 'h2']} onClose={vi.fn()} />);
    expect(screen.getByTestId('junk-sheet')).toHaveAttribute('data-pad-wrap');
    expect(row('h1')).toHaveAttribute('data-pad-first');
    expect(row('h1')).toHaveFocus();
  });
});
