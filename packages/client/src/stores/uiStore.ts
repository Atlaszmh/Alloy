import { create } from 'zustand';

interface UIStore {
  modalOpen: string | null;
  toastMessage: string | null;
  toastType: 'info' | 'success' | 'warning' | 'error';
  isMuted: boolean;
  showDebug: boolean;

  openModal: (id: string) => void;
  closeModal: () => void;
  toast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearToast: () => void;
  toggleMute: () => void;
  toggleDebug: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  modalOpen: null,
  toastMessage: null,
  toastType: 'info',
  isMuted: false,
  showDebug: false,

  openModal: (id) => set({ modalOpen: id }),
  closeModal: () => set({ modalOpen: null }),
  toast: (message, type = 'info') => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
}));
