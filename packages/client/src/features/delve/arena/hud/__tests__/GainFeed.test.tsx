import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer, showToast } from '@/components/Toast';
import { GainFeed } from '../GainFeed';
import { FEED_MS } from '../gain-feed';

const store = () => useDelveStore.getState();
/** The dive picks up `scrap` more (a bank). */
const gain = (scrap: number) =>
  act(() => {
    const s = store();
    const dive = s.profile.dive!;
    s.setProfile({ ...s.profile, dive: { ...dive, haul: { ...dive.haul, scrap: dive.haul.scrap + scrap } } });
  });
const lines = () => screen.queryAllByTestId('feed-line').map((l) => l.textContent);

describe('GainFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });
  afterEach(() => vi.useRealTimers());

  it('shows nothing for what the dive held when it mounted, and never takes the pointer', () => {
    gain(40);
    render(<GainFeed live />);
    expect(lines()).toEqual([]);
    expect(screen.getByTestId('gain-feed')).toHaveClass('pointer-events-none');
  });

  it('a pickup is a line, the same kind merging as it grows, gone FEED_MS after its last gain', () => {
    render(<GainFeed live />);
    gain(12);
    expect(lines()).toEqual(['+12 Scrap']);
    act(() => vi.advanceTimersByTime(FEED_MS - 1000));
    gain(147);
    expect(lines()).toEqual(['+159 Scrap']);
    act(() => vi.advanceTimersByTime(FEED_MS - 1));
    expect(lines()).toEqual(['+159 Scrap']);
    act(() => vi.advanceTimersByTime(1));
    expect(lines()).toEqual([]);
  });

  it('while the fight is live every toast is a line; paused, the toasts go to the container', () => {
    const { rerender } = render(
      <>
        <GainFeed live />
        <ToastContainer />
      </>,
    );
    act(() => showToast('Pattern learned: Maul'));
    expect(within(screen.getByTestId('gain-feed')).getByText('Pattern learned: Maul')).toBeInTheDocument();
    rerender(
      <>
        <GainFeed live={false} />
        <ToastContainer />
      </>,
    );
    act(() => showToast('Equip: done'));
    expect(within(screen.getByTestId('gain-feed')).queryByText('Equip: done')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });
});
