import { createHmrStore } from './hmr-store';

const STORAGE_KEY = 'alloy.onboarding.seen';

interface OnboardingStore {
  seen: boolean;
  hydrate: () => void;
  markSeen: () => void;
  reset: () => void;
}

export const useOnboardingStore = createHmrStore<OnboardingStore>('onboardingStore', (set) => ({
  seen: typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true',
  hydrate: () => {
    if (typeof localStorage === 'undefined') return;
    set({ seen: localStorage.getItem(STORAGE_KEY) === 'true' });
  },
  markSeen: () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, 'true');
    set({ seen: true });
  },
  reset: () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ seen: false });
  },
}));
