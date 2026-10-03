import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { HudIcon } from '@alloy/engine';
import { useUiScale, type GlyphId } from '../../kit';
import { GLYPH_ART, pixelRuns } from '../../kit/glyph-art';
import type { HudMap } from '../useArenaCore';

const BORDER = '#5a6988';
const TERRAIN = '#3a4466';
const VIEW = '#2ce8f5';
const FOE = '#e43b44';
const HERO = '#fee761';
/** A generated floor's: seen floor, floor in sight now, a revealed room's walls, a sealed room's. */
const SEEN = '#262b44';
const LIT = '#3a4466';
const ROOM = '#8b9bb4';
const SEALED = '#a22633';
/** The exit and the compass hint toward it. */
const EXIT = '#63c74d';
/** Each room icon's pixel glyph (the exit gate is the kit's door), and its tint where it has one colour. */
const ICON: Record<HudIcon, { glyph: GlyphId; tint: string }> = {
  chest: { glyph: 'chest', tint: ROOM },
  shrine: { glyph: 'shrine', tint: ROOM },
  anvil: { glyph: 'anvil', tint: ROOM },
  skull: { glyph: 'skull', tint: SEALED },
  gate: { glyph: 'door', tint: EXIT },
};
/** A dot's size in arena units (never under 2 device px). */
const FOE_SIZE = { normal: 0.8, elite: 1.3, boss: 2 } as const;

/** Device px per arena unit: the most whole px that fit the floor in `w` × `h`, at least 1. */
export function minimapScale(map: { width: number; height: number }, w: number, h: number): number {
  return Math.max(1, Math.floor(Math.min(w / map.width, h / map.height)));
}

/**
 * A generated floor's fog layer at `s` device px a cell: each floor cell the hero has seen, those in
 * sight now brighter. The minimap keeps it and redraws it only when the fog moves (`fogVersion`).
 */
export function drawFog(
  ctx: CanvasRenderingContext2D,
  floor: NonNullable<HudMap['floor']>,
  s: number,
): void {
  ctx.clearRect(0, 0, floor.width * s, floor.height * s);
  for (const [level, color] of [
    [1, SEEN],
    [2, LIT],
  ] as const) {
    ctx.fillStyle = color;
    floor.fog.forEach((f, i) => {
      if (f === level && floor.cells[i] !== 1)
        ctx.fillRect((i % floor.width) * s, Math.floor(i / floor.width) * s, s, s);
    });
  }
}

/**
 * Draws `map` on a `w` × `h` device-px canvas: the arena fitted at whole device px per unit and
 * centred, then its terrain; on a generated floor the fog layer (`fog`, from `drawFog`), the revealed
 * rooms and their icons and the exit; the border, the camera's view, the drops, the foes, the
 * compass toward an unfound exit once hinted, and the hero.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: HudMap,
  w: number,
  h: number,
  fog?: CanvasImageSource,
): void {
  const s = minimapScale(map, w, h);
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
  /** A room icon's glyph centred on (x, y), half a unit a glyph pixel; a used one faded. */
  const icon = (id: HudIcon, x: number, y: number, used: boolean) => {
    const art = GLYPH_ART[ICON[id].glyph];
    const k = Math.max(1, Math.round(s / 2));
    const l = X(x) - Math.floor((art.rows[0].length * k) / 2);
    const t = Y(y) - Math.floor((art.rows.length * k) / 2);
    ctx.globalAlpha = used ? 0.45 : 1;
    for (const r of pixelRuns(art.rows)) {
      ctx.fillStyle = (r.ch === '#' ? ICON[id].tint : art.palette?.[r.ch]) ?? ICON[id].tint;
      ctx.fillRect(l + r.x * k, t + r.y * k, r.w * k, k);
    }
    ctx.globalAlpha = 1;
  };

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = TERRAIN;
  for (const c of map.terrain)
    ctx.fillRect(X(c.x), Y(c.y), Math.round(c.w * s), Math.round(c.h * s));
  const floor = map.floor;
  if (floor) {
    if (fog) ctx.drawImage(fog, ox, oy);
    for (const { rect: r, sealed } of floor.rooms)
      frame(X(r.x), Y(r.y), X(r.x + r.w), Y(r.y + r.h), sealed ? SEALED : ROOM);
    for (const r of floor.rooms)
      if (r.icon && r.icon !== 'gate')
        icon(r.icon, r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2, r.used);
    if (floor.exit) icon('gate', floor.exit.x, floor.exit.y, false);
  }
  frame(X(0), Y(0), X(map.width), Y(map.height), BORDER);
  const v = map.view;
  frame(X(v.left), Y(v.top), X(v.right), Y(v.bottom), VIEW);
  for (const d of map.drops) dot(d.x, d.y, 0.8, d.color);
  for (const f of map.foes) dot(f.x, f.y, FOE_SIZE[f.rank], FOE);
  const hint = floor && !floor.exit ? floor.hint : null;
  if (hint) {
    // A compass out of the hero toward the unfound exit: three dots, the head the biggest.
    const dx = hint.x - map.hero.x;
    const dy = hint.y - map.hero.y;
    const len = Math.hypot(dx, dy) || 1;
    [3, 4, 5].forEach((u, i) =>
      dot(map.hero.x + (dx / len) * u, map.hero.y + (dy / len) * u, 0.5 + i * 0.3, EXIT),
    );
  }
  dot(map.hero.x, map.hero.y, 1.2, HERO);
}

/**
 * The floor panel's map: a 2D canvas whose backing store is its zoomed box × devicePixelRatio
 * (re-measured on resize and on a HUD scale change), redrawn whenever `map` changes; a generated
 * floor's fog layer is kept on its own canvas until the fog moves.
 */
export function Minimap({ map }: { map: HudMap | null }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const { hud } = useUiScale();
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** The fog layer, with the fog, version and scale it was drawn at. */
  const fogRef = useRef<{ canvas: HTMLCanvasElement; fog: Uint8Array; key: string } | null>(null);

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
    if (!ctx || !map || size.w <= 0 || size.h <= 0) return;
    /** The kept fog layer, redrawn when the fog, its version or the scale moves. */
    const fogLayer = (floor: NonNullable<HudMap['floor']>) => {
      const s = minimapScale(map, size.w, size.h);
      const key = `${floor.fogVersion}:${s}`;
      const kept = fogRef.current;
      if (kept && kept.fog === floor.fog && kept.key === key) return kept.canvas;
      const canvas = kept?.canvas ?? document.createElement('canvas');
      canvas.width = floor.width * s;
      canvas.height = floor.height * s;
      const fctx = canvas.getContext('2d');
      if (fctx) drawFog(fctx, floor, s);
      fogRef.current = { canvas, fog: floor.fog, key };
      return canvas;
    };
    drawMinimap(ctx, map, size.w, size.h, map.floor && fogLayer(map.floor));
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
