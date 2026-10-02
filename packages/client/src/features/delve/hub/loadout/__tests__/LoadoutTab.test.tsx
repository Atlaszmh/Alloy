import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
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

  it('the compare pane shows the hovered item, else the selected one, else the how-to on a first save, else the worn weapon', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    open();
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
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
    act(() => {
      const p = store().profile;
      store().setProfile({ ...p, bag: [], stats: { ...p.stats, dives: 1 } });
    });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');
    fireEvent.click(screen.getByTestId('slot-weapon'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Equipped · your weapon');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire');
  });

  it('a right-click equips; gear outside the pair asks first, with the focus on Bind', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring', 'storm'));
    open();
    fireEvent.contextMenu(tile('h1'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    fireEvent.contextMenu(tile('r1'));
    expect(store().profile.equipped.ring).toBeUndefined();
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('sets its prompts (Select, Equip, Full compare, Salvage, Lock), only Select and Full compare when paused, and clears them when it goes', () => {
    const { props, unmount } = open();
    expect(prompts(props).map((x) => [x.label, x.binding])).toEqual([
      ['Select', { mouse: 'click', pad: 'a' }],
      ['Equip', { mouse: 'rmb', pad: 'a' }],
      ['Full compare', { key: ['ShiftLeft', 'ShiftRight'], pad: 'lt', whileHeld: true }],
      ['Salvage', { key: 'Delete', pad: 'x' }],
      ['Lock', { key: 'KeyL', pad: 'y' }],
    ]);
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

  it("under the pad RT jumps to the compare pane's first action, and B from there goes back to the tile", () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open();
    expect(prompts(props).some((x) => x.id === 'to-actions')).toBe(false); // the pad's only
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    act(() => tile('r1').focus());
    expect(prompt(props, 'to-actions').binding).toEqual({ pad: 'rt' });
    expect(prompts(props).some((x) => x.id === 'to-bag')).toBe(false);
    act(() => prompt(props, 'to-actions').onPress!());
    expect(screen.getByTestId('equip-button')).toHaveFocus();
    expect(prompt(props, 'to-bag').binding).toEqual({ pad: 'b' });
    act(() => prompt(props, 'to-bag').onPress!());
    expect(tile('r1')).toHaveFocus();
    expect(prompts(props).some((x) => x.id === 'to-bag')).toBe(false);
  });

  it("holding Full compare shows every stat line and a weapon's moveset", () => {
    put(rareSword('w1'));
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    act(() => prompt(props, 'compare').onHold!(true));
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    act(() => prompt(props, 'compare').onHold!(false));
    expect(screen.queryByTestId('item-moveset')).toBeNull();
  });

  it('a precious item salvages on a second press within 2 s, and says the Links it gave', () => {
    vi.useFakeTimers();
    // Three extra Primary slots: two Links past the one a rare forge grants free.
    put(rareSword('w1', { primary: 4 }));
    open({ link: { tab: 'loadout', uid: 'w1' } });
    const salvage = () => fireEvent.click(screen.getByTestId('salvage-button'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      /^Salvage · \+2 Links · \+\d+ scrap/,
    );
    salvage();
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Press again to melt');
    act(() => vi.advanceTimersByTime(2001));
    expect(screen.getByTestId('salvage-button')).not.toHaveTextContent('Press again');
    salvage();
    expect(store().profile.bag).toHaveLength(1);
    salvage();
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });

  it('Salvage asks first for any weapon holding runes, naming what becomes of them by the pull rule', () => {
    useDelveStore.setState({ unsocket: null });
    const p = store().profile;
    const worn = p.equipped.weapon!;
    const chain = worn.moveset!.chains.primary!;
    const runed = [{ ...chain.moves[0], runes: [{ id: 'split', tier: 3 as const }] }];
    const held: GearItem = {
      ...worn,
      uid: 'w2',
      moveset: {
        ...worn.moveset!,
        chains: { ...worn.moveset!.chains, primary: { ...chain, moves: runed } },
      },
    };
    expect(held.rarity).toBe('common');
    store().setProfile({ ...p, bag: [held] });
    open({ link: { tab: 'loadout', uid: 'w2' } });
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(1);
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      'Press again to melt · destroys Split III',
    );
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      'Press again to melt · Split III back to your pouch',
    );
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
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
