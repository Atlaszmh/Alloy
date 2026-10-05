import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({ isMuted: false });
  });

  it('toggles mute', () => {
    expect(useUIStore.getState().isMuted).toBe(false);
    useUIStore.getState().toggleMute();
    expect(useUIStore.getState().isMuted).toBe(true);
    useUIStore.getState().toggleMute();
    expect(useUIStore.getState().isMuted).toBe(false);
  });

  describe('Delve UI scale fields', () => {
    const KEYS = ['alloy:delve:hudScale', 'alloy:delve:viewUnits', 'alloy:delve:hud'];
    const fresh = async () => {
      (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.clear();
      vi.resetModules();
      return (await import('./uiStore')).useUIStore;
    };
    afterEach(() => KEYS.forEach((k) => localStorage.removeItem(k)));

    it('defaults to ui 1, hud 1 and 27 view units', async () => {
      const s = (await fresh()).getState();
      expect([s.uiScale, s.hudScale, s.arenaViewUnits]).toEqual([1, 1, 27]);
    });

    it('persists hudScale and arenaViewUnits, not uiScale, and hydrates them', async () => {
      const store = await fresh();
      store.getState().setUiScale(1.5);
      store.getState().setHudScale(1.25);
      store.getState().setArenaViewUnits(22);
      expect(store.getState().uiScale).toBe(1.5);
      const s = (await fresh()).getState();
      expect([s.uiScale, s.hudScale, s.arenaViewUnits]).toEqual([1, 1.25, 22]);
    });

    it('falls back to the defaults on a corrupt value', async () => {
      localStorage.setItem('alloy:delve:hudScale', 'banana');
      localStorage.setItem('alloy:delve:viewUnits', '');
      const s = (await fresh()).getState();
      expect([s.hudScale, s.arenaViewUnits]).toEqual([1, 27]);
    });

    it('the HUD is lean by default, persists a choice of full, and reads anything else as lean', async () => {
      const store = await fresh();
      expect(store.getState().hudMode).toBe('lean');
      store.getState().setHudMode('full');
      expect(localStorage.getItem('alloy:delve:hud')).toBe('full');
      expect((await fresh()).getState().hudMode).toBe('full');
      localStorage.setItem('alloy:delve:hud', 'banana');
      expect((await fresh()).getState().hudMode).toBe('lean');
    });

    it('clamps hudScale to 0.8–1.25 and arenaViewUnits to 20–30, loaded or set', async () => {
      localStorage.setItem('alloy:delve:hudScale', '9');
      localStorage.setItem('alloy:delve:viewUnits', '2');
      const store = await fresh();
      expect([store.getState().hudScale, store.getState().arenaViewUnits]).toEqual([1.25, 20]);
      store.getState().setHudScale(0.1);
      store.getState().setArenaViewUnits(99);
      expect([store.getState().hudScale, store.getState().arenaViewUnits]).toEqual([0.8, 30]);
      expect(localStorage.getItem('alloy:delve:hudScale')).toBe('0.8');
      expect(localStorage.getItem('alloy:delve:viewUnits')).toBe('30');
    });
  });
});
