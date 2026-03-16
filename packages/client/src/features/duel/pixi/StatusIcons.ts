import { Container, Graphics, Text } from 'pixi.js';
import type { Element } from '@alloy/engine';

const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xe85d3a,
  cold: 0x3a9be8,
  lightning: 0xe8d03a,
  poison: 0x4ae83a,
  shadow: 0x8b3ae8,
  chaos: 0xe83a8b,
};

export type StatusType = Element | 'stun' | 'barrier' | 'buff' | 'debuff';

interface StatusEntry {
  container: Container;
  type: StatusType;
  element?: Element;
  pulsePhase: number;
}

interface PlayerStatusRow {
  container: Container;
  entries: StatusEntry[];
}

export class StatusIcons {
  private parentContainer: Container;
  private rows: [PlayerStatusRow, PlayerStatusRow];

  constructor(
    parent: Container,
    private positions: [{ x: number; y: number }, { x: number; y: number }],
  ) {
    this.parentContainer = parent;

    this.rows = [
      this.createRow(positions[0]),
      this.createRow(positions[1]),
    ];
  }

  addStatus(player: 0 | 1, type: StatusType, element?: Element): void {
    const row = this.rows[player];

    // Don't add duplicate
    const existing = row.entries.find(
      (e) => e.type === type && e.element === element,
    );
    if (existing) return;

    const icon = this.createIcon(type, element);
    row.container.addChild(icon);

    row.entries.push({
      container: icon,
      type,
      element,
      pulsePhase: Math.random() * Math.PI * 2,
    });

    this.layoutRow(row);
  }

  removeStatus(player: 0 | 1, type: StatusType, element?: Element): void {
    const row = this.rows[player];
    const idx = row.entries.findIndex(
      (e) => e.type === type && e.element === element,
    );
    if (idx === -1) return;

    row.entries[idx].container.destroy();
    row.entries.splice(idx, 1);
    this.layoutRow(row);
  }

  update(dt: number): void {
    for (const row of this.rows) {
      for (const entry of row.entries) {
        entry.pulsePhase += 0.05 * dt;
        const pulse = 0.8 + 0.2 * Math.sin(entry.pulsePhase);
        entry.container.alpha = pulse;
      }
    }
  }

  clear(): void {
    for (const row of this.rows) {
      for (const entry of row.entries) {
        entry.container.destroy();
      }
      row.entries = [];
    }
  }

  destroy(): void {
    this.clear();
    for (const row of this.rows) {
      row.container.destroy();
    }
  }

  private createRow(position: { x: number; y: number }): PlayerStatusRow {
    const container = new Container();
    container.x = position.x;
    container.y = position.y;
    this.parentContainer.addChild(container);

    return { container, entries: [] };
  }

  private layoutRow(row: PlayerStatusRow): void {
    const iconSize = 14;
    const gap = 3;
    const totalWidth = row.entries.length * (iconSize + gap) - gap;
    const startX = -totalWidth / 2;

    for (let i = 0; i < row.entries.length; i++) {
      row.entries[i].container.x = startX + i * (iconSize + gap);
      row.entries[i].container.y = 0;
    }
  }

  private createIcon(type: StatusType, element?: Element): Container {
    const container = new Container();
    const gfx = new Graphics();
    const size = 6;

    let color: number;
    let label: string;

    switch (type) {
      case 'stun':
        color = 0xe8d03a;
        label = '!';
        gfx.circle(0, 0, size);
        gfx.fill({ color, alpha: 0.8 });
        break;
      case 'barrier':
        color = 0x60a5fa;
        label = 'B';
        gfx.roundRect(-size, -size, size * 2, size * 2, 2);
        gfx.fill({ color, alpha: 0.8 });
        break;
      case 'buff':
        color = 0x34d399;
        label = '+';
        gfx.moveTo(0, -size);
        gfx.lineTo(size, size);
        gfx.lineTo(-size, size);
        gfx.closePath();
        gfx.fill({ color, alpha: 0.8 });
        break;
      case 'debuff':
        color = 0xf87171;
        label = '-';
        gfx.moveTo(-size, -size);
        gfx.lineTo(size, -size);
        gfx.lineTo(0, size);
        gfx.closePath();
        gfx.fill({ color, alpha: 0.8 });
        break;
      default:
        // Element DOT
        color = element ? ELEMENT_COLORS[element] : ELEMENT_COLORS[type as Element];
        label = (type as string).charAt(0).toUpperCase();
        gfx.circle(0, 0, size);
        gfx.fill({ color, alpha: 0.8 });
        break;
    }

    container.addChild(gfx);

    // Small label inside
    const text = new Text({
      text: label,
      style: {
        fontFamily: 'monospace',
        fontSize: 8,
        fill: 0xffffff,
        fontWeight: 'bold',
      },
    });
    text.anchor = { x: 0.5, y: 0.5 } as any;
    container.addChild(text);

    return container;
  }
}
