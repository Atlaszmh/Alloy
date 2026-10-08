import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { sandboxWeapon } from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
import { attachKeyboard, createArenaInput } from '../arena/input';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { DamageMeter } from '../training/meter';
import { TrainingPanel, type TrainingTab } from '../training/TrainingPanel';
import type { TrainingActions } from '../training/useTrainingArena';

const registry = getDelveRegistry();

function renderPanel(tab: TrainingTab) {
  const actions: TrainingActions = {
    addDummies: vi.fn(),
    spawn: vi.fn(),
    clear: vi.fn(),
    resetDummies: vi.fn(),
    fillCharge: vi.fn(),
    resetMeter: vi.fn(),
  };
  const onClose = vi.fn();
  const onOpenControls = vi.fn();
  const meter = new DamageMeter().summary(0);
  const panel = (t: TrainingTab) => (
    <TrainingPanel
      tab={t}
      onTab={vi.fn()}
      onClose={onClose}
      actions={actions}
      meter={meter}
      onOpenControls={onOpenControls}
    />
  );
  const { rerender } = render(panel(tab));
  return { actions, onClose, onOpenControls, showTab: (t: TrainingTab) => rerender(panel(t)) };
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

  it('picks the primary and the secondary; the primary is off in the secondary row, even unarmed', () => {
    renderPanel('loadout');
    expect(screen.getByTestId('sandbox-primary-fire')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/your basic blows strike with it/)).toBeInTheDocument();
    expect(screen.getByTestId('secondary-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('secondary-fire')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sandbox-primary-frost'));
    expect(useSandboxStore.getState().primary).toBe('frost');
    expect(screen.getByTestId('secondary-frost')).toBeDisabled();
    expect(screen.getByTestId('secondary-fire')).toBeEnabled();
    fireEvent.click(screen.getByTestId('secondary-storm'));
    expect(useSandboxStore.getState().secondary).toBe('storm');
    expect(screen.getByTestId('secondary-storm')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/The second element your basic blows can pick/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('weapon-base-none'));
    expect(screen.getByTestId('secondary-storm')).toBeEnabled();
    expect(screen.getByTestId('secondary-storm')).toHaveAttribute('aria-pressed', 'true');
  });

  it("the Abilities tab builds the sandbox's chains: any element for a move, the pair for a blow", () => {
    useSandboxStore.getState().setSecondary('storm');
    renderPanel('abilities');
    fireEvent.click(screen.getByTestId('element-shadow'));
    expect(useSandboxStore.getState().chains.primary.moves[0].elements).toEqual(['shadow']);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/)).toHaveLength(2);
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(useSandboxStore.getState().chains.basic[0].element).toBe('storm');
  });

  it('the Abilities tab sockets any rune at any tier, free, up to three a move, picked in the dock', () => {
    renderPanel('abilities');
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 0/3');
    expect(screen.getByTestId('socket-open')).toHaveTextContent(/^\+ socket$/);
    fireEvent.click(screen.getByTestId('socket-open'));
    fireEvent.click(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
    );
    // In place in the dock, not a sheet over the fight.
    expect(within(screen.getByTestId('training-panel')).getByTestId('rune-picker')).toHaveAttribute(
      'data-pad-scope',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const picker = within(screen.getByTestId('rune-picker'));
    fireEvent.click(picker.getByRole('button', { name: 'Tier III' }));
    fireEvent.click(picker.getByRole('button', { name: 'Quick III' }));
    expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([
      { id: 'quick', tier: 3 },
    ]);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/3');
  });

  it('the Abilities tab names every reaction under the builder', () => {
    renderPanel('abilities');
    const grid = within(screen.getByRole('region', { name: 'Reactions' }));
    for (const r of registry.getArpgData().reactions)
      expect(grid.getByTestId(`reaction-${r.id}`)).toHaveTextContent(r.name);
    expect(grid.queryByTestId('reaction-unknown')).toBeNull();
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

  it("the basic attack's Auto / Manual lives in the Controls editor alone, which the tab opens", () => {
    const { onOpenControls } = renderPanel('toggles');
    expect(screen.queryByTestId('training-attack-mode')).toBeNull();
    expect(screen.queryByText(/Basic attack:/)).toBeNull();
    fireEvent.click(screen.getByTestId('training-open-controls'));
    expect(onOpenControls).toHaveBeenCalledOnce();
  });

  it('No cooldowns says the beats stay on', () => {
    renderPanel('toggles');
    expect(
      screen.getByText('Cooldowns are off and charge stays full; each move still waits its beat.'),
    ).toBeInTheDocument();
  });

  it("Close closes the dock (B doesn't: it hands the pad back); the tabs are the kit's top level", () => {
    const { onClose } = renderPanel('toggles');
    const close = screen.getByTestId('training-panel-close');
    expect(close).not.toHaveAttribute('data-pad-back');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
    const tabs = screen.getByRole('tablist', { name: 'Training' });
    expect(tabs).toHaveAttribute('data-pad-tabs', '');
    expect(screen.getByTestId('training-tab-toggles')).toHaveAttribute('aria-selected', 'true');
    // One way back to the Anvil: the Training bar's.
    expect(screen.queryByTestId('training-panel-exit')).toBeNull();
  });

  it.each(['abilities', 'targets', 'toggles', 'meter'] as const)(
    'the %s tab wears glyphs, not emoji, and no text under 14 px',
    (tab) => {
      renderPanel(tab);
      const panel = screen.getByTestId('training-panel');
      expect(panel.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(panel.innerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
    },
  );

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

  it('its lists are named', () => {
    renderPanel('targets');
    expect(screen.getByRole('combobox', { name: 'Biome' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Monster' })).toBeInTheDocument();
  });

  it('is a labelled aside', () => {
    renderPanel('loadout');
    expect(screen.getByRole('complementary', { name: 'Training' })).toBeInTheDocument();
  });
});
