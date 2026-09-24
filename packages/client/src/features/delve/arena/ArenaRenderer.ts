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
import { MANA_HEX, NEUTRAL_HEX, RARITY_HEX, REACTION_HEX, cssToHex } from './palette';
import { PixelFloor } from './pixel/pixel-floor';

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
  ring: Graphics;
  sprite: Sprite;
  hp: Graphics;
  baseScale: number;
}

interface DropView {
  root: Container;
  gfx: Graphics;
  label: Text | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
  fill: boolean;
}

interface Bolt {
  points: Vec[];
  life: number;
  max: number;
  color: number;
}

interface Swing {
  x: number;
  y: number;
  angle: number;
  arc: number;
  range: number;
  life: number;
  max: number;
  color: number;
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
};

const FONT = 'Rajdhani, "DM Sans", system-ui, sans-serif';

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
  private decals = new Graphics();
  private dropLayer = new Container();
  private entities = new Container();
  private projG = new Graphics();
  private fxG = new Graphics();
  private textLayer = new Container();

  private hero = new Container();
  private heroAura = new Graphics();
  private heroBody = new Graphics();

  private textures = new Map<string, Texture>();
  private monsters = new Map<number, MonsterView>();
  private summons = new Map<number, MonsterView>();
  private drops = new Map<number, DropView>();
  private trails = new Map<number, Vec[]>();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private swings: Swing[] = [];
  private floats: FloatText[] = [];
  private textPool: Text[] = [];
  private dying: Dying[] = [];
  private heroFlashUntil = 0;

  constructor(app: Application) {
    this.app = app;
    this.entities.sortableChildren = true;
    this.root.addChild(
      this.floor,
      this.decals,
      this.dropLayer,
      this.entities,
      this.projG,
      this.fxG,
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
    for (const v of this.summons.values()) v.root.destroy({ children: true });
    for (const v of this.drops.values()) {
      v.root.destroy({ children: true });
      v.label?.destroy();
    }
    for (const d of this.dying) d.root.destroy({ children: true });
    this.monsters.clear();
    this.summons.clear();
    this.drops.clear();
    this.trails.clear();
    this.dying = [];
    this.particles = [];
    this.rings = [];
    this.bolts = [];
    this.swings = [];
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

  private burst(x: number, y: number, color: number, n: number, speed = 4, size = 0.09): void {
    for (let i = 0; i < n && this.particles.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45,
        max: 0.45,
        color,
        size: size * (0.6 + Math.random()),
      });
    }
  }

  private ring(
    x: number,
    y: number,
    r1: number,
    color: number,
    fill = false,
    life = 0.35,
    r0 = 0.1,
  ): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, fill });
  }

  private jagged(points: Vec[]): Vec[] {
    const out: Vec[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      out.push(a);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        out.push({
          x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.5,
          y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.5,
        });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

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
          this.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
          if (e.reaction) {
            this.floatText(
              e.x,
              e.y - 0.8,
              REACTION_LABEL[e.reaction],
              REACTION_HEX[e.reaction],
              26,
              { pop: true, life: 1.1, rise: 1 },
            );
            this.ring(e.x, e.y, 2.2, REACTION_HEX[e.reaction], false, 0.4);
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
          if (e.dodged) this.floatText(e.x, e.y - 0.5, 'DODGE', 0x67e8f9, 16);
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
              this.ring(w.hero.x, w.hero.y, 1.4, 0x4ade80);
          }
          break;
        case 'basic':
          if (e.melee) {
            const wpn = w.hero.stats.weapon;
            this.swings.push({
              x: e.x,
              y: e.y,
              angle: Math.atan2(e.ty - e.y, e.tx - e.x),
              arc: Math.min(360, wpn.arc) * (Math.PI / 180),
              range: wpn.range + 0.2,
              life: 0.16,
              max: 0.16,
              color: elemColor(e.element),
            });
          }
          break;
        case 'cast': {
          const skill = e.skillId;
          const color =
            skill === 'fireball' || skill === 'magma_eruption' ? MANA_HEX.fire : 0xffffff;
          this.ring(e.x, e.y, 0.9, color, false, 0.2);
          break;
        }
        case 'chain':
          this.bolts.push({
            points: this.jagged(e.points),
            life: 0.2,
            max: 0.2,
            color: MANA_HEX[e.element],
          });
          for (const p of e.points.slice(1)) this.burst(p.x, p.y, MANA_HEX.storm, 3, 3);
          break;
        case 'explode':
          this.ring(e.x, e.y, e.radius, elemColor(e.element), true, 0.35);
          this.ring(e.x, e.y, e.radius, elemColor(e.element), false, 0.45);
          this.burst(e.x, e.y, elemColor(e.element), 10, 5);
          this.addShake(0.04 + e.radius * 0.02);
          break;
        case 'freeze':
          break;
        case 'death':
          this.burst(
            e.x,
            e.y,
            this.biome ? cssToHex(this.biome.accent) : 0xffffff,
            e.monsterKind === 'boss' ? 40 : 12,
            5,
          );
          if (e.monsterKind === 'boss') {
            this.ring(e.x, e.y, 5, 0xfde68a, false, 0.8);
            this.addShake(0.5);
          }
          if (e.scrap > 0 && e.monsterKind !== 'normal')
            this.floatText(e.x, e.y + 0.4, `+${e.scrap} ⚙`, 0xfcd34d, 16);
          this.killMonsterView(e.id);
          break;
        case 'drop':
          if (e.rarity === 'rare' || e.rarity === 'epic' || e.rarity === 'legendary')
            this.ring(e.x, e.y, 1.2, RARITY_HEX[e.rarity], true, 0.5);
          break;
        case 'pickup':
          this.burst(
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
            0.07,
          );
          break;
        case 'dash':
          this.bolts.push({
            points: [
              { x: e.fromX, y: e.fromY },
              { x: e.toX, y: e.toY },
            ],
            life: 0.3,
            max: 0.3,
            color: MANA_HEX.shadow,
          });
          this.burst(e.toX, e.toY, MANA_HEX.shadow, 10, 4);
          break;
        case 'summon':
          this.ring(w.hero.x, w.hero.y, 2, MANA_HEX.earth, true, 0.4);
          break;
        case 'revive':
          this.ring(w.hero.x, w.hero.y, 4, 0xfb923c, true, 0.7);
          this.floatText(w.hero.x, w.hero.y - 1.5, 'REBORN!', 0xfb923c, 30, {
            pop: true,
            life: 1.4,
          });
          this.addShake(0.4);
          break;
        case 'heroDeath':
          this.burst(w.hero.x, w.hero.y, 0xf87171, 30, 5);
          this.addShake(0.6);
          break;
        default:
          break;
      }
    }
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

    if (this.pixelFloor) {
      const left = -this.root.position.x / u;
      const top = -this.root.position.y / u;
      this.pixelFloor.update(dt, w, {
        left,
        top,
        right: left + width / u,
        bottom: top + height / u,
      });
    }
    this.syncHero(w);
    this.syncMonsters(w);
    this.syncSummons(w);
    this.syncDrops(w);
    this.drawDecals(w);
    this.drawProjectiles(w);
    this.drawFx(dt);
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
    this.hero.position.set(h.x, h.y);
    this.hero.zIndex = h.y;
    this.hero.alpha = w.t < h.invulnUntil ? 0.55 : 1;
    const pulse = 0.25 + Math.sin(this.time * 4) * 0.08;
    const g = this.heroAura;
    g.clear();
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

  private makeCreature(icon: string, radius: number): MonsterView {
    const root = new Container();
    const shadow = new Graphics();
    const ring = new Graphics();
    const sprite = new Sprite(this.emoji(icon));
    sprite.anchor.set(0.5, 0.62);
    const baseScale = (radius * 2.5) / sprite.texture.width;
    sprite.scale.set(baseScale);
    const hp = new Graphics();
    root.addChild(shadow, ring, sprite, hp);
    this.entities.addChild(root);
    return { root, shadow, ring, sprite, hp, baseScale };
  }

  private syncMonsters(w: ArpgWorld): void {
    for (const m of w.monsters) {
      let v = this.monsters.get(m.id);
      if (!v) {
        v = this.makeCreature(m.icon, m.radius);
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
    const scale = v.baseScale * (hit ? 1.12 : 1) * (1 + windup * 0.12);
    v.sprite.scale.set(scale * flip, scale);
    v.sprite.position.set(0, bob);
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

    const r = v.ring;
    r.clear();
    if (m.kind === 'elite')
      r.circle(0, 0, m.radius + 0.12).stroke({ width: 0.08, color: 0xfacc15, alpha: 0.9 });
    if (m.kind === 'boss')
      r.circle(0, 0, m.radius + 0.15).stroke({ width: 0.12, color: 0xef4444, alpha: 0.9 });
    if (t < s.hexUntil)
      r.circle(0, 0, m.radius + 0.28).stroke({ width: 0.05, color: MANA_HEX.shadow, alpha: 0.8 });
    if (t < s.shockUntil)
      r.circle(0, 0, m.radius + 0.2).stroke({
        width: 0.04,
        color: MANA_HEX.storm,
        alpha: 0.5 + Math.random() * 0.5,
      });
    if (t < s.brandUntil) r.circle(0, -m.radius - 0.3, 0.12).fill({ color: MANA_HEX.fire });
    if (frozen) r.circle(0, 0, m.radius + 0.05).fill({ color: 0xbfefff, alpha: 0.25 });
    if (t < s.staggerUntil && !frozen) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 5 + (i * Math.PI * 2) / 3;
        r.circle(Math.cos(a) * m.radius * 0.7, -m.radius - 0.25 + Math.sin(a) * 0.1, 0.07).fill({
          color: 0xfde68a,
        });
      }
    }

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

  private syncSummons(w: ArpgWorld): void {
    const alive = new Set(w.summons.map((s) => s.id));
    for (const [id, v] of this.summons) {
      if (!alive.has(id)) {
        this.summons.delete(id);
        this.dying.push({ root: v.root, life: 0.3, max: 0.3 });
      }
    }
    for (const s of w.summons) {
      let v = this.summons.get(s.id);
      if (!v) {
        v = this.makeCreature('🧟', s.radius);
        this.summons.set(s.id, v);
      }
      v.root.position.set(s.x, s.y);
      v.root.zIndex = s.y;
      v.shadow.clear();
      v.shadow
        .ellipse(0, s.radius * 0.55, s.radius * 0.95, s.radius * 0.35)
        .fill({ color: 0x000000, alpha: 0.4 });
      v.ring.clear();
      v.ring
        .circle(0, 0, s.radius + 0.12)
        .stroke({ width: 0.08, color: MANA_HEX.earth, alpha: 0.9 });
      v.hp.clear();
      const bw = s.radius * 2;
      v.hp.rect(-bw / 2, -s.radius * 1.55 - 0.2, bw, 0.12).fill({ color: 0x000000, alpha: 0.7 });
      v.hp
        .rect(-bw / 2, -s.radius * 1.55 - 0.2, (bw * Math.max(0, s.hp)) / s.maxHp, 0.12)
        .fill({ color: 0x86efac });
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

  private drawDecals(w: ArpgWorld): void {
    const g = this.decals;
    g.clear();
    const t = w.t;
    for (const z of w.zones) {
      if (z.owner === 'monster') {
        const p = Math.min(1, (t - z.born) / Math.max(0.01, z.detonateAt - z.born));
        g.circle(z.x, z.y, z.radius).fill({ color: 0xef4444, alpha: 0.12 });
        g.circle(z.x, z.y, z.radius * p).fill({ color: 0xef4444, alpha: 0.28 });
        g.circle(z.x, z.y, z.radius).stroke({ width: 0.08, color: 0xff6b6b, alpha: 0.9 });
        continue;
      }
      const fade = Math.min(1, (z.until - t) / 0.5, (t - z.born) / 0.2);
      const pulse = 0.8 + Math.sin(this.time * 6) * 0.2;
      if (z.skillId === 'magma_eruption') {
        g.circle(z.x, z.y, z.radius).fill({ color: 0xff5a1f, alpha: 0.28 * fade * pulse });
        g.circle(z.x, z.y, z.radius * 0.6).fill({ color: 0xffb347, alpha: 0.2 * fade });
        g.circle(z.x, z.y, z.radius).stroke({ width: 0.08, color: 0xff7a3c, alpha: 0.7 * fade });
        if (Math.random() < 0.5)
          this.burst(
            z.x + (Math.random() - 0.5) * z.radius * 1.4,
            z.y + (Math.random() - 0.5) * z.radius * 1.4,
            0xff7a3c,
            1,
            1.5,
          );
      } else if (z.skillId === 'blizzard') {
        g.circle(z.x, z.y, z.radius).fill({ color: 0x9fdcff, alpha: 0.16 * fade });
        g.circle(z.x, z.y, z.radius).stroke({ width: 0.06, color: 0xe0f7ff, alpha: 0.7 * fade });
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * z.radius;
          this.particles.push({
            x: z.x + Math.cos(a) * r,
            y: z.y + Math.sin(a) * r - 1,
            vx: 0.5,
            vy: 2.5,
            life: 0.4,
            max: 0.4,
            color: Math.random() < 0.3 ? MANA_HEX.storm : 0xffffff,
            size: 0.06,
          });
        }
      } else {
        g.circle(z.x, z.y, z.radius).fill({ color: 0xbfefff, alpha: 0.14 * fade });
        g.circle(z.x, z.y, z.radius).stroke({ width: 0.05, color: 0xbfefff, alpha: 0.5 * fade });
      }
    }

    // Monster wind-ups
    for (const m of w.monsters) {
      if (m.windupUntil <= 0) continue;
      const p = Math.min(1, (t - m.windupStart) / Math.max(0.01, m.windupUntil - m.windupStart));
      const h = w.hero;
      if (m.ai === 'charger') {
        const d = m.chargeDir;
        const len = 7;
        const nx = -d.y * m.radius;
        const ny = d.x * m.radius;
        g.poly([
          m.x + nx,
          m.y + ny,
          m.x + d.x * len + nx,
          m.y + d.y * len + ny,
          m.x + d.x * len - nx,
          m.y + d.y * len - ny,
          m.x - nx,
          m.y - ny,
        ]).fill({
          color: 0xef4444,
          alpha: 0.12 + p * 0.25,
        });
      } else if (m.ai === 'ranged') {
        g.moveTo(m.x, m.y)
          .lineTo(h.x, h.y)
          .stroke({ width: 0.05 + p * 0.06, color: 0xff6b6b, alpha: 0.25 + p * 0.5 });
      } else {
        const reach = m.attackRange + m.radius + 0.4;
        g.circle(m.x, m.y, reach).fill({ color: 0xef4444, alpha: 0.06 + p * 0.16 });
        g.circle(m.x, m.y, reach).stroke({ width: 0.04, color: 0xff6b6b, alpha: 0.3 + p * 0.5 });
      }
    }
  }

  private drawProjectiles(w: ArpgWorld): void {
    const g = this.projG;
    g.clear();
    const alive = new Set<number>();
    for (const p of w.projectiles) {
      alive.add(p.id);
      let trail = this.trails.get(p.id);
      if (!trail) {
        trail = [];
        this.trails.set(p.id, trail);
      }
      trail.push({ x: p.x, y: p.y });
      if (trail.length > 7) trail.shift();
      const color =
        p.owner === 'monster' ? (p.element ? MANA_HEX[p.element] : 0xff4444) : elemColor(p.element);
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        g.moveTo(trail[i - 1].x, trail[i - 1].y)
          .lineTo(trail[i].x, trail[i].y)
          .stroke({ width: (p.skillId === 'boulder' ? 0.5 : 0.16) * a, color, alpha: 0.5 * a });
      }
      switch (p.skillId) {
        case 'fireball':
          g.circle(p.x, p.y, 0.5).fill({ color: 0xff6a2b, alpha: 0.3 });
          g.circle(p.x, p.y, 0.3).fill({ color: 0xffb347 });
          g.circle(p.x, p.y, 0.14).fill({ color: 0xfff1c1 });
          break;
        case 'boulder': {
          const spin = this.time * 12;
          g.circle(p.x, p.y, p.radius).fill({ color: 0x8b6b43 });
          g.circle(p.x, p.y, p.radius).stroke({ width: 0.08, color: 0x3b2a18 });
          g.moveTo(p.x + Math.cos(spin) * p.radius * 0.8, p.y + Math.sin(spin) * p.radius * 0.8)
            .lineTo(p.x - Math.cos(spin) * p.radius * 0.8, p.y - Math.sin(spin) * p.radius * 0.8)
            .stroke({ width: 0.08, color: 0x5c4630 });
          break;
        }
        case 'plasma_orb':
          g.circle(p.x, p.y, 0.75).fill({ color: 0xb07cff, alpha: 0.2 + Math.random() * 0.1 });
          g.circle(p.x, p.y, 0.45).fill({ color: 0xf5e049, alpha: 0.5 });
          g.circle(p.x, p.y, 0.25).fill({ color: 0xffffff });
          break;
        case 'void_bolt':
          g.circle(p.x, p.y, 0.32).fill({ color: 0xb07cff, alpha: 0.5 });
          g.circle(p.x, p.y, 0.16).fill({ color: 0xf5e049 });
          break;
        default:
          if (p.owner === 'monster') {
            g.circle(p.x, p.y, p.radius + 0.1).fill({ color, alpha: 0.3 });
            g.circle(p.x, p.y, p.radius).fill({ color: 0x7f1d1d });
            g.circle(p.x, p.y, p.radius * 0.55).fill({ color });
          } else {
            g.circle(p.x, p.y, 0.28).fill({ color, alpha: 0.35 });
            g.circle(p.x, p.y, 0.15).fill({ color: 0xffffff });
          }
      }
    }
    for (const id of [...this.trails.keys()]) if (!alive.has(id)) this.trails.delete(id);
  }

  private drawFx(dt: number): void {
    const g = this.fxG;
    g.clear();
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      const a = Math.max(0, p.life / p.max);
      g.circle(p.x, p.y, p.size * (0.5 + a * 0.5)).fill({ color: p.color, alpha: a });
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.life -= dt;
      const p = 1 - Math.max(0, r.life / r.max);
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - p, 3));
      if (r.fill) g.circle(r.x, r.y, radius).fill({ color: r.color, alpha: 0.3 * (1 - p) });
      else
        g.circle(r.x, r.y, radius).stroke({
          width: 0.1 * (1 - p) + 0.02,
          color: r.color,
          alpha: 1 - p,
        });
    }
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const b of this.bolts) {
      b.life -= dt;
      const a = Math.max(0, b.life / b.max);
      for (const [width, color, alpha] of [
        [0.22, b.color, 0.35],
        [0.08, 0xffffff, 0.9],
      ] as const) {
        g.moveTo(b.points[0].x, b.points[0].y);
        for (const pt of b.points.slice(1)) g.lineTo(pt.x, pt.y);
        g.stroke({ width, color, alpha: alpha * a });
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    for (const s of this.swings) {
      s.life -= dt;
      const a = Math.max(0, s.life / s.max);
      const start = s.angle - s.arc / 2;
      const end = s.angle + s.arc / 2;
      const sweep = start + (end - start) * (1 - a * 0.6);
      g.moveTo(s.x + Math.cos(start) * s.range, s.y + Math.sin(start) * s.range)
        .arc(s.x, s.y, s.range, start, sweep)
        .stroke({ width: 0.22 * a + 0.04, color: s.color, alpha: 0.85 * a });
    }
    this.swings = this.swings.filter((s) => s.life > 0);
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
