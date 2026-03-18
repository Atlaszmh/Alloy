// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Matchmaking } from '../Matchmaking';
import { useMatchStore } from '@/stores/matchStore';

// Track navigation
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock supabase — offline by default
let mockOnline = false;
vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(() => null),
  isOnline: vi.fn(() => mockOnline),
}));

// Mock useMatchmaking
vi.mock('@/features/matchmaking/hooks/useMatchmaking', () => ({
  useMatchmaking: vi.fn(() => ({
    status: 'idle',
    matchId: null,
    roomCode: null,
    queueTime: 0,
    offerAi: false,
    joinQueue: vi.fn(),
    leaveQueue: vi.fn(),
  })),
}));

function renderMatchmaking() {
  return render(
    <MemoryRouter initialEntries={['/queue']}>
      <Routes>
        <Route path="/queue" element={<Matchmaking />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Matchmaking page', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOnline = false;
    useMatchStore.getState().reset();
  });

  it('renders the menu view with Play vs AI button', () => {
    renderMatchmaking();
    expect(screen.getByText('Play vs AI')).toBeTruthy();
    expect(screen.getByText('Play')).toBeTruthy();
  });

  it('clicking Play vs AI shows tier selection buttons', () => {
    renderMatchmaking();

    fireEvent.click(screen.getByText('Play vs AI'));

    expect(screen.getByText('Choose AI Tier')).toBeTruthy();
    expect(screen.getByText(/Tier 1/)).toBeTruthy();
    expect(screen.getByText(/Tier 2/)).toBeTruthy();
    expect(screen.getByText(/Tier 3/)).toBeTruthy();
    expect(screen.getByText(/Tier 4/)).toBeTruthy();
    expect(screen.getByText(/Tier 5/)).toBeTruthy();
  });

  it('clicking a tier button starts a match and navigates', () => {
    renderMatchmaking();

    fireEvent.click(screen.getByText('Play vs AI'));
    fireEvent.click(screen.getByText(/Tier 1/));

    // Should have navigated to a match URL with ai- prefix
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/\/match\/ai-[a-z0-9]+\/draft/),
    );
  });

  it('PvP buttons hidden when offline', () => {
    mockOnline = false;
    renderMatchmaking();

    expect(screen.getByText('Play vs AI')).toBeTruthy();
    expect(screen.queryByText('Find Match')).toBeNull();
    expect(screen.queryByText('Create Match')).toBeNull();
    expect(screen.queryByText('Join Match')).toBeNull();
  });

  it('PvP buttons visible when online', () => {
    mockOnline = true;
    renderMatchmaking();

    expect(screen.getByText('Play vs AI')).toBeTruthy();
    expect(screen.getByText('Find Match')).toBeTruthy();
    expect(screen.getByText('Create Match')).toBeTruthy();
    expect(screen.getByText('Join Match')).toBeTruthy();
  });

  it('Back button navigates to /', () => {
    renderMatchmaking();

    fireEvent.click(screen.getByText('Back'));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
