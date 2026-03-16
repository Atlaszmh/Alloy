import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the given duration', () => {
    const { result } = renderHook(() => useCountdown(5000));
    expect(result.current).toBe(5000);
  });

  it('counts down over time', () => {
    const { result } = renderHook(() => useCountdown(5000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // After 1 second (10 intervals of 100ms), remaining should be ~4000
    expect(result.current).toBeLessThanOrEqual(4100);
    expect(result.current).toBeGreaterThanOrEqual(3900);
  });

  it('does not go below zero', () => {
    const { result } = renderHook(() => useCountdown(500));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(0);
  });

  // Regression: onExpire must NOT be called inside a setState updater.
  // It must be deferred to a useEffect to avoid "Cannot update component
  // while rendering a different component" errors.
  it('calls onExpire when timer reaches zero without causing setState-during-render', () => {
    const onExpire = vi.fn();
    renderHook(() => useCountdown(300, onExpire));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not call onExpire multiple times', () => {
    const onExpire = vi.fn();
    renderHook(() => useCountdown(200, onExpire));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should only fire once, not on every tick after reaching 0
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('pauses countdown when paused is true', () => {
    const { result } = renderHook(() => useCountdown(5000, undefined, true));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should still be at 5000 since paused
    expect(result.current).toBe(5000);
  });

  it('resets when durationMs changes', () => {
    const { result, rerender } = renderHook(
      ({ duration }) => useCountdown(duration),
      { initialProps: { duration: 5000 } },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Rerender with new duration
    rerender({ duration: 10000 });

    expect(result.current).toBe(10000);
  });
});
