import { useEffect, useLayoutEffect } from 'react';
import { Outlet } from 'react-router';
import { useGamepadNav } from '@/features/gamepad/use-gamepad-nav';
import { attachPromptKeys, hudScaleFor, uiScaleFor } from '@/features/delve/kit/prompts';
import { useUIStore } from '@/stores/uiStore';

/** The app's frame: every screen is a Delve screen, taking the whole window, with the prompt
 *  runtime's keys (Esc / Enter) bound and the Delve UI's zooms set on :root. */
export function AppShell() {
  useGamepadNav();
  useEffect(() => attachPromptKeys(), []);

  // The Delve UI's zooms, on :root (quarter steps; see prompts.ts), mirrored into uiStore.
  // A layout effect, so the first paint is already at the right zoom.
  const hudSetting = useUIStore((s) => s.hudScale);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const ui = uiScaleFor(window.innerWidth, window.innerHeight);
      root.style.setProperty('--ui-scale', String(ui));
      root.style.setProperty('--hud-scale', String(hudScaleFor(ui, hudSetting)));
      useUIStore.getState().setUiScale(ui);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [hudSetting]);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <main className="flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
