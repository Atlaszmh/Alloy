import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { PX } from './mana-pixels';

/** Effect pixels per arena unit: the sprites' and the floor's density. */
export const FX_PPU = Math.round(1 / PX);

/** The visible arena rectangle, in arena units. */
export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A layer of effects drawn as real pixels. Draw into `g` in world units; each
 * frame `render` rasterises it into a small texture at 10 px per unit (no
 * smoothing) with its origin snapped to the floor's pixel grid, and `sprite`
 * shows that texture back in world space. So every effect edge lands on the
 * same pixels as the sprites and the floor, and never shimmers as the camera
 * moves.
 */
export class PixelLayer {
  readonly g = new Graphics();
  readonly sprite = new Sprite();
  private readonly holder = new Container();
  private rt: RenderTexture | null = null;

  constructor(
    private readonly renderer: Renderer,
    additive = false,
  ) {
    this.holder.addChild(this.g);
    if (additive) this.sprite.blendMode = 'add';
    this.sprite.roundPixels = true;
  }

  render(view: ViewRect): void {
    const pad = 1;
    const left = Math.floor((view.left - pad) * FX_PPU) / FX_PPU;
    const top = Math.floor((view.top - pad) * FX_PPU) / FX_PPU;
    const w = Math.ceil((view.right + pad - left) * FX_PPU);
    const h = Math.ceil((view.bottom + pad - top) * FX_PPU);
    if (w <= 0 || h <= 0) return;
    if (!this.rt || this.rt.width < w || this.rt.height < h) {
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({
        width: w + 32,
        height: h + 32,
        resolution: 1,
        antialias: false,
      });
      this.rt.source.scaleMode = 'nearest';
      this.sprite.texture = this.rt;
    }
    this.holder.scale.set(FX_PPU);
    this.holder.position.set(-left * FX_PPU, -top * FX_PPU);
    this.renderer.render({ container: this.holder, target: this.rt, clear: true });
    this.sprite.position.set(left, top);
    this.sprite.scale.set(1 / FX_PPU);
  }

  destroy(): void {
    this.rt?.destroy(true);
    this.rt = null;
    this.g.destroy();
    this.sprite.destroy();
  }
}
