import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { Fuse } from '../Fuse';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const split = { id: 'split', tier: 3 } as const;
/** A rare sword (Basic, Primary and Defensive) at its base slots. */
const rareSword = (uid: string): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire') };
};
/** `w` with its Primary's first move holding Split III. */
const withSplit = (w: GearItem): GearItem => {
  const moveset = w.moveset!;
  const primary = moveset.chains.primary!;
  const moves = [{ ...primary.moves[0], runes: [split] }, ...primary.moves.slice(1)];
  return {
    ...w,
    moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
  };
};

describe('Fuse (Alloy Fusion)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('asks first when an input holds runes, naming what becomes of them', async () => {
    store().setProfile({
      ...store().profile,
      scrap: 9999,
      bag: [withSplit(rareSword('a')), rareSword('b'), rareSword('c')],
    });
    render(<Fuse onResult={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    fireEvent.click(screen.getByText('Auto-pick'));
    fireEvent.click(screen.getByTestId('fuse-button'));
    expect(store().profile.bag).toHaveLength(3);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent(
      'Tap again to fuse · destroys Split III',
    );
    await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
    expect(store().profile.bag.map((i) => i.rarity)).toEqual(['epic']);
  });

  it('prices the fusion in scrap, and a click on the result tempers it', async () => {
    store().setProfile({
      ...store().profile,
      scrap: 9999,
      bag: [rareSword('a'), rareSword('b'), rareSword('c')],
    });
    const onResult = vi.fn();
    render(<Fuse onResult={onResult} />);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent('Pick 3 items');
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    for (const t of screen.getAllByTestId('fuse-candidate')) fireEvent.click(t);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent(/^Fuse · [\d,]+ scrap$/);
    await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
    const made = store().profile.bag[0];
    expect(made.rarity).toBe('epic');
    fireEvent.click(within(screen.getByTestId('fusion-result')).getByRole('button'));
    expect(onResult).toHaveBeenCalledWith(made.uid);
    expect(HTMLElement.prototype.animate).toHaveBeenCalled(); // the inputs converge
  });

  it('under reduced motion, fuses without the converging tiles or the pop', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' })),
    );
    try {
      store().setProfile({
        ...store().profile,
        scrap: 9999,
        bag: [rareSword('a'), rareSword('b'), rareSword('c')],
      });
      render(<Fuse onResult={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
      fireEvent.click(screen.getByText('Auto-pick'));
      await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
      await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
      expect(store().profile.bag.map((i) => i.rarity)).toEqual(['epic']);
      expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says what it needs when the purse is short', () => {
    store().setProfile({
      ...store().profile,
      scrap: 0,
      bag: [rareSword('a'), rareSword('b'), rareSword('c')],
    });
    render(<Fuse onResult={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    for (const t of screen.getAllByTestId('fuse-candidate')) fireEvent.click(t);
    const fuse = screen.getByTestId('fuse-button');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription(/^Needs [\d,]+ scrap$/);
  });
});
