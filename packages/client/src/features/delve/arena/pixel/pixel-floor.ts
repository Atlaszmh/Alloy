import { BufferImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import type { ArpgEvent, ArpgWorld, FloorMap } from '@alloy/engine';
import {
  FLOOR_PPU,
  FLOOR_SCALE,
  FloorEngine,
  snapshotArena,
  type FloorFrame,
  type FloorInit,
} from './floor-engine';
import type { FloorRequest, FloorResponse } from './floor-worker';
import { getDelveRegistry } from '../../registry';

/** A structure's wear goes in steps of this fraction, so a scratch sends nothing. */
const CRACK_STEPS = 8;

/**
 * The simulated pixel floor under the arena, as a Pixi sprite in world units.
 *
 * Simulation and painting run in a Web Worker so the game's frame stays
 * free; each game frame sends a small snapshot (bodies, projectiles, zones,
 * new events) and the worker answers with a finished picture of the visible
 * window. Where workers are unavailable it runs the same engine in-thread.
 * A floor with foliage also has `canopy`, its leaves, to stand over the
 * creatures (the renderer puts it there).
 */
export class PixelFloor {
  readonly sprite: Sprite;
  readonly canopy: Sprite;
  private worker: Worker | null = null;
  private engine: FloorEngine | null = null;
  private readonly init: FloorInit;
  private inFlight = false;
  private pendingDt = 0;
  private pendingEvents: ArpgEvent[] = [];
  /** A spent picture buffer, handed back to the worker for reuse. */
  private spare: ArrayBuffer | null = null;
  private current: Uint8ClampedArray | null = null;
  private source: BufferImageSource | null = null;
  private texture: Texture | null = null;
  private canopyTexture: Texture | null = null;
  private shown = false;
  private destroyed = false;
  /** The map's cells and looks as last sent, the version they were read at, and its structures' wear. */
  private readonly cells: Uint8Array | null;
  private readonly looks: Uint8Array | null;
  private version = -1;
  private cracks = '';

  constructor(init: FloorInit) {
    const { foliageSight } = getDelveRegistry().getDelveBalance().terrain;
    this.init = { ...init, foliageSight };
    this.cells = init.plan ? init.plan.cells.slice() : null;
    this.looks = init.plan ? init.plan.look.slice() : null;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.scale.set(1 / (FLOOR_PPU * FLOOR_SCALE));
    this.canopy = new Sprite(Texture.EMPTY);
    this.canopy.scale.set(1 / (FLOOR_PPU * FLOOR_SCALE));
    if (typeof Worker === 'undefined') {
      this.engine = new FloorEngine(this.init);
      return;
    }
    try {
      this.worker = new Worker(new URL('./floor-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FloorResponse>) => this.receive(e.data);
      this.worker.onerror = () => this.fallBack();
      this.send({ type: 'init', init: this.init });
    } catch {
      this.fallBack();
    }
  }

  private send(msg: FloorRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = false;
    if (this.engine) return;
    this.engine = new FloorEngine(this.init);
    // The new floor starts from the plan: what was sent the worker goes again.
    if (this.init.plan) {
      this.cells?.set(this.init.plan.cells);
      this.looks?.set(this.init.plan.look);
    }
    this.version = -1;
    this.cracks = '';
  }

  handleEvents(events: readonly ArpgEvent[]): void {
    for (const e of events) this.pendingEvents.push(e);
  }

  /**
   * Called every game frame with the visible arena rectangle (arena units).
   * `dt` is 0 while paused.
   */
  update(dt: number, w: ArpgWorld, view: FloorFrame['view']): void {
    if (this.destroyed) return;
    this.pendingDt += dt;
    if (this.inFlight) return;
    const changes = this.changes(w.map);
    if (this.shown && this.pendingDt === 0 && this.pendingEvents.length === 0 && !changes) return;
    const frame = { ...snapshotArena(w, this.pendingDt, this.pendingEvents, view), ...changes };
    this.pendingDt = 0;
    this.pendingEvents = [];
    if (this.worker) {
      this.inFlight = true;
      const buffer = this.spare;
      this.spare = null;
      this.send({ type: 'frame', frame, buffer }, buffer ? [buffer] : []);
    } else if (this.engine) {
      const pic = this.engine.frame(frame);
      if (pic) this.show(pic.pixels, pic.width, pic.height, pic.x, pic.y, pic.layers);
    }
  }

  /** What changed on the map since the last frame sent: its cells (on a new version), its structures' wear. */
  private changes(map: FloorMap): Pick<FloorFrame, 'cells' | 'cracks'> | null {
    if (!this.cells || !this.looks) return null;
    let out: Pick<FloorFrame, 'cells' | 'cracks'> | null = null;
    if (map.version !== this.version) {
      this.version = map.version;
      const cells: number[] = [];
      for (let c = 0; c < map.cells.length; c++)
        if (map.cells[c] !== this.cells[c] || map.look[c] !== this.looks[c]) {
          cells.push(c, map.cells[c], map.look[c]);
          this.cells[c] = map.cells[c];
          this.looks[c] = map.look[c];
        }
      if (cells.length) out = { cells };
    }
    // By id (a crumbled structure stays on the list, fully worn).
    const cracks: number[] = [];
    for (const s of map.structures)
      cracks[s.id] =
        s.maxLife > 0 ? Math.round((1 - s.life / s.maxLife) * CRACK_STEPS) / CRACK_STEPS : 0;
    if (cracks.join() !== this.cracks) {
      this.cracks = cracks.join();
      out = { ...out, cracks };
    }
    return out;
  }

  private receive(msg: FloorResponse): void {
    this.inFlight = false;
    if (this.destroyed) return;
    if (msg.type === 'picture') {
      this.show(new Uint8ClampedArray(msg.buffer), msg.width, msg.height, msg.x, msg.y, msg.layers);
    } else if (msg.buffer) {
      this.spare = msg.buffer;
    }
  }

  private show(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    layers: number,
  ): void {
    const previous = this.current;
    if (!this.source || this.source.width !== width || this.source.height !== height * layers) {
      this.texture?.destroy(true);
      this.canopyTexture?.destroy();
      // The floor is opaque; the canopy under it comes premultiplied.
      this.source = new BufferImageSource({
        resource: new Uint8Array(pixels.buffer),
        width,
        height: height * layers,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
        alphaMode: 'premultiplied-alpha',
      });
      this.texture = new Texture({
        source: this.source,
        frame: new Rectangle(0, 0, width, height),
      });
      this.canopyTexture =
        layers > 1
          ? new Texture({ source: this.source, frame: new Rectangle(0, height, width, height) })
          : null;
      this.sprite.texture = this.texture;
      this.canopy.texture = this.canopyTexture ?? Texture.EMPTY;
    } else {
      this.source.resource = new Uint8Array(pixels.buffer);
      this.source.update();
    }
    this.current = pixels;
    this.sprite.position.set(x, y);
    this.canopy.position.set(x, y);
    this.shown = true;
    // Recycle the picture we just replaced (same size only).
    if (
      this.worker &&
      previous &&
      previous.buffer !== pixels.buffer &&
      previous.length === pixels.length
    ) {
      this.spare = previous.buffer as ArrayBuffer;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.worker?.terminate();
    this.worker = null;
    this.sprite.destroy();
    this.canopy.destroy();
    this.texture?.destroy(true);
    this.canopyTexture?.destroy();
    this.texture = null;
    this.canopyTexture = null;
  }
}
