import { Sprite, type Container, type Texture } from 'pixi.js';
import {
  CELL,
  LOOK_IDS,
  type ArpgWorld,
  type FloorMap,
  type HazardState,
  type Structure,
} from '@alloy/engine';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { SPRITE_LOOKS } from './sprite-looks';

/**
 * The room objects drawn from the atlas (see the room objects spec's "Client"): the props
 * (whole, then broken), the hazards (by state) and the cover cells whose look is a sprite
 * (`SPRITE_LOOKS`; a crumbling one cracks as it loses life and goes when it crumbles). Each
 * stands on the floor and sorts among the creatures; in a cell the fog has never seen it shows
 * nothing. The renderer makes one with its entities layer, `load`s it on a new floor and
 * `update`s it every frame. It never mutates the world.
 */

/** A hazard's frame in the atlas, by its state. */
export const HAZARD_FRAME: Record<HazardState, number> = { ready: 0, primed: 1, dormant: 2 };

/** A crumbling structure's frame: whole above two thirds of its life, then cracked, then badly cracked; at most `frames` − 1. */
export function crackFrame(s: Structure | undefined, frames: number): number {
  if (!s || s.maxLife <= 0) return 0;
  const lost = 1 - Math.max(0, s.life) / s.maxLife;
  return Math.max(0, Math.min(frames - 1, Math.floor(lost * 3)));
}

/** Whether a cell code is cover or crumbling cover. */
const isCover = (code: number) => code === CELL.cover || code === CELL.crumbling;

/** The cover cells drawn as sprites: cover or crumbling cover whose look is in `SPRITE_LOOKS`, row by row. */
export function coverSprites(map: FloorMap): { x: number; y: number; look: string }[] {
  const out: { x: number; y: number; look: string }[] = [];
  for (let i = 0; i < map.cells.length; i++) {
    const look = LOOK_IDS[map.look[i]];
    if (isCover(map.cells[i]) && SPRITE_LOOKS.includes(look))
      out.push({ x: i % map.width, y: Math.floor(i / map.width), look });
  }
  return out;
}

/** Whether the fog has ever seen a point's cell (on the open room, always). */
function seen(w: ArpgWorld, x: number, y: number): boolean {
  if (w.map.open) return true;
  const { width: W, height: H } = w.map;
  const cx = Math.min(W - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(H - 1, Math.max(0, Math.floor(y)));
  return w.fog[cy * W + cx] > 0;
}

interface CoverView {
  sprite: Sprite;
  frames: Texture[];
  /** Its cell's index. */
  i: number;
  structure: Structure | undefined;
}

export class RoomSprites {
  private cover: CoverView[] = [];
  /** By entity id (props and hazards share the world's `nextId`). */
  private objects = new Map<number, { sprite: Sprite; frames: Texture[] }>();
  /** The map's `version` the cover was last checked at. */
  private version = 0;

  constructor(private readonly layer: Container) {}

  /** A sprite from the atlas, its base at (x, base), sorted at `z`. */
  private place(frames: Texture[], x: number, base: number, z: number): Sprite {
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(SPRITE_PIXEL);
    sprite.position.set(x, base);
    sprite.zIndex = z;
    this.layer.addChild(sprite);
    return sprite;
  }

  /** A new floor: its cover sprites, and no objects until `update` meets them. */
  load(w: ArpgWorld): void {
    this.clear();
    const { map } = w;
    const byCell = new Map<number, Structure>();
    for (const s of map.structures) for (const c of s.cells) byCell.set(c.y * map.width + c.x, s);
    for (const c of coverSprites(map)) {
      const frames = spriteFrames(c.look);
      if (!frames) continue;
      const i = c.y * map.width + c.x;
      const sprite = this.place(frames, c.x + 0.5, c.y + 1, c.y + 0.5);
      this.cover.push({ sprite, frames, i, structure: byCell.get(i) });
    }
    this.version = map.version;
  }

  /** Every frame: each sprite in its state, shown once the fog has seen it. */
  update(w: ArpgWorld): void {
    const { map } = w;
    if (map.version !== this.version) {
      // A crumble (or a door) moved the map: a cell no longer cover loses its sprite.
      this.version = map.version;
      this.cover = this.cover.filter((v) => {
        if (isCover(map.cells[v.i])) return true;
        v.sprite.destroy();
        return false;
      });
    }
    for (const v of this.cover) {
      v.sprite.texture = v.frames[crackFrame(v.structure, v.frames.length)];
      v.sprite.visible = seen(w, v.sprite.x, v.sprite.y - 0.5);
    }
    const alive = new Set<number>();
    for (const o of [...w.props, ...w.hazards]) {
      let v = this.objects.get(o.id);
      if (!v) {
        const frames = spriteFrames(o.kind);
        if (!frames) continue;
        v = { sprite: this.place(frames, o.x, o.y + o.radius, o.y), frames };
        this.objects.set(o.id, v);
      }
      alive.add(o.id);
      const f = o.type === 'prop' ? (o.dead ? 1 : 0) : HAZARD_FRAME[o.state];
      v.sprite.texture = v.frames[Math.min(f, v.frames.length - 1)];
      v.sprite.visible = seen(w, o.x, o.y);
    }
    for (const [id, v] of this.objects) {
      if (alive.has(id)) continue;
      v.sprite.destroy();
      this.objects.delete(id);
    }
  }

  /** Destroy every sprite (a new floor, or the renderer going away). */
  clear(): void {
    for (const v of this.cover) v.sprite.destroy();
    for (const v of this.objects.values()) v.sprite.destroy();
    this.cover = [];
    this.objects.clear();
  }
}
