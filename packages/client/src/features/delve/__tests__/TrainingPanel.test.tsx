import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { defaultAbilities, sandboxWeapon } from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { attachKeyboard, createArenaInput } from '../arena/input';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { DamageMeter } from '../training/meter';
import {
  DepthLabel,
  TrainingPanel,
  openLayout,
  type PanelLayout,
  type TrainingTab,
} from '../training/TrainingPanel';
import type { TrainingActions } from '../training/useTrainingArena';

const registry = getDelveRegistry();

function renderPanel(tab: TrainingTab, layout: PanelLayout = 'sheet') {
  const actions: TrainingActions = {
    addDummies: vi.fn(),
    spawn: vi.fn(),
    clear: vi.fn(),
    resetDummies: vi.fn(),
    fillCharge: vi.fn(),
    resetMeter: vi.fn(),
  };
  const onClose = vi.fn();
  const onExit = vi.fn();
  const meter = new DamageMeter().summary(0);
  const panel = (t: TrainingTab) => (
    <TrainingPanel
      layout={layout}
      tab={t}
      onTab={vi.fn()}
      onClose={onClose}
      onExit={onExit}
      actions={actions}
      meter={meter}
      onOpenControls={vi.fn()}
    />
  );
  const { rerender } = render(panel(tab));
  return { actions, onClose, onExit, showTab: (t: TrainingTab) => rerender(panel(t)) };
}

describe('TrainingPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useSandboxStore.getState().reset();
  });

  it('a weapon chip sets the sandbox weapon', () => {
    renderPanel('loadout');
    fireEvent.click(screen.getByTestId('weapon-base-staff'));
    expect(useSandboxStore.getState().weapon).toMatchObject({ baseId: 'staff' });
    expect(screen.getByTestId('weapon-name')).toHaveTextContent('Staff');
  });

  it('the Basic infusion picker writes the store, disables the weapon element, and is off unarmed', () => {
    renderPanel('loadout');
    expect(screen.getByTestId('basic-infusion-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('basic-infusion-fire')).toBeDisabled(); // the rare fire sword's
    fireEvent.click(screen.getByTestId('basic-infusion-storm'));
    expect(useSandboxStore.getState().basicInfusion).toBe('storm');
    expect(screen.getByTestId('basic-infusion-storm')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(
        'Preview: in the Delve, basic attacks will gain a second element through elemental affinity.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('weapon-base-none'));
    expect(screen.getByTestId('basic-infusion-storm')).toBeDisabled();
    expect(screen.getByTestId('basic-infusion-none')).toBeDisabled();
  });

  it('adds dummies through the arena, and stops at the cap', () => {
    const { actions } = renderPanel('targets');
    fireEvent.click(screen.getByTestId('add-dummy-row'));
    expect(actions.addDummies).toHaveBeenCalledWith('row');
    act(() => {
      for (let i = 0; i < MAX_DUMMY_GROUPS; i++)
        useSandboxStore.getState().addDummyGroup({ layout: 'single', element: null });
    });
    expect(screen.getByTestId('add-dummy-single')).toBeDisabled();
    expect(screen.getByTestId('dummies-full')).toBeInTheDocument();
  });

  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {
    const { onClose, onExit } = renderPanel('toggles');
    const close = screen.getByTestId('training-panel-close');
    expect(close).toHaveAttribute('data-pad-back');
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-tabs');
    const exit = screen.getByTestId('training-panel-exit');
    expect(exit).not.toHaveAttribute('data-pad-back');
    expect(exit).not.toHaveAttribute('data-pad-menu');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(exit);
    expect(onExit).toHaveBeenCalled();
  });

  it('a control lets go of focus when the pointer does; a list only when the pointer chose it', () => {
    renderPanel('targets');
    const button = screen.getByTestId('reset-dummies');
    button.focus();
    fireEvent.pointerUp(button);
    expect(document.activeElement).not.toBe(button);

    const depth = screen.getByTestId('training-depth') as HTMLSelectElement;
    depth.focus();
    fireEvent.change(depth, { target: { value: '7' } }); // reached with the keyboard: focus stays
    expect(document.activeElement).toBe(depth);
    fireEvent.pointerDown(depth);
    fireEvent.change(depth, { target: { value: '8' } }); // picked with the pointer: let go
    expect(document.activeElement).not.toBe(depth);
    expect(useSandboxStore.getState().depth).toBe(8);
  });

  it('a list opened with the pointer and closed unchanged lets go on the next key, which moves the hero', () => {
    const input = createArenaInput();
    const detach = attachKeyboard(input, () => true);
    renderPanel('targets');
    const depth = screen.getByTestId('training-depth');
    const keyOn = (el: Element, type: 'keydown' | 'keyup') =>
      el.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
    fireEvent.pointerDown(depth);
    depth.focus();
    keyOn(depth, 'keydown');
    expect(document.activeElement).not.toBe(depth);
    expect(input.keys).toEqual({ x: 0, y: -1 });
    keyOn(document.body, 'keyup');
    // Reached with the keyboard, the list keeps its keys.
    depth.focus();
    keyOn(depth, 'keydown');
    expect(document.activeElement).toBe(depth);
    expect(input.keys).toEqual({ x: 0, y: 0 });
    detach();
  });

  it("a power from the loaded gear shows as on, from your gear, and can't be switched", () => {
    const power = registry.getDelveData().legendaries[0];
    const weapon = {
      ...sandboxWeapon(registry, { baseId: 'sword', mana: 'fire', rarity: 'legendary', ilvl: 5 }),
      legendary: { id: power.id, value: power.max, roll: 1 },
    };
    useSandboxStore.getState().loadMyBuild({
      equipped: { weapon },
      abilities: defaultAbilities('fire'),
      pair: { primary: 'fire', secondary: null },
    });
    renderPanel('loadout');
    const button = screen.getByTestId(`legendary-${power.id}`);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('from your gear');
    fireEvent.click(button);
    expect(useSandboxStore.getState().legendaries).toEqual({});
  });

  it('spawn picks survive a tab switch', () => {
    const { showTab } = renderPanel('targets');
    const second = registry.getDelveData().biomes[1];
    fireEvent.change(screen.getByTestId('spawn-biome'), { target: { value: second.id } });
    fireEvent.change(screen.getByTestId('spawn-count'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('spawn-kind-elite'));
    showTab('toggles');
    showTab('targets');
    expect(screen.getByTestId('spawn-biome')).toHaveValue(second.id);
    expect(screen.getByTestId('spawn-monster')).toHaveValue(second.monsters[0].id);
    expect(screen.getByTestId('spawn-kind-elite')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('spawn-button')).toHaveTextContent(
      `Spawn 6 × ${second.monsters[0].name}`,
    );
  });

  it('a dummy element chip names what it resists and what it is weak to', () => {
    renderPanel('targets');
    const weak = registry.getArpgData().weakness.fire;
    expect(screen.getByTestId('dummy-element-fire')).toHaveAttribute(
      'title',
      `Resists Fire · weak to ${manaStyle(registry, weak).name}`,
    );
  });

  it('as a sheet it is a modal dialog, and its lists are named', () => {
    renderPanel('targets');
    expect(screen.getByRole('dialog', { name: 'Training' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('combobox', { name: 'Biome' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Monster' })).toBeInTheDocument();
  });

  it('docked, it is a labelled aside', () => {
    renderPanel('loadout', 'dock');
    expect(screen.getByRole('complementary', { name: 'Training' })).toBeInTheDocument();
  });
});

describe('DepthLabel', () => {
  beforeEach(() => useSandboxStore.getState().reset());

  it('shows the depth, and the slow-motion speed when it is not 1×', () => {
    render(<DepthLabel />);
    expect(screen.getByTestId('training-depth-label')).toHaveTextContent('Depth 5');
    expect(screen.queryByTestId('training-slowmo')).toBeNull();
    act(() => useSandboxStore.getState().setSlowmo(0.5));
    expect(screen.getByTestId('training-slowmo')).toHaveTextContent('0.5×');
  });
});

describe('openLayout', () => {
  const page = (width: number) => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: width });
    return el;
  };
  afterEach(() => useInputDeviceStore.getState().setDevice('keyboard'));

  it('docks on a wide page with mouse and keyboard; a narrow page or a controller gets a sheet', () => {
    useInputDeviceStore.getState().setDevice('keyboard');
    expect(openLayout(page(1280))).toBe('dock');
    expect(openLayout(page(800))).toBe('sheet');
    useInputDeviceStore.getState().setDevice('gamepad');
    expect(openLayout(page(1280))).toBe('sheet');
  });
});
