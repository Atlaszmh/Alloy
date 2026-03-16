import { describe, it, expect, beforeEach } from 'vitest';
import { useForgeStore } from './forgeStore';

describe('forgeStore', () => {
  beforeEach(() => {
    useForgeStore.getState().reset();
  });

  it('starts with weapon tab active', () => {
    expect(useForgeStore.getState().activeTab).toBe('weapon');
  });

  it('switches tabs', () => {
    useForgeStore.getState().setActiveTab('armor');
    expect(useForgeStore.getState().activeTab).toBe('armor');
  });

  it('selects and deselects orbs', () => {
    useForgeStore.getState().selectOrb('orb-1');
    expect(useForgeStore.getState().selectedOrbUid).toBe('orb-1');

    useForgeStore.getState().selectOrb(null);
    expect(useForgeStore.getState().selectedOrbUid).toBeNull();
  });

  it('tracks drag state', () => {
    useForgeStore.getState().startDrag('orb-1');
    expect(useForgeStore.getState().dragSource).toEqual({ orbUid: 'orb-1' });

    useForgeStore.getState().endDrag();
    expect(useForgeStore.getState().dragSource).toBeNull();
  });

  it('toggles combination visibility', () => {
    expect(useForgeStore.getState().showCombinations).toBe(false);
    useForgeStore.getState().toggleCombinations();
    expect(useForgeStore.getState().showCombinations).toBe(true);
    useForgeStore.getState().toggleCombinations();
    expect(useForgeStore.getState().showCombinations).toBe(false);
  });

  it('reset clears all state', () => {
    useForgeStore.getState().setActiveTab('armor');
    useForgeStore.getState().selectOrb('orb-1');
    useForgeStore.getState().startDrag('orb-2');
    useForgeStore.getState().toggleCombinations();

    useForgeStore.getState().reset();

    const state = useForgeStore.getState();
    expect(state.activeTab).toBe('weapon');
    expect(state.selectedOrbUid).toBeNull();
    expect(state.dragSource).toBeNull();
    expect(state.showCombinations).toBe(false);
  });
});
