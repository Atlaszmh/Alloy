// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisconnectOverlay } from '../DisconnectOverlay';

describe('DisconnectOverlay', () => {
  it('renders nothing when not disconnected', () => {
    const { container } = render(
      <DisconnectOverlay isDisconnected={false} secondsLeft={30} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows overlay with countdown when disconnected', () => {
    render(<DisconnectOverlay isDisconnected={true} secondsLeft={45} />);

    expect(screen.getByText('Opponent Disconnected')).toBeTruthy();
    expect(screen.getByText(/45s/)).toBeTruthy();
  });

  it('shows reconnect waiting message', () => {
    render(<DisconnectOverlay isDisconnected={true} secondsLeft={30} />);

    expect(screen.getByText(/Waiting for reconnect/)).toBeTruthy();
  });

  it('updates countdown display when secondsLeft changes', () => {
    const { rerender } = render(
      <DisconnectOverlay isDisconnected={true} secondsLeft={60} />,
    );

    expect(screen.getByText(/60s/)).toBeTruthy();

    rerender(<DisconnectOverlay isDisconnected={true} secondsLeft={15} />);

    expect(screen.getByText(/15s/)).toBeTruthy();
    expect(screen.queryByText(/60s/)).toBeNull();
  });

  it('renders progress bar with correct width based on secondsLeft', () => {
    const { container } = render(
      <DisconnectOverlay isDisconnected={true} secondsLeft={30} />,
    );

    // The progress bar width is (secondsLeft / 60) * 100 = 50%
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toBeTruthy();
    expect(progressBar!.getAttribute('style')).toContain('50%');
  });
});
