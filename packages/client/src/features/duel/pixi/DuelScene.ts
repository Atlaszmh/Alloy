import { Application, Container, Graphics, Text } from 'pixi.js';
import type { TickEvent, DerivedStats, Element } from '@alloy/engine';
import { GladiatorSprite } from './GladiatorSprite.js';
import { VFXManager } from './VFXManager.js';
import { DamageNumbers } from './DamageNumbers.js';
import { StatusIcons } from './StatusIcons.js';

const ELEMENT_COLORS: Record<Element | 'physical', number> = {
  fire: 0xe85d3a,
  cold: 0x3a9be8,
  lightning: 0xe8d03a,
  poison: 0x4ae83a,
  shadow: 0x8b3ae8,
  chaos: 0xe83a8b,
  physical: 0xc0c0c0,
};

export const STAGE_WIDTH = 600;
export const STAGE_HEIGHT = 320;
export const GLADIATOR_Y = 200;
export const P0_X = 150;
export const P1_X = 450;

export class DuelScene {
  private app: Application | null = null;
  private gladiators: [GladiatorSprite, GladiatorSprite] | null = null;
  private hpBars: [Graphics, Graphics] | null = null;
  private hpTexts: [Text, Text] | null = null;
  private vfx: VFXManager | null = null;
  private damageNumbers: DamageNumbers | null = null;
  private statusIcons: StatusIcons | null = null;

  private hp: [number, number] = [0, 0];
  private maxHp: [number, number] = [0, 0];
  private lastProcessedTick = -1;

  async init(app: Application, stats: [DerivedStats, DerivedStats]): Promise<void> {
    this.app = app;
    this.maxHp = [stats[0].maxHP, stats[1].maxHP];
    this.hp = [stats[0].maxHP, stats[1].maxHP];

    // Arena floor
    const floor = new Graphics();
    floor.rect(0, GLADIATOR_Y + 40, STAGE_WIDTH, 80);
    floor.fill({ color: 0x1a1a26 });
    app.stage.addChild(floor);

    // Arena floor detail lines
    const floorLines = new Graphics();
    for (let i = 0; i < 5; i++) {
      const lx = 50 + i * 125;
      floorLines.moveTo(lx, GLADIATOR_Y + 45);
      floorLines.lineTo(lx, GLADIATOR_Y + 115);
      floorLines.stroke({ color: 0x252538, width: 1 });
    }
    app.stage.addChild(floorLines);

    // Create gladiators
    const g0 = new GladiatorSprite(0xc8a84e, 'You', P0_X, GLADIATOR_Y, 1);
    const g1 = new GladiatorSprite(0xe85d3a, 'AI', P1_X, GLADIATOR_Y, -1);
    app.stage.addChild(g0.container);
    app.stage.addChild(g1.container);
    this.gladiators = [g0, g1];

    // HP bars
    const hpBar0 = new Graphics();
    const hpBar1 = new Graphics();
    app.stage.addChild(hpBar0);
    app.stage.addChild(hpBar1);
    this.hpBars = [hpBar0, hpBar1];

    // HP text
    const hpText0 = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' },
    });
    hpText0.x = P0_X - 60;
    hpText0.y = 25;
    const hpText1 = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' },
    });
    hpText1.x = P1_X - 60;
    hpText1.y = 25;
    app.stage.addChild(hpText0);
    app.stage.addChild(hpText1);
    this.hpTexts = [hpText0, hpText1];

    // VFX layer
    const vfxContainer = new Container();
    app.stage.addChild(vfxContainer);
    this.vfx = new VFXManager(vfxContainer);
    this.vfx.setStage(app.stage);

    // Damage numbers layer (on top)
    const dmgContainer = new Container();
    app.stage.addChild(dmgContainer);
    this.damageNumbers = new DamageNumbers(dmgContainer);

    // Status icons
    this.statusIcons = new StatusIcons(app.stage, [
      { x: P0_X, y: GLADIATOR_Y - 90 },
      { x: P1_X, y: GLADIATOR_Y - 90 },
    ]);

    this.drawHPBars();
  }

  processEvent(tick: number, event: TickEvent): void {
    if (!this.gladiators || !this.vfx || !this.damageNumbers || !this.statusIcons) return;

    const playerX = (p: 0 | 1) => (p === 0 ? P0_X : P1_X);
    const playerPos = (p: 0 | 1) => ({ x: playerX(p), y: GLADIATOR_Y - 30 });

    switch (event.type) {
      case 'attack': {
        const target: 0 | 1 = event.attacker === 0 ? 1 : 0;

        // Gladiator attack animation
        this.gladiators[event.attacker].playAttack();

        // Hit flash on target
        this.gladiators[target].playHit();

        // VFX: element effect
        this.vfx.spawnEffect(
          event.damageType,
          playerPos(event.attacker),
          playerPos(target),
        );

        // Crit effect
        if (event.isCrit) {
          this.vfx.spawnEffect('crit', playerPos(target), playerPos(target));
        }

        // Damage number
        const color = ELEMENT_COLORS[event.damageType] ?? 0xffffff;
        const label = `${event.isCrit ? 'CRIT ' : ''}${Math.round(event.damage)}`;
        this.damageNumbers.spawn(label, playerX(target), GLADIATOR_Y - 70, color, {
          isCrit: event.isCrit,
        });
        break;
      }

      case 'dodge': {
        this.damageNumbers.spawn('DODGE', playerX(event.dodger), GLADIATOR_Y - 70, 0x60a5fa);
        break;
      }

      case 'block': {
        this.damageNumbers.spawn(
          `BLOCK ${Math.round(event.blockedDamage)}`,
          playerX(event.blocker),
          GLADIATOR_Y - 70,
          0x8a8a8a,
        );
        break;
      }

      case 'dot_apply': {
        this.statusIcons.addStatus(event.target, event.element, event.element);

        // Small VFX at target for DOT application
        this.vfx.spawnEffect(
          event.element,
          playerPos(event.target),
          playerPos(event.target),
          0.5,
        );
        break;
      }

      case 'dot_tick': {
        const elementColor = ELEMENT_COLORS[event.element] ?? 0xff0000;
        this.damageNumbers.spawn(
          `${Math.round(event.damage)}`,
          playerX(event.target),
          GLADIATOR_Y - 80,
          elementColor,
          { isDot: true },
        );

        this.vfx.spawnEffect(
          event.element,
          playerPos(event.target),
          playerPos(event.target),
          0.3,
        );
        break;
      }

      case 'lifesteal': {
        this.damageNumbers.spawn(
          `+${Math.round(event.healed)}`,
          playerX(event.player),
          GLADIATOR_Y - 90,
          0x34d399,
          { isHeal: true },
        );
        break;
      }

      case 'thorns': {
        const thornsTarget: 0 | 1 = event.reflector === 0 ? 1 : 0;
        this.damageNumbers.spawn(
          `${Math.round(event.damage)} thorns`,
          playerX(thornsTarget),
          GLADIATOR_Y - 70,
          0x8b3ae8,
        );
        break;
      }

      case 'barrier_absorb': {
        this.damageNumbers.spawn(
          `Shield ${Math.round(event.absorbed)}`,
          playerX(event.player),
          GLADIATOR_Y - 70,
          0x60a5fa,
        );
        if (event.remaining > 0) {
          this.statusIcons.addStatus(event.player, 'barrier');
        } else {
          this.statusIcons.removeStatus(event.player, 'barrier');
        }
        break;
      }

      case 'trigger_proc': {
        this.statusIcons.addStatus(event.player, 'buff');
        // Auto-remove buff icon after some time (simple approach)
        setTimeout(() => {
          this.statusIcons?.removeStatus(event.player, 'buff');
        }, 1500);
        break;
      }

      case 'synergy_proc': {
        this.statusIcons.addStatus(event.player, 'buff');
        setTimeout(() => {
          this.statusIcons?.removeStatus(event.player, 'buff');
        }, 1500);
        break;
      }

      case 'stun': {
        this.damageNumbers.spawn(
          'STUNNED',
          playerX(event.target),
          GLADIATOR_Y - 80,
          0xe8d03a,
        );
        this.statusIcons.addStatus(event.target, 'stun');
        // Remove stun icon after duration
        const stunMs = event.durationTicks * 33;
        setTimeout(() => {
          this.statusIcons?.removeStatus(event.target, 'stun');
        }, stunMs);
        break;
      }

      case 'hp_change': {
        this.hp[event.player] = event.newHP;
        this.drawHPBars();
        break;
      }

      case 'death': {
        this.gladiators[event.player].playDeath();
        this.damageNumbers.spawn(
          'DEFEATED',
          playerX(event.player),
          GLADIATOR_Y - 90,
          0xf87171,
          { isCrit: true },
        );
        this.vfx.spawnEffect(
          'crit',
          playerPos(event.player),
          playerPos(event.player),
          1.5,
        );
        break;
      }
    }
  }

  update(dt: number): void {
    this.gladiators?.[0].update(dt);
    this.gladiators?.[1].update(dt);
    this.vfx?.update(dt);
    this.damageNumbers?.update(dt);
    this.statusIcons?.update(dt);
  }

  get processedTick(): number {
    return this.lastProcessedTick;
  }

  set processedTick(tick: number) {
    this.lastProcessedTick = tick;
  }

  reset(stats?: [DerivedStats, DerivedStats]): void {
    if (stats) {
      this.maxHp = [stats[0].maxHP, stats[1].maxHP];
    }
    this.hp = [...this.maxHp];
    this.lastProcessedTick = -1;

    this.gladiators?.[0].reset();
    this.gladiators?.[1].reset();
    this.vfx?.clear();
    this.damageNumbers?.clear();
    this.statusIcons?.clear();

    this.drawHPBars();
  }

  destroy(): void {
    this.gladiators?.[0].destroy();
    this.gladiators?.[1].destroy();
    this.vfx?.destroy();
    this.damageNumbers?.destroy();
    this.statusIcons?.destroy();

    this.gladiators = null;
    this.hpBars = null;
    this.hpTexts = null;
    this.vfx = null;
    this.damageNumbers = null;
    this.statusIcons = null;
  }

  private drawHPBars(): void {
    if (!this.hpBars || !this.hpTexts) return;

    for (const i of [0, 1] as const) {
      const bar = this.hpBars[i];
      const pct = Math.max(0, this.hp[i] / this.maxHp[i]);
      const x = i === 0 ? P0_X - 60 : P1_X - 60;
      const barWidth = 120;

      bar.clear();

      // Background
      bar.rect(x, 40, barWidth, 10);
      bar.fill({ color: 0x242432 });

      // Fill
      const fillColor = pct < 0.3 ? 0xf87171 : pct < 0.6 ? 0xfbbf24 : 0x34d399;
      bar.rect(x, 40, barWidth * pct, 10);
      bar.fill({ color: fillColor });

      // Border
      bar.rect(x, 40, barWidth, 10);
      bar.stroke({ color: 0x3a3a4e, width: 1 });

      // Text
      this.hpTexts[i].text = `${Math.round(Math.max(0, this.hp[i]))} / ${Math.round(this.maxHp[i])}`;
    }
  }
}
