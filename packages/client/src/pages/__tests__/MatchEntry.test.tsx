// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MatchEntry } from '../MatchEntry';

// Track navigation
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock supabase — offline by default (returns null)
vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(() => null),
  isOnline: vi.fn(() => false),
}));

function renderMatchEntry(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/match/${code}`]}>
      <Routes>
        <Route path="/match/:code" element={<MatchEntry />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MatchEntry page', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('AI codes redirect to draft phase', async () => {
    renderMatchEntry('ai-test123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/match/ai-test123/draft', { replace: true });
    });
  });

  it('PvP codes show error when offline (no supabase)', async () => {
    renderMatchEntry('ROOM123');

    // Should show error because getSupabase returns null
    await waitFor(() => {
      expect(screen.getByText('Unable to Join Match')).toBeTruthy();
    });
    expect(screen.getByText('Online features are not available')).toBeTruthy();
  });

  it('PvP codes without supabase show error with descriptive message', async () => {
    renderMatchEntry('ROOM456');

    // Without supabase available, the effect resolves immediately to error
    await waitFor(() => {
      expect(screen.getByText('Unable to Join Match')).toBeTruthy();
    });
    expect(screen.getByText('Online features are not available')).toBeTruthy();
  });

  it('shows Back to Menu button on error', async () => {
    renderMatchEntry('ROOM789');

    await waitFor(() => {
      expect(screen.getByText('Unable to Join Match')).toBeTruthy();
    });

    expect(screen.getByText('Back to Menu')).toBeTruthy();
  });
});
