import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const POISON_COLORS = [0x4ae83a, 0x2ecc40, 0x6aff5e, 0x1a9c14];

export class PoisonEffect extends BaseEffect {
  private clouds: Graphics[] = [];

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 35, ...options });
  }

  play(
    _origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    // Green cloud around target
    const cloudCount = Math.floor(3 * this.intensity);
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new Graphics();
      const cx = this.randomSpread(target.x, 20);
      const cy = this.randomSpread(target.y, 15);
      const radius = 8 + Math.random() * 12;
      cloud.circle(cx, cy, radius);
      cloud.fill({ color: 0x4ae83a, alpha: 0.15 + Math.random() * 0.1 });
      this.container.addChild(cloud);
      this.clouds.push(cloud);
    }

    // Poison droplet particles
    const particleCount = Math.floor(5 * this.intensity);
    for (let i = 0; i < particleCount; i++) {
      const color = POISON_COLORS[Math.floor(Math.random() * POISON_COLORS.length)];
      this.spawnParticle(
        this.randomSpread(target.x, 15),
        this.randomSpread(target.y - 5, 10),
        this.randomSpread(0, 0.8),
        0.3 + Math.random() * 0.5,
        color,
        1.5 + Math.random() * 2,
        25 + Math.random() * 15,
      );
    }

    // Small skull-like particle (simplified as X shape)
    if (this.intensity >= 1) {
      const skull = new Graphics();
      const sx = target.x;
      const sy = target.y - 15;
      // Draw a simple skull icon (small circle with eyes)
      skull.circle(sx, sy, 5);
      skull.fill({ color: 0x4ae83a, alpha: 0.7 });
      skull.circle(sx - 2, sy - 1, 1);
      skull.circle(sx + 2, sy - 1, 1);
      skull.fill({ color: 0x000000 });
      this.container.addChild(skull);
      this.clouds.push(skull);
    }
  }

  override update(dt: number): void {
    super.update(dt);

    // Fade clouds
    for (const cloud of this.clouds) {
      cloud.alpha = Math.max(0, cloud.alpha - 0.02 * dt);
    }

    if (this.elapsed > this.duration * 0.8) {
      for (const cloud of this.clouds) {
        cloud.destroy();
      }
      this.clouds = [];
    }
  }

  override destroy(): void {
    for (const cloud of this.clouds) {
      cloud.destroy();
    }
    this.clouds = [];
    super.destroy();
  }
}
