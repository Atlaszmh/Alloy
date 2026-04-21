import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFrameMode } from './useFrameMode';

describe('useFrameMode', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-frame-mode');
  });

  test('defaults to portrait when attribute missing', () => {
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('portrait');
  });

  test('reads initial value from data-frame-mode', () => {
    document.documentElement.setAttribute('data-frame-mode', 'desktop');
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('desktop');
  });

  test('updates when attribute changes', async () => {
    document.documentElement.setAttribute('data-frame-mode', 'portrait');
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('portrait');
    await act(async () => {
      document.documentElement.setAttribute('data-frame-mode', 'desktop');
    });
    expect(result.current).toBe('desktop');
  });
});
