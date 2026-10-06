import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUIStore, loadSeen } from '@/stores/uiStore';
import { useDelveStore } from '@/stores/delveStore';
import { ONBOARDING, useOnboarding } from '../onboarding';

const store = () => useDelveStore.getState();

describe('onboarding hints', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ seen: [] });
    store().resetProfile(1234, 'fire');
  });

  it("shows a screen's line until its action is done once, then never again on this device", () => {
    const first = renderHook(() => useOnboarding('loadout'));
    expect(first.result.current.hint).toBe(ONBOARDING.loadout);
    act(() => first.result.current.done());
    expect(first.result.current.hint).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('alloy:delve:seen')!)).toEqual(['loadout']);
    // A later visit (and a reload: the store reads it back).
    expect(renderHook(() => useOnboarding('loadout')).result.current.hint).toBeUndefined();
    expect(loadSeen()).toEqual(['loadout']);
    // Another screen's is its own.
    expect(renderHook(() => useOnboarding('skills')).result.current.hint).toBe(ONBOARDING.skills);
  });

  it('shows nothing on a guided save, nor where the screen is read-only; done still counts there', () => {
    act(() => store().startTutorial());
    const guided = renderHook(() => useOnboarding('forge'));
    expect(guided.result.current.hint).toBeUndefined();
    act(() => guided.result.current.done()); // forged during the lesson
    act(() => store().skipTutorial());
    expect(renderHook(() => useOnboarding('forge')).result.current.hint).toBeUndefined();
    expect(renderHook(() => useOnboarding('quests', false)).result.current.hint).toBeUndefined();
  });

  it('reads a saved list, and anything else as none', () => {
    for (const [saved, seen] of [
      ['["stop","forge"]', ['stop', 'forge']],
      ['{"stop":true}', []],
      ['not json', []],
      [null, []],
    ] as const) {
      if (saved === null) localStorage.removeItem('alloy:delve:seen');
      else localStorage.setItem('alloy:delve:seen', saved);
      expect(loadSeen()).toEqual(seen);
    }
  });
});
