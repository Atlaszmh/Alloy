import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { ArpgEvent, ArpgWorld } from '@alloy/engine';
import {
  FLOOR_PPU,
  FLOOR_SCALE,
  FloorEngine,
  snapshotArena,
  type FloorFrame,
  type FloorInit,
} from './floor-engine';
import type { FloorRequest, FloorResponse } from './floor-worker';

/**
 * The simulated pixel floor under the arena, as a Pixi sprite in world units.
 *
 * Simulation and painting run in a Web Worker so the game's frame stays
 * free; each game frame sends a small snapshot (bodies, projectiles, zones,
 * new events) and the worker answers with a finished picture of the visible
 * window. Where workers are unavailable it runs the same engine in-thread.
 */
export class PixelFloor {
  readonly sprite: Sprite;
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
  private shown = false;
  private destroyed = false;

  constructor(init: FloorInit) {
    this.init = init;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.scale.set(1 / (FLOOR_PPU * FLOOR_SCALE));
    if (typeof Worker === 'undefined') {
      this.engine = new FloorEngine(init);
      return;
    }
    try {
      this.worker = new Worker(new URL('./floor-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FloorResponse>) => this.receive(e.data);
      this.worker.onerror = () => this.fallBack();
      this.send({ type: 'init', init });
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
    this.engine ??= new FloorEngine(this.init);
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
    if (this.shown && this.pendingDt === 0 && this.pendingEvents.length === 0) return;
    const frame = snapshotArena(w, this.pendingDt, this.pendingEvents, view);
    this.pendingDt = 0;
    this.pendingEvents = [];
    if (this.worker) {
      this.inFlight = true;
      const buffer = this.spare;
      this.spare = null;
      this.send({ type: 'frame', frame, buffer }, buffer ? [buffer] : []);
    } else if (this.engine) {
      const pic = this.engine.frame(frame);
      if (pic) this.show(pic.pixels, pic.width, pic.height, pic.x, pic.y);
    }
  }

  private receive(msg: FloorResponse): void {
    this.inFlight = false;
    if (this.destroyed) return;
    if (msg.type === 'picture') {
      this.show(new Uint8ClampedArray(msg.buffer), msg.width, msg.height, msg.x, msg.y);
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
  ): void {
    const previous = this.current;
    if (!this.source || this.source.width !== width || this.source.height !== height) {
      this.texture?.destroy(true);
      this.source = new BufferImageSource({
        resource: new Uint8Array(pixels.buffer),
        width,
        height,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
      });
      this.texture = new Texture({ source: this.source });
      this.sprite.texture = this.texture;
    } else {
      this.source.resource = new Uint8Array(pixels.buffer);
      this.source.update();
    }
    this.current = pixels;
    this.sprite.position.set(x, y);
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
    this.texture?.destroy(true);
    this.texture = null;
  }
}
