import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore } from '@/stores/onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingStore.getState().reset();
  });

  it('defaults to seen=false', () => {
    expect(useOnboardingStore.getState().seen).toBe(false);
  });

  it('markSeen sets seen=true and persists', () => {
    useOnboardingStore.getState().markSeen();
    expect(useOnboardingStore.getState().seen).toBe(true);
    expect(localStorage.getItem('alloy.onboarding.seen')).toBe('true');
  });

  it('hydrates from localStorage on first read', () => {
    // reset clears state; then we seed localStorage and hydrate to simulate fresh load
    useOnboardingStore.getState().reset();
    localStorage.setItem('alloy.onboarding.seen', 'true');
    useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().seen).toBe(true);
  });

  it('reset clears both state and localStorage', () => {
    useOnboardingStore.getState().markSeen();
    useOnboardingStore.getState().reset();
    expect(useOnboardingStore.getState().seen).toBe(false);
    expect(localStorage.getItem('alloy.onboarding.seen')).toBeNull();
  });
});
