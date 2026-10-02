import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
  pouchCount,
  SeededRNG,
  upgradeCost,
  type Chains,
  type StopKind,
} from '@alloy/engine';
import { StopPanel } from '../StopPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { pricedRegistry } from '../runes/__tests__/priced-registry';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const helm = generateItem(
  registry,
  { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
  new SeededRNG(4),
);
const back = () => screen.getByRole('button', { name: 'Back' });

/** At the door screen after depth 1, a stop offering `offers`; the panel reads the store's. */
function atStop(offers: StopKind[], over: Partial<ReturnType<typeof store>['profile']> = {}) {
  store().setProfile({ ...store().profile, bag: [helm], ...over });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: { ...dive, phase: 'choosing', stop: { offers, taken: false } },
  });
  const Panel = () => {
    const stop = useDelveStore((s) => s.profile.dive!.stop!);
    return (
      <div data-pad-scope>
        <StopPanel stop={stop} />
        <button data-testid="door-first">The first door</button>
        <ToastContainer />
      </div>
    );
  };
  return render(<Panel />);
}

describe('StopPanel (the stop between depths)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('shows the offered kinds as cards that expand in place to their picker, and once one is taken, says so', () => {
    atStop(['equip', 'upgrade']);
    const stop = screen.getByTestId('stop');
    expect(stop).toHaveTextContent('Take one power-up');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('Equip');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('PriceFree');
    expect(screen.getByTestId('stop-upgrade')).toHaveTextContent('Upgrade');
    expect(screen.queryByTestId('stop-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    // In place of the cards, inside the stop: its own pad scope, with the pad's back button.
    const picker = screen.getByTestId('stop-picker');
    expect(stop).toContainElement(picker);
    expect(screen.queryByTestId('stop-upgrade')).toBeNull();
    expect(picker).toHaveAttribute('data-pad-scope');
    expect(back()).toHaveAttribute('data-pad-back');
    fireEvent.click(back());
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });

  it('Back has the focus; Escape closes the picker, and the focus returns to its card', () => {
    atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const picker = screen.getByRole('group', { name: 'Upgrade' });
    expect(back()).toHaveFocus();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByTestId('stop-upgrade')).toHaveFocus();
  });

  it('after a take, the focus goes on to the first door, not the card that has gone', () => {
    atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.getByTestId('door-first')).toHaveFocus();
  });

  it('a weapon to equip brings its own moves, which the picker says', () => {
    const sword = store().profile.equipped.weapon!;
    atStop(['equip'], { bag: [helm, { ...sword, uid: 'w2' }] });
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-equip-weapon-note')).toHaveTextContent(
      `A weapon brings its own moves; yours stay on ${sword.name}.`,
    );
  });

  it("adds a slot to a chain at its price; one it can't pay for is off", () => {
    atStop(['slot'], { links: 1, scrap: 20 });
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(screen.getByTestId('stop-slot-primary')).toHaveTextContent(
      'Primary 1/5 · + a slot · 1 Link · 20 scrap',
    );
    const basic = screen.getByTestId('stop-slot-basic');
    expect(basic).toBeDisabled(); // its 4th slot: 3 Links
    // It says why, in the engine's words.
    const why = document.getElementById(basic.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent('Not enough Links');
    expect(screen.getByTestId('stop-slot-primary')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('stop-slot-defensive')).toBeNull(); // not carried
    fireEvent.click(screen.getByTestId('stop-slot-primary'));
    expect(chains().primary.moves).toHaveLength(2);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it('adjusts one move: a later change replaces an earlier one, at its price', () => {
    const p = store().profile;
    // A two-slot Primary holding one move: a free builder would offer to add one.
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const weapon = { ...sword, moveset: { ...moveset, slots: { ...moveset.slots, primary: 2 } } };
    atStop(['move'], {
      manaDust: 20,
      stats: { ...p.stats, dives: 1 },
      equipped: { ...p.equipped, weapon },
    });
    fireEvent.click(screen.getByTestId('stop-move'));
    expect(screen.getByTestId('stop-move-take')).toBeDisabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('attune-fire')).toBeNull(); // no attunement bars either
    // A blow of the basic chain, then the Primary's Bolt: only the Bolt's change is taken.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('chain-skill-primary'));
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(screen.getByTestId('stop-move-take')).toHaveTextContent(
      "Change Primary's move 1 · 5 Mana Dust",
    );
    fireEvent.click(screen.getByTestId('stop-move-take'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(chains().basic[0].kind).toBe('light');
    expect(store().profile.manaDust).toBe(15);
    expect(store().profile.dive!.stop!.taken).toBe(true);
  });

  it("a move it can't pay for is off, and says why", () => {
    const p = store().profile;
    atStop(['move'], { manaDust: 4, stats: { ...p.stats, dives: 1 } });
    fireEvent.click(screen.getByTestId('stop-move'));
    fireEvent.click(screen.getByTestId('form-lance'));
    const take = screen.getByTestId('stop-move-take');
    expect(take).toBeDisabled();
    const why = document.getElementById(take.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent('Not enough Mana Dust');
  });

  it('an unaffordable upgrade is dimmed, and taking it says why, keeping the stop open', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost - 1 });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const tile = screen.getByRole('button', {
      name: `Upgrade ${helm.name} for ${cost} scrap`,
    });
    expect(tile).toHaveStyle({ opacity: '0.35' });
    fireEvent.click(tile);
    expect(screen.getByTestId('stop-picker')).toHaveTextContent('Not enough scrap');
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });

  it('upgrades an item, worn or in the bag, at its price', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const items = screen.getAllByTestId('stop-upgrade-item');
    expect(items.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: `Upgrade ${helm.name} for ${cost} scrap` }));
    expect(store().profile.bag[0].upgrade).toBe(1);
    expect(store().profile.scrap).toBe(0);
  });

  /** At a stop offering a rune: the sword's Bolt has one open, empty socket. */
  function atRuneStop() {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes: [null] }];
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    atStop(['rune'], {
      equipped: { ...p.equipped, weapon },
      runes: { split: [1, 0, 0, 0, 0], widen: [1, 0, 0, 0, 0] },
    });
    fireEvent.click(screen.getByTestId('stop-rune'));
    const move = screen.getByTestId('stop-rune-move-primary-0');
    expect(move).toHaveTextContent('Primary · light Fire Bolt');
    fireEvent.click(within(move).getByRole('button', { name: 'Socket 1: empty' }));
    return within(screen.getByTestId('rune-picker'));
  }

  it('sockets a fitting pouch rune into an empty socket, free, and the focus goes on to the doors', () => {
    const picker = atRuneStop();
    // Inline, inside the stop's picker: no sheet over the screen.
    expect(screen.getByTestId('stop-picker')).toContainElement(screen.getByTestId('rune-picker'));
    // Widen doesn't fit a Bolt.
    expect(picker.queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker.getByRole('button', { name: 'Split I ×1' }));
    expect(chains().primary.moves[0].runes).toEqual([{ id: 'split', tier: 1 }]);
    expect(pouchCount(store().profile.runes, { id: 'split', tier: 1 })).toBe(0);
    expect(store().profile.dive!.stop!.taken).toBe(true);
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.getByText('Socket a rune: done')).toBeInTheDocument();
    expect(screen.getByTestId('door-first')).toHaveFocus();
  });

  it("prices a rune in the saved chain's payment, eased by the move's attunement", () => {
    pricedRegistry();
    const picker = atRuneStop();
    // Split I's 0.27, eased 6% by the starting sword's and chest's 2 Fire.
    expect(picker.getByTestId('rune-pick-split')).toHaveTextContent('+25% cost');
  });

  it("Escape closes the rune picker, not the stop's", () => {
    atRuneStop();
    fireEvent.keyDown(screen.getByTestId('rune-picker'), { key: 'Escape' });
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });
});
