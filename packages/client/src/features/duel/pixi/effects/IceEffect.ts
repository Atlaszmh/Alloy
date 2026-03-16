import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const ICE_COLORS = [0x3a9be8, 0x6bb8f0, 0xa8daf8, 0xffffff];

export class IceEffect extends BaseEffect {
  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 30, ...options });
  }

  play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    const count = Math.floor(8 * this.intensity);

    // Frost crystal burst at target
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.5;
      const color = ICE_COLORS[Math.floor(Math.random() * ICE_COLORS.length)];

      // Create diamond-shaped snowflake particle
      const gfx = new Graphics();
      const size = 2 + Math.random() * 3;
      gfx.moveTo(0, -size);
      gfx.lineTo(size * 0.6, 0);
      gfx.lineTo(0, size);
      gfx.lineTo(-size * 0.6, 0);
      gfx.closePath();
      gfx.fill({ color });
      gfx.x = target.x;
      gfx.y = target.y;
      this.container.addChild(gfx);

      this.particles.push({
        gfx,
        x: target.x,
        y: target.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color,
        size,
      });
    }

    // Blue tint ring expanding outward
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.spawnParticle(
        target.x,
        target.y,
        Math.cos(angle) * 3,
        Math.sin(angle) * 3,
        0x3a9be8,
        4,
        10 + Math.random() * 5,
      );
    }
  }

  override update(dt: number): void {
    // Ice particles drift gently, slight gravity
    for (const p of this.particles) {
      p.vy += 0.02 * dt;
      p.vx *= 0.98;
    }
    super.update(dt);
  }
}
