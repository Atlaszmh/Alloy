import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type {
  ArpgEvent,
  ArpgWorld,
  BiomeDef,
  Drop,
  ManaType,
  MonsterEntity,
  Vec,
} from '@alloy/engine';
import { PixelLayer, type ViewRect } from './fx/pixel-layer';
import { ManaFx } from './fx/mana-fx';
import {
  drawAim,
  drawFooting,
  drawGuard,
  drawMonsterMarks,
  drawProjectiles,
  drawTelegraphs,
  drawZones,
  type AimView,
} from './fx/draw-world';

export type { AimView } from './fx/draw-world';
import { MANA_HEX, NEUTRAL_HEX, RARITY_HEX, REACTION_HEX, cssToHex } from './palette';
import { PixelFloor } from './pixel/pixel-floor';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { getDelveRegistry } from '../registry';

/**
 * PixiJS view of an ArpgWorld. It never mutates the world: every frame it
 * syncs sprites to entity state, and turns simulation events into effects
 * (sparks, rings, lightning, floating numbers, screen shake).
 *
 * Everything in `root` is drawn in world units (root is scaled by `unit`
 * px/unit); floating text lives in an unscaled layer for crisp glyphs.
 */

interface MonsterView {
  root: Container;
  shadow: Graphics;
  sprite: Sprite;
  hp: Graphics;
  baseScale: number;
  /** Pixel-art frames (idle cycle); null when the creature is drawn as an emoji. */
  frames: Texture[] | null;
}

interface DropView {
  root: Container;
  gfx: Graphics;
  label: Text | null;
}

interface FloatText {
  text: Text;
  x: number;
  y: number;
  life: number;
  max: number;
  rise: number;
  pop: boolean;
}

interface Dying {
  root: Container;
  life: number;
  max: number;
}

const REACTION_LABEL: Record<string, string> = {
  melt: 'MELT!',
  shatter: 'SHATTER!',
  overload: 'OVERLOAD!',
  superconduct: 'SUPERCONDUCT!',
  soulfire: 'SOULFIRE!',
  combust: 'COMBUST!',
  blight: 'BLIGHT!',
};

const FONT = 'Rajdhani, "DM Sans", system-ui, sans-serif';

/** Forms cast on the hero itself: they burst outward instead of flinging at a target. */
const SELF_FORMS = new Set(['nova', 'ward', 'armor', 'surge']);

function elemColor(e: ManaType | null | undefined): number {
  return e ? MANA_HEX[e] : NEUTRAL_HEX;
}

export class ArenaRenderer {
  readonly app: Application;
  private world: ArpgWorld | null = null;
  private biome: BiomeDef | null = null;
  private unit = 30;
  private insets = { top: 0, bottom: 0 };
  private cam = { x: 0, y: 0 };
  private shake = 0;
  private time = 0;

  private root = new Container();
  private floor = new Graphics();
  private pixelFloor: PixelFloor | null = null;
  private dropLayer = new Container();
  private entities = new Container();
  private textLayer = new Container();

  private hero = new Container();
  private heroSprite: Sprite | null = null;
  private heroFrames: Texture[] | null = null;
  private heroAura = new Graphics();
  private heroBody = new Graphics();

  private textures = new Map<string, Texture>();
  private monsters = new Map<number, MonsterView>();
  private drops = new Map<number, DropView>();
  private trails = new Map<number, Vec[]>();
  /** Effects as mana pixels: under the characters (ground) and over them (air, glowing). */
  private readonly groundFx: PixelLayer;
  private readonly airFx: PixelLayer;
  private readonly fx = new ManaFx();
  private floats: FloatText[] = [];
  private textPool: Text[] = [];
  private dying: Dying[] = [];
  private heroFlashUntil = 0;
  private heroPerfectUntil = 0;
  private aim: AimView | null = null;

  constructor(app: Application) {
    this.app = app;
    this.entities.sortableChildren = true;
    this.groundFx = new PixelLayer(app.renderer);
    this.airFx = new PixelLayer(app.renderer, true);
    this.root.addChild(
      this.floor,
      this.groundFx.sprite,
      this.dropLayer,
      this.entities,
      this.airFx.sprite,
    );
    this.hero.addChild(this.heroAura, this.heroBody);
    app.stage.addChild(this.root, this.textLayer);
    this.resize();
  }

  /** Screen space covered by HUD at the top/bottom, so the hero stays in the open. */
  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
  }

  resize(): void {
    const { width, height } = this.app.screen;
    const playH = Math.max(200, height - this.insets.top - this.insets.bottom);
    this.unit = Math.max(16, Math.min(width / 13.5, playH / 15));
  }

  /** Scene setup for a new floor. */
  loadFloor(world: ArpgWorld, biome: BiomeDef): void {
    this.world = world;
    this.biome = biome;
    for (const v of this.monsters.values()) v.root.destroy({ children: true });
    for (const v of this.drops.values()) {
      v.root.destroy({ children: true });
      v.label?.destroy();
    }
    for (const d of this.dying) d.root.destroy({ children: true });
    this.monsters.clear();
    this.drops.clear();
    this.trails.clear();
    this.dying = [];
    this.fx.clear();
    for (const f of this.floats) this.releaseText(f.text);
    this.floats = [];
    this.drawFloor();
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor({
      arenaWidth: world.width,
      arenaHeight: world.height,
      biomeId: biome.id,
      depth: world.depth,
    });
    this.root.addChildAt(this.pixelFloor.sprite, 1);
    if (!this.hero.parent) this.entities.addChild(this.hero);
    this.cam = { x: world.hero.x, y: world.hero.y };
  }

  private emoji(glyph: string): Texture {
    let tex = this.textures.get(glyph);
    if (!tex) {
      const t = new Text({ text: glyph, style: { fontSize: 96, fontFamily: 'sans-serif' } });
      tex = this.app.renderer.generateTexture(t);
      t.destroy();
      this.textures.set(glyph, tex);
    }
    return tex;
  }

  /** Backdrop behind the simulated pixel floor (visible past the cliffs). */
  private drawFloor(): void {
    const w = this.world!;
    this.floor.clear();
    this.floor.rect(-12, -12, w.width + 24, w.height + 24).fill({ color: 0x050407 });
  }

  // ── Floating text ────────────────────────────────────────────────────────

  private acquireText(): Text {
    const t =
      this.textPool.pop() ??
      new Text({
        text: '',
        style: {
          fontFamily: FONT,
          fontWeight: '800',
          fontSize: 20,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
        },
      });
    t.anchor.set(0.5);
    t.visible = true;
    this.textLayer.addChild(t);
    return t;
  }

  private releaseText(t: Text): void {
    t.visible = false;
    t.removeFromParent();
    if (this.textPool.length < 60) this.textPool.push(t);
    else t.destroy();
  }

  private floatText(
    x: number,
    y: number,
    str: string,
    color: number,
    size: number,
    opts: { pop?: boolean; life?: number; rise?: number } = {},
  ): void {
    if (this.floats.length > 45) return;
    const t = this.acquireText();
    t.text = str;
    t.style.fill = color;
    t.style.fontSize = size;
    const jitter = opts.pop ? 0 : (Math.random() - 0.5) * 0.8;
    this.floats.push({
      text: t,
      x: x + jitter,
      y: y - 0.6,
      life: opts.life ?? 0.8,
      max: opts.life ?? 0.8,
      rise: opts.rise ?? 1.3,
      pop: !!opts.pop,
    });
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  addShake(amount: number): void {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  handleEvents(events: ArpgEvent[]): void {
    const w = this.world;
    if (!w) return;
    this.pixelFloor?.handleEvents(events);
    let numbers = 0;
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          const color = elemColor(e.element);
          this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
          if (e.reaction) {
            this.floatText(
              e.x,
              e.y - 0.8,
              REACTION_LABEL[e.reaction],
              REACTION_HEX[e.reaction],
              26,
              { pop: true, life: 1.1, rise: 1 },
            );
            this.fx.ring(e.x, e.y, 2.2, REACTION_HEX[e.reaction], false, 0.4);
            this.addShake(0.12);
          }
          if (numbers++ < 14 && e.amount >= 1) {
            const str = `${formatShort(e.amount)}${e.crit ? '!' : ''}`;
            this.floatText(
              e.x,
              e.y,
              str,
              e.crit ? 0xfde047 : e.element ? lighten(color) : 0xffffff,
              e.crit ? 26 : 17,
              { pop: e.crit },
            );
          }
          if (e.crit) this.addShake(0.05);
          break;
        }
        case 'heroHit':
          if (e.dodged) this.floatText(e.x, e.y - 0.5, 'EVADE', 0x67e8f9, 16);
          else {
            this.floatText(e.x, e.y - 0.3, `-${formatShort(e.amount)}`, 0xf87171, 20);
            this.heroFlashUntil = this.time + 0.12;
            this.addShake(Math.min(0.35, 0.08 + (e.amount / w.hero.stats.maxHp) * 1.5));
          }
          break;
        case 'heal':
          if (e.amount >= 1 && e.source !== 'lifesteal') {
            this.floatText(
              w.hero.x,
              w.hero.y - 0.8,
              `+${formatShort(e.amount)}`,
              0x4ade80,
              e.source === 'potion' ? 24 : 16,
              {
                pop: e.source === 'potion',
              },
            );
            if (e.source === 'potion' || e.source === 'orb')
              this.fx.ring(w.hero.x, w.hero.y, 1.4, 0x4ade80);
          }
          break;
        case 'basic': {
          if (e.melee) {
            const wpn = w.hero.stats.weapon;
            const s = wpn.combo[e.step] ?? wpn.combo[0];
            this.fx.swing(
              e.x,
              e.y,
              Math.atan2(e.dir.y, e.dir.x),
              Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180),
              wpn.range + (s.reach ?? 0) + 0.2,
              elemColor(e.element),
              0.16,
            );
          } else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          break;
        }
        case 'cast': {
          const color = MANA_HEX[e.element];
          this.fx.ring(e.x, e.y, 0.9, color, false, 0.2);
          if (SELF_FORMS.has(e.form)) this.fx.burst(e.x, e.y - 0.3, color, 14, 4);
          else {
            const dir = { x: e.tx - e.x, y: e.ty - e.y };
            this.fx.fling(e.x, e.y, dir, color, 14, 9);
          }
          if (e.slot > 0)
            this.floatText(e.x, e.y - 1.4, e.name, lighten(MANA_HEX[e.element]), 15, {
              life: 1,
              rise: 0.8,
            });
          break;
        }
        case 'beam':
          this.fx.beam(e.x, e.y, e.tx, e.ty, e.width, MANA_HEX[e.element]);
          this.fx.burst(e.tx, e.ty, MANA_HEX[e.element], 6, 3);
          break;
        case 'slash':
          this.fx.swing(
            e.x,
            e.y,
            Math.atan2(e.dir.y, e.dir.x),
            Math.min(360, e.arc) * (Math.PI / 180),
            e.range,
            MANA_HEX[e.element],
            0.22,
          );
          if (e.arc >= 360) this.addShake(0.12);
          break;
        case 'buff':
          this.fx.ring(w.hero.x, w.hero.y, 1.6, MANA_HEX[e.element], true, 0.4);
          break;
        case 'wardBreak':
          this.fx.ring(e.x, e.y, 2.4, MANA_HEX[e.element], false, 0.5);
          this.fx.burst(e.x, e.y, 0xffffff, 16, 5);
          this.addShake(0.15);
          break;
        case 'chain':
          this.fx.bolt(e.points, MANA_HEX[e.element], 0.2, true);
          for (const p of e.points.slice(1)) this.fx.burst(p.x, p.y, MANA_HEX.storm, 3, 3);
          break;
        case 'explode':
          this.fx.ring(e.x, e.y, e.radius, elemColor(e.element), true, 0.35);
          this.fx.ring(e.x, e.y, e.radius, elemColor(e.element), false, 0.45);
          this.fx.burst(e.x, e.y, elemColor(e.element), 10, 5);
          this.addShake(0.04 + e.radius * 0.02);
          break;
        case 'freeze':
          break;
        case 'death':
          this.fx.burst(
            e.x,
            e.y,
            this.biome ? cssToHex(this.biome.accent) : 0xffffff,
            e.monsterKind === 'boss' ? 40 : 12,
            5,
          );
          if (e.monsterKind === 'boss') {
            this.fx.ring(e.x, e.y, 5, 0xfde68a, false, 0.8);
            this.addShake(0.5);
          }
          if (e.scrap > 0 && e.monsterKind !== 'normal')
            this.floatText(e.x, e.y + 0.4, `+${e.scrap} ⚙`, 0xfcd34d, 16);
          this.killMonsterView(e.id);
          break;
        case 'drop':
          if (e.rarity === 'rare' || e.rarity === 'epic' || e.rarity === 'legendary')
            this.fx.ring(e.x, e.y, 1.2, RARITY_HEX[e.rarity], true, 0.5);
          break;
        case 'pickup':
          this.fx.burst(
            w.hero.x,
            w.hero.y,
            e.item
              ? RARITY_HEX[e.item.rarity]
              : e.dropKind === 'orb'
                ? 0xf87171
                : e.mana
                  ? MANA_HEX[e.mana]
                  : 0xffffff,
            5,
            2.5,
          );
          break;
        case 'dash':
          this.fx.bolt(
            [
              { x: e.fromX, y: e.fromY },
              { x: e.toX, y: e.toY },
            ],
            this.guardColor(w),
            0.3,
          );
          this.fx.burst(e.toX, e.toY, this.guardColor(w), 10, 4);
          break;
        case 'dodge': {
          const reach = getDelveRegistry().getDelveBalance().dodge.distance;
          this.fx.bolt(
            [
              { x: e.fromX, y: e.fromY },
              { x: e.fromX + e.dirX * reach, y: e.fromY + e.dirY * reach },
            ],
            0xe7e5e4,
            0.18,
          );
          this.fx.burst(e.fromX, e.fromY + 0.3, 0xd6d3d1, 6, 2.5);
          break;
        }
        case 'perfectDodge':
          this.heroPerfectUntil = this.time + 0.3;
          this.floatText(e.x, e.y - 1.6, 'PERFECT', 0xfde047, 28, {
            pop: true,
            life: 0.9,
            rise: 0.7,
          });
          this.fx.ring(e.x, e.y, 2.6, 0xfde047, false, 0.45);
          this.fx.ring(e.x, e.y, 1.4, 0xffffff, true, 0.25);
          this.fx.burst(e.x, e.y, 0xfff7c2, 14, 5);
          this.addShake(0.18);
          break;
        case 'revive':
          this.fx.ring(w.hero.x, w.hero.y, 4, 0xfb923c, true, 0.7);
          this.floatText(w.hero.x, w.hero.y - 1.5, 'REBORN!', 0xfb923c, 30, {
            pop: true,
            life: 1.4,
          });
          this.addShake(0.4);
          break;
        case 'heroDeath':
          this.fx.burst(w.hero.x, w.hero.y, 0xf87171, 30, 5);
          this.addShake(0.6);
          break;
        default:
          break;
      }
    }
  }

  private guardColor(w: ArpgWorld): number {
    const guard = w.hero.abilities[1];
    return guard ? MANA_HEX[guard.element] : MANA_HEX.shadow;
  }

  /** Show (or hide, with null) the aim marker. */
  setAim(aim: AimView | null): void {
    this.aim = aim;
  }

  /** A point on screen (client px) in world units. */
  screenToWorld(clientX: number, clientY: number): Vec {
    const r = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.root.position.x) / this.unit,
      y: (clientY - r.top - this.root.position.y) / this.unit,
    };
  }

  private killMonsterView(id: number): void {
    const v = this.monsters.get(id);
    if (!v) return;
    this.monsters.delete(id);
    this.dying.push({ root: v.root, life: 0.35, max: 0.35 });
  }

  // ── Per-frame sync ───────────────────────────────────────────────────────

  update(dt: number): void {
    const w = this.world;
    if (!w) return;
    this.time += dt;
    const { width, height } = this.app.screen;
    const u = this.unit;

    // Camera
    const playTop = this.insets.top;
    const playH = height - this.insets.top - this.insets.bottom;
    const halfW = width / 2 / u;
    const halfH = playH / 2 / u;
    const k = 1 - Math.exp(-8 * dt);
    this.cam.x += (w.hero.x - this.cam.x) * k;
    this.cam.y += (w.hero.y - this.cam.y) * k;
    const cx =
      w.width <= halfW * 2
        ? w.width / 2
        : Math.max(halfW - 1, Math.min(w.width - halfW + 1, this.cam.x));
    const cy =
      w.height <= halfH * 2
        ? w.height / 2
        : Math.max(halfH - 1.5, Math.min(w.height - halfH + 1.5, this.cam.y));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sx = (Math.random() - 0.5) * this.shake * u;
    const sy = (Math.random() - 0.5) * this.shake * u;
    this.root.scale.set(u);
    this.root.position.set(width / 2 - cx * u + sx, playTop + playH / 2 - cy * u + sy);

    const left = -this.root.position.x / u;
    const top = -this.root.position.y / u;
    const view: ViewRect = { left, top, right: left + width / u, bottom: top + height / u };
    this.pixelFloor?.update(dt, w, view);

    const ground = this.groundFx.g;
    const air = this.airFx.g;
    ground.clear();
    air.clear();
    this.syncHero(w);
    this.syncMonsters(w);
    this.syncDrops(w);
    drawZones(ground, w, this.time);
    drawTelegraphs(ground, w, this.time);
    drawFooting(ground, w, this.time);
    drawMonsterMarks(ground, air, w, this.time);
    drawProjectiles(air, w, this.time, this.trails);
    drawGuard(air, this.fx, w, this.time);
    this.fx.draw(air, dt, this.time);
    drawAim(air, w, this.aim, this.time);
    this.groundFx.render(view);
    this.airFx.render(view);
    this.updateTexts(dt);

    for (const d of this.dying) {
      d.life -= dt;
      const p = Math.max(0, d.life / d.max);
      d.root.alpha = p;
      d.root.scale.set(0.6 + p * 0.4);
    }
    const done = this.dying.filter((d) => d.life <= 0);
    for (const d of done) d.root.destroy({ children: true });
    this.dying = this.dying.filter((d) => d.life > 0);
  }

  /** Hero position in screen pixels (for mouse click-to-move). */
  heroScreen(): Vec | null {
    return this.world ? this.toScreen(this.world.hero.x, this.world.hero.y) : null;
  }

  pixelsPerUnit(): number {
    return this.unit;
  }

  private toScreen(x: number, y: number): Vec {
    return { x: this.root.position.x + x * this.unit, y: this.root.position.y + y * this.unit };
  }

  private syncHero(w: ArpgWorld): void {
    const h = w.hero;
    const aura = h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834;
    // Dust kicked up along a dodge.
    if (h.dodge && w.t < h.dodge.until) this.fx.burst(h.x, h.y + 0.35, 0xd6d3d1, 1, 1.2);
    this.hero.position.set(h.x, h.y);
    this.hero.zIndex = h.y;
    this.hero.alpha = w.t < h.invulnUntil ? 0.55 : 1;
    const pulse = 0.25 + Math.sin(this.time * 4) * 0.08;
    const g = this.heroAura;
    g.clear();
    if (!this.heroFrames) {
      this.heroFrames = spriteFrames('hero');
      if (this.heroFrames) {
        this.heroSprite = new Sprite(this.heroFrames[0]);
        this.heroSprite.anchor.set(0.5, 1);
        this.hero.addChild(this.heroSprite);
      }
    }
    if (this.heroSprite && this.heroFrames) {
      // The footing ring and its facing notch are drawn as mana pixels (drawFooting).
      const fx = h.facing.x;
      g.ellipse(0, 0.42, 0.5, 0.2).fill({ color: 0x000000, alpha: 0.45 });
      const s = this.heroSprite;
      s.texture = this.heroFrames[Math.floor(this.time * 3) % this.heroFrames.length];
      s.scale.set(SPRITE_PIXEL * (fx < -0.2 ? -1 : 1), SPRITE_PIXEL);
      s.position.set(0, 0.5);
      s.tint =
        this.time < this.heroPerfectUntil
          ? 0xfff3b0
          : this.time < this.heroFlashUntil
            ? 0xff8a8a
            : 0xffffff;
      this.heroBody.clear();
      return;
    }
    g.ellipse(0, 0.35, 0.6, 0.25).fill({ color: 0x000000, alpha: 0.45 });
    g.circle(0, 0, 0.85).fill({ color: aura, alpha: pulse * 0.4 });
    g.circle(0, 0, 0.72).stroke({ width: 0.06, color: aura, alpha: 0.8 });
    const b = this.heroBody;
    const flash = this.time < this.heroFlashUntil;
    b.clear();
    b.circle(0, 0, 0.5).fill({ color: flash ? 0xff6b6b : 0x2b2b3a });
    b.circle(0, 0, 0.5).stroke({ width: 0.09, color: 0xe0bc4a });
    b.circle(0, 0, 0.26).fill({ color: flash ? 0xffffff : 0xecd06a });
    const fx = h.facing.x;
    const fy = h.facing.y;
    b.poly([
      fx * 0.85,
      fy * 0.85,
      fx * 0.45 - fy * 0.28,
      fy * 0.45 + fx * 0.28,
      fx * 0.45 + fy * 0.28,
      fy * 0.45 - fx * 0.28,
    ]).fill({
      color: 0xecd06a,
    });
  }

  private makeCreature(icon: string, radius: number, spriteId?: string): MonsterView {
    const root = new Container();
    const shadow = new Graphics();
    const frames = spriteId ? spriteFrames(spriteId) : null;
    let sprite: Sprite;
    let baseScale: number;
    if (frames) {
      sprite = new Sprite(frames[0]);
      // Feet on the shadow; one sprite pixel = one floor pixel, for every creature (elites too).
      sprite.anchor.set(0.5, 1);
      baseScale = SPRITE_PIXEL;
    } else {
      sprite = new Sprite(this.emoji(icon));
      sprite.anchor.set(0.5, 0.62);
      baseScale = (radius * 2.5) / sprite.texture.width;
    }
    sprite.scale.set(baseScale);
    const hp = new Graphics();
    root.addChild(shadow, sprite, hp);
    this.entities.addChild(root);
    return { root, shadow, sprite, hp, baseScale, frames };
  }

  private syncMonsters(w: ArpgWorld): void {
    for (const m of w.monsters) {
      let v = this.monsters.get(m.id);
      if (!v) {
        v = this.makeCreature(m.icon, m.radius, m.defId);
        this.monsters.set(m.id, v);
      }
      this.drawMonster(v, m, w);
    }
  }

  private drawMonster(v: MonsterView, m: MonsterEntity, w: ArpgWorld): void {
    const t = w.t;
    const s = m.status;
    v.root.position.set(m.x, m.y);
    v.root.zIndex = m.y;
    const flip = w.hero.x > m.x ? -1 : 1;
    const hit = t - m.lastHitAt < 0.09;
    const frozen = t < s.freezeUntil;
    const bob = frozen ? 0 : Math.sin(this.time * 6 + m.id) * 0.04;
    const windup =
      m.windupUntil > 0 ? (t - m.windupStart) / Math.max(0.01, m.windupUntil - m.windupStart) : 0;
    if (v.frames) {
      // Pixel art keeps one pixel density: it never scales. Idle cycle (frozen creatures hold
      // still); a hit hops it up 1 pixel and a wind-up lifts it up to 2 before the strike.
      v.sprite.scale.set(v.baseScale * flip, v.baseScale);
      if (!frozen)
        v.sprite.texture = v.frames[Math.floor(this.time * 3 + m.id * 0.37) % v.frames.length];
      const lift = hit ? 1 : Math.round(windup * 2);
      v.sprite.position.set(0, m.radius * 0.7 - lift * SPRITE_PIXEL);
    } else {
      const scale = v.baseScale * (hit ? 1.12 : 1) * (1 + windup * 0.12);
      v.sprite.scale.set(scale * flip, scale);
      v.sprite.position.set(0, bob);
    }
    v.sprite.tint = frozen
      ? 0x9fe8ff
      : hit
        ? 0xffd6d6
        : t < s.chillUntil
          ? 0xc8ecff
          : t < s.burnUntil && Math.sin(this.time * 20) > 0
            ? 0xffc29a
            : 0xffffff;

    const sh = v.shadow;
    sh.clear();
    sh.ellipse(0, m.radius * 0.55, m.radius * 0.95, m.radius * 0.35).fill({
      color: 0x000000,
      alpha: 0.4,
    });

    const hp = v.hp;
    hp.clear();
    if (m.kind !== 'boss' && (m.hp < m.maxHp || m.kind === 'elite')) {
      const bw = Math.max(0.9, m.radius * 2);
      const y = -m.radius * 1.55 - 0.2;
      hp.rect(-bw / 2, y, bw, 0.13).fill({ color: 0x000000, alpha: 0.7 });
      hp.rect(-bw / 2, y, (bw * Math.max(0, m.hp)) / m.maxHp, 0.13).fill({
        color: m.kind === 'elite' ? 0xfacc15 : 0xef4444,
      });
    }
  }

  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
    for (const d of w.drops) {
      alive.add(d.id);
      let v = this.drops.get(d.id);
      if (!v) {
        v = this.makeDrop(d);
        this.drops.set(d.id, v);
      }
      const age = w.t - d.born;
      const pop = age < 0.35 ? Math.sin((age / 0.35) * Math.PI) * 1.1 : 0;
      const bob = d.kind === 'item' ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;
      v.root.position.set(d.x, d.y - pop + bob);
      v.root.zIndex = d.y - 0.5;
      this.drawDrop(v, d);
      if (v.label) {
        const p = this.toScreen(d.x, d.y - pop - 0.9);
        v.label.position.set(p.x, p.y);
      }
    }
    for (const [id, v] of this.drops) {
      if (alive.has(id)) continue;
      v.root.destroy({ children: true });
      v.label?.destroy();
      this.drops.delete(id);
    }
  }

  private makeDrop(d: Drop): DropView {
    const root = new Container();
    const gfx = new Graphics();
    root.addChild(gfx);
    this.dropLayer.addChild(root);
    let label: Text | null = null;
    const rarity = d.item?.rarity;
    if (d.item && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary')) {
      label = new Text({
        text: d.item.name,
        style: {
          fontFamily: FONT,
          fontWeight: '700',
          fontSize: 13,
          fill: RARITY_HEX[rarity],
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      this.textLayer.addChild(label);
    }
    return { root, gfx, label };
  }

  private drawDrop(v: DropView, d: Drop): void {
    const g = v.gfx;
    g.clear();
    if (d.kind === 'item' && d.item) {
      const color = RARITY_HEX[d.item.rarity];
      const r = d.item.rarity;
      if (r === 'rare' || r === 'epic' || r === 'legendary') {
        const h = r === 'legendary' ? 7 : r === 'epic' ? 5.5 : 4;
        const flicker = 0.75 + Math.sin(this.time * 3 + d.id) * 0.25;
        g.rect(-0.28, -h, 0.56, h).fill({ color, alpha: 0.1 * flicker });
        g.rect(-0.14, -h * 0.8, 0.28, h * 0.8).fill({ color, alpha: 0.18 * flicker });
        g.rect(-0.05, -h * 0.6, 0.1, h * 0.6).fill({ color: 0xffffff, alpha: 0.25 * flicker });
      }
      g.ellipse(0, 0.12, 0.32, 0.12).fill({ color: 0x000000, alpha: 0.4 });
      g.circle(0, 0, 0.42).fill({ color, alpha: 0.18 });
      g.poly([0, -0.32, 0.24, 0, 0, 0.32, -0.24, 0]).fill({ color });
      g.poly([0, -0.32, 0.24, 0, 0, 0]).fill({ color: 0xffffff, alpha: 0.45 });
      g.poly([0, -0.32, 0.24, 0, 0, 0.32, -0.24, 0]).stroke({
        width: 0.04,
        color: 0x000000,
        alpha: 0.6,
      });
      if (d.item.mana) g.circle(0.26, 0.24, 0.09).fill({ color: MANA_HEX[d.item.mana] });
    } else if (d.kind === 'mote') {
      const color = d.mana ? MANA_HEX[d.mana] : 0x93c5fd;
      g.circle(0, 0, 0.26).fill({ color, alpha: 0.25 });
      g.circle(0, 0, 0.13).fill({ color });
      g.circle(-0.04, -0.04, 0.05).fill({ color: 0xffffff, alpha: 0.8 });
    } else if (d.kind === 'orb') {
      g.circle(0, 0, 0.32).fill({ color: 0xef4444, alpha: 0.25 });
      g.circle(0, 0, 0.2).fill({ color: 0xdc2626 });
      g.circle(-0.06, -0.06, 0.07).fill({ color: 0xffffff, alpha: 0.8 });
    } else {
      g.circle(0, 0, 0.16).fill({ color: 0xfcd34d });
    }
  }

  private updateTexts(dt: number): void {
    for (const f of this.floats) {
      f.life -= dt;
      const p = 1 - Math.max(0, f.life / f.max);
      const y = f.y - f.rise * (1 - Math.pow(1 - p, 2));
      const pos = this.toScreen(f.x, y);
      f.text.position.set(pos.x, pos.y);
      f.text.alpha = p > 0.7 ? (1 - p) / 0.3 : 1;
      const s = f.pop ? (p < 0.15 ? 0.5 + (p / 0.15) * 0.9 : Math.max(1, 1.4 - (p - 0.15) * 2)) : 1;
      f.text.scale.set(s);
    }
    const done = this.floats.filter((f) => f.life <= 0);
    for (const f of done) this.releaseText(f.text);
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  destroy(): void {
    this.pixelFloor?.destroy();
    this.pixelFloor = null;
    this.groundFx.destroy();
    this.airFx.destroy();
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
    for (const t of this.textPool) t.destroy();
    this.textPool = [];
  }
}

function lighten(color: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + 60);
  const g = Math.min(255, ((color >> 8) & 0xff) + 60);
  const b = Math.min(255, (color & 0xff) + 60);
  return (r << 16) | (g << 8) | b;
}

function formatShort(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
