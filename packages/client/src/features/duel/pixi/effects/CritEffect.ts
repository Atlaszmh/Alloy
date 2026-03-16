import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

export class CritEffect extends BaseEffect {
  private flash: Graphics | null = null;
  private shakeTarget: Container | null = null;
  private shakeOrigX = 0;
  private shakeOrigY = 0;
  private shakeFrames = 0;

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 20, ...options });
  }

  /**
   * For crit, `origin` is the impact point, and `target` should be
   * `{ x: 0, y: 0 }` (not used for positioning).
   * Call setShakeTarget() before play() to enable screen shake on the stage.
   */
  setShakeTarget(stage: Container): void {
    this.shakeTarget = stage;
    this.shakeOrigX = stage.x;
    this.shakeOrigY = stage.y;
  }

  play(
    origin: { x: number; y: number },
    _target: { x: number; y: number },
  ): void {
    // Impact flash (white circle expanding)
    this.flash = new Graphics();
    this.flash.circle(origin.x, origin.y, 20 * this.intensity);
    this.flash.fill({ color: 0xffffff, alpha: 0.7 });
    this.container.addChild(this.flash);

    // Gold impact particles
    const count = Math.floor(10 * this.intensity);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.spawnParticle(
        this.randomSpread(origin.x, 5),
        this.randomSpread(origin.y, 5),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 1,
        0xfbbf24,
        2 + Math.random() * 3,
        12 + Math.random() * 10,
      );
    }

    this.shakeFrames = 8;
  }

  override update(dt: number): void {
    super.update(dt);

    // Fade flash
    if (this.flash) {
      this.flash.alpha = Math.max(0, this.flash.alpha - 0.1 * dt);
      this.flash.scale.x += 0.05 * dt;
      this.flash.scale.y += 0.05 * dt;
      if (this.flash.alpha <= 0) {
        this.flash.destroy();
        this.flash = null;
      }
    }

    // Screen shake
    if (this.shakeTarget && this.shakeFrames > 0) {
      this.shakeFrames -= dt;
      const magnitude = 3 * (this.shakeFrames / 8);
      this.shakeTarget.x = this.shakeOrigX + (Math.random() - 0.5) * magnitude;
      this.shakeTarget.y = this.shakeOrigY + (Math.random() - 0.5) * magnitude;

      if (this.shakeFrames <= 0) {
        this.shakeTarget.x = this.shakeOrigX;
        this.shakeTarget.y = this.shakeOrigY;
      }
    }
  }

  override destroy(): void {
    if (this.flash) {
      this.flash.destroy();
      this.flash = null;
    }
    if (this.shakeTarget) {
      this.shakeTarget.x = this.shakeOrigX;
      this.shakeTarget.y = this.shakeOrigY;
      this.shakeTarget = null;
    }
    super.destroy();
  }
}
