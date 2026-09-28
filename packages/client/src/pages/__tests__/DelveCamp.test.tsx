import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DelveCamp } from '../DelveCamp';
import { useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('DelveCamp', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('the Training Grounds button opens the sandbox, even with a dive under way', () => {
    useDelveStore.getState().startDive(1);
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('training-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it('shows waiting notices as toasts, once', () => {
    const text = 'Storm now outweighs Fire: your basic attacks strike with Storm';
    act(() => useDelveStore.setState({ notices: [text] }));
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(useDelveStore.getState().notices).toEqual([]);
  });

  it('a new save chooses its mana first; Frost starts with frost gear and frost abilities', () => {
    useDelveStore.getState().resetProfile(99); // no primary yet
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    const choice = screen.getByTestId('mana-choice');
    expect(choice).toHaveAttribute('data-pad-scope');
    const storm = screen.getByTestId('mana-choice-storm');
    expect(storm).toHaveTextContent('Storm chains');
    expect(storm).toHaveTextContent('Shock');
    expect(storm).toHaveTextContent('Superconductor');
    fireEvent.click(screen.getByTestId('mana-choice-frost'));
    expect(screen.queryByTestId('mana-choice')).toBeNull();
    const p = useDelveStore.getState().profile;
    expect(p.pair).toEqual({ primary: 'frost', secondary: null });
    expect(p.equipped.weapon!.mana).toBe('frost');
    expect(p.abilities.defensive.elements).toEqual(['frost']);
  });

  it('asks nothing once the mana is chosen', () => {
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('mana-choice')).toBeNull();
  });
});
