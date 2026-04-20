// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OnboardingOverlay } from '@/components/OnboardingOverlay';

describe('OnboardingOverlay', () => {
  it('renders step 1 on mount', () => {
    render(<OnboardingOverlay onDismiss={() => {}} />);
    expect(screen.getByText(/Draft your gems/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 of 3/i)).toBeTruthy();
  });

  it('advances through steps on NEXT', () => {
    render(<OnboardingOverlay onDismiss={() => {}} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByText(/Combine to discover/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByText(/Win with what you bring/i)).toBeTruthy();
  });

  it('calls onDismiss on GOT IT', () => {
    const onDismiss = vi.fn();
    render(<OnboardingOverlay onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onDismiss on SKIP', () => {
    const onDismiss = vi.fn();
    render(<OnboardingOverlay onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText(/SKIP/i));
    expect(onDismiss).toHaveBeenCalled();
  });
});
