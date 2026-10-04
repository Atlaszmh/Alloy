import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SystemMenu } from '../SystemMenu';
import { UNSOCKET_KEY, useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderMenu = (props: Partial<Parameters<typeof SystemMenu>[0]> = {}) =>
  render(
    <MemoryRouter>
      <SystemMenu onClose={() => {}} {...props} />
    </MemoryRouter>,
  );

describe('SystemMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('is a kit dialog: Resume closes it, Title screen leaves for the title screen', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu.closest('#delve-ui-layer')).not.toBeNull();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('menu-main')).toHaveTextContent('Title screen');
    fireEvent.click(screen.getByTestId('menu-main'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('opens focused on Resume', () => {
    renderMenu();
    expect(screen.getByTestId('menu-resume')).toHaveFocus();
  });

  it('opens Controls and Settings in its place, and their Close comes back to it', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('controls-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('controls-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
  });

  it("lists a screen's extra entries", () => {
    const onSelect = vi.fn();
    renderMenu({ extra: [{ id: 'anvil', label: 'Anvil', onSelect }] });
    fireEvent.click(screen.getByTestId('menu-anvil'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Restart Delve (dev) wipes the save on a second press, and closes the menu', () => {
    const s = useDelveStore.getState();
    s.startDive(1);
    s.setProfile({ ...useDelveStore.getState().profile, scrap: 500 });
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
    expect(useDelveStore.getState().profile.scrap).toBe(500);
    expect(screen.getByTestId('restart-delve')).toHaveTextContent(/wipe/i);
    fireEvent.click(screen.getByTestId('restart-delve'));
    const p = useDelveStore.getState().profile;
    expect(p).toMatchObject({ scrap: 50, dive: null, pair: { primary: null } }); // the starter kit's scrap
    expect(p.stats.dives).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the dev chip flips the pull rule and keeps it on this device', () => {
    act(() => useDelveStore.setState({ unsocket: null }));
    renderMenu();
    const chip = screen.getByTestId('unsocket-chip');
    expect(chip).toHaveTextContent('Pull: destroys'); // the balance's rule
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: pays');
    expect(useDelveStore.getState().unsocket).toBe('pay');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: destroys');
  });

  it('a production build shows neither Restart nor the pull chip', () => {
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      renderMenu();
      expect(screen.queryByTestId('restart-delve')).toBeNull();
      expect(screen.queryByTestId('unsocket-chip')).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
