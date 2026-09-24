/// <reference lib="webworker" />
import { FloorEngine, type FloorFrame, type FloorInit } from './floor-engine';

/**
 * Runs the pixel floor off the main thread. Pictures travel back as
 * transferred buffers, and the main thread returns the previous one so the
 * two buffers ping-pong without copying.
 */

export type FloorRequest =
  | { type: 'init'; init: FloorInit }
  | { type: 'frame'; frame: FloorFrame; buffer: ArrayBuffer | null };

export type FloorResponse =
  | {
      type: 'picture';
      buffer: ArrayBuffer;
      width: number;
      height: number;
      x: number;
      y: number;
      cost: number;
    }
  | { type: 'idle'; buffer: ArrayBuffer | null };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: FloorEngine | null = null;

scope.onmessage = (e: MessageEvent<FloorRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    engine = new FloorEngine(msg.init);
    return;
  }
  if (!engine) return;
  const picture = engine.frame(
    msg.frame,
    msg.buffer ? new Uint8ClampedArray(msg.buffer) : undefined,
  );
  if (!picture) {
    const reply: FloorResponse = { type: 'idle', buffer: msg.buffer };
    scope.postMessage(reply, msg.buffer ? [msg.buffer] : []);
    return;
  }
  const buffer = picture.pixels.buffer as ArrayBuffer;
  engine.release();
  const reply: FloorResponse = {
    type: 'picture',
    buffer,
    width: picture.width,
    height: picture.height,
    x: picture.x,
    y: picture.y,
    cost: engine.renderCost,
  };
  scope.postMessage(reply, [buffer]);
};
