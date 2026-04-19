import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

/**
 * Crit VFX: an expanding white flash plus gold particle burst.
 *
 * Screen shake used to live here; it has moved to {@link DuelScene.applyShake}
 * so crits and big non-crit hits share a single shake mechanism with scaled
 * intensity. {@link setShakeTarget} is retained as a no-op for API stability
 * with {@link VFXManager}.
 */
export class CritEffect extends BaseEffect {
  private flash: Graphics | null = null;

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 20, ...options });
  }

  /** Retained for VFXManager compatibility; shake now lives on DuelScene. */
  setShakeTarget(_stage: Container): void {
    // Intentionally no-op. See class docstring.
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
  }

  override destroy(): void {
    if (this.flash) {
      this.flash.destroy();
      this.flash = null;
    }
    super.destroy();
  }
}
