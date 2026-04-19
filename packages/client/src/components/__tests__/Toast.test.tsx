// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastContainer, showToast } from '../Toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders a gold-styled toast when variant=discovery', () => {
    render(<ToastContainer />);
    act(() => {
      showToast('New Recipe: Ignite', { variant: 'discovery' });
    });
    const el = screen.getByText(/New Recipe: Ignite/);
    expect(el.closest('[data-variant]')?.getAttribute('data-variant')).toBe('discovery');
  });

  it('default variant has no star prefix; discovery variant does', () => {
    const { unmount } = render(<ToastContainer />);
    act(() => {
      showToast('plain message');
    });
    // Default toast text should NOT start with star
    const defaultEl = screen.getByText(/plain message/);
    expect(defaultEl.textContent?.trim().startsWith('★')).toBe(false);
    unmount();

    render(<ToastContainer />);
    act(() => {
      showToast('discovery message', { variant: 'discovery' });
    });
    const discoveryEl = screen.getByText(/discovery message/);
    expect(discoveryEl.textContent?.trim().startsWith('★')).toBe(true);
  });

  it('two toasts show simultaneously without overlap', () => {
    render(<ToastContainer />);
    act(() => {
      showToast('first toast');
      showToast('second toast', { variant: 'discovery' });
    });
    expect(screen.getByText(/first toast/)).toBeTruthy();
    expect(screen.getByText(/second toast/)).toBeTruthy();
  });

  it('toast auto-dismisses after 2000ms', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);
    act(() => {
      showToast('ephemeral');
    });
    expect(screen.queryByText(/ephemeral/)).toBeTruthy();

    // Advance just under 2000ms — still there
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.queryByText(/ephemeral/)).toBeTruthy();

    // Advance past 2000ms — gone
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText(/ephemeral/)).toBeNull();
  });
});
