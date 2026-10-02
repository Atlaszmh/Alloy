import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useControlsStore } from '@/stores/controlsStore';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import { QuestTracker } from '../QuestTracker';
import { SAMPLE_QUESTS } from '../sample';
import type { QuestView } from '../types';

const tracked = (q: QuestView, id = q.id): QuestView => ({ ...q, id, tracked: true });

describe('QuestTracker', () => {
  it('renders nothing while no quest is tracked', () => {
    const { container } = render(
      <QuestTracker quests={SAMPLE_QUESTS.map((q) => ({ ...q, tracked: false }))} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(render(<QuestTracker quests={[]} />).container).toBeEmptyDOMElement();
  });

  it('shows up to three tracked quests with their kind, name and objectives', () => {
    const [main, side, , bounty] = SAMPLE_QUESTS;
    render(
      <QuestTracker
        quests={[tracked(main), tracked(side), tracked(bounty), tracked(side, 'fourth')]}
      />,
    );
    const tracker = screen.getByTestId('quest-tracker');
    expect(within(tracker).getByText('Quests')).toBeInTheDocument();
    expect(within(tracker).getByText('Journal')).toBeInTheDocument();
    expect(screen.queryByTestId('tracked-fourth')).toBeNull();
    const first = screen.getByTestId('tracked-frozen-foreman');
    expect(first).toHaveTextContent('Main');
    expect(first).toHaveTextContent('The Frozen Foreman');
    expect(first).toHaveTextContent('Descend to depth 8');
    expect(first).toHaveTextContent('6 / 8');
    expect(within(first).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByTestId('tracked-rat-catcher')).toHaveTextContent('Bounty');
    expect(screen.getByTestId('tracked-kindling')).toHaveTextContent('12 / 20');
  });

  it('its Journal hint opens the journal when the HUD passes onJournal', () => {
    const onJournal = vi.fn();
    render(<QuestTracker quests={[tracked(SAMPLE_QUESTS[0])]} onJournal={onJournal} />);
    const journal = screen.getByRole('button', { name: /Journal/ });
    expect(fireEvent.mouseDown(journal)).toBe(false); // the focus stays where it was
    fireEvent.click(journal);
    expect(onJournal).toHaveBeenCalledOnce();
  });

  it("its Journal hint shows the player's binding", () => {
    render(<QuestTracker quests={[tracked(SAMPLE_QUESTS[0])]} />);
    expect(screen.getByTestId('quest-tracker')).toHaveTextContent('JJournal');
    act(() => useControlsStore.getState().setKey('journal', 'KeyB'));
    try {
      expect(screen.getByTestId('quest-tracker')).toHaveTextContent('BJournal');
    } finally {
      useControlsStore.setState({ config: DEFAULT_CONTROLS });
    }
  });
});
