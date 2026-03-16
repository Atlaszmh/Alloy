import { describe, it, expect, beforeEach } from 'vitest';
import { useDraftStore } from './draftStore';

describe('draftStore', () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it('starts with no selection', () => {
    const state = useDraftStore.getState();
    expect(state.selectedOrbUid).toBeNull();
    expect(state.isConfirming).toBe(false);
  });

  it('selectOrb sets the selected orb', () => {
    useDraftStore.getState().selectOrb('orb-1');
    expect(useDraftStore.getState().selectedOrbUid).toBe('orb-1');
    expect(useDraftStore.getState().isConfirming).toBe(false);
  });

  it('selecting the same orb twice triggers confirmation', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().selectOrb('orb-1');
    expect(useDraftStore.getState().isConfirming).toBe(true);
  });

  it('selecting a different orb resets confirmation', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().selectOrb('orb-2');
    expect(useDraftStore.getState().selectedOrbUid).toBe('orb-2');
    expect(useDraftStore.getState().isConfirming).toBe(false);
  });

  it('confirmPick clears selection', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().confirmPick();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
    expect(useDraftStore.getState().isConfirming).toBe(false);
  });

  it('cancelSelection clears selection', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().cancelSelection();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
  });

  it('reset clears everything', () => {
    useDraftStore.getState().selectOrb('orb-1');
    useDraftStore.getState().selectOrb('orb-1'); // trigger confirming
    useDraftStore.getState().reset();
    expect(useDraftStore.getState().selectedOrbUid).toBeNull();
    expect(useDraftStore.getState().isConfirming).toBe(false);
  });
});
