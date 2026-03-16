import { Container } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const FIRE_COLORS = [0xe85d3a, 0xff7b39, 0xffad33, 0xcc3a1a];

export class FireEffect extends BaseEffect {
  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 25, ...options });
  }

  play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    const count = Math.floor(6 * this.intensity);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Flame trail particles
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const px = origin.x + dx * t;
      const py = origin.y + dy * t;
      const color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
      const speed = 1.5 + Math.random() * 2;

      this.spawnParticle(
        this.randomSpread(px, 10),
        this.randomSpread(py, 10),
        dirX * speed + this.randomSpread(0, 1),
        dirY * speed - Math.random() * 1.5,
        color,
        2 + Math.random() * 3,
        20 + Math.random() * 15,
      );
    }

    // Ember burst at target
    for (let i = 0; i < Math.floor(4 * this.intensity); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      const color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
      this.spawnParticle(
        this.randomSpread(target.x, 8),
        this.randomSpread(target.y, 8),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 1,
        color,
        1.5 + Math.random() * 2,
        15 + Math.random() * 15,
      );
    }
  }

  override update(dt: number): void {
    // Add gravity-defying float to fire particles (rise upward)
    for (const p of this.particles) {
      p.vy -= 0.03 * dt;
    }
    super.update(dt);
  }
}
