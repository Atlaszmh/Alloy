import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { bindSecondary, generateItem, profilePower, SeededRNG, type ManaType } from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const helm = (mana: ManaType) =>
  generateItem(
    registry,
    { uid: `h-${mana}`, ilvl: 1, rarity: 'common', slot: 'helm', mana },
    new SeededRNG(1),
  );

describe('the Mana view (the Anvil, Abilities tab)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('binds a second element you own gear in, after a confirmation that shows the Power', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-primary')).toHaveTextContent('Fire');
    expect(screen.getByTestId('pair-secondary')).toHaveTextContent('No second element yet');
    expect(screen.queryByTestId('mana-bind-nature')).toBeNull(); // no nature gear
    fireEvent.click(screen.getByTestId('mana-bind-storm'));
    expect(screen.getByTestId('mana-bind-storm')).toHaveTextContent('Power');
    fireEvent.click(screen.getByTestId('mana-bind-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(screen.getByTestId('overtake')).toHaveTextContent('to overtake Fire');
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(2); // the pair's bars only
  });

  it('says a bind gives the last blow only while the basic chain is its default', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    const { unmount } = render(<AbilitiesPanel />);
    expect(screen.getByTestId('bind-section')).toHaveTextContent(
      "your basic chain's last blow strikes with it",
    );
    unmount();
    store().setChain('basic', [{ kind: 'heavy', element: 'fire' }]);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('bind-section')).toHaveTextContent('keeps the blows you built');
    expect(screen.getByTestId('bind-section')).not.toHaveTextContent('last blow');
  });

  it('shows the Mana Dust, and realigns for its cost', () => {
    const { realignDust, realignScrap } = registry.getDelveBalance().pair;
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: realignDust,
      scrap: realignScrap,
    });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('mana-dust')).toHaveTextContent(`✦ ${realignDust} Mana Dust`);
    expect(screen.getByTestId('realign-button')).toBeDisabled(); // nothing changed yet
    fireEvent.click(screen.getByTestId('realign-secondary-nature'));
    fireEvent.click(screen.getByTestId('realign-button'));
    expect(store().profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
  });

  it('realign swaps the two: both elements go to the engine', () => {
    const { realignDust, realignScrap } = registry.getDelveBalance().pair;
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: realignDust,
      scrap: realignScrap,
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('realign-primary-storm'));
    expect(screen.getByTestId('realign-button')).toBeDisabled(); // storm twice
    fireEvent.click(screen.getByTestId('realign-secondary-fire'));
    fireEvent.click(screen.getByTestId('realign-button'));
    expect(store().profile).toMatchObject({
      pair: { primary: 'storm', secondary: 'fire' },
      manaDust: 0,
      scrap: 0,
    });
  });

  it('the overtake bar stays empty while the secondary has no attunement', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('overtake')).toHaveTextContent('Storm 0 /');
    expect(screen.getByTestId('overtake-bar').style.width).toBe('0%');
  });

  it('binding and realigning wait for the dive to end, and say so', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    store().unequip('chest'); // under 1000 Power: the chip's whole number shows the bind's change
    // Binding Storm between dives gives this Power; mid-dive the preview still shows it.
    const bound = profilePower(registry, bindSecondary(registry, store().profile, 'storm').profile);
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-locked')).toHaveTextContent('between dives');
    expect(screen.getByTestId('mana-bind-storm')).toBeDisabled();
    expect(screen.getByTestId('mana-bind-storm')).toHaveTextContent(
      new RegExp(`Power ${formatNumber(bound)}$`),
    );
  });

  it('realign waits for the dive to end too', () => {
    const { realignDust, realignScrap } = registry.getDelveBalance().pair;
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: realignDust,
      scrap: realignScrap,
    });
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-locked')).toBeInTheDocument();
    expect(screen.getByTestId('realign-secondary-nature')).toBeDisabled();
    expect(screen.getByTestId('realign-button')).toBeDisabled();
  });

  it('the element picker offers only the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('element-fire')).toBeInTheDocument();
    expect(screen.getByTestId('element-storm')).toBeInTheDocument();
    expect(screen.queryByTestId('element-frost')).toBeNull();
    expect(screen.getByTestId('infusion-storm')).toBeInTheDocument();
    expect(screen.queryByTestId('infusion-nature')).toBeNull();
  });
});
