import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { rerollContract, startDive, type Contract, type ProfileActionResult } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
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
  render(<QuestsTab mode={mode} link={link} {...props} />);
  return props;
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
    const { setPrompts } = renderTab();
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim');
    expect(claim).toBeEnabled();
    fireEvent.click(claim);
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledWith('frozen-foreman');
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
      expect(lastPrompts(setPrompts).map((p) => p.id)).toEqual(['select', 'track']);
    } finally {
      useInputDeviceStore.setState({ device: 'keyboard' });
    }
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
