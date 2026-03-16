import { create } from 'zustand';

interface AuthState {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  setPlayer: (id: string, name: string, isGuest: boolean) => void;
  loginAsGuest: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  playerId: '',
  displayName: '',
  isGuest: true,
  setPlayer: (playerId, displayName, isGuest) => set({ playerId, displayName, isGuest }),
  loginAsGuest: () => {
    const guestId = `guest_${Date.now()}`;
    set({ playerId: guestId, displayName: 'Guest', isGuest: true });
  },
}));
