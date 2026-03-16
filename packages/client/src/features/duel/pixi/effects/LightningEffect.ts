import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const LIGHTNING_COLORS = [0xe8d03a, 0xfff176, 0xffffff];

export class LightningEffect extends BaseEffect {
  private bolts: Graphics[] = [];

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 15, ...options });
  }

  play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    // Draw bolt as a jagged line from origin to target
    const boltCount = Math.ceil(2 * this.intensity);
    for (let b = 0; b < boltCount; b++) {
      const bolt = new Graphics();
      const segments = 6 + Math.floor(Math.random() * 4);
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;

      bolt.moveTo(origin.x, origin.y);
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const px = origin.x + dx * t + (Math.random() - 0.5) * 20;
        const py = origin.y + dy * t + (Math.random() - 0.5) * 20;
        bolt.lineTo(px, py);
      }
      bolt.lineTo(target.x, target.y);
      bolt.stroke({
        color: LIGHTNING_COLORS[b % LIGHTNING_COLORS.length],
        width: 2 - b * 0.5,
        alpha: 0.9 - b * 0.2,
      });

      this.container.addChild(bolt);
      this.bolts.push(bolt);
    }

    // Impact flash at target
    const flash = new Graphics();
    flash.circle(target.x, target.y, 12 * this.intensity);
    flash.fill({ color: 0xffffff, alpha: 0.6 });
    this.container.addChild(flash);
    this.bolts.push(flash);

    // Spark particles
    const sparkCount = Math.floor(5 * this.intensity);
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      const color = LIGHTNING_COLORS[Math.floor(Math.random() * LIGHTNING_COLORS.length)];
      this.spawnParticle(
        this.randomSpread(target.x, 6),
        this.randomSpread(target.y, 6),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        1 + Math.random() * 1.5,
        8 + Math.random() * 8,
      );
    }
  }

  override update(dt: number): void {
    super.update(dt);

    // Fade out bolt graphics quickly
    for (const bolt of this.bolts) {
      bolt.alpha = Math.max(0, bolt.alpha - 0.08 * dt);
    }

    if (this.elapsed > 10) {
      for (const bolt of this.bolts) {
        bolt.destroy();
      }
      this.bolts = [];
    }
  }

  override destroy(): void {
    for (const bolt of this.bolts) {
      bolt.destroy();
    }
    this.bolts = [];
    super.destroy();
  }
}
