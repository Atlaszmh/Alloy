import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { heroChains } from '@alloy/engine';
import { DepartSheet } from '../DepartSheet';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { armed } from '@/features/delve/__tests__/armed';
import { SAMPLE_QUESTS } from '../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../quests/types';

// A lesson's hold and the start depths, as the engine gives them (mocked: each test says).
const engine = vi.hoisted(() => ({ why: null as string | null, starts: [1] as number[] }));
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: () => engine.why,
  startDepthOptions: () => engine.starts,
}));
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../quests/useQuests', () => ({
  useQuests: () => ({ quests: shown.quests, setTracked: () => {} }),
}));

const WHY = "Finish Hesta's lesson or skip it";
const sheet = (over: Partial<Parameters<typeof DepartSheet>[0]> = {}) => {
  const props = {
    start: 1,
    onStart: vi.fn(),
    onDelve: vi.fn(),
    onTraining: vi.fn(),
    onQuests: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<DepartSheet {...props} />);
  return props;
};
/** An unapplied change to the Primary, as the chain builder leaves one. */
const draft = () => {
  const s = useDelveStore.getState();
  s.setProfile(armed(s.profile));
  const { profile } = useDelveStore.getState();
  const primary = heroChains(getDelveRegistry(), profile.equipped, profile.pair).primary!;
  act(() => s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }));
};
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

describe('DepartSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    engine.why = null;
    engine.starts = [1];
    shown.quests = [];
  });

  it('is a dialog whose Delve is the first focus and starts the dive', () => {
    const { onDelve } = sheet();
    expect(screen.getByTestId('depart-sheet')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Depart' })).toBeInTheDocument();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toHaveTextContent('Delve ▸ depth 1');
    expect(delve).toHaveAttribute('data-pad-first');
    expect(delve).toHaveAttribute('data-tutorial', 'hub.delve');
    expect(document.activeElement).toBe(delve);
    fireEvent.click(delve);
    expect(onDelve).toHaveBeenCalledTimes(1);
  });

  it('offers the start depths only when there is more than one, and reports the pick', () => {
    sheet();
    expect(screen.queryByTestId('start-depths')).toBeNull();
    cleanup();
    engine.starts = [1, 6];
    const { onStart } = sheet({ start: 6 });
    const chips = screen.getByTestId('start-depths').querySelectorAll('button');
    expect([...chips].map((c) => c.textContent)).toEqual(['1', '6']);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chips[0]);
    expect(onStart).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('delve-button')).toHaveTextContent('Delve ▸ depth 6');
  });

  it('lists each tracked quest with its first objective still to do', () => {
    const [main, , untracked] = SAMPLE_QUESTS;
    shown.quests = [main, untracked];
    sheet();
    const tracked = screen.getByTestId('depart-tracked');
    expect(tracked).toHaveTextContent(main.name);
    expect(tracked).toHaveTextContent(main.objectives.find((o) => !o.done)!.text);
    expect(tracked).not.toHaveTextContent(untracked.name);
  });

  it('counts the quests to claim as a button that opens Quests', () => {
    const [main, side] = SAMPLE_QUESTS;
    shown.quests = [
      { ...main, status: 'complete' },
      { ...side, status: 'complete' },
    ];
    const { onQuests } = sheet();
    const count = screen.getByTestId('claim-count');
    expect(count).toHaveTextContent('2 to claim');
    fireEvent.click(count);
    expect(onQuests).toHaveBeenCalledTimes(1);
  });

  it('Training goes to the Training Grounds, by its button or T, and carries the guided start target', () => {
    const { onTraining } = sheet();
    const training = screen.getByTestId('training-button');
    expect(training).toHaveAttribute('data-tutorial', 'hub.training');
    fireEvent.click(training);
    expect(onTraining).toHaveBeenCalledTimes(1);
    // The sheet is its own scope: it binds T itself.
    press('KeyT');
    expect(onTraining).toHaveBeenCalledTimes(2);
  });

  it('a lesson holds Delve, saying why', () => {
    engine.why = WHY;
    sheet();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(screen.getByTestId('lesson-block')).toHaveTextContent(WHY);
    expect(delve).toHaveAccessibleDescription(WHY);
    // Nothing to apply: the first focus is the dialog's Back.
    expect(delve).not.toHaveAttribute('data-pad-first');
    expect(document.activeElement).toHaveAttribute('data-pad-back');
  });

  it('an unapplied draft holds Delve: Apply (the first focus), or Discard changes & delve', () => {
    draft();
    const { onDelve } = sheet();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(delve).toHaveAttribute('aria-describedby', screen.getByTestId('draft-warning').id);
    // Free before the first dive, so Apply can go: it takes the first focus.
    expect(document.activeElement).toBe(screen.getByTestId('draft-apply'));
    fireEvent.click(screen.getByTestId('draft-discard-delve'));
    expect(useDelveStore.getState().chainDraft).toBeNull();
    expect(onDelve).toHaveBeenCalledTimes(1);
  });

  it("Apply sets the draft and frees Delve; one the engine refuses says why and leaves the focus to Back", () => {
    draft();
    sheet();
    fireEvent.click(screen.getByTestId('draft-apply'));
    expect(useDelveStore.getState().chainDraft).toBeNull();
    expect(screen.queryByTestId('draft-block')).toBeNull();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
    cleanup();
    // After a first dive an edit costs Mana Dust, and this hero has none.
    const p = useDelveStore.getState().profile;
    useDelveStore.getState().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 0 });
    draft();
    sheet();
    const apply = screen.getByTestId('draft-apply');
    expect(apply).toBeDisabled();
    const why = screen.getByTestId('draft-apply-why');
    expect(apply).toHaveAttribute('aria-describedby', why.id);
    expect(document.activeElement).toHaveAttribute('data-pad-back');
  });

  it("under a lesson a draft offers no discard (it would only drop the lesson's draft)", () => {
    draft();
    engine.why = WHY;
    sheet();
    expect(screen.getByTestId('draft-apply')).toBeInTheDocument();
    expect(screen.queryByTestId('draft-discard-delve')).toBeNull();
  });

  it('a dive in progress reads Resume, and nothing holds it or sits beside it', () => {
    useDelveStore.getState().startDive(1);
    engine.why = WHY;
    engine.starts = [1, 6];
    const [main] = SAMPLE_QUESTS;
    shown.quests = [{ ...main, status: 'complete' }];
    sheet();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeEnabled();
    expect(delve).toHaveTextContent('Resume dive · depth 1');
    expect(screen.queryByTestId('start-depths')).toBeNull();
    expect(screen.queryByTestId('claim-count')).toBeNull();
    expect(screen.queryByTestId('lesson-block')).toBeNull();
  });
});
