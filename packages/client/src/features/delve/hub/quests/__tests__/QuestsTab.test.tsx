import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { rerollContract, startDive, type Contract, type ProfileActionResult } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useUIStore } from '@/stores/uiStore';
import { ONBOARDING } from '../../../onboarding';
import { QuestsTab } from '../QuestsTab';
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../../quests/types';
import type { Prompt } from '@/features/delve/kit';
import type { HubLink, HubMode } from '../../types';

/** The quests the tab's `useQuests` hands it (the engine's own come with B1); tracking is local. */
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../../quests/useQuests', async () => {
  const { useCallback, useState } = await import('react');
  return {
    useQuests: () => {
      const [quests, setQuests] = useState(shown.quests);
      const setTracked = useCallback(
        (id: string, on: boolean) =>
          setQuests((qs) => qs.map((q) => (q.id === id ? { ...q, tracked: on } : q))),
        [],
      );
      return { quests, setTracked };
    },
  };
});
// The board's reroll as a dry run (B2 fills the engine's): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  rerollContract: vi.fn(),
}));

const renderTab = (link?: HubLink, mode: HubMode = 'anvil') => {
  const props = { setPrompts: vi.fn(), setFooterAction: vi.fn(), go: vi.fn(), onDelve: vi.fn() };
  const { unmount } = render(<QuestsTab mode={mode} link={link} {...props} />);
  return { ...props, unmount };
};
/** The prompts the tab last handed the hub. */
const lastPrompts = (setPrompts: ReturnType<typeof vi.fn>): Prompt[] =>
  setPrompts.mock.calls.at(-1)?.[0] ?? [];
const [MAIN, KINDLING, DEEP_ROOTS, RAT_CATCHER] = SAMPLE_QUESTS;
/** The fixture's contract on the board's first slot (only its id matters to the tab). */
const ratCatcher = { id: 'rat-catcher' } as Contract;
const ok = (over: Partial<ProfileActionResult> = {}): ProfileActionResult => ({
  ok: true,
  profile: useDelveStore.getState().profile,
  ...over,
});

describe('QuestsTab', () => {
  const { claimQuest, rerollContract: reroll, markQuestSeen } = useDelveStore.getState();
  beforeEach(() => {
    shown.quests = [];
    const p = useDelveStore.getState().profile;
    useDelveStore.setState({
      profile: { ...p, dive: null, quests: { ...p.quests, board: [ratCatcher, null, null] } },
      claimQuest: vi.fn(() => ok()),
      rerollContract: vi.fn(() => ok()),
      markQuestSeen: vi.fn(),
    });
    vi.mocked(rerollContract).mockClear().mockReturnValue(ok());
  });
  afterEach(() => useDelveStore.setState({ claimQuest, rerollContract: reroll, markQuestSeen }));

  it('shows the journal by kind, the first quest open, its objectives and rewards', () => {
    shown.quests = SAMPLE_QUESTS;
    renderTab();
    const journal = screen.getByTestId('quest-journal');
    const headings = within(journal).getAllByRole('heading');
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Contracts']);
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
    expect(screen.getByTestId('quest-frozen-foreman')).toHaveAttribute('aria-current', 'true');
    const detail = screen.getByTestId('quest-detail');
    expect(detail).toHaveTextContent('Main quest · Chapter 1');
    expect(detail).toHaveTextContent('The Frozen Foreman');
    expect(detail).toHaveTextContent('Descend to depth 8');
    expect(detail).toHaveTextContent('6 / 8');
    expect(detail.querySelector('[data-sprite="foreman_grask"]')).not.toBeNull();
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('Rune · Echo III');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(screen.getByTestId('quest-detail')).toHaveTextContent('Slay mine rats');
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('200 scrap');
  });

  it('opens on the first quest that waits to be claimed', () => {
    shown.quests = [MAIN, { ...KINDLING, status: 'complete' }, DEEP_ROOTS];
    renderTab();
    expect(screen.getByTestId(`quest-${KINDLING.id}`)).toHaveAttribute('aria-current', 'true');
  });

  it('opens on the first quest not yet claimed when none waits, else the first', () => {
    shown.quests = [{ ...MAIN, status: 'claimed' }, KINDLING];
    const { unmount } = renderTab();
    expect(screen.getByTestId(`quest-${KINDLING.id}`)).toHaveAttribute('aria-current', 'true');
    unmount();

    shown.quests = [{ ...MAIN, status: 'claimed' }];
    renderTab();
    expect(screen.getByTestId('quest-detail')).toHaveTextContent(MAIN.name);
  });

  it('a link still opens its quest over the default', () => {
    shown.quests = [MAIN, { ...KINDLING, status: 'complete' }];
    renderTab({ tab: 'quests', questId: MAIN.id });
    expect(screen.getByTestId(`quest-${MAIN.id}`)).toHaveAttribute('aria-current', 'true');
  });

  it("the open quest's row is the tab's data-pad-first, and only it", () => {
    shown.quests = [MAIN, { ...KINDLING, status: 'complete' }, DEEP_ROOTS];
    renderTab();
    const first = [...document.querySelectorAll('[data-pad-first]')];
    expect(first).toEqual([screen.getByTestId(`quest-${KINDLING.id}`)]);
  });

  it('tracks on the HUD from the button and from G / Y, three at most', () => {
    shown.quests = SAMPLE_QUESTS;
    const { setPrompts } = renderTab({ tab: 'quests', questId: 'deep-roots' });
    const track = () => screen.getByTestId('quest-track');
    const trackPrompt = () => lastPrompts(setPrompts).find((p) => p.id === 'track');
    expect(screen.getByTestId('quest-deep-roots')).toHaveAttribute('aria-current', 'true');
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(lastPrompts(setPrompts).map((p) => [p.label, p.binding])).toEqual([
      ['Select', { mouse: 'click', pad: 'a' }],
      ['Track', { key: 'KeyG', pad: 'y' }],
    ]);

    fireEvent.click(track());
    expect(track()).toHaveAttribute('aria-pressed', 'true');
    expect(track()).toHaveTextContent('Tracked on the HUD');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('3 tracked of 3');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(track()).toBeDisabled();
    expect(trackPrompt()?.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('quest-kindling'));
    act(() => trackPrompt()?.onPress?.());
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
  });

  it('badges NEW and DONE, keeps the claimed under a collapsed Done, and marks a quest seen when opened', () => {
    shown.quests = [
      { ...MAIN, status: 'complete', isNew: true, giver: 'hesta' },
      { ...KINDLING, status: 'claimed' },
      { ...DEEP_ROOTS, isNew: true },
      RAT_CATCHER,
    ];
    renderTab();
    const row = (id: string) => within(screen.getByTestId(`quest-${id}`));
    expect(row('frozen-foreman').getByTestId('quest-new')).toHaveTextContent('NEW');
    expect(row('frozen-foreman').getByTestId('quest-done')).toHaveTextContent('DONE');
    expect(row('deep-roots').getByTestId('quest-new')).toBeInTheDocument();
    expect(row('deep-roots').queryByTestId('quest-done')).toBeNull();
    expect(screen.getByTestId('quest-detail')).toHaveTextContent(
      'Main quest · Chapter 1 · Complete',
    );
    // Hesta's body sits left of her canvas's centre: nudged 3 sprite pixels right, at 6 px each.
    expect(screen.getByTestId('quest-giver')).toHaveStyle({ left: '18px' });
    const markSeen = useDelveStore.getState().markQuestSeen;
    expect(markSeen).toHaveBeenCalledWith('frozen-foreman'); // the quest open at first
    fireEvent.click(screen.getByTestId('quest-deep-roots'));
    expect(markSeen).toHaveBeenLastCalledWith('deep-roots');
    expect(markSeen).toHaveBeenCalledTimes(2);

    expect(screen.getByTestId('quest-group-side')).not.toHaveTextContent('Kindling');
    const toggle = screen.getByTestId('quest-done-toggle');
    expect(toggle).toHaveTextContent('Done · 1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('quest-kindling')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('quest-kindling'));
    expect(screen.getByTestId('quest-detail')).toHaveTextContent('Side quest · Claimed');
    expect(screen.queryByTestId('quest-track')).toBeNull(); // a claimed quest isn't tracked
    expect(screen.queryByTestId('quest-claim')).toBeNull();
  });

  it("marks the first completed quest's row for the guided start (quests.done), done once it is open", () => {
    shown.quests = [
      MAIN,
      { ...KINDLING, status: 'complete' },
      { ...DEEP_ROOTS, status: 'complete' },
    ];
    // Another quest opened by a link: the row that waits is not the open one yet.
    renderTab({ tab: 'quests', questId: MAIN.id });
    const row = screen.getByTestId('quest-kindling');
    expect(row).toHaveAttribute('data-tutorial', 'quests.done');
    expect(row).toHaveAttribute('data-tutorial-done', 'false');
    // Only the first that waits, and never the open one that doesn't.
    expect(screen.getByTestId('quest-deep-roots')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('quest-frozen-foreman')).not.toHaveAttribute('data-tutorial');
    fireEvent.click(row);
    expect(row).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('quest-claim')).toHaveAttribute('data-tutorial', 'quests.claim');
  });

  it('with no link the row that waits is open, so the guided start goes straight to Claim', () => {
    shown.quests = [MAIN, { ...KINDLING, status: 'complete' }];
    renderTab();
    expect(screen.getByTestId('quest-kindling')).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('quest-claim')).toHaveAttribute('data-tutorial', 'quests.claim');
  });

  it('claims a completed quest from its button and from Enter, naming what it gave', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
    vi.mocked(useDelveStore.getState().claimQuest).mockReturnValue(
      ok({
        rewards: [
          { ref: { kind: 'scrap' }, count: 40 },
          { ref: { kind: 'flux', grade: 'uncommon' }, count: 1 },
        ],
      }),
    );
    useUIStore.setState({ seen: [] });
    const { setPrompts } = renderTab();
    // A first visit: Claim carries the screen's line, until a claim.
    expect(lastPrompts(setPrompts).find((p) => p.id === 'claim')!.hint).toBe(ONBOARDING.quests);
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim');
    expect(claim).toBeEnabled();
    fireEvent.click(claim);
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledWith('frozen-foreman');
    expect(useUIStore.getState().seen).toContain('quests');
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      'Claimed The Frozen Foreman: 40 scrap, 1 × Uncommon flux',
    );
    const prompt = lastPrompts(setPrompts).find((p) => p.id === 'claim')!;
    expect(prompt.binding).toEqual({ key: ['Enter', 'NumpadEnter'] });
    act(() => prompt.onPress?.());
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledTimes(2);

    // Opening a quest still under way: no Claim.
    fireEvent.click(screen.getByTestId('quest-deep-roots'));
    expect(screen.queryByTestId('quest-claim')).toBeNull();
    expect(screen.queryByTestId('quest-message')).toBeNull();
    expect(lastPrompts(setPrompts).map((p) => p.id)).toEqual(['select', 'track']);
  });

  it("shows the engine's refusal of a claim", () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    vi.mocked(useDelveStore.getState().claimQuest).mockReturnValue(
      ok({ ok: false, reason: 'Claim at the Anvil, between dives' }),
    );
    renderTab();
    fireEvent.click(screen.getByTestId('quest-claim'));
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      'Claim at the Anvil, between dives',
    );
  });

  it('in the pause, Claim reads "Claim after the dive" and is disabled', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    const { setPrompts } = renderTab(undefined, 'pause');
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim after the dive');
    expect(claim).toBeDisabled();
    expect(lastPrompts(setPrompts).find((p) => p.id === 'claim')?.disabled).toBe(true);
  });

  it('at the Anvil mid-dive (a floor restart), Claim reads "Claim after the dive" and is disabled', () => {
    const p = useDelveStore.getState().profile;
    const { dive } = startDive(getDelveRegistry(), { ...p, quests: { ...p.quests, board: [] } }, 1);
    useDelveStore.setState({ profile: { ...p, dive } });
    shown.quests = [{ ...MAIN, status: 'complete' }];
    const { setPrompts } = renderTab();
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim after the dive');
    expect(claim).toBeDisabled();
    expect(lastPrompts(setPrompts).find((p) => p.id === 'claim')?.disabled).toBe(true);
  });

  it('on the pad, A presses the focused Claim: no Enter prompt', () => {
    useInputDeviceStore.setState({ device: 'gamepad' });
    try {
      shown.quests = [{ ...MAIN, status: 'complete' }];
      const { setPrompts } = renderTab();
      expect(lastPrompts(setPrompts).map((p) => [p.id, p.label])).toEqual([
        ['select', 'Claim'],
        ['track', 'Untrack'],
      ]);
    } finally {
      useInputDeviceStore.setState({ device: 'keyboard' });
    }
  });

  describe('claiming on the row, under the pad', () => {
    beforeEach(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    afterEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

    it('pressing the open, complete row claims it, and the prompt reads Claim', () => {
      shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
      const { setPrompts } = renderTab();
      expect(lastPrompts(setPrompts).map((p) => [p.id, p.label])).toEqual([
        ['select', 'Claim'],
        ['track', 'Untrack'],
      ]);
      fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
      expect(useDelveStore.getState().claimQuest).toHaveBeenCalledWith(MAIN.id);
      expect(screen.getByTestId('quest-message')).toHaveTextContent(`Claimed ${MAIN.name}`);
    });

    it('pressing another row opens it and claims nothing; a quest still under way reads Select', () => {
      shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
      const { setPrompts } = renderTab();
      fireEvent.click(screen.getByTestId(`quest-${DEEP_ROOTS.id}`));
      expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
      expect(screen.getByTestId(`quest-${DEEP_ROOTS.id}`)).toHaveAttribute('aria-current', 'true');
      expect(lastPrompts(setPrompts).find((p) => p.id === 'select')?.label).toBe('Select');
    });

    it('while a dive is open the row only opens, and the prompt reads Select', () => {
      shown.quests = [{ ...MAIN, status: 'complete' }];
      const { setPrompts } = renderTab(undefined, 'pause');
      fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
      expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
      expect(lastPrompts(setPrompts).find((p) => p.id === 'select')?.label).toBe('Select');
    });

    it('after a claim the next quest that waits opens and takes the focus', () => {
      shown.quests = [
        { ...MAIN, status: 'complete' },
        DEEP_ROOTS,
        { ...KINDLING, status: 'complete' },
      ];
      renderTab();
      fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
      const next = screen.getByTestId(`quest-${KINDLING.id}`);
      expect(next).toHaveAttribute('aria-current', 'true');
      expect(document.activeElement).toBe(next);
      // The line that says what was claimed stays over the next quest.
      expect(screen.getByTestId('quest-message')).toHaveTextContent(`Claimed ${MAIN.name}`);
    });

    it('a refused claim opens nothing else', () => {
      shown.quests = [{ ...MAIN, status: 'complete' }, { ...KINDLING, status: 'complete' }];
      vi.mocked(useDelveStore.getState().claimQuest).mockReturnValue(
        ok({ ok: false, reason: 'Finish or leave the dive first' }),
      );
      renderTab();
      fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
      expect(screen.getByTestId(`quest-${MAIN.id}`)).toHaveAttribute('aria-current', 'true');
      expect(screen.getByTestId('quest-message')).toHaveTextContent('Finish or leave the dive first');
    });
  });

  it('with the mouse, pressing the open, complete row claims nothing', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    renderTab();
    fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
    expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
  });

  it('with the mouse, a claim from the button opens the next quest that waits and moves no focus', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, { ...KINDLING, status: 'complete' }];
    renderTab();
    const claim = screen.getByTestId('quest-claim');
    claim.focus();
    fireEvent.click(claim);
    expect(screen.getByTestId(`quest-${KINDLING.id}`)).toHaveAttribute('aria-current', 'true');
    expect(document.activeElement).not.toBe(screen.getByTestId(`quest-${KINDLING.id}`));
  });

  describe('Claim all', () => {
    const two = () => [
      { ...MAIN, status: 'complete' as const },
      DEEP_ROOTS,
      { ...KINDLING, status: 'complete' as const },
    ];

    it("shows while two or more quests wait, as the tab's data-pad-first", () => {
      shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
      const { unmount } = renderTab();
      expect(screen.queryByTestId('quest-claim-all')).toBeNull();
      unmount();

      shown.quests = two();
      renderTab();
      const all = screen.getByTestId('quest-claim-all');
      expect(all).toHaveTextContent('Claim all 2');
      expect([...document.querySelectorAll('[data-pad-first]')]).toEqual([all]);
    });

    it("claims each in the journal's order and says what it claimed", () => {
      shown.quests = two();
      renderTab();
      fireEvent.click(screen.getByTestId('quest-claim-all'));
      expect(vi.mocked(useDelveStore.getState().claimQuest).mock.calls.map(([id]) => id)).toEqual(
        [MAIN.id, KINDLING.id],
      );
      expect(screen.getByTestId('quest-message')).toHaveTextContent(
        `Claimed 2 quests: ${MAIN.name}, ${KINDLING.name}`,
      );
    });

    it("stops at a refusal and shows the engine's reason", () => {
      shown.quests = two();
      vi.mocked(useDelveStore.getState().claimQuest)
        .mockReturnValueOnce(ok())
        .mockReturnValueOnce(ok({ ok: false, reason: 'The pouch is full' }));
      renderTab();
      fireEvent.click(screen.getByTestId('quest-claim-all'));
      expect(useDelveStore.getState().claimQuest).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('quest-message')).toHaveTextContent(
        `Claimed 1 quest: ${MAIN.name} · The pouch is full`,
      );
    });

    it('is absent while a dive is open', () => {
      shown.quests = two();
      renderTab(undefined, 'pause');
      expect(screen.queryByTestId('quest-claim-all')).toBeNull();
    });
  });

  it('the Contract board: its slots in order, empty ones waiting for the next dive', () => {
    shown.quests = [MAIN, RAT_CATCHER];
    renderTab();
    const group = screen.getByTestId('quest-group-contract');
    expect(within(group).getByRole('heading')).toHaveTextContent('Contracts');
    expect(
      within(screen.getByTestId('contract-slot-0')).getByTestId('quest-rat-catcher'),
    ).toBeInTheDocument();
    for (const i of [1, 2])
      expect(screen.getByTestId(`contract-slot-${i}`)).toHaveTextContent(
        'New contract after your next dive',
      );
    // A quest has no Reroll; the engine is asked only for an open contract.
    expect(screen.queryByTestId('quest-reroll')).toBeNull();
    expect(rerollContract).not.toHaveBeenCalled();
  });

  it("rerolls the open contract for the engine's price from the button and from R / X", () => {
    shown.quests = [MAIN, RAT_CATCHER];
    const { setPrompts } = renderTab({ tab: 'quests', questId: 'rat-catcher' });
    expect(rerollContract).toHaveBeenLastCalledWith(
      expect.anything(),
      useDelveStore.getState().profile,
      0,
    );
    const button = screen.getByTestId('quest-reroll');
    expect(button).toHaveTextContent('Reroll');
    expect(button).toHaveTextContent('30 scrap'); // delve.quests.contracts.rerollScrap
    expect(button).toBeEnabled();
    const prompt = () => lastPrompts(setPrompts).find((p) => p.id === 'reroll')!;
    expect(prompt().binding).toEqual({ key: 'KeyR', pad: 'x' });
    fireEvent.click(button);
    expect(useDelveStore.getState().rerollContract).toHaveBeenCalledWith(0);
    act(() => prompt().onPress?.());
    expect(useDelveStore.getState().rerollContract).toHaveBeenCalledTimes(2);
  });

  it("a spent reroll is disabled with the engine's reason", () => {
    vi.mocked(rerollContract).mockReturnValue(
      ok({ ok: false, reason: 'One reroll a visit: the board refills after your next dive' }),
    );
    shown.quests = [RAT_CATCHER];
    const { setPrompts } = renderTab();
    expect(screen.getByTestId('quest-reroll')).toBeDisabled();
    expect(screen.getByTestId('quest-reroll-why')).toHaveTextContent(
      'One reroll a visit: the board refills after your next dive',
    );
    expect(lastPrompts(setPrompts).find((p) => p.id === 'reroll')?.disabled).toBe(true);
  });
});
