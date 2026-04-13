import { Container, Graphics, Text } from 'pixi.js';

export class CooldownRing {
  readonly container: Container;
  private bgRing: Graphics;
  private fgArc: Graphics;
  private label: Text;
  private radius: number;
  private color: number;
  private progress = 0;
  private pulseScale = 1;
  private pulseFrames = 0;

  constructor(
    radius: number,
    color: number,
    weaponName: string,
    attackSpeedSec: number,
  ) {
    this.radius = radius;
    this.color = color;

    this.container = new Container();

    // Background ring: full circle at 20% opacity
    this.bgRing = new Graphics();
    this.drawBgRing();
    this.container.addChild(this.bgRing);

    // Foreground arc: fills clockwise based on progress
    this.fgArc = new Graphics();
    this.container.addChild(this.fgArc);

    // Label below the ring: "1.8s sword"
    this.label = new Text({
      text: `${attackSpeedSec.toFixed(1)}s ${weaponName}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 9,
        fill: '#ffffff',
        align: 'center',
      },
    });
    this.label.anchor = { x: 0.5, y: 0 } as any;
    this.label.x = 0;
    this.label.y = this.radius + 6;
    this.container.addChild(this.label);
  }

  setProgress(progress: number): void {
    this.progress = Math.max(0, Math.min(1, progress));
  }

  triggerPulse(): void {
    this.pulseFrames = 6;
  }

  update(_dt: number): void {
    // Redraw foreground arc based on current progress
    this.drawFgArc();

    // Handle pulse animation: scale 1.0 -> 1.15 -> 1.0 over 6 frames using sin curve
    if (this.pulseFrames > 0) {
      this.pulseFrames--;
      // pulseFrames goes from 6 down to 0
      // Map to 0..PI so sin goes 0 -> 1 -> 0
      const t = (6 - this.pulseFrames) / 6; // 0 -> 1
      this.pulseScale = 1 + 0.15 * Math.sin(t * Math.PI);
      this.container.scale.set(this.pulseScale);
    } else if (this.pulseScale !== 1) {
      this.pulseScale = 1;
      this.container.scale.set(1);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private drawBgRing(): void {
    this.bgRing.clear();
    this.bgRing.arc(0, 0, this.radius, 0, Math.PI * 2);
    this.bgRing.stroke({ color: this.color, width: 3, alpha: 0.2 });
  }

  private drawFgArc(): void {
    this.fgArc.clear();

    if (this.progress <= 0) return;

    const startAngle = -Math.PI / 2; // 12 o'clock
    const endAngle = startAngle + this.progress * Math.PI * 2;

    this.fgArc.arc(0, 0, this.radius, startAngle, endAngle);
    this.fgArc.stroke({ color: this.color, width: 3, alpha: 1 });
  }
}
