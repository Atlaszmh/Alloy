// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { TabBar } from '../TabBar';

// Mock uiStore
vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn(() => ({ devMode: false })),
}));

const defaultProps = {
  onSettingsOpen: vi.fn(),
  onDevOpen: vi.fn(),
  onConfirmLeave: vi.fn(),
  isInActiveGame: false,
  isInQueue: false,
};

function renderTabBar(props = {}) {
  return render(
    <MemoryRouter>
      <TabBar {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('TabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Home, Ranks, and Settings tabs', () => {
    renderTabBar();
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.getByLabelText('Ranks')).toBeTruthy();
    expect(screen.getByLabelText('Settings')).toBeTruthy();
  });

  it('hides Dev tab when devMode is false and not in dev build', () => {
    const origDev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      renderTabBar();
      expect(screen.queryByLabelText('Dev')).toBeNull();
    } finally {
      import.meta.env.DEV = origDev;
    }
  });

  it('shows Dev tab when devMode is true', async () => {
    const { useUIStore } = await import('@/stores/uiStore');
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ devMode: true });
    renderTabBar();
    expect(screen.getByLabelText('Dev')).toBeTruthy();
  });

  it('calls onSettingsOpen when Settings tab is clicked', async () => {
    const onSettingsOpen = vi.fn();
    renderTabBar({ onSettingsOpen });
    await userEvent.click(screen.getByLabelText('Settings'));
    expect(onSettingsOpen).toHaveBeenCalledOnce();
  });

  it('calls onConfirmLeave instead of navigating when in active game', async () => {
    const onConfirmLeave = vi.fn();
    renderTabBar({ isInActiveGame: true, onConfirmLeave });
    await userEvent.click(screen.getByLabelText('Home'));
    expect(onConfirmLeave).toHaveBeenCalledWith('/');
  });

  it('renders the app version label from __APP_VERSION__', () => {
    renderTabBar();
    const el = screen.getByTestId('app-version');
    // __APP_VERSION__ is injected by vite.config.ts define from package.json.
    // Assert the shape (v<semver>) rather than a specific version so bumps
    // don't churn the test.
    expect(el.textContent).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
