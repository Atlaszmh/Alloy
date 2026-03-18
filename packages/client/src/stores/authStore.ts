import { create } from 'zustand';
import { getSupabase } from '@/shared/utils/supabase';

interface AuthState {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  supabaseUserId: string | null;
  setPlayer: (id: string, name: string, isGuest: boolean) => void;
  loginAsGuest: () => void;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  playerId: '',
  displayName: '',
  isGuest: true,
  supabaseUserId: null,

  setPlayer: (playerId, displayName, isGuest) => set({ playerId, displayName, isGuest }),

  loginAsGuest: () => {
    const guestId = `guest_${Date.now()}`;
    set({ playerId: guestId, displayName: 'Guest', isGuest: true, supabaseUserId: null });
  },

  initAuth: async () => {
    const supabase = getSupabase();

    if (!supabase) {
      // Offline mode — fall back to guest
      get().loginAsGuest();
      return;
    }

    try {
      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        set({
          playerId: session.user.id,
          displayName: session.user.user_metadata?.display_name ?? 'Player',
          isGuest: session.user.is_anonymous ?? false,
          supabaseUserId: session.user.id,
        });
        return;
      }

      // No session — sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error || !data.user) {
        console.warn('[Auth] Anonymous sign-in failed, falling back to guest:', error?.message);
        get().loginAsGuest();
        return;
      }

      set({
        playerId: data.user.id,
        displayName: 'Player',
        isGuest: true,
        supabaseUserId: data.user.id,
      });
    } catch (err) {
      console.warn('[Auth] Auth initialization failed, falling back to guest:', err);
      get().loginAsGuest();
    }
  },
}));
