import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset to defaults
    useUIStore.setState({
      modalOpen: null,
      toastMessage: null,
      toastType: 'info',
      isMuted: false,
      showDebug: false,
      duelSpeed: 1,
    });
  });

  it('opens and closes modals', () => {
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().modalOpen).toBe('settings');

    useUIStore.getState().closeModal();
    expect(useUIStore.getState().modalOpen).toBeNull();
  });

  it('shows and clears toasts', () => {
    useUIStore.getState().toast('Test message', 'success');
    expect(useUIStore.getState().toastMessage).toBe('Test message');
    expect(useUIStore.getState().toastType).toBe('success');

    useUIStore.getState().clearToast();
    expect(useUIStore.getState().toastMessage).toBeNull();
  });

  it('toggles mute', () => {
    expect(useUIStore.getState().isMuted).toBe(false);
    useUIStore.getState().toggleMute();
    expect(useUIStore.getState().isMuted).toBe(true);
    useUIStore.getState().toggleMute();
    expect(useUIStore.getState().isMuted).toBe(false);
  });

  it('toggles debug', () => {
    expect(useUIStore.getState().showDebug).toBe(false);
    useUIStore.getState().toggleDebug();
    expect(useUIStore.getState().showDebug).toBe(true);
  });

  describe('duelSpeed', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      try { localStorage.removeItem('alloy:duelSpeed'); } catch { /* noop */ }
    });

    it('defaults to 1', () => {
      expect(useUIStore.getState().duelSpeed).toBe(1);
    });

    it('accepts 1, 2, and 3 via setDuelSpeed', () => {
      useUIStore.getState().setDuelSpeed(2);
      expect(useUIStore.getState().duelSpeed).toBe(2);

      useUIStore.getState().setDuelSpeed(3);
      expect(useUIStore.getState().duelSpeed).toBe(3);

      useUIStore.getState().setDuelSpeed(1);
      expect(useUIStore.getState().duelSpeed).toBe(1);
    });

    it('runtime clamps out-of-range values to 1', () => {
      // Types enforce 1|2|3 at compile time; this guards against any runtime
      // path (e.g. legacy persisted localStorage) bypassing the type union.
      useUIStore.getState().setDuelSpeed(5 as unknown as 1 | 2 | 3);
      expect(useUIStore.getState().duelSpeed).toBe(1);

      useUIStore.getState().setDuelSpeed(0 as unknown as 1 | 2 | 3);
      expect(useUIStore.getState().duelSpeed).toBe(1);
    });

    it('persists duelSpeed to localStorage on set', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      useUIStore.getState().setDuelSpeed(2);
      expect(spy).toHaveBeenCalledWith('alloy:duelSpeed', '2');
    });

    it('hydrates duelSpeed from localStorage on store init', async () => {
      // Seed localStorage before dynamically re-importing the module to
      // exercise the hydration path (`loadDuelSpeed()`). createHmrStore
      // caches on globalThis to survive HMR; clear that cache so the
      // re-import actually runs the creator again.
      (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.clear();
      localStorage.setItem('alloy:duelSpeed', '3');
      vi.resetModules();
      const { useUIStore: freshStore } = await import('./uiStore');
      expect(freshStore.getState().duelSpeed).toBe(3);
    });

    it('falls back to 1 when localStorage has an invalid value', async () => {
      (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.clear();
      localStorage.setItem('alloy:duelSpeed', 'banana');
      vi.resetModules();
      const { useUIStore: freshStore } = await import('./uiStore');
      expect(freshStore.getState().duelSpeed).toBe(1);
    });
  });
});
