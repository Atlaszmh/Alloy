import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { useDelveStore, UNDO_MS } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useUIStore } from '@/stores/uiStore';
import { ONBOARDING } from '../../../onboarding';
import { ToastContainer } from '@/components/Toast';
import type { Prompt } from '../../../kit';
import { LoadoutTab } from '../LoadoutTab';
import type { HubTabProps } from '../../types';
import { getDelveRegistry } from '../../../registry';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
const gear = (uid: string, slot: 'helm' | 'ring', mana: 'fire' | 'storm' = 'fire') =>
  generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot, mana }, new SeededRNG(4));
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};
/** Put in the bag a copy of the worn uncommon sword with Split III in its first Primary move. */
const putRunedSword = (uid: string) => {
  const p = store().profile;
  const worn = p.equipped.weapon!;
  const chain = worn.moveset!.chains.primary!;
  const runed = [{ ...chain.moves[0], runes: [{ id: 'split', tier: 3 as const }] }];
  const held: GearItem = {
    ...worn,
    uid,
    moveset: {
      ...worn.moveset!,
      chains: { ...worn.moveset!.chains, primary: { ...chain, moves: runed } },
    },
  };
  expect(held.rarity).toBe('uncommon');
  store().setProfile({ ...p, bag: [held] });
};
const open = (over: Partial<HubTabProps> = {}) => {
  const props: HubTabProps = {
    mode: 'anvil',
    setPrompts: vi.fn(),
    setFooterAction: vi.fn(),
    go: vi.fn(),
    onDelve: vi.fn(),
    ...over,
  };
  const view = render(
    <>
      <LoadoutTab {...props} />
      <ToastContainer />
    </>,
  );
  return { props, unmount: view.unmount };
};
/** The prompts the tab set last. */
const prompts = (p: HubTabProps): Prompt[] => vi.mocked(p.setPrompts).mock.lastCall![0];
const prompt = (p: HubTabProps, id: string) => prompts(p).find((x) => x.id === id)!;
/** The bag tile of item `uid`, by its name. */
const tile = (uid: string) =>
  screen
    .getAllByTestId('bag-item')
    .find((t) =>
      t
        .getAttribute('aria-label')!
        .startsWith(store().profile.bag.find((i) => i.uid === uid)!.name),
    )!;

describe('LoadoutTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
    useDelveStore.setState({ bindDeclined: [] });
    useInputDeviceStore.getState().setDevice('keyboard');
  });
  afterEach(() => vi.useRealTimers());

  it("lays out the equipped, bag and compare panes in the Loadout's columns", () => {
    open();
    expect(screen.getByTestId('loadout-tab')).toHaveStyle({
      gridTemplateColumns: '430px minmax(0, 1fr) 470px',
    });
    expect(screen.getByTestId('paper-doll')).toBeInTheDocument();
    expect(screen.getByTestId('bag-panel')).toBeInTheDocument();
  });

  it('the compare pane shows the hovered item, else the selected one, else the worn weapon', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    open();
    // A first save too: How to delve is Help now (the menu, the pause, the Codex).
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');
    expect(screen.queryByTestId('delve-howto')).toBeNull();
    fireEvent.click(tile('h1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    fireEvent.mouseEnter(tile('r1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Hovered · compared with your ring');
    // Leaving the tile (on the way to the compare pane) keeps it; a click selects anew.
    fireEvent.mouseLeave(tile('r1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Hovered · compared with your ring');
    fireEvent.click(tile('h1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    // The bag emptied, nothing is targeted: the worn weapon again.
    act(() => store().setProfile({ ...store().profile, bag: [] }));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');
    fireEvent.click(screen.getByTestId('slot-weapon'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Equipped · your weapon');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire');
  });

  it('a right-click equips; gear outside the pair asks first, with the focus on Bind', () => {
    useUIStore.setState({ seen: [] });
    put(gear('h1', 'helm'), gear('r1', 'ring', 'storm'));
    const { props } = open();
    // A first visit: Equip carries the screen's line, until an equip.
    expect(prompt(props, 'equip').hint).toBe(ONBOARDING.loadout);
    fireEvent.contextMenu(tile('h1'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(useUIStore.getState().seen).toContain('loadout');
    expect(prompt(props, 'equip').hint).toBeUndefined();
    fireEvent.contextMenu(tile('r1'));
    expect(store().profile.equipped.ring).toBeUndefined();
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('sets its prompts in the grammar (A, X, Y, R3), only Select and Full compare when paused, and clears them when it goes', () => {
    const { props, unmount } = open();
    expect(prompts(props).map((x) => [x.id, x.label, x.binding])).toEqual([
      ['select', 'Select', { mouse: 'click', pad: 'a' }],
      ['equip', 'Equip', { mouse: 'rmb', pad: 'a' }],
      ['salvage', 'Salvage', { key: 'Delete', pad: 'x' }],
      ['lock', 'Lock', { key: 'KeyL', pad: 'y' }],
      ['compare', 'Full compare', { key: ['ShiftLeft', 'ShiftRight'], pad: 'rs' }],
    ]);
    expect(prompts(props).some((x) => x.id === 'to-actions' || x.id === 'to-bag')).toBe(false);
    unmount();
    expect(props.setPrompts).toHaveBeenLastCalledWith([]);
    const paused = open({ mode: 'pause' }).props;
    expect(prompts(paused).map((x) => x.id)).toEqual(['select', 'compare']);
  });

  it('L locks and Del salvages the hovered or selected item, and nothing else', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open();
    act(() => prompt(props, 'lock').onPress!()); // nothing hovered or selected
    expect(store().profile.bag.some((i) => i.locked)).toBe(false);
    fireEvent.mouseEnter(tile('h1'));
    act(() => prompt(props, 'lock').onPress!());
    expect(store().profile.bag.find((i) => i.uid === 'h1')!.locked).toBe(true);
    act(() => prompt(props, 'salvage').onPress!()); // locked: kept
    expect(store().profile.bag).toHaveLength(2);
    act(() => prompt(props, 'lock').onPress!());
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['r1']);
  });

  it('under the pad the actions take the selected item only, and a device switch forgets the hover', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open();
    fireEvent.mouseEnter(tile('h1'));
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    fireEvent.focus(tile('r1'));
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['h1']);
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    expect(screen.queryByText(/Hovered/)).toBeNull();
  });

  it('under the pad one A prompt names what A does on the focused tile, and carries the guided-start target', () => {
    put(gear('h1', 'helm'), rareSword('w1'));
    const { props } = open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    act(() => tile('h1').focus());
    expect(
      prompts(props)
        .filter((x) => x.binding.pad === 'a')
        .map((x) => [x.label, x.tutorial]),
    ).toEqual([['Equip', 'loadout.equip']]);
    expect(prompt(props, 'salvage').tutorial).toBe('loadout.salvage');
    // A bag weapon that can take your moveset: A opens the take sheet, the prompt says so.
    act(() => tile('w1').focus());
    expect(
      prompts(props)
        .filter((x) => x.binding.pad === 'a')
        .map((x) => [x.label, x.tutorial]),
    ).toEqual([['Equip or transfer', 'loadout.transfer']]);
    // Under the keys no prompt carries a target: the pane's buttons do.
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    expect(prompts(props).every((x) => x.tutorial === undefined)).toBe(true);
  });

  it('on a worn tile X unequips and A only selects', () => {
    const { props } = open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    act(() => screen.getByTestId('slot-weapon').focus());
    // Focus selects a worn item under the pad: the pane shows it.
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Equipped · your weapon');
    expect(
      prompts(props)
        .filter((x) => x.binding.pad === 'a')
        .map((x) => x.label),
    ).toEqual(['Select']);
    expect(prompt(props, 'salvage').label).toBe('Unequip');
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.equipped.weapon).toBeUndefined();
  });

  it('a locked item turns X off, and Y unlocks it', () => {
    put(gear('h1', 'helm'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    act(() => prompt(props, 'lock').onPress!());
    expect(prompt(props, 'salvage').disabled).toBe(true);
    act(() => prompt(props, 'salvage').onPress?.());
    expect(store().profile.bag).toHaveLength(1);
    act(() => prompt(props, 'lock').onPress!());
    expect(prompt(props, 'salvage').disabled).toBe(false);
  });

  it('under the pad A on a bag weapon that can take your moveset opens the take sheet; any other item equips', () => {
    put(gear('h1', 'helm'), rareSword('w1'));
    open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    fireEvent.click(tile('h1')); // A presses the focused tile
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    fireEvent.click(tile('w1'));
    expect(screen.getByTestId('take-sheet')).toBeInTheDocument();
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
  });

  it("R3 (or Shift) toggles Full compare: every stat line and a weapon's moveset", () => {
    put(rareSword('w1'));
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    act(() => prompt(props, 'compare').onPress!());
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    act(() => prompt(props, 'compare').onPress!());
    expect(screen.queryByTestId('item-moveset')).toBeNull();
  });

  it('X salvages a precious item at once, and says the Links it gave', () => {
    // Two Primary slots bought on it: a Link each on salvage (the constructs spec §3.2).
    const w = rareSword('w1', { primary: 4 });
    put({ ...w, moveset: { ...w.moveset!, bought: { primary: 2 } } });
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      /^Salvage · \+2 Links · \+\d+ scrap/,
    );
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });

  it("Salvage names what becomes of a weapon's runes on its button, and melts at once", () => {
    useDelveStore.setState({ unsocket: null });
    putRunedSword('w2');
    open({ link: { tab: 'loadout', uid: 'w2' } });
    // The pull rule 'pay' as shipped; 'destroy' under the dev override.
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Split III back to your pouch');
    act(() => store().setUnsocket('destroy'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('destroys Split III');
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Split III back to your pouch');
    expect(screen.getByTestId('salvage-button')).not.toHaveTextContent('Press again');
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
  });

  it('for 5 s the footer offers Undo on B and Ctrl+Z; it puts the item back, and goes when the time is up', () => {
    vi.useFakeTimers();
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['r1']);
    expect(prompt(props, 'undo')).toMatchObject({
      label: 'Undo salvage',
      binding: { key: 'KeyZ', ctrl: true, pad: 'b' },
    });
    act(() => prompt(props, 'undo').onPress!());
    expect(
      store()
        .profile.bag.map((i) => i.uid)
        .sort(),
    ).toEqual(['h1', 'r1']);
    expect(screen.getByText('Salvage undone')).toBeInTheDocument();
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
    // Again, and let the time run out.
    act(() => prompt(props, 'salvage').onPress!());
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(true);
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
  });

  it('another change to the save takes the Undo away (a lock, an equip)', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    act(() => prompt(props, 'salvage').onPress!());
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(true);
    fireEvent.contextMenu(tile('r1'));
    expect(store().profile.equipped.ring?.uid).toBe('r1');
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
  });

  it('paused, no Undo is offered', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    act(() => {
      store().salvage(['h1']);
    });
    const { props } = open({ mode: 'pause' });
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
  });

  it('paused, dive finds carry NEW and their actions are notes', () => {
    put(gear('h1', 'helm'));
    store().markNew(['h1']);
    store().startDive(1);
    const { props } = open({ mode: 'pause', link: { tab: 'loadout', uid: 'h1' } });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Locked during the dive');
    expect(prompts(props).map((p) => p.label)).toEqual(['Inspect', 'Full compare']);
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(tile('h1')).toHaveAccessibleName(expect.stringMatching(/, new$/));
  });
});
