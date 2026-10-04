import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HubFooter } from '../HubFooter';
import { ApplyBar } from '../skills/ApplyBar';
import { useDelveStore } from '@/stores/delveStore';

// See the tutorial spec's gates: an unfinished Anvil lesson holds the Delve button, with
// `tutorialBlocksDive`'s reason (B1's; mocked here).
const lesson = vi.hoisted(() => ({ why: null as string | null }));
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: () => lesson.why,
}));

const WHY = "Finish Hesta's lesson or skip it";
const footer = () =>
  render(
    <HubFooter
      prompts={[]}
      onTraining={() => {}}
      start={1}
      onStart={() => {}}
      onDelve={() => {}}
    />,
  );

describe("the hub's Delve while a lesson runs", () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    lesson.why = null;
  });

  it('waits, saying why, while a lesson is unfinished', () => {
    lesson.why = WHY;
    footer();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(screen.getByTestId('lesson-block')).toHaveTextContent(WHY);
    expect(delve).toHaveAccessibleDescription(WHY);
  });

  it('goes when no lesson holds it', () => {
    footer();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
    expect(screen.queryByTestId('lesson-block')).toBeNull();
  });

  it("never holds a dive's Resume", () => {
    useDelveStore.getState().startDive(1);
    lesson.why = WHY;
    footer();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
    expect(screen.getByTestId('delve-button')).toHaveTextContent('Resume dive');
  });

  it("the Skills tab's compact Delve waits too, its reason as its title", () => {
    lesson.why = WHY;
    render(<ApplyBar onDelve={() => {}} />);
    expect(screen.getByTestId('delve-button')).toBeDisabled();
    expect(screen.getByTestId('delve-button')).toHaveAttribute('title', WHY);
  });
});
