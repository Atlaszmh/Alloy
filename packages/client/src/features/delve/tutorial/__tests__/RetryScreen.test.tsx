import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { RetryScreen } from '../RetryScreen';

describe('RetryScreen', () => {
  beforeEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it('Hesta pulls you back with advice, the inputs drawn for the device in hand', () => {
    render(<RetryScreen onRetry={vi.fn()} onSkip={vi.fn()} />);
    const root = screen.getByTestId('tutorial-retry');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
    expect(root.querySelector('[data-sprite="hesta"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hesta pulls you back');
    expect(root).toHaveTextContent('Nothing is lost');
    expect(root).toHaveTextContent('Dodge with Space');
    expect(root).toHaveTextContent('drink a potion with F');
  });

  it("Retry is the pad's first focus; Skip tutorial asks first", () => {
    const on = { onRetry: vi.fn(), onSkip: vi.fn() };
    render(<RetryScreen {...on} />);
    const retry = screen.getByTestId('retry-depth');
    expect(retry).toHaveAttribute('data-pad-first');
    fireEvent.click(retry);
    expect(on.onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('retry-skip-tutorial'));
    const confirm = screen.getByTestId('skip-tutorial');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Back' }));
    expect(on.onSkip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('retry-skip-tutorial'));
    fireEvent.click(screen.getByTestId('skip-tutorial-confirm'));
    expect(on.onSkip).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('skip-tutorial')).toBeNull();
  });
});
