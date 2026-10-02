import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useUiScale } from '../../kit';
import type { ViewRect } from '../fx/pixel-layer';

/** The floor as the minimap draws it: the snapshot's `map` (the spec's contract, filled by the arena core). */
export interface HudMap {
  width: number;
  height: number;
  view: ViewRect;
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];
  drops: { x: number; y: number; color: string }[];
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
}

const BORDER = '#5a6988';
const TERRAIN = '#3a4466';
const VIEW = '#2ce8f5';
const FOE = '#e43b44';
const HERO = '#fee761';
/** A dot's size in arena units (never under 2 device px). */
const FOE_SIZE = { normal: 0.8, elite: 1.3, boss: 2 } as const;

/**
 * Draws `map` on a `w` × `h` device-px canvas: the arena fitted at whole device px per unit and
 * centred, then its terrain, border, the camera's view, the drops, the foes and the hero.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: HudMap,
  w: number,
  h: number,
): void {
  const s = Math.max(1, Math.floor(Math.min(w / map.width, h / map.height)));
  const ox = Math.floor((w - map.width * s) / 2);
  const oy = Math.floor((h - map.height * s) / 2);
  const X = (x: number) => ox + Math.round(Math.min(Math.max(x, 0), map.width) * s);
  const Y = (y: number) => oy + Math.round(Math.min(Math.max(y, 0), map.height) * s);
  const line = Math.max(1, Math.round(s / 3));
  const frame = (l: number, t: number, r: number, b: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(l, t, r - l, line);
    ctx.fillRect(l, b - line, r - l, line);
    ctx.fillRect(l, t, line, b - t);
    ctx.fillRect(r - line, t, line, b - t);
  };
  const dot = (x: number, y: number, units: number, color: string) => {
    const d = Math.max(2, Math.round(units * s));
    ctx.fillStyle = color;
    ctx.fillRect(X(x) - Math.floor(d / 2), Y(y) - Math.floor(d / 2), d, d);
  };

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = TERRAIN;
  for (const c of map.terrain)
    ctx.fillRect(X(c.x), Y(c.y), Math.round(c.w * s), Math.round(c.h * s));
  frame(X(0), Y(0), X(map.width), Y(map.height), BORDER);
  const v = map.view;
  frame(X(v.left), Y(v.top), X(v.right), Y(v.bottom), VIEW);
  for (const d of map.drops) dot(d.x, d.y, 0.8, d.color);
  for (const f of map.foes) dot(f.x, f.y, FOE_SIZE[f.rank], FOE);
  dot(map.hero.x, map.hero.y, 1.2, HERO);
}

/**
 * The floor panel's map: a 2D canvas whose backing store is its zoomed box × devicePixelRatio
 * (re-measured on resize and on a HUD scale change), redrawn whenever `map` changes.
 */
export function Minimap({ map }: { map: HudMap | null }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const { hud } = useUiScale();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hud]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx && map && size.w > 0 && size.h > 0) drawMinimap(ctx, map, size.w, size.h);
  }, [map, size]);

  return (
    <canvas
      ref={ref}
      width={size.w}
      height={size.h}
      role="img"
      aria-label="Minimap"
      data-testid="minimap"
      className="block h-[150px] w-full bg-[var(--k-well)] shadow-[inset_0_0_0_2px_var(--k-steel-1)]"
    />
  );
}
