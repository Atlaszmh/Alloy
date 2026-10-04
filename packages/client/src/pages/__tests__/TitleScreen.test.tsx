import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TitleScreen } from '../TitleScreen';
import { useDelveStore } from '@/stores/delveStore';
import { version } from '../../../package.json';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderTitle = () =>
  render(
    <MemoryRouter>
      <TitleScreen />
    </MemoryRouter>,
  );

describe('TitleScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('shows the logo, the menu and the version', () => {
    renderTitle();
    expect(screen.getByRole('heading', { name: 'ALLOY' })).toBeInTheDocument();
    expect(screen.getByTestId('title-version')).toHaveTextContent(`Alloy v${version}`);
    for (const id of ['menu-delve', 'menu-training', 'open-controls', 'open-settings']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('Delve opens the Anvil between dives', () => {
    renderTitle();
    const delve = screen.getByTestId('menu-delve');
    expect(delve).toHaveTextContent('Delve');
    expect(delve).toHaveAttribute('data-pad-first');
    fireEvent.click(delve);
    expect(mockNavigate).toHaveBeenCalledWith('/delve');
  });

  it('becomes Resume dive while a dive is under way, and goes back into it', () => {
    useDelveStore.getState().startDive(1);
    renderTitle();
    const delve = screen.getByTestId('menu-delve');
    expect(delve).toHaveTextContent('Resume dive');
    fireEvent.click(delve);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
  });

  it('Training Grounds opens the sandbox', () => {
    renderTitle();
    fireEvent.click(screen.getByTestId('menu-training'));
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it('opens Controls and Settings as dialogs, and their Back closes them', () => {
    renderTitle();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByRole('dialog', { name: /controls/i })).toBeInTheDocument();
  });
});
