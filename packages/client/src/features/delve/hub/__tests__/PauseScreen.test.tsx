import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import type { PadButton } from '@/features/gamepad/gamepad';
import { attachPromptKeys, padPrompts, scopedLast } from '../../kit/prompts';
import { SAMPLE_QUESTS } from '../../quests/__tests__/quest-fixture';
import { getDelveRegistry } from '../../registry';
import { PauseScreen, type PauseScreenProps } from '../PauseScreen';
import type { HubLink } from '../types';

// The fixture's quests: the journal link opens the Quests tab on them.
vi.mock('../../quests/useQuests', async () => {
  const { SAMPLE_QUESTS } = await import('../../quests/__tests__/quest-fixture');
  const some = { quests: SAMPLE_QUESTS, setTracked: () => {} };
  return { useQuests: () => some };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

const renderPause = (link?: HubLink, atStop = false, more: Partial<PauseScreenProps> = {}) => {
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
      {...more}
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

/**
 * A pad button as the nav hears it (use-gamepad-nav.ts): the topmost scope's prompts first, else
 * its default (B presses the scope's [data-pad-back], Menu its [data-pad-menu] or its back).
 */
const padPress = (button: PadButton) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    act(() => {
      const took = padPrompts(new Set([button]), {} as Record<PadButton, boolean>, 0);
      if (took.has(button)) return;
      if (button === 'b') scopedLast('[data-pad-back]')?.click();
      if (button === 'menu')
        (scopedLast('[data-pad-menu]') ?? scopedLast('[data-pad-back]'))?.click();
    });
  } finally {
    box.mockRestore();
  }
};

/** Open the read-only hub from the list. */
const toHub = () => fireEvent.click(screen.getByTestId('pause-build'));

describe('PauseScreen', () => {
  // The Esc rule, as AppShell attaches it on every Delve route: the list binds no prompts of its own.
  let release: () => void;
  beforeEach(() => {
    release = attachPromptKeys();
  });
  afterEach(() => release());

  beforeEach(() => {
    localStorage.clear();
    // The app makes the UI layer after the root; a layer left by an earlier test would sit before it.
    document.getElementById('delve-ui-layer')?.remove();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });

  it('is a pad scope: Paused, the floor, the tabs with the Forge locked, and the gear note', () => {
    renderPause();
    toHub();
    const pause = screen.getByTestId('pause-hub');
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
    toHub();
    const header = screen.getByTestId('pause-hub').querySelector('header')!;
    expect(header).toHaveTextContent(`${registry.getBiomeForDepth(1).name} · Depth 1 cleared`);
    expect(header).not.toHaveTextContent('foes left');
    padPress('b');
    expect(screen.queryByText(/foes left/)).toBeNull();
  });

  it('the list: Resume (the first focus), Build and quests, Controls, Settings, Help, then the Anvil and Abandon with their stakes', () => {
    const on = renderPause();
    const list = screen.getByTestId('pause-screen');
    expect(list).toHaveAttribute('role', 'dialog');
    expect(list).toHaveAttribute('data-pad-wrap');
    expect(list.closest('[data-pad-scope]')).not.toBeNull();
    expect(screen.queryByTestId('pause-hub')).toBeNull();
    const rows = [...list.querySelectorAll<HTMLElement>('button[data-testid]')].map(
      (b) => b.dataset.testid,
    );
    expect(rows).toEqual([
      'pause-resume',
      'pause-build',
      'open-controls',
      'open-settings',
      'pause-help',
      'pause-anvil',
      'pause-abandon',
    ]);
    const resume = screen.getByTestId('pause-resume');
    expect(resume).toHaveFocus();
    expect(resume).toHaveClass('k-btn-lg');
    expect(resume).toHaveAttribute('data-primary-action', 'resume');
    const anvil = screen.getByRole('button', { name: /^Anvil · floor restarts/ });
    // Its subtitle: the floor replays, so what it picked up and hasn't banked is lost.
    expect(anvil).toHaveTextContent("This floor's unbanked haul is lost");
    fireEvent.click(anvil);
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · counts as a death' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it("the hub's footer: the tab's prompts and Tabs (the grammar order), then back to the list and Resume", () => {
    renderPause();
    toHub();
    const text = screen.getByTestId('pause-hub').querySelector('footer')!.textContent!;
    const order = ['Inspect', 'Tabs', 'Full compare', 'Pause menu', 'Resume'].map((s) =>
      text.indexOf(s),
    );
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    expect(screen.getByTestId('pause-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('pause-hub-resume')).toHaveAttribute('data-pad-menu');
    expect(screen.queryByTestId('open-controls')).toBeNull();
  });

  it('over the stop, the Anvil says the stop waits: nothing restarts', () => {
    const on = renderPause(undefined, true);
    expect(screen.queryByRole('button', { name: /^Anvil · floor restarts/ })).toBeNull();
    expect(screen.getByTestId('pause-anvil')).not.toHaveTextContent('haul');
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · back to this stop' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
  });

  it("in the list B (its Back), the pad's Menu and Esc all resume", () => {
    const on = renderPause();
    expect(screen.getByTestId('pause-screen').querySelector('[data-pad-menu]')).toBeNull();
    padPress('b');
    expect(on.onResume).toHaveBeenCalledTimes(1);
    padPress('menu');
    expect(on.onResume).toHaveBeenCalledTimes(2);
    press('Escape');
    expect(on.onResume).toHaveBeenCalledTimes(3);
  });

  it('the digits skip the locked Forge', () => {
    renderPause();
    toHub();
    press('Digit3');
    expect(selected()).toEqual(['tab-loadout']);
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
  });

  it('Controls and Settings open over the pause, and Esc closes only them', () => {
    const on = renderPause();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('attack-mode-toggle')).toHaveTextContent('Basic attack: Manual');
    press('Escape');
    expect(screen.queryByTestId('controls-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it('Help opens over the pause, and Esc closes only it', () => {
    const on = renderPause();
    fireEvent.click(screen.getByTestId('pause-help'));
    expect(screen.getByTestId('help-dialog')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('help-dialog')).toBeNull();
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
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
    expect(screen.getByTestId('pause-hub')).toBeInTheDocument();
    expect(screen.queryByTestId('pause-screen')).toBeNull();
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Locked during the dive');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByRole('tab', { name: /Loadout/ })).toHaveTextContent('1');
  });

  it('while the guided start runs, the Anvil and Abandon restart the depth; Skip tutorial asks first', () => {
    const onSkipTutorial = vi.fn();
    const on = renderPause(undefined, false, { onSkipTutorial });
    expect(screen.getByTestId('pause-anvil')).toHaveTextContent(
      'The depth restarts as you entered it',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · the depth restarts' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pause-skip-step')).toBeNull();
    fireEvent.click(screen.getByTestId('pause-skip-tutorial'));
    expect(onSkipTutorial).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('skip-tutorial-confirm'));
    expect(onSkipTutorial).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('skip-tutorial')).toBeNull();
  });

  it("at the guided start's stop Abandon waits; Skip this step shows while the engine allows it", () => {
    const onSkipStep = vi.fn();
    renderPause(undefined, true, { onSkipTutorial: vi.fn(), onSkipStep });
    expect(screen.getByTestId('pause-abandon')).toBeDisabled();
    expect(screen.getByTestId('pause-abandon')).toHaveAccessibleDescription(
      'Not while the guided start runs',
    );
    fireEvent.click(screen.getByTestId('pause-skip-step'));
    expect(onSkipStep).toHaveBeenCalledTimes(1);
  });

  it('opens on Quests from the journal', () => {
    renderPause({ tab: 'quests' });
    expect(screen.getByTestId('pause-hub')).toBeInTheDocument();
    expect(selected()).toEqual(['tab-quests']);
    expect(screen.getByTestId('quest-journal')).toBeInTheDocument();
  });

  it("in the hub B and Esc return to the list, its row focused, and the pad's Menu resumes", () => {
    const on = renderPause();
    toHub();
    expect(screen.getByTestId('pause-hub')).toHaveAttribute('data-pad-scope');
    expect(screen.queryByTestId('pause-screen')).toBeNull();
    padPress('b');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(screen.getByTestId('pause-build')).toHaveFocus();
    expect(on.onResume).not.toHaveBeenCalled();
    toHub();
    press('Escape');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(on.onResume).not.toHaveBeenCalled();
    toHub();
    padPress('menu');
    expect(on.onResume).toHaveBeenCalledTimes(1);
  });

  it('a link (the journal, a find) opens the hub directly; B from there is the list', () => {
    renderPause({ tab: 'quests' });
    expect(selected()).toEqual(['tab-quests']);
    padPress('b');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('pause-hub')).toBeNull();
  });

  it('beside the list, the dive as it stands: depth, biome, rooms, banked, the death-loss line, the tracked objective', () => {
    const dive = store().profile.dive!;
    const banked = addMaterial({ ...emptyHaul(), scrap: 40 }, { kind: 'metal', metal: 'iron' }, 3);
    store().setProfile({ ...store().profile, dive: { ...dive, banked, bounty: 12 } });
    renderPause(undefined, false, { roomsExplored: 2, roomsTotal: 6 });
    const state = screen.getByTestId('pause-state');
    expect(state).toHaveTextContent(`Depth 1 · ${registry.getBiomeForDepth(1).name}`);
    expect(state).toHaveTextContent('Rooms explored 2 / 6');
    expect(state).not.toHaveTextContent('foes left');
    expect(state).toHaveTextContent('Banked 40 scrap · 3 materials · +12 bounty on extract');
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    expect(state).toHaveTextContent(`Banked this dive · dying loses ${loss}% of it`);
    const quest = SAMPLE_QUESTS.find((q) => q.tracked && q.status !== 'claimed')!;
    expect(state).toHaveTextContent(
      `${quest.name}: ${quest.objectives.find((o) => !o.done)!.text}`,
    );
  });

  it("the state lists the dive's boons by name and count, and nothing when none", () => {
    renderPause();
    expect(screen.queryByTestId('dive-boons')).toBeNull();
    cleanup();
    const dive = store().profile.dive!;
    const row = (id: string) => registry.getBoons().find((b) => b.id === id)!;
    store().setProfile({
      ...store().profile,
      dive: {
        ...dive,
        diveBuffs: [
          { boon: 'devotion', tier: 1, effect: {} },
          { boon: 'vigor', tier: 1, effect: {} },
          { boon: 'devotion', tier: 1, effect: {} },
        ],
      },
    });
    renderPause();
    expect(within(screen.getByTestId('pause-state')).getByTestId('dive-boons')).toHaveTextContent(
      `Boons: ${row('devotion').name} ×2 · ${row('vigor').name}`,
    );
  });

  it('on the open room the state counts the foes left, not rooms', () => {
    renderPause();
    expect(screen.getByTestId('pause-state')).toHaveTextContent('12 foes left');
  });
});
