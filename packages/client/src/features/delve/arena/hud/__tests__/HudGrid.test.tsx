import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  addMaterial,
  createDelveProfile,
  emptyHaul,
  emptyMaterials,
  startDive,
  type MaterialRef,
} from '@alloy/engine';
import { HudGrid } from '../HudGrid';
import { PurseBar } from '../PurseBar';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';

/** Where each part sits on a 1920×1080 window, by its `data-hud` (the life bar by its id). */
let boxes: Record<string, DOMRect>;
const rect = (el: Element) =>
  boxes[el.getAttribute('data-hud') ?? el.getAttribute('data-testid') ?? ''] ?? new DOMRect();

describe('HudGrid', () => {
  beforeEach(() => {
    boxes = {
      top: new DOMRect(24, 24, 1516, 48),
      right: new DOMRect(1556, 24, 340, 1032),
      dock: new DOMRect(24, 700, 600, 356),
      'hero-hp': new DOMRect(24, 990, 600, 32),
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return rect(this);
    });
    window.innerWidth = 1920;
    window.innerHeight = 1080;
  });
  afterEach(() => vi.restoreAllMocks());

  const grid = (onInsets: (i: unknown) => void, life = true) => (
    <HudGrid
      onInsets={onInsets}
      testId="hud"
      top={<div />}
      right={<div />}
      dock={life && <div data-testid="hero-hp" />}
    >
      <span data-testid="overlay" />
    </HudGrid>
  );

  it('is the zoomed HUD root, laying its children on the grid', () => {
    render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root).toHaveClass('delve-ui', 'delve-hud-zoom', 'pointer-events-none');
    expect(screen.getByTestId('overlay').parentElement).toBe(root);
  });

  it('sizes its right column: 340 px, or `rightWidth` (the Training dock)', () => {
    const { rerender } = render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 340px',
    );
    rerender(
      <HudGrid
        onInsets={() => {}}
        testId="hud"
        top={null}
        right={null}
        dock={null}
        rightWidth={400}
      />,
    );
    expect(root.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 400px',
    );
  });

  it("reports the camera's insets in viewport px, again on a resize or a HUD scale change, only when they change", () => {
    const onInsets = vi.fn();
    const { rerender } = render(grid(onInsets));
    expect(onInsets).toHaveBeenCalledExactlyOnceWith({ top: 72, right: 364, bottom: 90, left: 0 });
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onInsets).toHaveBeenCalledTimes(1);
    boxes.top = new DOMRect(30, 30, 1500, 60);
    boxes.right = new DOMRect(1475, 30, 425, 1020);
    act(() => useUIStore.setState({ hudScale: 1.25 }));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 90, right: 445, bottom: 90, left: 0 });
    // No life bar (no snapshot yet): the dock's top edge.
    rerender(grid(onInsets, false));
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 90, right: 445, bottom: 380, left: 0 });
    act(() => useUIStore.setState({ hudScale: 1 }));
  });

  it('reports no right inset while the right column is empty, and again once it fills', async () => {
    const onInsets = vi.fn();
    const at = (right: boolean) => (
      <HudGrid
        onInsets={onInsets}
        top={<div />}
        right={right && <div />}
        dock={<div data-testid="hero-hp" />}
      />
    );
    const { rerender } = render(at(false));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 72, right: 0, bottom: 90, left: 0 });
    rerender(at(true));
    await act(async () => {});
    expect(onInsets).toHaveBeenLastCalledWith({ top: 72, right: 364, bottom: 90, left: 0 });
    rerender(at(false));
    await act(async () => {});
    expect(onInsets).toHaveBeenLastCalledWith({ top: 72, right: 0, bottom: 90, left: 0 });
  });
});

describe('PurseBar', () => {
  const registry = getDelveRegistry();
  const iron: MaterialRef = { kind: 'metal', metal: 'iron' };

  beforeEach(() => {
    useInputDeviceStore.setState({ device: 'keyboard' });
    const profile = {
      ...createDelveProfile(registry, 7),
      scrap: 2412,
      links: 5,
      manaDust: 40,
      runes: { quick: [2, 1, 0, 0, 0] },
      materials: { ...emptyMaterials(), metals: { ...emptyMaterials().metals, steel: 7 } },
    };
    const dived = startDive(registry, profile, 1);
    // This floor's haul so far, and what the dive's cleared floors banked.
    const haul = addMaterial(addMaterial(emptyHaul(), iron, 3), { kind: 'dust' }, 2);
    const banked = {
      ...addMaterial(emptyHaul(), { kind: 'flux', grade: 'magic' }),
      scrap: 30,
      dust: 4,
      links: 1,
      runes: { split: [0, 0, 1, 0, 0] },
    };
    useDelveStore.setState({
      profile: { ...dived, dive: { ...dived.dive!, bounty: 26, haul, banked } },
      diveDrops: ['a', 'b', 'c', 'd'],
    });
  });

  const purse = (onMenu = () => {}, onJournal?: () => void) => (
    <PurseBar dive={useDelveStore.getState().profile.dive!} onMenu={onMenu} onJournal={onJournal} />
  );

  it("shows each resource held and this dive's gain, and what banks on extract", () => {
    render(purse());
    const bag = useDelveStore.getState().profile.bag.length;
    const cap = registry.getDelveBalance().loot.bagSize;
    const row = (id: string, name: string, text: string) => {
      const el = screen.getByTestId(`purse-${id}`);
      expect(within(el).getByRole('img', { name })).toBeInTheDocument();
      expect(el).toHaveTextContent(text);
    };
    row('scrap', 'Scrap', '2,412+30');
    row('links', 'Links', '5+1');
    row('dust', 'Mana Dust', '40+6');
    row('materials', 'Materials', '7+4');
    row('runes', 'Runes', '3+1');
    row('items', 'Items', `${bag} / ${cap}+4`);
    expect(screen.getByTestId('bounty')).toHaveTextContent('+26');
    expect(screen.getByTestId('purse-bar')).toHaveTextContent('+26 banks on extract');
  });

  it("the materials' tooltip lists what this dive found and what waits at the Anvil", () => {
    render(purse());
    fireEvent.mouseEnter(screen.getByTestId('purse-materials'));
    const card = within(screen.getByTestId('purse-bar')).getByRole('tooltip');
    const rows = within(card)
      .getAllByTestId('haul-row')
      .map((r) => r.textContent);
    expect(rows).toEqual(['Iron bar×3', 'Magic flux×1', 'Steel bar×7']);
    expect(card).toHaveTextContent(/This dive.*At the Anvil/);
  });

  it('"Dive menu" carries the menu marker and presses onMenu; Journal waits for 3b', () => {
    const onMenu = vi.fn();
    const { rerender } = render(purse(onMenu));
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    expect(menu).toHaveAttribute('data-pad-menu');
    expect(menu).toHaveTextContent('EscMenu');
    fireEvent.click(menu);
    fireEvent.click(menu);
    expect(onMenu).toHaveBeenCalledTimes(2);
    const journal = screen.getByRole('button', { name: /Journal/ });
    expect(journal).toHaveAttribute('data-pad-journal');
    expect(journal).toBeDisabled();
    const onJournal = vi.fn();
    rerender(purse(onMenu, onJournal));
    fireEvent.click(journal);
    expect(onJournal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('purse-bar')).toHaveTextContent('AltLabels');
  });

  it("the Labels and Journal hints show the player's bindings", () => {
    render(purse());
    act(() => {
      useControlsStore.getState().setKey('labels', 'KeyV');
      useControlsStore.getState().setKey('journal', 'KeyB');
    });
    try {
      expect(screen.getByTestId('purse-bar')).toHaveTextContent('VLabels');
      expect(screen.getByRole('button', { name: /Journal/ })).toHaveTextContent('BJournal');
    } finally {
      useControlsStore.setState({ config: DEFAULT_CONTROLS });
    }
  });
});
