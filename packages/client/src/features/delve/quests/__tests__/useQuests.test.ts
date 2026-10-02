import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QUEST_PREVIEW_KEY, useQuests } from '../useQuests';
import { MAX_TRACKED } from '../types';

describe('useQuests', () => {
  beforeEach(() => localStorage.clear());

  it('has no quests in v1', () => {
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([]);
  });

  it('fills from the fixture under the dev preview flag, and tracks at most three', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
    const { result } = renderHook(() => useQuests());
    const tracked = () => result.current.quests.filter((q) => q.tracked).map((q) => q.id);
    expect(result.current.quests.map((q) => q.kind)).toEqual(['main', 'side', 'side', 'bounty']);
    expect(tracked()).toEqual(['frozen-foreman', 'kindling']);
    act(() => result.current.setTracked('deep-roots', true));
    expect(tracked()).toHaveLength(MAX_TRACKED);
    act(() => result.current.setTracked('rat-catcher', true));
    expect(tracked()).toEqual(['frozen-foreman', 'kindling', 'deep-roots']);
    act(() => result.current.setTracked('kindling', false));
    expect(tracked()).toEqual(['frozen-foreman', 'deep-roots']);
  });
});
