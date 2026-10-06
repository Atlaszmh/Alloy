import { useEffect, useLayoutEffect } from 'react';
import { Outlet } from 'react-router';
import { useGamepadNav } from '@/features/gamepad/use-gamepad-nav';
import {
  attachPromptKeys,
  hudScaleFor,
  menuScaleFor,
  TEXT_SIZES,
  uiScaleFor,
} from '@/features/delve/kit/prompts';
import { TutorialHighlight } from '@/features/delve/tutorial/TutorialHighlight';
import { useUIStore } from '@/stores/uiStore';

/** The app's frame: every screen is a Delve screen, taking the whole window, with the prompt
 *  runtime's keys (Esc / Enter) bound, the Delve UI's zooms set on :root (the menus' at the UI
 *  scale × Text size, the HUD's at the UI scale × HUD scale), and the guided
 *  start's highlight over whatever screen is open. */
export function AppShell() {
  useGamepadNav();
  useEffect(() => attachPromptKeys(), []);

  // The Delve UI's zooms, on :root (see prompts.ts): the menus' at the UI scale × Text size, the
  // HUD's at the UI scale × HUD scale, mirrored into uiStore. A layout effect, so the first paint
  // is already at the right zoom.
  const hudSetting = useUIStore((s) => s.hudScale);
  const textSize = useUIStore((s) => s.textSize);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const ui = uiScaleFor(window.innerWidth, window.innerHeight);
      const menu = menuScaleFor(window.innerWidth, window.innerHeight, TEXT_SIZES[textSize]);
      root.style.setProperty('--ui-scale', String(menu));
      root.style.setProperty('--hud-scale', String(hudScaleFor(ui, hudSetting)));
      useUIStore.getState().setUiScale(ui, menu);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [hudSetting, textSize]);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <main className="flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </main>
      </div>
      <TutorialHighlight />
    </div>
  );
}
