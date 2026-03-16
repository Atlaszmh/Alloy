import { Container, Text } from 'pixi.js';

interface FloatingNumber {
  text: Text;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleStart: number;
}

export interface DamageNumberOptions {
  isCrit?: boolean;
  isHeal?: boolean;
  isDot?: boolean;
}

export class DamageNumbers {
  private container: Container;
  private active: FloatingNumber[] = [];

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  spawn(
    label: string,
    x: number,
    y: number,
    color: number,
    options: DamageNumberOptions = {},
  ): void {
    const { isCrit = false, isHeal = false, isDot = false } = options;

    let fontSize: number;
    let fontWeight: 'bold' | 'normal';
    let lifespan: number;

    if (isCrit) {
      fontSize = 18;
      fontWeight = 'bold';
      lifespan = 75;
    } else if (isDot) {
      fontSize = 11;
      fontWeight = 'normal';
      lifespan = 50;
    } else if (isHeal) {
      fontSize = 14;
      fontWeight = 'bold';
      lifespan = 60;
    } else {
      fontSize = 13;
      fontWeight = 'normal';
      lifespan = 60;
    }

    const displayColor = isHeal ? 0x34d399 : isCrit ? 0xfbbf24 : color;

    const text = new Text({
      text: label,
      style: {
        fontFamily: 'monospace',
        fontSize,
        fill: displayColor,
        fontWeight,
        dropShadow: isCrit
          ? {
              alpha: 0.8,
              angle: Math.PI / 4,
              blur: 4,
              color: 0x000000,
              distance: 2,
            }
          : undefined,
      },
    });

    text.anchor = { x: 0.5, y: 0.5 } as any;
    text.x = x + (Math.random() - 0.5) * 30;
    text.y = y;
    this.container.addChild(text);

    const vy = isHeal ? -2 : -1.5;
    const startScale = isCrit ? 1.4 : 1;

    text.scale.set(startScale);

    this.active.push({
      text,
      vx: (Math.random() - 0.5) * 0.5,
      vy,
      life: lifespan,
      maxLife: lifespan,
      scaleStart: startScale,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fn = this.active[i];
      fn.text.x += fn.vx * dt;
      fn.text.y += fn.vy * dt;
      fn.life -= dt;

      const progress = 1 - fn.life / fn.maxLife;
      fn.text.alpha = Math.max(0, 1 - progress * progress);

      // Scale down from start scale over lifetime
      const scale = fn.scaleStart * (1 - progress * 0.3);
      fn.text.scale.set(Math.max(0.5, scale));

      if (fn.life <= 0) {
        fn.text.destroy();
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const fn of this.active) {
      fn.text.destroy();
    }
    this.active = [];
  }

  destroy(): void {
    this.clear();
    this.container.destroy();
  }
}
