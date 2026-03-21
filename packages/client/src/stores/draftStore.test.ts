import { describe, it, expect, beforeEach } from 'vitest';
import { useDraftStore } from './draftStore';

describe('draftStore', () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it('starts with no selection', () => {
    const state = useDraftStore.getState();
    expect(state.selectedOrbUid).toBeNull();
  });

  it('selectOrb sets the selected orb', () => {
    useDraftStore.getState().selectOrb('orb-1');
    expect(useDraftStore.getState().selectedOrbUid).toBe('orb-1');
  });

  it('selecting a different orb switches selection', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().selectOrb('orb-2');
    expect(useDraftStore.getState().selectedOrbUid).toBe('orb-2');
  });

  it('confirmPick clears selection', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().confirmPick();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
  });

  it('cancelSelection clears selection', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().cancelSelection();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
  });

  it('reset clears everything', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().reset();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
  });
});
