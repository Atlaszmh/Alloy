import { describe, it, expect, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from '../AppShell';
import { useUIStore } from '@/stores/uiStore';

/** A page with a visible back button, which Esc presses on a Delve route. */
function Page({ onBack }: { onBack: () => void }) {
  return (
    <button
      data-pad-back
      onClick={onBack}
      ref={(b) => {
        if (b) b.getBoundingClientRect = () => DOMRect.fromRect({ width: 10, height: 10 });
      }}
    >
      Back
    </button>
  );
}

function renderAt(path: string, onBack = () => {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<Page onBack={onBack} />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const resize = (width: number, height: number) =>
  act(() => {
    Object.assign(window, { innerWidth: width, innerHeight: height });
    window.dispatchEvent(new Event('resize'));
  });

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('AppShell', () => {
  afterEach(() => {
    resize(1024, 768);
    act(() => useUIStore.getState().setHudScale(1));
    localStorage.removeItem('alloy:delve:hudScale');
  });

  it('gives every Delve route the full window and no TabBar; other routes keep both', () => {
    for (const path of ['/delve', '/delve/run', '/delve/training', '/delve/lab']) {
      const { container, unmount } = renderAt(path);
      expect(container.querySelector('.app-frame')).toHaveAttribute('data-frame', 'full');
      expect(container.querySelector('[data-tabbar]')).toBeNull();
      unmount();
    }
    const { container } = renderAt('/');
    expect(container.querySelector('.app-frame')).not.toHaveAttribute('data-frame');
    expect(container.querySelector('[data-tabbar]')).not.toBeNull();
  });

  it('sets --ui-scale and --hud-scale in quarter steps on resize and on a HUD scale change, mirrored in uiStore', () => {
    resize(1280, 720);
    renderAt('/delve');
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['0.75', '0.75']);
    resize(2560, 1440);
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['1.25', '1.25']);
    expect(useUIStore.getState().uiScale).toBe(1.25);
    act(() => useUIStore.getState().setHudScale(1.25));
    expect(rootVar('--hud-scale')).toBe('1.5');
  });

  it('sets --ui-scale before the first paint, ahead of any page effect', () => {
    resize(2560, 1440);
    document.documentElement.style.removeProperty('--ui-scale');
    let seen = '';
    function Reader() {
      useEffect(() => {
        seen = rootVar('--ui-scale');
      }, []);
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/delve']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<Reader />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(seen).toBe('1.25');
  });

  it("binds Esc to the page's back on Delve routes only", () => {
    const back = vi.fn();
    const classic = renderAt('/', back);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(back).not.toHaveBeenCalled();
    classic.unmount();
    renderAt('/delve', back);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
