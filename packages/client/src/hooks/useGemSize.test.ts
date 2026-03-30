import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGemSize } from './useGemSize';

describe('useGemSize', () => {
  it('returns largest size for ≤8 gems', () => {
    const { result } = renderHook(() => useGemSize(8));
    expect(result.current.gemSize).toBe(100);
    expect(result.current.columns).toBe(4);
  });

  it('returns medium size for 12 gems (ranked R2-R3)', () => {
    const { result } = renderHook(() => useGemSize(12));
    expect(result.current.gemSize).toBe(88);
    expect(result.current.columns).toBe(4);
  });

  it('returns compact size for 16 gems', () => {
    const { result } = renderHook(() => useGemSize(16));
    expect(result.current.gemSize).toBe(82);
    expect(result.current.columns).toBe(4);
  });

  it('returns small size for 24 gems (ranked R1)', () => {
    const { result } = renderHook(() => useGemSize(24));
    expect(result.current.gemSize).toBe(68);
    expect(result.current.columns).toBe(5);
  });

  it('returns smallest size for 32 gems (quick full)', () => {
    const { result } = renderHook(() => useGemSize(32));
    expect(result.current.gemSize).toBe(62);
    expect(result.current.columns).toBe(5);
  });

  it('scales up as pool shrinks', () => {
    const { result: r32 } = renderHook(() => useGemSize(32));
    const { result: r8 } = renderHook(() => useGemSize(8));
    expect(r8.current.gemSize).toBeGreaterThan(r32.current.gemSize);
  });

  it('shrinks gems when container is narrow', () => {
    const { result } = renderHook(() => useGemSize(24, 300));
    expect(result.current.gemSize).toBeLessThan(68);
    expect(result.current.columns).toBe(5);
  });

  it('enforces minimum gem size of 48px', () => {
    const { result } = renderHook(() => useGemSize(24, 100));
    expect(result.current.gemSize).toBe(48);
  });

  describe('forge context', () => {
    it('returns forge-large for ≤8 gems', () => {
      const { result } = renderHook(() => useGemSize(8, undefined, 'forge'));
      expect(result.current.gemSize).toBe(76);
      expect(result.current.columns).toBe(4);
    });

    it('returns forge-medium for 9-12 gems', () => {
      const { result } = renderHook(() => useGemSize(12, undefined, 'forge'));
      expect(result.current.gemSize).toBe(68);
      expect(result.current.columns).toBe(4);
    });

    it('returns forge-small for 13-16 gems', () => {
      const { result } = renderHook(() => useGemSize(16, undefined, 'forge'));
      expect(result.current.gemSize).toBe(58);
      expect(result.current.columns).toBe(5);
    });

    it('returns forge-xs for 17+ gems', () => {
      const { result } = renderHook(() => useGemSize(20, undefined, 'forge'));
      expect(result.current.gemSize).toBe(52);
      expect(result.current.columns).toBe(5);
    });

    it('defaults to draft context', () => {
      const { result } = renderHook(() => useGemSize(8));
      expect(result.current.gemSize).toBe(100); // Draft breakpoint, not forge
    });
  });
});
