import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { heroChains } from '@alloy/engine';
import { HubFooter } from '../HubFooter';
import { ApplyBar } from '../skills/ApplyBar';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { armed } from '@/features/delve/__tests__/armed';

// A lesson's hold, as the engine gives it (mocked). The footer's Delve only opens the Depart
// sheet, which says what holds a dive (see DepartSheet.test.tsx): nothing here waits on it.
const lesson = vi.hoisted(() => ({ why: null as string | null }));
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: () => lesson.why,
}));

const WHY = "Finish Hesta's lesson or skip it";
/** An unapplied change to the Primary, as the chain builder leaves one. */
const draft = () => {
  const s = useDelveStore.getState();
  s.setProfile(armed(s.profile));
  const { profile } = useDelveStore.getState();
  const primary = heroChains(getDelveRegistry(), profile.equipped, profile.pair).primary!;
  act(() => s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }));
};

describe("the hub's footer", () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    lesson.why = null;
  });

  it('holds one button, Delve, that opens the Depart sheet and is never disabled', () => {
    const onDepart = vi.fn();
    render(<HubFooter prompts={[]} start={6} onDepart={onDepart} />);
    const depart = screen.getByTestId('depart-button');
    expect(depart).toHaveTextContent('Delve ▸ depth 6');
    expect(depart).toBeEnabled();
    expect(depart).toHaveAttribute('data-pad-menu');
    expect(depart).toHaveAttribute('data-pad-first');
    expect(depart).toHaveAttribute('data-tutorial', 'hub.delve');
    expect(depart).toHaveAttribute('data-primary-action', 'delve');
    fireEvent.click(depart);
    expect(onDepart).toHaveBeenCalledTimes(1);
    for (const gone of [
      'delve-button',
      'training-button',
      'start-depths',
      'claim-count',
      'lesson-block',
      'draft-block',
    ])
      expect(screen.queryByTestId(gone)).toBeNull();
  });

  it('stays enabled under a lesson and over an unapplied draft: the sheet says what holds the dive', () => {
    lesson.why = WHY;
    draft();
    render(<HubFooter prompts={[]} start={1} onDepart={() => {}} />);
    expect(screen.getByTestId('depart-button')).toBeEnabled();
    expect(screen.queryByTestId('lesson-block')).toBeNull();
    expect(screen.queryByTestId('draft-block')).toBeNull();
  });

  it('reads Resume while a dive is open', () => {
    useDelveStore.getState().startDive(1);
    render(<HubFooter prompts={[]} start={1} onDepart={() => {}} />);
    expect(screen.getByTestId('depart-button')).toHaveTextContent('Resume dive · depth 1');
  });

  it("a tab's own action replaces the button", () => {
    render(
      <HubFooter prompts={[]} start={1} onDepart={() => {}} action={<span data-testid="own" />} />,
    );
    expect(screen.getByTestId('own')).toBeInTheDocument();
    expect(screen.queryByTestId('depart-button')).toBeNull();
  });

  it("the Skills tab's compact Delve opens the sheet too, whatever the lesson or the draft", () => {
    lesson.why = WHY;
    draft();
    const onDelve = vi.fn();
    render(<ApplyBar onDelve={onDelve} />);
    const depart = screen.getByTestId('depart-button');
    expect(depart).toBeEnabled();
    expect(depart).not.toHaveAttribute('title');
    expect(depart).toHaveAttribute('data-pad-menu');
    expect(depart).toHaveAttribute('data-tutorial', 'hub.delve');
    expect(depart).toHaveAttribute('data-primary-action', 'delve');
    fireEvent.click(depart);
    expect(onDelve).toHaveBeenCalledTimes(1);
  });
});
