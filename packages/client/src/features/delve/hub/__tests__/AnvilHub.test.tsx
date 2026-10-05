import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AnvilHub } from '../AnvilHub';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { padHint } from '@/features/controls/controls';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { padPrompts } from '@/features/delve/kit/prompts';
import { SAMPLE_QUESTS } from '../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../quests/types';
import { generateItem, SeededRNG } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

/** The quests the hub's `useQuests` gives (the engine's own come with B1). */
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../quests/useQuests', () => {
  const setTracked = () => {};
  return { useQuests: () => ({ quests: shown.quests, setTracked }) };
});

const renderHub = () =>
  render(
    <MemoryRouter>
      <AnvilHub mode="anvil" />
    </MemoryRouter>,
  );
/** The hub's own tabs (the chain builder has tabs of its own). */
const hubTabs = () =>
  within(screen.getByRole('tablist', { name: 'The Anvil' })).getAllByRole('tab');
const selected = () =>
  hubTabs()
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.getAttribute('data-testid'));
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
/** A key press as the window hears it. */
const press = (code: string) => boxed(() => void fireEvent.keyDown(document.body, { code }));
let padClock = 0;
/** A pad button's tap as the prompts hear it (pressed, then let go); true when a prompt took it. */
const padPress = (button: PadButton) => {
  const held = (on?: PadButton) =>
    Object.fromEntries(PAD_BUTTONS.map((b) => [b, b === on])) as Record<PadButton, boolean>;
  let took = false;
  boxed(() =>
    act(() => {
      took = padPrompts(new Set([button]), held(button), (padClock += 1000)).has(button);
      padPrompts(new Set(), held(), padClock + 50);
    }),
  );
  return took;
};
/** The footer's Delve, pressed: the Depart sheet opens. */
const openSheet = () => fireEvent.click(screen.getByTestId('depart-button'));
/** The Depart sheet's Back. */
const sheetBack = () =>
  screen.getByTestId('depart-sheet').querySelector<HTMLElement>('[data-pad-back]')!;

describe('AnvilHub', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    shown.quests = [];
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it("Loadout's tab counts the new finds as a NEW pip", () => {
    useDelveStore.setState({ newUids: { a: true, b: true } });
    renderHub();
    const pip = screen.getByTestId('tab-loadout').querySelector('.k-tab-badge')!;
    expect(pip).toHaveTextContent(/^NEW 2$/);
    expect(pip.querySelector('[aria-label="2 new"]')).not.toBeNull();
  });

  it("Quests' tab counts the quests to claim, and the Depart sheet's count opens it", () => {
    const [main, side, other] = SAMPLE_QUESTS;
    shown.quests = [{ ...main, status: 'complete' }, { ...side, status: 'complete' }, other];
    renderHub();
    const pip = screen.getByTestId('tab-quests').querySelector('.k-tab-badge')!;
    expect(pip).toHaveTextContent(/^2$/);
    expect(pip.querySelector('[aria-label="2 to claim"]')).not.toBeNull();
    expect(screen.queryByTestId('claim-count')).toBeNull(); // the footer holds none
    openSheet();
    const count = screen.getByTestId('claim-count');
    expect(count).toHaveTextContent('2 to claim');
    fireEvent.click(count);
    expect(screen.queryByTestId('depart-sheet')).toBeNull();
    expect(selected()).toEqual(['tab-quests']);
    expect(screen.getByTestId('quest-claim')).toBeEnabled();
  });

  it('counts nothing while nothing waits to be claimed', () => {
    renderHub();
    expect(screen.getByTestId('tab-quests').querySelector('.k-tab-badge')).toBeNull();
    openSheet();
    expect(screen.queryByTestId('claim-count')).toBeNull();
  });

  it('mid-dive the pip stays, and the sheet holds no count: claims wait for the dive to end', () => {
    shown.quests = [{ ...SAMPLE_QUESTS[0], status: 'complete' }];
    useDelveStore.getState().startDive(1);
    renderHub();
    expect(screen.getByTestId('claim-pip')).toHaveTextContent('1');
    openSheet();
    expect(screen.getByTestId('delve-button')).toHaveTextContent('Resume dive');
    expect(screen.queryByTestId('claim-count')).toBeNull();
  });

  it('is a kit screen whose header holds the five tabs, the purse and Power', () => {
    renderHub();
    const hub = screen.getByTestId('hub-anvil');
    expect(hub).toHaveAttribute('data-pad-scope');
    expect(hubTabs().map((t) => t.getAttribute('data-testid'))).toEqual([
      'tab-loadout',
      'tab-skills',
      'tab-forge',
      'tab-codex',
      'tab-quests',
    ]);
    expect(selected()).toEqual(['tab-loadout']);
    expect(screen.getByRole('tablist', { name: 'The Anvil' })).toHaveAttribute('data-pad-tabs');
    expect(screen.getByTestId('scrap-count')).toHaveTextContent(/^50 scrap$/); // the starter kit's
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^0 Links$/);
    expect(screen.getByTestId('dust-count')).toHaveTextContent(/Mana Dust$/);
    expect(screen.getByTestId('hero-power')).toBeInTheDocument();
    expect(hub).toHaveTextContent('Deepest 0 · 0 of 12 legendaries');
  });

  it('shows each tab: Loadout, Skills, Forge, Codex and Quests', () => {
    shown.quests = SAMPLE_QUESTS;
    renderHub();
    expect(screen.getByTestId('paper-doll')).toBeInTheDocument();
    expect(screen.getByTestId('bag-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-skills'));
    expect(screen.getByTestId('abilities-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('reaction-unknown')).toBeNull(); // the reactions live on the Codex
    fireEvent.click(screen.getByTestId('tab-forge'));
    expect(screen.getByTestId('forge-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-codex'));
    expect(screen.getByTestId('codex-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('codex-section-reactions'));
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
    fireEvent.click(screen.getByTestId('tab-quests'));
    expect(screen.getByTestId('quest-journal')).toBeInTheDocument();
  });

  it("the Loadout's attunement line opens Skills", () => {
    renderHub();
    const strip = screen.getByTestId('mana-strip');
    expect(strip).toHaveTextContent('Skills ›');
    fireEvent.click(strip);
    expect(selected()).toEqual(['tab-skills']);
    expect(screen.getByTestId('mana-view')).toBeInTheDocument(); // the link opens the Mana view
    fireEvent.click(screen.getByTestId('tab-loadout'));
    fireEvent.click(screen.getByTestId('tab-skills'));
    expect(screen.queryByTestId('mana-view')).toBeNull(); // a plain tab change carries no link
  });

  it('each tab comes back to its selection: the bag tile and its filter', () => {
    const registry = getDelveRegistry();
    const ring = generateItem(
      registry,
      { uid: 'r1', ilvl: 3, rarity: 'magic', slot: 'ring', mana: 'fire' },
      new SeededRNG(4),
    );
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(5),
    );
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [helm, ring] });
    });
    renderHub();
    fireEvent.click(screen.getByTestId('bag-filter-jewelry'));
    const ringTile = () => screen.getAllByTestId('bag-item').find((t) => t.dataset.uid === 'r1')!;
    fireEvent.click(ringTile());
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('compared with your ring');
    // Away and back: the tab view remounts, the hub kept its selection and filter.
    fireEvent.click(screen.getByTestId('tab-skills'));
    fireEvent.click(screen.getByTestId('tab-loadout'));
    expect(screen.getByTestId('bag-filter-jewelry')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('bag-item').map((t) => t.dataset.uid)).toEqual(['r1']);
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('compared with your ring');
    // The pad lands on it: the remembered tile is the tab's first focus.
    expect(ringTile()).toHaveAttribute('data-pad-first');
  });

  it('a link wins over the memory, and a salvaged tile is forgotten', () => {
    const registry = getDelveRegistry();
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(5),
    );
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [helm] });
    });
    renderHub();
    fireEvent.click(screen.getAllByTestId('bag-item')[0]);
    fireEvent.click(screen.getByTestId('tab-skills'));
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [] });
    });
    fireEvent.click(screen.getByTestId('tab-loadout'));
    // The salvaged tile is forgotten: nothing is selected, so the pane shows the worn weapon.
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');
  });

  it("the footer draws the tab's prompts before the hub's Menu", () => {
    renderHub();
    const footer = screen.getByTestId('hub-anvil').querySelector('footer')!.textContent!;
    expect(footer.indexOf('Salvage')).toBeGreaterThan(-1);
    expect(footer.indexOf('Salvage')).toBeLessThan(footer.indexOf('Menu'));
  });

  it("on Skills the Apply bar replaces the footer's group, with one Delve button", () => {
    renderHub();
    fireEvent.click(screen.getByTestId('tab-skills'));
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    expect(screen.getAllByTestId('depart-button')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('tab-forge'));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(screen.getAllByTestId('depart-button')).toHaveLength(1);
    // Training lives in the sheet, whatever the tab.
    expect(screen.queryByTestId('training-button')).toBeNull();
    openSheet();
    expect(screen.getByTestId('training-button')).toBeInTheDocument();
  });

  it('the digits 1–5 pick a tab, and T opens the Training Grounds', () => {
    renderHub();
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
    press('Digit2');
    expect(selected()).toEqual(['tab-skills']);
    press('KeyT');
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it("a disabled tab's digit does nothing: the pause hub's Forge", () => {
    render(
      <MemoryRouter>
        <AnvilHub mode="pause" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab-forge')).toBeDisabled();
    expect(screen.getByTestId('tab-forge')).toHaveAttribute('title', 'Forge at the Anvil');
    press('Digit3');
    expect(selected()).toEqual(['tab-loadout']);
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
  });

  it("the footer's Menu (Esc / Menu) opens the system menu, and Resume closes it", () => {
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    try {
      renderHub();
      const hub = screen.getByTestId('hub-anvil');
      const menu = within(hub.querySelector('footer')!).getByRole('button', { name: 'Menu' });
      expect(menu).toHaveAttribute('data-pad-skip');
      // Under the pad it draws Menu, never B: the hub's root has no Back.
      expect(within(menu).getByRole('img', { name: padHint('menu') })).toBeInTheDocument();
      expect(hub.querySelector('[data-pad-back]')).toBeNull();
      fireEvent.click(menu);
      expect(screen.getByTestId('system-menu')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('menu-resume'));
      expect(screen.queryByTestId('system-menu')).toBeNull();
    } finally {
      act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    }
  });

  it("on the pad Menu opens the system menu, View the Depart sheet, and B nothing at the hub's root", () => {
    document.getElementById('delve-ui-layer')?.remove();
    renderHub();
    expect(padPress('b')).toBe(false);
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(screen.queryByTestId('depart-sheet')).toBeNull();
    expect(padPress('menu')).toBe(true);
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('depart-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(padPress('view')).toBe(true);
    expect(screen.getByTestId('depart-sheet')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled(); // View plans: it starts nothing
  });

  it('a rebound menu key opens the system menu, not the sheet', () => {
    document.getElementById('delve-ui-layer')?.remove();
    act(() => useControlsStore.getState().setKey('menu', 'KeyM'));
    try {
      renderHub();
      press('KeyM');
      expect(screen.getByTestId('system-menu')).toBeInTheDocument();
      expect(screen.queryByTestId('depart-sheet')).toBeNull();
    } finally {
      act(() => useControlsStore.getState().reset());
    }
  });

  it('Esc opens the system menu, and Esc again closes it, once each', () => {
    // The app makes the UI layer after the root; a layer left by an earlier test would sit before it.
    document.getElementById('delve-ui-layer')?.remove();
    renderHub();
    press('Escape');
    expect(screen.getAllByTestId('system-menu')).toHaveLength(1);
    press('Escape'); // the menu's Back, never the hub's Menu prompt behind it
    expect(screen.queryByTestId('system-menu')).toBeNull();
    press('Escape');
    expect(screen.getAllByTestId('system-menu')).toHaveLength(1);
  });

  it("the footer holds Delve, which opens the Depart sheet; the sheet's Delve starts the dive at the chosen depth", () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bestDepth: 6, checkpoints: [5] });
    });
    renderHub();
    const depart = screen.getByTestId('depart-button');
    expect(depart).toHaveAttribute('data-pad-menu');
    expect(depart).toHaveAttribute('data-pad-first');
    expect(depart).toHaveTextContent('Delve ▸ depth 6');
    for (const moved of ['training-button', 'start-depths', 'delve-button'])
      expect(screen.queryByTestId(moved)).toBeNull();
    fireEvent.click(depart);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useDelveStore.getState().profile.dive).toBeNull();
    expect(screen.getByTestId('depart-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('training-button')).toHaveTextContent('Training');
    expect(screen.getByTestId('start-depths')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('delve-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
    expect(useDelveStore.getState().profile.dive?.depth).toBe(6);
  });

  it('Enter with nothing focused opens the sheet', () => {
    document.getElementById('delve-ui-layer')?.remove();
    renderHub();
    press('Enter');
    expect(screen.getByTestId('depart-sheet')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("the sheet's Back (or Esc) returns to the hub without a dive", () => {
    document.getElementById('delve-ui-layer')?.remove();
    renderHub();
    openSheet();
    fireEvent.click(sheetBack());
    expect(screen.queryByTestId('depart-sheet')).toBeNull();
    openSheet();
    press('Escape'); // the sheet's Back, never the hub's Menu behind it
    expect(screen.queryByTestId('depart-sheet')).toBeNull();
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useDelveStore.getState().profile.dive).toBeNull();
  });

  it("the sheet's Training, and T inside the sheet, open the Training Grounds", () => {
    document.getElementById('delve-ui-layer')?.remove();
    renderHub();
    openSheet();
    fireEvent.click(screen.getByTestId('training-button'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/delve/training');
    mockNavigate.mockClear();
    press('KeyT'); // the sheet's own prompt: the hub's are inert under a dialog
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it("the start depth picked in the sheet holds for the footer's label and the Skills tab's Delve too", () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bestDepth: 6, checkpoints: [5] });
    });
    renderHub();
    openSheet();
    fireEvent.click(within(screen.getByTestId('start-depths')).getByText('1'));
    expect(screen.getByTestId('delve-button')).toHaveTextContent('depth 1');
    fireEvent.click(sheetBack());
    expect(screen.getByTestId('depart-button')).toHaveTextContent('depth 1');
    fireEvent.click(screen.getByTestId('tab-skills'));
    fireEvent.click(screen.getByTestId('depart-button')); // the compact Delve opens the sheet
    expect(useDelveStore.getState().profile.dive).toBeNull();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toHaveTextContent('depth 1');
    fireEvent.click(delve);
    expect(useDelveStore.getState().profile.dive?.depth).toBe(1);
  });
});
