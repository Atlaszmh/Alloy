import { Container, Text } from 'pixi.js';
import type { DamageBreakdown, Element } from '@alloy/engine';
import { DAMAGE_COLORS, PIXI_COLORS } from '../colors.js';

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
      fontSize = 28;
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
              alpha: 0.9,
              angle: 0,
              blur: 6,
              color: 0xfbbf24,
              distance: 0,
            }
          : undefined,
      },
    });

    text.anchor.set(0.5, 0.5);
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

  /**
   * Spawn a cascade of floating numbers from a full DamageBreakdown.
   * Each non-zero damage type gets its own colored number, stacked vertically.
   */
  spawnFromBreakdown(
    breakdown: DamageBreakdown,
    targetX: number,
    targetY: number,
  ): void {
    const entries: Array<{ label: string; color: number; net: number }> = [];

    // Physical damage
    if (breakdown.physical.net > 0) {
      entries.push({
        label: `-${Math.round(breakdown.physical.net)}`,
        color: DAMAGE_COLORS.physical,
        net: breakdown.physical.net,
      });
    }

    // Elemental damage
    for (const [elem, elemBd] of Object.entries(breakdown.elemental) as [
      Element,
      { net: number } | undefined,
    ][]) {
      if (elemBd && elemBd.net > 0) {
        entries.push({
          label: `-${Math.round(elemBd.net)} ${elem}`,
          color: DAMAGE_COLORS[elem],
          net: elemBd.net,
        });
      }
    }

    if (entries.length === 0) return;

    // For crits, the first (largest) entry gets the crit treatment
    const isFirstCrit = breakdown.isCrit;

    entries.forEach((entry, i) => {
      const isCritEntry = isFirstCrit && i === 0;
      const fontSize = isCritEntry ? 28 : 13;
      const fontWeight: 'bold' | 'normal' = isCritEntry ? 'bold' : 'normal';
      const fillColor = isCritEntry ? PIXI_COLORS.crit : entry.color;
      const lifespan = isCritEntry ? 75 : 60;

      const text = new Text({
        text: entry.label,
        style: {
          fontFamily: 'monospace',
          fontSize,
          fill: fillColor,
          fontWeight,
          dropShadow: isCritEntry
            ? {
                alpha: 0.9,
                angle: 0,
                blur: 6,
                color: 0xfbbf24,
                distance: 0,
              }
            : undefined,
        },
      });

      text.anchor.set(0.5, 0.5);
      text.x = targetX + (Math.random() - 0.5) * 30;
      text.y = targetY + i * 20;
      this.container.addChild(text);

      const startScale = isCritEntry ? 1.4 : 1;
      text.scale.set(startScale);

      this.active.push({
        text,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -1.5,
        life: lifespan,
        maxLife: lifespan,
        scaleStart: startScale,
      });
    });
  }

  /**
   * Spawn a healing number. Green for effective heal, dimmed for overheal.
   */
  spawnHeal(
    amount: number,
    x: number,
    y: number,
    isOverheal: boolean,
  ): void {
    const color = isOverheal ? 0x6b8f7b : PIXI_COLORS.healing;
    const label = `+${Math.round(amount)}`;

    const text = new Text({
      text: label,
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: color,
        fontWeight: 'bold',
      },
    });

    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 30;
    text.y = y;
    this.container.addChild(text);

    text.scale.set(1);

    this.active.push({
      text,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -2,
      life: 60,
      maxLife: 60,
      scaleStart: 1,
    });
  }

  /**
   * Spawn a blue "DODGE" floating text.
   */
  spawnDodge(x: number, y: number): void {
    const text = new Text({
      text: 'DODGE',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: PIXI_COLORS.dodged,
        fontWeight: 'bold',
      },
    });

    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 30;
    text.y = y;
    this.container.addChild(text);

    text.scale.set(1);

    this.active.push({
      text,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.5,
      life: 60,
      maxLife: 60,
      scaleStart: 1,
    });
  }

  /**
   * Spawn a grey "BLOCK" floating text with the blocked amount.
   */
  spawnBlock(amount: number, x: number, y: number): void {
    const text = new Text({
      text: `BLOCK ${Math.round(amount)}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fill: PIXI_COLORS.blocked,
        fontWeight: 'normal',
      },
    });

    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 30;
    text.y = y;
    this.container.addChild(text);

    text.scale.set(1);

    this.active.push({
      text,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.5,
      life: 60,
      maxLife: 60,
      scaleStart: 1,
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
