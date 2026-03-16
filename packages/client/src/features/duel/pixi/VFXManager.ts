import { Container } from 'pixi.js';
import type { Element } from '@alloy/engine';
import { BaseEffect } from './effects/BaseEffect.js';
import { FireEffect } from './effects/FireEffect.js';
import { IceEffect } from './effects/IceEffect.js';
import { LightningEffect } from './effects/LightningEffect.js';
import { PoisonEffect } from './effects/PoisonEffect.js';
import { ShadowEffect } from './effects/ShadowEffect.js';
import { ChaosEffect } from './effects/ChaosEffect.js';
import { CritEffect } from './effects/CritEffect.js';

export type EffectType = Element | 'physical' | 'crit';

const MAX_PARTICLES = 200;

export class VFXManager {
  private container: Container;
  private activeEffects: BaseEffect[] = [];
  private stage: Container | null = null;

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  setStage(stage: Container): void {
    this.stage = stage;
  }

  spawnEffect(
    type: EffectType,
    origin: { x: number; y: number },
    target: { x: number; y: number },
    intensity = 1,
  ): void {
    // Enforce particle budget by skipping if too many active
    if (this.getApproxParticleCount() >= MAX_PARTICLES) {
      return;
    }

    const effect = this.createEffect(type, intensity);
    if (!effect) return;

    effect.play(origin, target);
    this.activeEffects.push(effect);
  }

  update(dt: number): void {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const effect = this.activeEffects[i];
      effect.update(dt);
      if (effect.isComplete) {
        effect.destroy();
        this.activeEffects.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const effect of this.activeEffects) {
      effect.destroy();
    }
    this.activeEffects = [];
  }

  destroy(): void {
    this.clear();
    this.container.destroy();
  }

  private getApproxParticleCount(): number {
    // Rough estimate: each effect has ~5-10 particles on average
    return this.activeEffects.length * 8;
  }

  private createEffect(type: EffectType, intensity: number): BaseEffect | null {
    const opts = { intensity };

    switch (type) {
      case 'fire':
        return new FireEffect(this.container, opts);
      case 'cold':
        return new IceEffect(this.container, opts);
      case 'lightning':
        return new LightningEffect(this.container, opts);
      case 'poison':
        return new PoisonEffect(this.container, opts);
      case 'shadow':
        return new ShadowEffect(this.container, opts);
      case 'chaos':
        return new ChaosEffect(this.container, opts);
      case 'crit': {
        const critEffect = new CritEffect(this.container, opts);
        if (this.stage) {
          critEffect.setShakeTarget(this.stage);
        }
        return critEffect;
      }
      case 'physical':
        // Physical attacks use a simple white particle burst — reuse fire with low intensity
        return new FireEffect(this.container, { intensity: intensity * 0.5 });
      default:
        return null;
    }
  }
}
