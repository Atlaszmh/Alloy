import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AnvilHub } from '../AnvilHub';
import { useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderHub = () =>
  render(
    <MemoryRouter>
      <AnvilHub mode="anvil" />
    </MemoryRouter>,
  );
/** The hub's own tabs (the chain builder has tabs of its own). */
const hubTabs = () =>
  within(screen.getByRole('tablist', { name: 'The Anvil' })).getAllByRole('tab');
const selected = () =>
  hubTabs()
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.getAttribute('data-testid'));
/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

describe('AnvilHub', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('is a kit screen whose header holds the five tabs, the purse and Power', () => {
    renderHub();
    const hub = screen.getByTestId('hub-anvil');
    expect(hub).toHaveAttribute('data-pad-scope');
    expect(hubTabs().map((t) => t.getAttribute('data-testid'))).toEqual([
      'tab-loadout',
      'tab-skills',
      'tab-forge',
      'tab-codex',
      'tab-quests',
    ]);
    expect(selected()).toEqual(['tab-loadout']);
    expect(screen.getByRole('tablist', { name: 'The Anvil' })).toHaveAttribute('data-pad-tabs');
    expect(screen.getByTestId('scrap-count')).toHaveTextContent(/^0 scrap$/);
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^0 Links$/);
    expect(screen.getByTestId('dust-count')).toHaveTextContent(/Mana Dust$/);
    expect(screen.getByTestId('hero-power')).toBeInTheDocument();
    expect(hub).toHaveTextContent('Deepest 0 · 0 of 12 legendaries');
  });

  it('shows each tab: Loadout with the how-to, Skills, Forge, Codex and the Quests empty state', () => {
    renderHub();
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
    expect(screen.getByTestId('paper-doll')).toBeInTheDocument();
    expect(screen.getByTestId('bag-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-skills'));
    expect(screen.getByTestId('abilities-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-forge'));
    expect(screen.getByTestId('forge-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-codex'));
    expect(screen.getByTestId('codex-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-quests'));
    expect(screen.getByTestId('quests-empty')).toHaveTextContent('Quests arrive in a later update');
  });

  it("the Loadout's attunement line opens Skills, and the how-to goes after the first dive", () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, stats: { ...p.stats, dives: 1 } });
    });
    renderHub();
    expect(screen.queryByTestId('delve-howto')).toBeNull();
    const strip = screen.getByTestId('mana-strip');
    expect(strip).toHaveTextContent('Skills ›');
    fireEvent.click(strip);
    expect(selected()).toEqual(['tab-skills']);
  });

  it('the digits 1–5 pick a tab, and T opens the Training Grounds', () => {
    renderHub();
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
    press('Digit2');
    expect(selected()).toEqual(['tab-skills']);
    press('KeyT');
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it("a disabled tab's digit does nothing: the pause hub's Forge", () => {
    render(
      <MemoryRouter>
        <AnvilHub mode="pause" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab-forge')).toBeDisabled();
    press('Digit3');
    expect(selected()).toEqual(['tab-loadout']);
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
  });

  it("the footer's Menu (Esc / B) opens the system menu, and Resume closes it", () => {
    renderHub();
    const menu = document.querySelector<HTMLElement>('[data-pad-back]')!;
    expect(menu).toHaveTextContent('Menu');
    expect(menu).toHaveAttribute('data-pad-skip');
    fireEvent.click(menu);
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
  });

  it('the footer holds Training, the start depths and the Delve button, the first focus', () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bestDepth: 6, checkpoints: [5] });
    });
    renderHub();
    expect(screen.getByTestId('training-button')).toHaveTextContent('Training');
    expect(screen.getByTestId('start-depths')).toBeInTheDocument();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toHaveAttribute('data-pad-menu');
    expect(delve).toHaveAttribute('data-pad-first');
    fireEvent.click(delve);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
  });
});
