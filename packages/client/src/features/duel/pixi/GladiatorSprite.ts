import { Container, Graphics, Text } from 'pixi.js';
import { CooldownRing } from './CooldownRing.js';

export type GladiatorState = 'idle' | 'attack' | 'hit' | 'death';

const BODY_WIDTH = 40;
const BODY_HEIGHT = 50;
const HEAD_RADIUS = 12;

export class GladiatorSprite {
  readonly container: Container;
  private body: Graphics;
  private head: Graphics;
  private weapon: Graphics;
  private shield: Graphics;
  private nameLabel: Text;
  private cooldownRing: CooldownRing | null = null;

  private state: GladiatorState = 'idle';
  private bodyColor: number;
  private baseX: number;
  private baseY: number;
  private facing: 1 | -1; // 1 = facing right, -1 = facing left

  // Animation state
  private animTimer = 0;
  private animDuration = 0;
  private animCallback: (() => void) | null = null;

  // Idle bob
  private idlePhase: number;

  constructor(
    color: number,
    label: string,
    x: number,
    y: number,
    facing: 1 | -1 = 1,
    weaponName?: string,
    attackSpeedSec?: number,
  ) {
    this.bodyColor = color;
    this.baseX = x;
    this.baseY = y;
    this.facing = facing;
    this.idlePhase = Math.random() * Math.PI * 2;

    this.container = new Container();
    this.container.x = x;
    this.container.y = y;

    // Body torso
    this.body = new Graphics();
    this.drawBody();
    this.container.addChild(this.body);

    // Head
    this.head = new Graphics();
    this.head.circle(0, -62, HEAD_RADIUS);
    this.head.fill({ color });
    this.container.addChild(this.head);

    // Weapon arm
    this.weapon = new Graphics();
    this.drawWeapon();
    this.container.addChild(this.weapon);

    // Shield arm
    this.shield = new Graphics();
    this.drawShield();
    this.container.addChild(this.shield);

    // Name label
    this.nameLabel = new Text({
      text: label,
      style: {
        fontFamily: 'sans-serif',
        fontSize: 11,
        fill: '#ffffff',
      },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.x = 0;
    this.nameLabel.y = 8;
    this.container.addChild(this.nameLabel);

    // Cooldown ring (only if weapon info provided)
    if (weaponName !== undefined && attackSpeedSec !== undefined) {
      const ringColor = facing === 1 ? 0x3b82f6 : 0xef4444; // blue P0, red P1
      this.cooldownRing = new CooldownRing(40, ringColor, weaponName, attackSpeedSec);
      // Position the ring centered on the body
      this.cooldownRing.container.y = -25;
      this.container.addChild(this.cooldownRing.container);
    }
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  getState(): GladiatorState {
    return this.state;
  }

  setState(state: GladiatorState): void {
    this.state = state;
  }

  playAttack(onComplete?: () => void): void {
    this.state = 'attack';
    this.animTimer = 0;
    this.animDuration = 12; // frames

    // Jolt forward
    this.container.x = this.baseX + this.facing * 15;

    this.animCallback = () => {
      this.container.x = this.baseX;
      this.state = 'idle';
      onComplete?.();
    };
  }

  playHit(onComplete?: () => void): void {
    this.state = 'hit';
    this.animTimer = 0;
    this.animDuration = 10;

    // Squash-stretch: compress vertically, stretch horizontally at hit peak.
    // Scale is interpolated back to (1, 1) by updateHit() over animDuration.
    this.container.scale.set(1.15, 0.85);
    // Brief red tint on the body Graphics (Pixi 8: tint is a number).
    this.body.tint = 0xff6666;

    this.animCallback = () => {
      this.container.scale.set(1, 1);
      this.body.tint = 0xffffff;
      this.state = 'idle';
      onComplete?.();
    };
  }

  playDeath(onComplete?: () => void): void {
    this.state = 'death';
    this.animTimer = 0;
    this.animDuration = 30;
    this.animCallback = onComplete ?? null;
  }

  update(dt: number): void {
    // Process animation timers
    if (this.animDuration > 0) {
      this.animTimer += dt;
      if (this.animTimer >= this.animDuration) {
        this.animDuration = 0;
        this.animTimer = 0;
        this.animCallback?.();
        this.animCallback = null;
      }
    }

    // State-specific updates
    switch (this.state) {
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'hit':
        this.updateHit();
        break;
      case 'death':
        this.updateDeath(dt);
        break;
    }

    // Update cooldown ring
    this.cooldownRing?.update(dt);
  }

  setCooldownProgress(progress: number): void {
    this.cooldownRing?.setProgress(progress);
  }

  triggerAttackPulse(): void {
    this.cooldownRing?.triggerPulse();
  }

  reset(): void {
    this.state = 'idle';
    this.animTimer = 0;
    this.animDuration = 0;
    this.animCallback = null;
    this.container.x = this.baseX;
    this.container.y = this.baseY;
    this.container.alpha = 1;
    this.container.rotation = 0;
    this.container.scale.set(1, 1);
    this.body.tint = 0xffffff;
    this.cooldownRing?.setProgress(0);
  }

  destroy(): void {
    this.cooldownRing?.destroy();
    this.container.destroy({ children: true });
  }

  private updateIdle(dt: number): void {
    this.idlePhase += 0.04 * dt;
    // Gentle bob
    this.container.y = this.baseY + Math.sin(this.idlePhase) * 1.5;
  }

  private updateAttack(_dt: number): void {
    // Attack jolt is instant; weapon swoosh via rotation
    const progress = this.animTimer / this.animDuration;
    this.weapon.rotation = this.facing * Math.sin(progress * Math.PI) * 0.5;
  }

  private updateHit(): void {
    // Linear interpolation of scale back to (1, 1) over animDuration frames.
    const progress = Math.min(1, this.animTimer / this.animDuration);
    this.container.scale.x = 1.15 - 0.15 * progress;
    this.container.scale.y = 0.85 + 0.15 * progress;
  }

  private updateDeath(_dt: number): void {
    const progress = Math.min(1, this.animTimer / this.animDuration);
    // Fade out and tilt
    this.container.alpha = 1 - progress * 0.7;
    this.container.rotation = this.facing * progress * 0.3;
    this.container.y = this.baseY + progress * 10;
  }

  private drawBody(): void {
    this.body.roundRect(
      -BODY_WIDTH / 2,
      -BODY_HEIGHT,
      BODY_WIDTH,
      BODY_HEIGHT,
      5,
    );
    this.body.fill({ color: this.bodyColor });
  }

  private drawWeapon(): void {
    const wx = this.facing === 1 ? 20 : -45;
    this.weapon.rect(wx, -45, 25, 4);
    this.weapon.fill({ color: 0x8a8a8a });
  }

  private drawShield(): void {
    const sx = this.facing === 1 ? -35 : 20;
    this.shield.roundRect(sx, -45, 15, 25, 3);
    this.shield.fill({ color: 0x3a3a4e });
  }
}
