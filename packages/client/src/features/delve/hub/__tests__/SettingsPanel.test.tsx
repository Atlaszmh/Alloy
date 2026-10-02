import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useUIStore } from '@/stores/uiStore';
import { version } from '../../../../../package.json';

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ isMuted: false, colorblindMode: 'none', hudScale: 1 });
  });

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

  it('shows the version, which the Delve has no TabBar for, and closes from Done', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByTestId('settings-version')).toHaveTextContent(`v${version}`);
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
