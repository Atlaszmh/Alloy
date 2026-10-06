import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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

  describe('Text size', () => {
    afterEach(() => {
      Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
      useUIStore.getState().setTextSize('small');
      localStorage.removeItem('alloy:delve:textSize');
    });

    it('Display holds Text size: Small, Medium, Large, saved for this device; a window too small for it says so', () => {
      Object.assign(window, { innerWidth: 1920, innerHeight: 1080 });
      render(<SettingsPanel onClose={() => {}} />);
      expect(screen.getByTestId('text-size-small')).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByTestId('text-size-large'));
      expect(useUIStore.getState().textSize).toBe('large');
      expect(localStorage.getItem('alloy:delve:textSize')).toBe('large');
      expect(screen.getByTestId('text-size-large')).toHaveAttribute('aria-checked', 'true');
      expect(screen.queryByTestId('text-size-capped')).toBeNull();
      cleanup();
      Object.assign(window, { innerWidth: 1280, innerHeight: 800 });
      render(<SettingsPanel onClose={() => {}} />);
      expect(screen.getByTestId('text-size-capped')).toHaveTextContent(
        'This window shows Large at 115%: the screens can grow no further here.',
      );
      fireEvent.click(screen.getByTestId('text-size-medium'));
      expect(screen.queryByTestId('text-size-capped')).toBeNull();
    });
  });

  describe('Effects', () => {
    afterEach(() => {
      for (const k of ['shake', 'hitstop', 'flash'] as const) {
        useUIStore.getState().setFx(k, 1);
        localStorage.removeItem(`alloy:delve:fx:${k}`);
      }
    });

    it('Screen shake, Hit-stop and Flashes, 0 to 100%, full by default, saved for this device', () => {
      render(<SettingsPanel onClose={() => {}} />);
      for (const [id, kind] of [
        ['fx-shake', 'shake'],
        ['fx-hitstop', 'hitstop'],
        ['fx-flash', 'flash'],
      ] as const) {
        const slider = screen.getByTestId(id);
        expect(slider).toHaveAttribute('min', '0');
        expect(slider).toHaveAttribute('max', '100');
        expect(slider).toHaveValue('100');
        fireEvent.change(slider, { target: { value: '0' } });
        expect(useUIStore.getState()[kind]).toBe(0);
        expect(localStorage.getItem(`alloy:delve:fx:${kind}`)).toBe('0');
      }
      expect(screen.getByTestId('fx-off-note')).toHaveTextContent('0 turns an effect off');
    });
  });
});
