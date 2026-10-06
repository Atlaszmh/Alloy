import { useEffect, useState, type ReactElement } from 'react';
import { useUIStore } from '@/stores/uiStore';
import type { PixelSpriteProps } from './types';
import { hudZoom, snapScale } from './zoom';

/** The parts of public/sprites/delve/atlas.json the DOM reads (the arena's own atlas). */
interface Atlas {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number } };
}

const DIR = `${import.meta.env.BASE_URL}sprites/delve/`;
let atlas: Promise<Atlas | null> | null = null;

/** The atlas, fetched once for every sprite on the page. */
function loadAtlas(): Promise<Atlas | null> {
  atlas ??= fetch(`${DIR}atlas.json`)
    .then((r) => r.json() as Promise<Atlas>)
    .catch(() => null);
  return atlas;
}

/**
 * A sprite from the arena's atlas, drawn as a background-position of the atlas at `scale` px per
 * sprite pixel, snapped to whole device pixels under the zoom of its `context`. Empty until the
 * atlas loads, and for an id without art.
 */
export function PixelSprite({
  id,
  scale,
  context,
  frame = 0,
  label,
}: PixelSpriteProps): ReactElement {
  const [data, setData] = useState<Atlas | null>(null);
  const ui = useUIStore((s) => s.uiScale);
  const menu = useUIStore((s) => s.menuScale);
  const hud = useUIStore((s) => s.hudScale);

  useEffect(() => {
    void loadAtlas().then(setData);
  }, []);

  const frames = data?.animations[id];
  const rect = frames?.length ? data?.frames[frames[frame % frames.length]]?.frame : undefined;
  const z = context === 'hud' ? hudZoom(ui, hud) : menu;
  const s = snapScale(scale, z, window.devicePixelRatio || 1);

  return (
    <span
      className="k-sprite"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-sprite={id}
      style={
        data && rect
          ? {
              width: rect.w * s,
              height: rect.h * s,
              backgroundImage: `url(${DIR}${data.meta.image})`,
              backgroundSize: `${data.meta.size.w * s}px ${data.meta.size.h * s}px`,
              backgroundPosition: `${-rect.x * s}px ${-rect.y * s}px`,
            }
          : undefined
      }
    />
  );
}
