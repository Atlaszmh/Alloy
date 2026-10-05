import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useUIStore } from '@/stores/uiStore';
import { version } from '../../../../../package.json';

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      isMuted: false,
      colorblindMode: 'none',
      hudScale: 1,
      arenaViewUnits: 27,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('binds the volumes, the mute and the colorblind mode to the ui store', () => {
    render(<SettingsPanel onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('volume-sfx'), { target: { value: '40' } });
    expect(useUIStore.getState().sfxVolume).toBeCloseTo(0.4);
    fireEvent.change(screen.getByTestId('volume-master'), { target: { value: '55' } });
    expect(useUIStore.getState().masterVolume).toBeCloseTo(0.55);
    const mute = screen.getByTestId('settings-mute');
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mute);
    expect(useUIStore.getState().isMuted).toBe(true);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('colorblind-tritanopia'));
    expect(useUIStore.getState().colorblindMode).toBe('tritanopia');
  });

  it('sets the HUD scale from 80% to 125%, kept on this device', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const hud = screen.getByTestId('hud-scale');
    expect(hud).toHaveAttribute('min', '80');
    expect(hud).toHaveAttribute('max', '125');
    expect(screen.getByTestId('hud-scale-value')).toHaveTextContent('100%');
    fireEvent.change(hud, { target: { value: '110' } });
    expect(useUIStore.getState().hudScale).toBeCloseTo(1.1);
    expect(localStorage.getItem('alloy:delve:hudScale')).toBe('1.1');
    expect(screen.getByTestId('hud-scale-value')).toHaveTextContent('110%');
  });

  it('chooses the HUD, Lean (the default) or Full, kept on this device', () => {
    useUIStore.setState({ hudMode: 'lean' });
    render(<SettingsPanel onClose={() => {}} />);
    const lean = screen.getByTestId('hud-mode-lean');
    const full = screen.getByTestId('hud-mode-full');
    expect(lean).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(full);
    expect(useUIStore.getState().hudMode).toBe('full');
    expect(full).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('alloy:delve:hud')).toBe('full');
    fireEvent.click(lean);
    expect(useUIStore.getState().hudMode).toBe('lean');
  });

  it('sets View distance from 20 to 30 units, showing the zoom it gives in this window', () => {
    vi.stubGlobal('innerHeight', 1080);
    render(<SettingsPanel onClose={() => {}} />);
    const view = screen.getByTestId('view-distance');
    expect(view).toHaveAttribute('min', '20');
    expect(view).toHaveAttribute('max', '30');
    expect(screen.getByTestId('view-distance-value')).toHaveTextContent(
      '4 px per pixel · 27 units tall',
    );
    fireEvent.change(view, { target: { value: '20' } });
    expect(useUIStore.getState().arenaViewUnits).toBe(20);
    expect(localStorage.getItem('alloy:delve:viewUnits')).toBe('20');
    expect(screen.getByTestId('view-distance-value')).toHaveTextContent(
      '5 px per pixel · 21.6 units tall',
    );
  });

  it('shows the version, which the Delve has no TabBar for, and closes from Done', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByTestId('settings-version')).toHaveTextContent(`v${version}`);
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
