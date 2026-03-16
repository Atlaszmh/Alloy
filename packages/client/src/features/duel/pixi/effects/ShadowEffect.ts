import { Container, Graphics } from 'pixi.js';
import { BaseEffect, type EffectOptions } from './BaseEffect.js';

const SHADOW_COLORS = [0x8b3ae8, 0x6a1fd0, 0xb36aff, 0x3a1a5e];

export class ShadowEffect extends BaseEffect {
  private tendrils: Graphics[] = [];

  constructor(parent: Container, options?: EffectOptions) {
    super(parent, { duration: 30, ...options });
  }

  play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void {
    // Dark tendrils from origin toward target
    const tendrilCount = Math.ceil(3 * this.intensity);
    for (let t = 0; t < tendrilCount; t++) {
      const tendril = new Graphics();
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const segments = 5;

      tendril.moveTo(origin.x, origin.y);
      for (let i = 1; i <= segments; i++) {
        const frac = i / segments;
        const px = origin.x + dx * frac + (Math.random() - 0.5) * 15;
        const py = origin.y + dy * frac + (Math.random() - 0.5) * 15;
        tendril.lineTo(px, py);
      }
      tendril.stroke({ color: SHADOW_COLORS[t % SHADOW_COLORS.length], width: 2, alpha: 0.6 });
      this.container.addChild(tendril);
      this.tendrils.push(tendril);
    }

    // Purple glow at target
    const glow = new Graphics();
    glow.circle(target.x, target.y, 15 * this.intensity);
    glow.fill({ color: 0x8b3ae8, alpha: 0.25 });
    this.container.addChild(glow);
    this.tendrils.push(glow);

    // Void particles drifting inward toward target
    const particleCount = Math.floor(6 * this.intensity);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 15;
      const px = target.x + Math.cos(angle) * dist;
      const py = target.y + Math.sin(angle) * dist;
      const color = SHADOW_COLORS[Math.floor(Math.random() * SHADOW_COLORS.length)];

      // Particles move inward toward target
      const toTargetX = (target.x - px) / dist;
      const toTargetY = (target.y - py) / dist;
      const speed = 0.5 + Math.random();
      this.spawnParticle(
        px,
        py,
        toTargetX * speed,
        toTargetY * speed,
        color,
        1.5 + Math.random() * 2,
        20 + Math.random() * 15,
      );
    }
  }

  override update(dt: number): void {
    super.update(dt);

    for (const tendril of this.tendrils) {
      tendril.alpha = Math.max(0, tendril.alpha - 0.025 * dt);
    }

    if (this.elapsed > this.duration * 0.7) {
      for (const tendril of this.tendrils) {
        tendril.destroy();
      }
      this.tendrils = [];
    }
  }

  override destroy(): void {
    for (const tendril of this.tendrils) {
      tendril.destroy();
    }
    this.tendrils = [];
    super.destroy();
  }
}
