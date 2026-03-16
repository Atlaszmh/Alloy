import { Container, Graphics } from 'pixi.js';

export interface Particle {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

export interface EffectOptions {
  intensity?: number;
  duration?: number;
}

export abstract class BaseEffect {
  protected container: Container;
  protected particles: Particle[] = [];
  protected elapsed = 0;
  protected duration: number;
  protected _isComplete = false;
  protected intensity: number;

  constructor(parent: Container, options: EffectOptions = {}) {
    this.container = new Container();
    parent.addChild(this.container);
    this.duration = options.duration ?? 30;
    this.intensity = options.intensity ?? 1;
  }

  get isComplete(): boolean {
    return this._isComplete;
  }

  abstract play(
    origin: { x: number; y: number },
    target: { x: number; y: number },
  ): void;

  stop(): void {
    this._isComplete = true;
  }

  update(dt: number): void {
    this.elapsed += dt;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        p.gfx.destroy();
        this.particles.splice(i, 1);
      }
    }

    if (this.elapsed >= this.duration && this.particles.length === 0) {
      this._isComplete = true;
    }
  }

  destroy(): void {
    for (const p of this.particles) {
      p.gfx.destroy();
    }
    this.particles = [];
    this.container.destroy();
  }

  protected spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    size: number,
    life: number,
  ): Particle {
    const gfx = new Graphics();
    gfx.circle(0, 0, size);
    gfx.fill({ color });
    gfx.x = x;
    gfx.y = y;
    this.container.addChild(gfx);

    const particle: Particle = {
      gfx,
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      color,
      size,
    };
    this.particles.push(particle);
    return particle;
  }

  protected randomSpread(base: number, spread: number): number {
    return base + (Math.random() - 0.5) * spread;
  }
}
