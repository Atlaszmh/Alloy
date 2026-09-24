import { describe, it, expect } from 'vitest';
import { getRGBA } from '../src/image';
import { bob, renderSprite, type CodeSprite } from '../src/draw';

const BLOB: CodeSprite = {
  size: 8,
  legend: { k: '#181425', r: '#e43b44', w: '#ffffff' },
  frames: [['.kkk', 'krrr', 'krwr', 'krrr', '.kkk', '.k.k']],
  mirror: true,
};

describe('code-drawn sprites', () => {
  it('mirrors half-width rows into a symmetric sprite, bottom-centred', () => {
    const [frame] = renderSprite(BLOB);
    expect(frame.width).toBe(8);
    // Rows are 4 wide → 8 wide after mirroring; 6 rows sit on the bottom edge.
    expect(getRGBA(frame, 0, 2)[3]).toBe(0);
    expect(getRGBA(frame, 1, 2)).toEqual([0x18, 0x14, 0x25, 255]);
    expect(getRGBA(frame, 6, 2)).toEqual([0x18, 0x14, 0x25, 255]);
    expect(getRGBA(frame, 2, 4)).toEqual([255, 255, 255, 255]);
    expect(getRGBA(frame, 5, 4)).toEqual([255, 255, 255, 255]);
    expect(getRGBA(frame, 0, 3)).toEqual([0x18, 0x14, 0x25, 255]);
  });

  it('adds a breathing idle frame by squashing the body above the feet', () => {
    const frames = renderSprite(BLOB);
    expect(frames).toHaveLength(2);
    const [a, b] = frames;
    // The top row drops by one pixel; the feet stay put.
    expect(getRGBA(a, 3, 2)[3]).toBe(255);
    expect(getRGBA(b, 3, 2)[3]).toBe(0);
    expect(getRGBA(b, 3, 3)[3]).toBe(255);
    expect(getRGBA(b, 1, 7)).toEqual(getRGBA(a, 1, 7));
  });

  it('keeps explicit frames as drawn', () => {
    const frames = renderSprite({ ...BLOB, frames: [BLOB.frames[0], BLOB.frames[0]] });
    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0].data)).toEqual(Array.from(frames[1].data));
  });

  it('rejects characters missing from the legend', () => {
    expect(() => renderSprite({ ...BLOB, frames: [['.kz']] })).toThrow(/legend/);
  });

  it('bob leaves an empty image unchanged', () => {
    const [frame] = renderSprite({ ...BLOB, frames: [['....']] });
    expect(Array.from(bob(frame).data)).toEqual(Array.from(frame.data));
  });
});
