import { describe, it, expect, beforeEach } from 'vitest';
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
});
