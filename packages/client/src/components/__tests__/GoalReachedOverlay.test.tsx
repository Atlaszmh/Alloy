import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GoalReachedOverlay } from '@/components/GoalReachedOverlay';

describe('GoalReachedOverlay', () => {
  it('renders the headline and round numbers', () => {
    render(<GoalReachedOverlay roundReached={10} goalRound={10} />);
    expect(screen.getByText(/GOAL REACHED/i)).toBeTruthy();
    expect(screen.getByText(/Round 10 \/ 10/)).toBeTruthy();
  });
});
