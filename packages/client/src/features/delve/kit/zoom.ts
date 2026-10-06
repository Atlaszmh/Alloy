import { useUIStore } from '@/stores/uiStore';
import type { ScaleContext } from './types';

/** The classes that carry a zoom: the hub, dialogs and tooltips (`--ui-scale`), and the HUD (`--hud-scale`). */
const ZOOMED = '.delve-zoom, .delve-hud-zoom';

/** The HUD's zoom: the UI scale times Settings → HUD scale, in quarter steps, never under 0.75 (spec, decided item 1). */
export function hudZoom(ui: number, hudSetting: number): number {
  return Math.max(0.75, Math.round(ui * hudSetting * 4) / 4);
}

/** The zoom a context sits under now, from the ui store (AppShell mirrors the UI scale and `--ui-scale` into it). */
export function contextZoom(context: ScaleContext): number {
  const { uiScale, menuScale, hudScale } = useUIStore.getState();
  return context === 'hud' ? hudZoom(uiScale, hudScale) : menuScale;
}

/**
 * A sprite scale snapped to whole device pixels per sprite pixel under zoom `z` at
 * `dpr`: round(scale × z × dpr) / (z × dpr), at least one device pixel.
 */
export function snapScale(scale: number, z: number, dpr: number): number {
  return Math.max(1, Math.round(scale * z * dpr)) / (z * dpr);
}

/** The zoom an element sits under, from the class it sits under (itself included); 1 when none. */
export function layerZoom(el: Element): number {
  const layer = el.closest(ZOOMED);
  if (!layer) return 1;
  return contextZoom(layer.classList.contains('delve-hud-zoom') ? 'hud' : 'ui');
}

/** True when any ancestor of `el` is zoomed: the Pixi canvas host must never be (spec, decided item 31). */
export function hasZoomedAncestor(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.matches(ZOOMED)) return true;
    const z = p.style.zoom || getComputedStyle(p).zoom;
    if (z && z !== 'normal' && parseFloat(z) !== 1) return true;
  }
  return false;
}
