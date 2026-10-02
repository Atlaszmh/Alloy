import { SPRITE_PIXEL } from './sprites';

/**
 * The dive camera's zoom (Delve UI v1, decided item 2): a whole number of
 * render pixels per sprite pixel, so the sprites, the effect pixels and the
 * floor stay crisp, chosen from the window height alone.
 */

/** The screen the HUD covers on each side, in viewport px: the camera centres in what is left. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Arena units of window height the dive aims to show: 27 is the user's 1080p choice (4 px per sprite pixel). View distance sets 20–30. */
export const ARENA_VIEW_UNITS = 27;

/**
 * Render pixels per sprite pixel: the whole number whose view height (renderH × SPRITE_PIXEL / p units)
 * is nearest `viewUnits`, ties to the larger p, at least 2. `renderH` = screen height × the renderer's resolution.
 */
export function spritePixelScale(renderH: number, viewUnits = ARENA_VIEW_UNITS): number {
  const exact = (renderH * SPRITE_PIXEL) / viewUnits;
  const lo = Math.max(2, Math.floor(exact));
  const hi = Math.max(2, Math.ceil(exact));
  const off = (p: number) => Math.abs((renderH * SPRITE_PIXEL) / p - viewUnits);
  return off(lo) < off(hi) ? lo : hi;
}

/** The arena renderer's resolution: the device-pixel ratio, at most 2. */
export function arenaResolution(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

/** The zoom at a screen height (CSS px) and resolution: its sprite-pixel scale and the units it shows. */
export function arenaZoom(
  height: number,
  resolution: number,
  viewUnits = ARENA_VIEW_UNITS,
): { scale: number; unitsTall: number } {
  const scale = spritePixelScale(height * resolution, viewUnits);
  return { scale, unitsTall: (height * resolution * SPRITE_PIXEL) / scale };
}
