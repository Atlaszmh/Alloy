import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { PauseScreen } from '../PauseScreen';
import type { HubLink } from '../types';

// No quests (the engine's own come with B1): the journal link opens the Quests tab's empty state.
vi.mock('../../quests/useQuests', () => {
  const none = { quests: [], setTracked: () => {} };
  return { useQuests: () => none };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

const renderPause = (link?: HubLink, atStop = false) => {
  const on = { onResume: vi.fn(), onAnvil: vi.fn(), onAbandon: vi.fn() };
  const dive = store().profile.dive!;
  render(
    <PauseScreen
      dive={dive}
      biome={registry.getBiomeForDepth(dive.depth)}
      foesLeft={12}
      link={link}
      atStop={atStop}
      {...on}
    />,
  );
  return on;
};
const selected = () =>
  within(screen.getByRole('tablist', { name: 'The Anvil' }))
    .getAllByRole('tab')
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.getAttribute('data-testid'));
/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

describe('PauseScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    // The app makes the UI layer after the root; a layer left by an earlier test would sit before it.
    document.getElementById('delve-ui-layer')?.remove();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });

  it('is a pad scope: Paused, the floor, the tabs with the Forge locked, and the gear note', () => {
    renderPause();
    const pause = screen.getByTestId('pause-screen');
    expect(pause).toHaveAttribute('data-pad-scope');
    const header = pause.querySelector('header')!;
    expect(header).toHaveTextContent('Paused');
    expect(header).toHaveTextContent(
      `Depth 1 · ${registry.getBiomeForDepth(1).name} · 12 foes left`,
    );
    expect(selected()).toEqual(['tab-loadout']);
    const forge = screen.getByTestId('tab-forge');
    expect(forge).toBeDisabled();
    expect(forge).toHaveAttribute('title', 'Forge at the Anvil');
    expect(screen.getByTestId('pause-note')).toHaveTextContent(
      'Gear is locked until you are back at the Anvil',
    );
  });

  it('over the stop, the floor reads cleared, not its foes', () => {
    renderPause(undefined, true);
    const header = screen.getByTestId('pause-screen').querySelector('header')!;
    expect(header).toHaveTextContent(`${registry.getBiomeForDepth(1).name} · Depth 1 cleared`);
    expect(header).not.toHaveTextContent('foes left');
  });

  it('the footer: Inspect, Full compare and Tabs, then Controls, Settings, Anvil, Abandon and Resume', () => {
    const on = renderPause();
    const footer = screen.getByTestId('pause-screen').querySelector('footer')!;
    const text = footer.textContent!;
    const order = [
      'Inspect',
      'Full compare',
      'Tabs',
      'Controls',
      'Settings',
      'Anvil · floor restarts',
      'Abandon · counts as a death',
      'Resume',
    ].map((s) => text.indexOf(s));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    const anvil = screen.getByRole('button', { name: /^Anvil · floor restarts/ });
    // Its subtitle: the floor replays, so what it picked up and hasn't banked is lost.
    expect(anvil).toHaveTextContent("This floor's unbanked haul is lost");
    fireEvent.click(anvil);
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · counts as a death' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it('over the stop, the Anvil says the stop waits: nothing restarts', () => {
    const on = renderPause(undefined, true);
    expect(screen.queryByRole('button', { name: /^Anvil · floor restarts/ })).toBeNull();
    expect(screen.getByTestId('pause-anvil')).not.toHaveTextContent('haul');
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · back to this stop' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
  });

  it('Resume is hot metal on Esc / B / Menu and the first focus; Esc resumes', () => {
    const on = renderPause();
    const resume = screen.getByTestId('pause-resume');
    for (const marker of ['data-pad-back', 'data-pad-menu', 'data-pad-first'])
      expect(resume).toHaveAttribute(marker);
    expect(resume).toHaveClass('k-btn-lg');
    press('Escape');
    expect(on.onResume).toHaveBeenCalledTimes(1);
  });

  it('the digits skip the locked Forge', () => {
    renderPause();
    press('Digit3');
    expect(selected()).toEqual(['tab-loadout']);
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
  });

  it('Controls and Settings open over the pause, and Esc closes only them', () => {
    const on = renderPause();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('attack-mode-toggle')).toHaveTextContent('Basic attack: Auto');
    press('Escape');
    expect(screen.queryByTestId('controls-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it("a link opens on its item: the Found log's find, NEW, its actions locked", () => {
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...store().profile, bag: [helm] });
    store().markNew(['h1']);
    renderPause({ tab: 'loadout', uid: 'h1' });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Locked during the dive');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByRole('tab', { name: /Loadout/ })).toHaveTextContent('1');
  });

  it('opens on Quests from the journal', () => {
    renderPause({ tab: 'quests' });
    expect(selected()).toEqual(['tab-quests']);
    expect(screen.getByTestId('quests-empty')).toBeInTheDocument();
  });
});
