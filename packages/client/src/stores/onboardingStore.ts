import { createHmrStore } from './hmr-store';

const STORAGE_KEY = 'alloy.onboarding.seen';
const TRANSPLANT_TUTORIAL_KEY = 'alloy.onboarding.transplant-tutorial-seen';

interface OnboardingStore {
  seen: boolean;
  hydrate: () => void;
  markSeen: () => void;
  reset: () => void;

  hasSeenTransplantTutorial: boolean;
  markTransplantTutorialSeen: () => void;
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TRANSPLANT_TUTORIAL_KEY);
    }
    set({ seen: false, hasSeenTransplantTutorial: false });
  },

  hasSeenTransplantTutorial:
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(TRANSPLANT_TUTORIAL_KEY) === 'true',
  markTransplantTutorialSeen: () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TRANSPLANT_TUTORIAL_KEY, 'true');
    set({ hasSeenTransplantTutorial: true });
  },
}));
