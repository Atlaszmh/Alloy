import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { profileStats, strikeInterval, type Blow } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { EquippedPane } from '../EquippedPane';

const store = () => useDelveStore.getState();
const open = () => {
  const props = { selected: null, onSelect: vi.fn(), go: vi.fn() };
  render(<EquippedPane {...props} />);
  return props;
};

describe('the equipped pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'frost');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
    useInputDeviceStore.setState({ device: 'keyboard' });
  });

  it('draws the paper doll round the hero on the anvil, each slot labelled', () => {
    open();
    const doll = screen.getByTestId('paper-doll');
    const slots = within(doll)
      .getAllByTestId(/^slot-/)
      .map((t) => t.dataset.testid);
    expect(slots).toEqual([
      'slot-weapon',
      'slot-gloves',
      'slot-ring',
      'slot-helm',
      'slot-amulet',
      'slot-chest',
      'slot-boots',
    ]);
    expect(within(doll).getByRole('img', { name: 'Your hero' })).toBeInTheDocument();
    expect(within(doll).getByRole('button', { name: /Empty helm slot/ })).toBeInTheDocument();
    expect(doll).toHaveTextContent('EquippedFrost');
  });

  it("shows the hero's damage, life, attack speed, armor, mana and regen", () => {
    open();
    expect(screen.getByTestId('loadout-stats')).toHaveTextContent(
      /^Damage\d[\d.k]*Life\d+Attack speed\d+\.\d\d\/sArmor\d+Mana\d+Regen\d+\.\d\/s$/,
    );
  });

  it("the attack speed is the engine's, a blow's Quick rune counted", () => {
    const p = store().profile;
    const weapon = p.equipped.weapon!;
    const quick = weapon.moveset!.chains.basic!.map(
      (b): Blow => ({
        ...b,
        runes: [{ id: 'quick', tier: 3 }],
      }),
    );
    const equipped = {
      ...p.equipped,
      weapon: {
        ...weapon,
        moveset: {
          ...weapon.moveset!,
          chains: { ...weapon.moveset!.chains, basic: quick },
        },
      },
    };
    store().setProfile({ ...p, equipped });
    open();
    const stats = profileStats(getDelveRegistry(), { equipped, pair: p.pair });
    expect(screen.getByTestId('loadout-stats')).toHaveTextContent(
      `Attack speed${(1 / strikeInterval(stats)).toFixed(2)}/s`,
    );
  });

  it("the attunement block shows the pair's and opens the Mana view on Skills", () => {
    const props = open();
    const strip = screen.getByTestId('mana-strip');
    // A button holds phrasing content only, and no text is drawn under the kit's 14 px.
    expect(strip.querySelector('div')).toBeNull();
    expect(
      strip.querySelector('.text-xs, [class*="text-[10px]"], [class*="text-[12px]"]'),
    ).toBeNull();
    expect(strip).toHaveTextContent('Skills ›');
    expect(within(strip).getByTestId('attune-frost')).toBeInTheDocument();
    expect(within(strip).queryByTestId('attune-fire')).toBeNull();
    // Compact, so the moveset box fits at 1080p with two elements: no pool line (the stats show
    // Mana and Regen) and no line under each element (the Mana view has them).
    expect(within(strip).queryByTestId('mana-pool')).toBeNull();
    expect(strip).not.toHaveTextContent('At 10');
    fireEvent.click(strip);
    expect(props.go).toHaveBeenCalledWith({ tab: 'skills', view: 'mana' });
  });

  it("counts the weapon's slots of each skill's cap, and opens Skills", () => {
    const props = open();
    const box = screen.getByTestId('loadout-moveset');
    expect(box).toHaveTextContent(`Moveset · ${store().profile.equipped.weapon!.name}`);
    // The common sword carries Basic and Primary.
    expect(screen.getByTestId('loadout-moveset-basic')).toHaveTextContent('Basic 3/5');
    expect(screen.getByTestId('loadout-moveset-primary')).toHaveTextContent('Primary 1/5');
    expect(screen.getByTestId('loadout-moveset-defensive')).toHaveTextContent('Defensive —');
    fireEvent.click(within(box).getByRole('button', { name: 'Skills ›' }));
    expect(props.go).toHaveBeenCalledWith({ tab: 'skills' });
  });

  it('a worn tile shows its card on hover, and a click selects it', () => {
    const props = open();
    const weapon = store().profile.equipped.weapon!;
    const tile = screen.getByTestId('slot-weapon');
    fireEvent.mouseEnter(tile);
    expect(screen.getByRole('tooltip')).toHaveTextContent(weapon.name);
    fireEvent.mouseLeave(tile);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(tile);
    expect(props.onSelect).toHaveBeenCalledWith(weapon.uid);
  });

  it('under the pad focus on a worn tile selects it, and no card shows', () => {
    useInputDeviceStore.setState({ device: 'gamepad' });
    const props = open();
    const weapon = store().profile.equipped.weapon!;
    const tile = screen.getByTestId('slot-weapon');
    fireEvent.focus(tile);
    expect(props.onSelect).toHaveBeenCalledWith(weapon.uid);
    fireEvent.mouseEnter(tile);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("the attunement strip and the moveset's Skills › are off the D-pad: LB/RB reach Skills", () => {
    open();
    expect(screen.getByTestId('mana-strip').closest('[data-pad-skip]')).not.toBeNull();
    const box = screen.getByTestId('loadout-moveset');
    expect(within(box).getByRole('button', { name: 'Skills ›' })).toHaveAttribute('data-pad-skip');
  });
});
