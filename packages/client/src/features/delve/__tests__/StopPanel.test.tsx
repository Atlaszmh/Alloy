import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
  SeededRNG,
  upgradeCost,
  type Chains,
  type StopKind,
} from '@alloy/engine';
import { StopPanel } from '../StopPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const helm = generateItem(
  registry,
  { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
  new SeededRNG(4),
);

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
      <>
        <StopPanel stop={stop} />
        <ToastContainer />
      </>
    );
  };
  return render(<Panel />);
}

describe('StopPanel (the door screen)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('shows the offered kinds as cards, and once one is taken, says so', () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('stop')).toHaveTextContent('A power-up: take one, or skip it');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('Equip');
    expect(screen.getByTestId('stop-upgrade')).toHaveTextContent('Upgrade');
    expect(screen.queryByTestId('stop-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-picker')).toHaveAttribute('data-pad-scope');
    // Over the whole screen (not inside the door list), with the pad's back button.
    expect(screen.getByTestId('stop-picker').parentElement).toBe(document.body);
    expect(screen.getByText('Back')).toHaveAttribute('data-pad-back');
    fireEvent.click(screen.getByText('Back'));
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
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
      'Primary 1/5 · + a slot · 🔗 1 · ⚙ 20',
    );
    expect(screen.getByTestId('stop-slot-basic')).toBeDisabled(); // its 4th slot: 3 Links
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
    expect(screen.getByTestId('stop-move-take')).toHaveTextContent("Change Primary's move 1 · ✦ 5");
    fireEvent.click(screen.getByTestId('stop-move-take'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(chains().basic[0].kind).toBe('light');
    expect(store().profile.manaDust).toBe(15);
    expect(store().profile.dive!.stop!.taken).toBe(true);
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
});
