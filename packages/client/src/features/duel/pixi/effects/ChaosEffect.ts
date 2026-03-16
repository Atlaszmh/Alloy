import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const CHAOS_COLORS = [0xe83a8b, 0xff4eaa, 0x3ae8d0, 0xe8d03a, 0x8b3ae8, 0xe85d3a, 0x3a9be8];

export class ChaosEffect extends BaseEffect {
  private tears: Graphics[] = [];

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 25, ...options });
  }

  play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    // Reality-tear distortion lines around target
    const tearCount = Math.ceil(3 * this.intensity);
    for (let t = 0; t < tearCount; t++) {
      const tear = new Graphics();
      const cx = this.randomSpread(target.x, 20);
      const cy = this.randomSpread(target.y, 20);
      const len = 8 + Math.random() * 12;
      const angle = Math.random() * Math.PI;

      tear.moveTo(
        cx - Math.cos(angle) * len,
        cy - Math.sin(angle) * len,
      );
      tear.lineTo(
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len,
      );
      tear.stroke({
        color: CHAOS_COLORS[Math.floor(Math.random() * CHAOS_COLORS.length)],
        width: 2,
        alpha: 0.8,
      });
      this.container.addChild(tear);
      this.tears.push(tear);
    }

    // Multicolor particle burst
    const particleCount = Math.floor(8 * this.intensity);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const color = CHAOS_COLORS[Math.floor(Math.random() * CHAOS_COLORS.length)];

      this.spawnParticle(
        this.randomSpread(target.x, 10),
        this.randomSpread(target.y, 10),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        2 + Math.random() * 3,
        15 + Math.random() * 15,
      );
    }
  }

  override update(dt: number): void {
    // Chaotic particle movement: random jitter
    for (const p of this.particles) {
      p.vx += (Math.random() - 0.5) * 0.3 * dt;
      p.vy += (Math.random() - 0.5) * 0.3 * dt;
    }

    super.update(dt);

    for (const tear of this.tears) {
      tear.alpha = Math.max(0, tear.alpha - 0.04 * dt);
    }

    if (this.elapsed > this.duration * 0.6) {
      for (const tear of this.tears) {
        tear.destroy();
      }
      this.tears = [];
    }
  }

  override destroy(): void {
    for (const tear of this.tears) {
      tear.destroy();
    }
    this.tears = [];
    super.destroy();
  }
}
