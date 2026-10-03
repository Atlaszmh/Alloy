import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  activeMove,
  type ArpgEvent,
  type ArpgWorld,
  type BiomeDef,
  type Door,
  type Drop,
  type FloorMap,
  type GearItem,
  type InteractableKind,
  type ManaType,
  type MaterialRef,
  type MonsterEntity,
  type PropId,
  type Vec,
} from '@alloy/engine';
import { PixelLayer, type ViewRect } from './fx/pixel-layer';
import { ManaFx, finisherRing } from './fx/mana-fx';
import { INFUSION_BUDGET, type InfusionBudget } from './fx/infusion';
import { windingUp } from './fx/anticipation';
import { Lifecycles } from './fx/lifecycles';
import { barrierBreakFx, reactionFx, reactionLabel } from './fx/reactions';
import { runeFx, runeHex } from './fx/runes';
import { TIER_NUMERAL } from '../runes/rune-style';
import {
  drawAim,
  drawAnticipation,
  drawFooting,
  drawGuard,
  drawInfusions,
  drawLobs,
  drawMonsterMarks,
  drawProjectiles,
  drawTelegraphs,
  drawZones,
  guardMove,
  type AimView,
} from './fx/draw-world';

export type { AimView } from './fx/draw-world';
import { MANA_HEX, NEUTRAL_HEX, RARITY_HEX, REACTION_HEX, cssToHex } from './palette';
import { PixelFloor } from './pixel/pixel-floor';
import { FLOOR_MARGIN, floorInit } from './pixel/floor-engine';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { arenaZoom, type Insets } from './camera';
import { getDelveRegistry } from '../registry';
import { RARITY_TEXT } from '../format';
import { PATTERN_COLOR, materialColor, materialLabel } from '../materials/material-style';
import { contextZoom } from '../kit/zoom';
import { useUIStore } from '@/stores/uiStore';

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
  plaque: Plaque | null;
  /** Where the drop was last frame: a magnet's pull shows as a trail. */
  x: number;
  y: number;
}

/** A loot label (decided item 22): screen space, `w`×`h` px. */
interface Plaque {
  box: Container;
  w: number;
  h: number;
  /** Shown without Alt: rare and up, a rune, an upgrade. */
  always: boolean;
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

/** A generated floor's fog: one pixel a cell, over the map and the cliffs round it. */
interface FogLayer {
  sprite: Sprite;
  source: BufferImageSource;
  pixels: Uint8Array;
  /** The world's `fogVersion` it shows. */
  version: number;
}

interface Dying {
  root: Container;
  life: number;
  max: number;
}

const FONT = 'Rajdhani, "DM Sans", system-ui, sans-serif';

/** A door's posts, its bars, and the glow of a sealed one (ENDESGA 32). */
const DOOR_STONE = 0x5a6988;
const DOOR_IRON = 0x8b9bb4;
const DOOR_SEAL = 0xe43b44;
/** Seconds a door's bars take to slide shut, or back open. */
const DOOR_SECONDS = 0.25;

/** The fog's darkness (alpha) by a cell's fog: unseen black, seen but out of sight dimmed, in sight clear. */
const FOG_ALPHA = [255, 150, 0];

/** Each interactable's prop in the atlas. */
const PROP_SPRITE: Record<InteractableKind, PropId> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'alcove_anvil',
  gate: 'exit_gate',
};

/** Forms cast on the hero itself: they burst outward instead of flinging at a target. */
const SELF_FORMS = new Set(['nova', 'ward', 'armor', 'surge']);

function elemColor(e: ManaType | null | undefined): number {
  return e ? MANA_HEX[e] : NEUTRAL_HEX;
}

/** Destroy and forget every view whose entity id isn't in `alive`. */
export function pruneViews<V>(
  views: Map<number, V>,
  alive: Set<number>,
  destroy: (view: V) => void,
): void {
  for (const [id, view] of views) {
    if (alive.has(id)) continue;
    destroy(view);
    views.delete(id);
  }
}

export class ArenaRenderer {
  readonly app: Application;
  private world: ArpgWorld | null = null;
  private biome: BiomeDef | null = null;
  private unit = 30;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** The visible arena rectangle (world units), as of the last frame. */
  private view: ViewRect = { left: 0, top: 0, right: 0, bottom: 0 };
  /** Reduced motion: no shake and no strike kick (decided item 14). */
  private readonly still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private cam = { x: 0, y: 0 };
  private shake = 0;
  /** This frame's shake offset in px; held while the display is frozen or paused. */
  private jitter = { x: 0, y: 0 };
  /** A camera nudge toward the last strike (world units), decaying fast. */
  private kick = { x: 0, y: 0 };
  private time = 0;

  private root = new Container();
  private floor = new Graphics();
  private pixelFloor: PixelFloor | null = null;
  /** A generated floor's doors, under the drops, redrawn every frame. */
  private doorGfx = new Graphics();
  /** How shut each door's bars are, 0 to 1. */
  private doorShut = new Map<number, number>();
  /** The rooms' props by interactable id, with their atlas frames. */
  private props = new Map<string, { sprite: Sprite; frames: Texture[] }>();
  /** A generated floor's fog. */
  private fog: FogLayer | null = null;
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
  private lifecycles = new Lifecycles();
  /** Effects as mana pixels: under the characters (ground) and over them (air, glowing). */
  private readonly groundFx: PixelLayer;
  private readonly airFx: PixelLayer;
  private readonly fx = new ManaFx();
  /** The infusion pass's per-frame allowance (fx/infusion.ts), reset every frame. */
  private readonly budget: InfusionBudget = { left: INFUSION_BUDGET };
  private floats: FloatText[] = [];
  private textPool: Text[] = [];
  private dying: Dying[] = [];
  private heroFlashUntil = 0;
  private heroPerfectUntil = 0;
  private aim: AimView | null = null;
  /** Alt or L3 held: every drop's loot label shows. */
  private labelsHeld = false;
  /** Whether an item is an upgrade as it comes (▲ on its label), asked once per drop. */
  private isUpgrade: (item: GearItem) => boolean = () => false;

  constructor(app: Application) {
    this.app = app;
    this.entities.sortableChildren = true;
    this.groundFx = new PixelLayer(app.renderer);
    this.airFx = new PixelLayer(app.renderer, true);
    this.root.addChild(
      this.floor,
      this.groundFx.sprite,
      this.doorGfx,
      this.dropLayer,
      this.entities,
      this.airFx.sprite,
    );
    this.hero.addChild(this.heroAura, this.heroBody);
    app.stage.addChild(this.root, this.textLayer);
    this.resize();
  }

  /** The screen the HUD covers on each side (viewport px): the camera centres in what is left. */
  setInsets(insets: Insets): void {
    this.insets = insets;
  }

  /** The visible arena rectangle in world units (the minimap's view box). */
  viewRect(): ViewRect {
    return this.view;
  }

  /** The zoom (camera.ts): whole render pixels per sprite pixel, from the screen height alone. */
  resize(): void {
    const res = this.app.renderer.resolution;
    const { scale } = arenaZoom(this.app.screen.height, res, useUIStore.getState().arenaViewUnits);
    this.unit = Math.round(scale / SPRITE_PIXEL) / res;
  }

  /** Scene setup for a new floor. */
  loadFloor(world: ArpgWorld, biome: BiomeDef): void {
    this.world = world;
    this.biome = biome;
    for (const v of this.monsters.values()) v.root.destroy({ children: true });
    for (const v of this.drops.values()) {
      v.root.destroy({ children: true });
      v.plaque?.box.destroy({ children: true });
    }
    for (const d of this.dying) d.root.destroy({ children: true });
    this.monsters.clear();
    this.drops.clear();
    this.trails.clear();
    this.lifecycles.clear();
    this.kick = { x: 0, y: 0 };
    this.dying = [];
    this.fx.clear();
    for (const f of this.floats) this.releaseText(f.text);
    this.floats = [];
    this.drawFloor();
    this.doorShut.clear();
    this.makeProps(world);
    this.fog?.sprite.destroy({ texture: true, textureSource: true });
    this.fog = world.map.open ? null : this.makeFog(world.map);
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
    this.root.addChildAt(this.pixelFloor.sprite, 1);
    if (!this.hero.parent) this.entities.addChild(this.hero);
    this.cam = { x: world.hero.x, y: world.hero.y };
    // A still frame: the new floor's view at once, for the HUD's first snapshot of it.
    this.update(0);
  }

  /** The rooms' props from the atlas, standing at their interactables (none without art). */
  private makeProps(w: ArpgWorld): void {
    for (const v of this.props.values()) v.sprite.destroy();
    this.props.clear();
    const sizes = getDelveRegistry().getDelveData().layouts.props;
    for (const { interactable: it } of w.map.rooms) {
      const frames = it && spriteFrames(PROP_SPRITE[it.kind]);
      if (!it || !frames) continue;
      // Its base on the floor below the spot, sorted among the creatures by it.
      const base = it.y + sizes[PROP_SPRITE[it.kind]] / 2;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_PIXEL);
      sprite.position.set(it.x, base);
      sprite.zIndex = base - 0.5;
      this.entities.addChild(sprite);
      this.props.set(it.id, { sprite, frames });
    }
  }

  /** The fog layer, over everything on the floor (the labels and numbers stay above it). */
  private makeFog(map: FloorMap): FogLayer {
    const pad = FLOOR_MARGIN;
    const width = map.width + pad * 2;
    const height = map.height + pad * 2;
    const pixels = new Uint8Array(width * height * 4);
    const source = new BufferImageSource({
      resource: pixels,
      width,
      height,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.position.set(-pad, -pad);
    this.root.addChild(sprite);
    return { sprite, source, pixels, version: -1 };
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
    if (this.still) return;
    this.shake = Math.min(0.6, this.shake + amount);
  }

  /** Nudge the camera toward a strike, by its heft; heavy ones shake too. */
  private kickCamera(dir: Vec, heft: number): void {
    if (this.still) return;
    const len = Math.hypot(dir.x, dir.y) || 1;
    this.kick.x += (dir.x / len) * 0.12 * heft;
    this.kick.y += (dir.y / len) * 0.12 * heft;
    if (heft >= 0.7) this.addShake(0.15 * heft);
  }

  handleEvents(events: ArpgEvent[]): void {
    const w = this.world;
    if (!w) return;
    this.pixelFloor?.handleEvents(events);
    let numbers = 0;
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          // Out of sight, a hit shows nothing (its number would give the foe away).
          if (!inSight(w, e.x, e.y)) break;
          const color = elemColor(e.element);
          this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
          if (e.reaction) {
            this.floatText(
              e.x,
              e.y - 0.8,
              reactionLabel(e.reaction, e.pairs),
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
          // Invulnerable (Training Grounds): the would-be damage in grey, and no flash.
          else if (e.blocked)
            this.floatText(e.x, e.y - 0.3, `-${formatShort(e.amount)}`, 0x9ca3af, 20);
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
          this.kickCamera(e.dir, e.heft);
          // The row the blow struck with (a manual hold blow's: its stage's).
          const wpn = w.hero.stats.weapon;
          const s = wpn.feel[e.moveKind];
          const arc = Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180);
          const range = wpn.range + (s.reach ?? 0) + 0.2;
          const heavy = e.moveKind === 'heavy' || e.moveKind === 'hold';
          if (e.melee)
            this.fx.swing(
              e.x,
              e.y,
              Math.atan2(e.dir.y, e.dir.x),
              arc,
              range,
              elemColor(e.element),
              { heft: e.heft, reverse: e.step % 2 === 1, finisher: heavy },
            );
          else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          // Heavy and hold blows ring out in their own element: at the tip, round a full circle, or at the hand.
          const ring = finisherRing(e, arc, range);
          if (ring) this.fx.infuse('finisher', e.element, ring);
          break;
        }
        case 'cast': {
          const color = MANA_HEX[e.element];
          this.kickCamera({ x: e.tx - e.x, y: e.ty - e.y }, e.heft);
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
          this.fx.beam(e.x, e.y, e.tx, e.ty, e.width, MANA_HEX[e.element], e.infusion);
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
            { heft: e.heft, finisher: e.arc >= 360, infusion: e.infusion },
          );
          if (e.arc >= 360) this.addShake(0.12);
          break;
        case 'buff':
          this.fx.ring(w.hero.x, w.hero.y, 1.6, MANA_HEX[e.element], true, 0.4);
          break;
        case 'holdStage': {
          const ping = holdPing(w, e);
          this.fx.ring(w.hero.x, w.hero.y - 0.3, ping.r, ping.color, false, 0.25);
          break;
        }
        case 'wardBreak':
          this.fx.ring(e.x, e.y, 2.4, MANA_HEX[e.element], false, 0.5);
          this.fx.burst(e.x, e.y, 0xffffff, 16, 5);
          this.addShake(0.15);
          break;
        case 'barrierBreak':
          barrierBreakFx(this.fx, e);
          this.addShake(0.12);
          break;
        case 'reaction':
          reactionFx(this.fx, e, w);
          break;
        case 'runeFx':
          runeFx(this.fx, e);
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
          if (e.infusion)
            this.fx.infuse('blast', e.infusion, { kind: 'ring', x: e.x, y: e.y, r: e.radius });
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
          this.killMonsterView(e.id);
          break;
        case 'drop':
          if (e.rarity === 'rare' || e.rarity === 'epic' || e.rarity === 'legendary')
            this.fx.ring(e.x, e.y, 1.2, RARITY_HEX[e.rarity], true, 0.5);
          break;
        case 'pickup':
          this.fx.burst(w.hero.x, w.hero.y, pickupColor(e), 5, 2.5);
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
          if (e.infusion)
            this.fx.infuse('dash', e.infusion, {
              kind: 'path',
              points: [
                { x: e.fromX, y: e.fromY },
                { x: e.toX, y: e.toY },
              ],
              width: 0.4,
              progress: 0,
            });
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
    const guard = guardMove(w.hero);
    return guard ? MANA_HEX[guard.element] : MANA_HEX.shadow;
  }

  /** Alt or L3 held (or let go): every drop's loot label shows. */
  setLabelsHeld(held: boolean): void {
    this.labelsHeld = held;
  }

  /** How to tell an upgrade (▲ on its label); asked once, when a drop's view is made. */
  setUpgradeTest(isUpgrade: (item: GearItem) => boolean): void {
    this.isUpgrade = isUpgrade;
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

    // Camera: centred in the clear rectangle the HUD's insets leave, clamped to that rectangle's
    // half extents (a narrow one still follows sideways), on whole render pixels.
    const ins = this.insets;
    const clearW = Math.max(1, width - ins.left - ins.right);
    const clearH = Math.max(1, height - ins.top - ins.bottom);
    const halfW = clearW / 2 / u;
    const halfH = clearH / 2 / u;
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
    const kd = Math.exp(-dt / 0.04);
    this.kick.x *= kd;
    this.kick.y *= kd;
    if (dt > 0)
      this.jitter = {
        x: (Math.random() - 0.5) * this.shake * u,
        y: (Math.random() - 0.5) * this.shake * u,
      };
    const { x: sx, y: sy } = this.jitter;
    const res = this.app.renderer.resolution;
    const whole = (px: number) => Math.round(px * res) / res;
    this.root.scale.set(u);
    this.root.position.set(
      whole(ins.left + clearW / 2 - (cx + this.kick.x) * u + sx),
      whole(ins.top + clearH / 2 - (cy + this.kick.y) * u + sy),
    );

    const left = -this.root.position.x / u;
    const top = -this.root.position.y / u;
    const view: ViewRect = { left, top, right: left + width / u, bottom: top + height / u };
    this.view = view;
    this.pixelFloor?.update(dt, w, view);

    const ground = this.groundFx.g;
    const air = this.airFx.g;
    ground.clear();
    air.clear();
    this.syncHero(w);
    this.syncMonsters(w);
    this.syncDrops(w);
    this.syncProps(w);
    this.drawDoors(w, dt);
    const fog = this.fog;
    if (fog && fog.version !== w.fogVersion) {
      paintFog(w.map, w.fog, FLOOR_MARGIN, fog.pixels);
      fog.source.update();
      fog.version = w.fogVersion;
    }
    // A foe out of sight shows nothing: not its marks, nor its wind-ups.
    const seen = w.map.open
      ? w
      : { ...w, monsters: w.monsters.filter((m) => inSight(w, m.x, m.y)) };
    drawZones(ground, w, this.time);
    drawLobs(ground, air, w, this.time);
    drawTelegraphs(ground, seen, this.time);
    drawFooting(ground, w, this.time);
    drawMonsterMarks(ground, air, seen, this.time);
    this.lifecycles.update(w, this.fx, this.time);
    drawProjectiles(air, w, this.time, this.trails, (id) => this.lifecycles.bornAt(id));
    drawGuard(air, w, this.time);
    drawAnticipation(air, this.fx, w, this.time, dt, this.aim?.point ?? null);
    // The effects, then the infusion pass (fx/infusion.ts), sharing one budget in priority order:
    // ManaFx's transient carriers first, then the hero's aura, projectiles, lobs and zones.
    const layers = { air, ground };
    this.budget.left = INFUSION_BUDGET;
    this.fx.draw(layers, dt, this.time, this.budget);
    drawInfusions(layers, w, this.time, this.budget);
    // The aim marker stays on top.
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
    const aura = MANA_HEX[h.stats.weapon.blows[0].element];
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
      // Winding up: lean back from the target, a pixel or two for heavy moves (a 1 px lift
      // would cancel the lean of a blow aimed up).
      const a = windingUp(w, this.aim?.point ?? null);
      const lean = a ? (a.heft >= 0.7 ? 2 : 1) * SPRITE_PIXEL : 0;
      s.position.set(-Math.round(a?.dir.x ?? 0) * lean, 0.5 - Math.round(a?.dir.y ?? 0) * lean);
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
    // A monster removed without dying (the Training Grounds' Clear) leaves no sprite behind.
    pruneViews(this.monsters, new Set(w.monsters.map((m) => m.id)), (v) =>
      v.root.destroy({ children: true }),
    );
  }

  private drawMonster(v: MonsterView, m: MonsterEntity, w: ArpgWorld): void {
    const t = w.t;
    const s = m.status;
    v.root.position.set(m.x, m.y);
    v.root.zIndex = m.y;
    v.root.visible = inSight(w, m.x, m.y);
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
        : s.stacks.frost > 0
          ? 0xc8ecff
          : s.stacks.fire > 0 && Math.sin(this.time * 20) > 0
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
    // Dummies show no life bar: the meter shows the damage.
    if (!m.dummy && m.kind !== 'boss' && (m.hp < m.maxHp || m.kind === 'elite')) {
      const bw = Math.max(0.9, m.radius * 2);
      const y = -m.radius * 1.55 - 0.2;
      hp.rect(-bw / 2, y, bw, 0.13).fill({ color: 0x000000, alpha: 0.7 });
      hp.rect(-bw / 2, y, (bw * Math.max(0, m.hp)) / m.maxHp, 0.13).fill({
        color: m.kind === 'elite' ? 0xfacc15 : 0xef4444,
      });
    }
  }

  /** Each prop in its state (`propFrame`); a gate opens once no boss lives. */
  private syncProps(w: ArpgWorld): void {
    const open = w.bossId === null || w.bossKilled;
    for (const { interactable: it } of w.map.rooms) {
      const v = it && this.props.get(it.id);
      if (!it || !v) continue;
      const f = propFrame(it.kind, it.used, open, this.time);
      v.sprite.texture = v.frames[f.frame % v.frames.length];
      v.sprite.tint = f.tint;
    }
  }

  /** The doors, each one's bars easing toward its state over `DOOR_SECONDS`. */
  private drawDoors(w: ArpgWorld, dt: number): void {
    const g = this.doorGfx;
    g.clear();
    for (const d of w.map.doors) {
      const was = this.doorShut.get(d.id) ?? (d.closed ? 1 : 0);
      const step = dt / DOOR_SECONDS;
      const shut = d.closed ? Math.min(1, was + step) : Math.max(0, was - step);
      this.doorShut.set(d.id, shut);
      drawDoor(g, d, shut, this.time);
    }
  }

  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
    const shown: { p: Plaque; x: number; y: number }[] = [];
    for (const d of w.drops) {
      alive.add(d.id);
      let v = this.drops.get(d.id);
      if (!v) {
        v = this.makeDrop(d);
        this.drops.set(d.id, v);
      }
      const age = w.t - d.born;
      const pop = dropPop(d, age);
      // Items, runes, patterns and essences lie still, and so does a Seedling's rooted sprout.
      const still =
        d.kind === 'item' ||
        d.kind === 'rune' ||
        d.kind === 'pattern' ||
        d.material?.kind === 'essence' ||
        isSprout(d);
      const bob = still ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;
      v.root.position.set(d.x, d.y - pop + bob);
      v.root.zIndex = d.y - 0.5;
      drawDrop(v.gfx, d, this.time, age, { dx: d.x - v.x, dy: d.y - v.y });
      v.x = d.x;
      v.y = d.y;
      const plaque = v.plaque;
      if (plaque) {
        plaque.box.visible = (plaque.always || this.labelsHeld) && seenAt(w, d.x, d.y);
        if (plaque.box.visible) shown.push({ p: plaque, ...this.toScreen(d.x, d.y - pop - 0.9) });
      }
    }
    const bottoms = stackPlaques(shown.map(({ p, x, y }) => ({ x, y, w: p.w, h: p.h })));
    shown.forEach(({ p, x }, i) =>
      p.box.position.set(Math.round(x - p.w / 2), Math.round(bottoms[i] - p.h)),
    );
    pruneViews(this.drops, alive, (v) => {
      v.root.destroy({ children: true });
      v.plaque?.box.destroy({ children: true });
    });
  }

  private makeDrop(d: Drop): DropView {
    const root = new Container();
    const gfx = new Graphics();
    root.addChild(gfx);
    this.dropLayer.addChild(root);
    const named = dropPlaque(d, !!d.item && this.isUpgrade(d.item));
    return { root, gfx, plaque: named && this.makePlaque(named), x: d.x, y: d.y };
  }

  /** A loot label: its text in Jersey 10 at 14 × the HUD scale px on a dark plate, bordered in its colour. */
  private makePlaque(named: { text: string; color: number; always: boolean }): Plaque {
    const s = contextZoom('hud');
    const text = new Text({
      text: named.text,
      style: {
        fontFamily: '"Jersey 10", sans-serif',
        fontSize: 14 * s,
        letterSpacing: 0.7 * s,
        fill: named.color,
      },
    });
    text.position.set(Math.round(9 * s), Math.round(3 * s));
    const w = Math.ceil(text.width + 18 * s);
    const h = Math.ceil(text.height + 6 * s);
    const plate = new Graphics()
      .rect(0, 0, w, h)
      .fill({ color: 0x0a0a10, alpha: 0.86 })
      .stroke({ width: 1, color: named.color, alpha: 0.55, alignment: 1 });
    const box = new Container();
    box.addChild(plate, text);
    box.visible = false;
    this.textLayer.addChild(box);
    return { box, w, h, always: named.always };
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

/**
 * A hold reaching a stage pings a ring round the hero, wider at stage 2, in
 * the held move's element (an ability's hold) or the held blow's (slot null).
 */
export function holdPing(
  w: ArpgWorld,
  e: { slot: number | null; stage: number },
): { r: number; color: number } {
  const h = w.hero;
  const element =
    e.slot === null
      ? h.stats.weapon.blows[h.swing?.step ?? 0]?.element
      : activeMove(h, e.slot)?.element;
  return { r: 0.8 + 0.4 * e.stage, color: elemColor(element) };
}

/**
 * A door: a stone post at each end of its cells and, as it shuts (`shut` 0 → 1),
 * iron bars sliding across it, glowing red while they hold its room sealed.
 * Whole sprite pixels (0.1 units).
 */
export function drawDoor(g: Graphics, d: Door, shut: number, time: number): void {
  const xs = d.cells.map((c) => c.x);
  const ys = d.cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) + 1 - x0;
  const h = Math.max(...ys) + 1 - y0;
  // Across a hall running up and down (wider than deep), or across one running sideways.
  const across = w >= h;
  if (across) {
    g.rect(x0 - 0.3, y0, 0.3, h).fill({ color: DOOR_STONE });
    g.rect(x0 + w, y0, 0.3, h).fill({ color: DOOR_STONE });
  } else {
    g.rect(x0, y0 - 0.3, w, 0.3).fill({ color: DOOR_STONE });
    g.rect(x0, y0 + h, w, 0.3).fill({ color: DOOR_STONE });
  }
  if (shut <= 0) return;
  g.rect(x0, y0, w, h).fill({ color: DOOR_SEAL, alpha: (0.25 + 0.15 * Math.sin(time * 6)) * shut });
  // A bar every 3 sprite pixels, slid `shut` of the way in.
  const bars = Math.round((across ? w : h) / 0.3);
  for (let k = 0; k < bars; k++) {
    if (across) g.rect(x0 + 0.1 + k * 0.3, y0, 0.1, h * shut).fill({ color: DOOR_IRON });
    else g.rect(x0, y0 + 0.1 + k * 0.3, w * shut, 0.1).fill({ color: DOOR_IRON });
  }
}

/** The fog at a point: 0 unseen, 1 seen, 2 in sight (on the open room, always 2). */
function fogAt(w: ArpgWorld, x: number, y: number): number {
  if (w.map.open) return 2;
  const { width: W, height: H } = w.map;
  const cx = Math.min(W - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(H - 1, Math.max(0, Math.floor(y)));
  return w.fog[cy * W + cx];
}

/** Whether the hero sees a point now (on the open room, always). */
export function inSight(w: ArpgWorld, x: number, y: number): boolean {
  return fogAt(w, x, y) === 2;
}

/** Whether the fog has ever seen a point (on the open room, always): the minimap's rule for drops. */
export function seenAt(w: ArpgWorld, x: number, y: number): boolean {
  return fogAt(w, x, y) > 0;
}

/**
 * The fog layer's pixels (black, at `FOG_ALPHA`), one a cell over the map and
 * `pad` cells round it. A wall takes the clearest fog of the floor beside it,
 * so the walls round what the hero sees show; past the map's edge, the edge's.
 */
export function paintFog(map: FloorMap, fog: Uint8Array, pad: number, out: Uint8Array): void {
  const { width: W, height: H, cells } = map;
  const OW = W + pad * 2;
  for (let oy = 0; oy < H + pad * 2; oy++)
    for (let ox = 0; ox < OW; ox++) {
      const x = Math.min(W - 1, Math.max(0, ox - pad));
      const y = Math.min(H - 1, Math.max(0, oy - pad));
      let f = fog[y * W + x];
      if (cells[y * W + x] === 1)
        for (let ny = Math.max(0, y - 1); ny <= Math.min(H - 1, y + 1); ny++)
          for (let nx = Math.max(0, x - 1); nx <= Math.min(W - 1, x + 1); nx++)
            if (cells[ny * W + nx] !== 1) f = Math.max(f, fog[ny * W + nx]);
      out[(oy * OW + ox) * 4 + 3] = FOG_ALPHA[f];
    }
}

/**
 * A prop's atlas frame and tint: a chest opens (frame 1) and a shrine goes dark
 * once used; a gate opens once it may be taken; an anvil's glow flickers until
 * used, then it stands dimmed.
 */
export function propFrame(
  kind: InteractableKind,
  used: boolean,
  gateOpen: boolean,
  time: number,
): { frame: number; tint: number } {
  if (kind === 'gate') return { frame: gateOpen ? 1 : 0, tint: 0xffffff };
  if (kind !== 'alcove') return { frame: used ? 1 : 0, tint: 0xffffff };
  return used ? { frame: 0, tint: 0x8b8b8b } : { frame: Math.floor(time * 3) % 2, tint: 0xffffff };
}

/**
 * A pickup's sparkle: the item's rarity, a rune's family, a material's
 * colour, else the drop's mana (a mote, a Seedling orb), else red.
 */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
  if (e.rune) return runeHex(e.rune);
  if (e.material) return cssToHex(materialColor(getDelveRegistry(), e.material));
  if (e.pattern) return cssToHex(PATTERN_COLOR);
  if (e.mana) return MANA_HEX[e.mana];
  return e.dropKind === 'orb' ? 0xf87171 : 0xffffff;
}

/** A Seedling's orb: a sprout rooted where it grew. */
const isSprout = (d: Drop) => d.kind === 'orb' && d.mana === 'nature';

/** How high a drop hops as it lands, `age` seconds after it fell: a sprout grows in rooted. */
export function dropPop(d: Drop, age: number): number {
  if (age >= 0.35 || isSprout(d)) return 0;
  return Math.sin((age / 0.35) * Math.PI) * 1.1;
}

/**
 * A drop's loot label (decided item 22): an item's name in its rarity's text
 * colour, with ▲ when it is an upgrade as it comes, or a rune's name and tier
 * ("Split III") in its family's, an essence's name in legendary orange, or a
 * pattern's base ("Pattern: Maul") in blueprint chalk.
 * Rare and up, runes, essences, patterns and upgrades always show; anything else only
 * while every label does. Null for drops that aren't loot, and for every other
 * material (bars, flux, shards, Mana Dust and Links fly in unlabelled).
 */
export function dropPlaque(
  d: Drop,
  isUpgrade: boolean,
): { text: string; color: number; always: boolean } | null {
  if (d.item) {
    const r = d.item.rarity;
    return {
      text: isUpgrade ? `${d.item.name} ▲` : d.item.name,
      color: cssToHex(RARITY_TEXT[r]),
      always: isUpgrade || r === 'rare' || r === 'epic' || r === 'legendary',
    };
  }
  if (d.material?.kind === 'essence')
    return {
      text: materialLabel(getDelveRegistry(), d.material),
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    };
  if (d.pattern)
    return {
      text: `Pattern: ${getDelveRegistry().getGearBase(d.pattern).name}`,
      color: cssToHex(PATTERN_COLOR),
      always: true,
    };
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
  return { text: `${def.name} ${TIER_NUMERAL[d.rune.tier]}`, color: runeHex(d.rune), always: true };
}

/** Space between stacked loot labels, px. */
const PLAQUE_GAP = 2;

/**
 * Loot labels that overlap stack upward: one greedy pass from the lowest on
 * screen up, each moved above any label already placed that it overlaps.
 * Boxes are centred on `x` with their bottom at `y` (px); returns each bottom.
 */
export function stackPlaques(boxes: { x: number; y: number; w: number; h: number }[]): number[] {
  const bottoms = boxes.map((b) => b.y);
  /** The labels placed so far, lowest first (a placed label never moves again). */
  const placed: number[] = [];
  for (const i of boxes.map((_, i) => i).sort((a, b) => boxes[b].y - boxes[a].y)) {
    const b = boxes[i];
    // Lowest first: moving above one can only meet those placed higher, and a label it passed
    // while below it stays clear (it sits below every one after it too).
    for (const j of placed) {
      const p = boxes[j];
      const apart =
        Math.abs(b.x - p.x) >= (b.w + p.w) / 2 ||
        bottoms[i] <= bottoms[j] - p.h ||
        bottoms[i] - b.h >= bottoms[j];
      if (!apart) bottoms[i] = bottoms[j] - p.h - PLAQUE_GAP;
    }
    const at = placed.findIndex((j) => bottoms[j] < bottoms[i]);
    placed.splice(at < 0 ? placed.length : at, 0, i);
  }
  return bottoms;
}

/**
 * A drop's look, `age` seconds after it fell. A Seedling's orb (nature) is a
 * sprout that grows in; a mote wears its mana's colour (a Siphon's is violet).
 * `moved` is how far it went since the last frame (a material trails it).
 */
export function drawDrop(
  g: Graphics,
  d: Drop,
  time: number,
  age: number,
  moved?: { dx: number; dy: number },
): void {
  g.clear();
  if (d.kind === 'item' && d.item) {
    const color = RARITY_HEX[d.item.rarity];
    const r = d.item.rarity;
    if (r === 'rare' || r === 'epic' || r === 'legendary') {
      const h = r === 'legendary' ? 7 : r === 'epic' ? 5.5 : 4;
      const flicker = 0.75 + Math.sin(time * 3 + d.id) * 0.25;
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
  } else if (isSprout(d)) {
    // A sprout: its stem and two leaves grow in over half a second.
    const k = Math.min(1, age / 0.5);
    g.ellipse(0, 0.12, 0.26, 0.1).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(-0.03, 0.1 - 0.4 * k, 0.06, 0.4 * k).fill({ color: 0x3f9a3a });
    g.ellipse(-0.12 * k, 0.1 - 0.36 * k, 0.12 * k, 0.06 * k).fill({ color: MANA_HEX.nature });
    g.ellipse(0.12 * k, 0.1 - 0.3 * k, 0.12 * k, 0.06 * k).fill({ color: MANA_HEX.nature });
  } else if (d.kind === 'rune' && d.rune) {
    // A rune stone in its family's colour, glowing, with a notch per tier (its name floats above).
    const color = runeHex(d.rune);
    const stone = [-0.2, -0.36, 0.2, -0.36, 0.26, -0.1, 0.2, 0.14, -0.2, 0.14, -0.26, -0.1];
    g.ellipse(0, 0.14, 0.3, 0.11).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, -0.1, 0.46).fill({ color, alpha: 0.16 + Math.sin(time * 4 + d.id) * 0.06 });
    g.poly(stone).fill({ color: 0x1c1917 });
    g.poly(stone).stroke({ width: 0.05, color });
    for (let i = 0; i < d.rune.tier; i++)
      g.rect(-0.15 + i * 0.07, -0.16, 0.04, 0.1).fill({ color });
  } else if (d.kind === 'material' && d.material) {
    drawMaterial(g, d.material, time + d.id, moved);
  } else if (d.kind === 'pattern') {
    // A rolled blueprint on whole sprite pixels: dark blue paper, chalk lines, curled ends.
    const chalk = cssToHex(PATTERN_COLOR);
    const px = (x: number, y: number, w: number, h: number, color: number, alpha = 1) =>
      g.rect(x * 0.1, y * 0.1, w * 0.1, h * 0.1).fill({ color, alpha });
    g.ellipse(0, 0.1, 0.3, 0.1).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, -0.2, 0.42).fill({ color: chalk, alpha: 0.1 + Math.sin(time * 4 + d.id) * 0.05 });
    px(-3, -4, 6, 4, 0x124e89);
    px(-2, -3, 4, 1, chalk);
    px(-2, -1, 3, 1, chalk);
    px(-4, -4, 1, 4, chalk);
    px(3, -4, 1, 4, chalk);
  } else if (d.kind === 'orb') {
    g.circle(0, 0, 0.32).fill({ color: 0xef4444, alpha: 0.25 });
    g.circle(0, 0, 0.2).fill({ color: 0xdc2626 });
    g.circle(-0.06, -0.06, 0.07).fill({ color: 0xffffff, alpha: 0.8 });
  } else {
    g.circle(0, 0, 0.16).fill({ color: 0xfcd34d });
  }
}

/**
 * A material on the floor: a small pickup in its colour, whole sprite pixels (0.1 units) — a
 * bar, a flux vial, a shard, an essence glowing under its pillar, Mana Dust's motes or a Link —
 * trailing three fading pixels while the magnet pulls it in.
 */
function drawMaterial(
  g: Graphics,
  ref: MaterialRef,
  phase: number,
  moved?: { dx: number; dy: number },
): void {
  const color = cssToHex(materialColor(getDelveRegistry(), ref));
  const px = (x: number, y: number, w = 1, h = 1, c = color, alpha = 1) =>
    g.rect(x * 0.1, y * 0.1, w * 0.1, h * 0.1).fill({ color: c, alpha });
  g.ellipse(0, 0.1, 0.22, 0.08).fill({ color: 0x000000, alpha: 0.35 });
  switch (ref.kind) {
    case 'metal':
      px(-2, -2, 4, 2);
      px(-2, -2, 4, 1, 0xffffff, 0.35);
      break;
    case 'flux':
      px(-1, -4, 2, 1, 0xc0cbdc);
      px(-1, -3, 2, 3);
      break;
    case 'shard':
      px(-1, -3, 2, 1);
      px(-2, -2, 4, 1);
      px(-1, -1, 2, 1);
      px(-1, -3, 1, 1, 0xffffff, 0.5);
      break;
    case 'essence': {
      const flicker = 0.75 + Math.sin(phase * 3) * 0.25;
      g.rect(-0.15, -5, 0.3, 5).fill({ color, alpha: 0.12 * flicker });
      px(-1, -4, 2, 4);
      px(-2, -3, 4, 2);
      px(-1, -3, 1, 1, 0xffffff, 0.8);
      break;
    }
    case 'dust':
      px(-2, -1);
      px(1, -2);
      px(-1, -3);
      break;
    case 'links':
      px(-3, -2, 2, 2);
      px(1, -2, 2, 2);
      px(-1, -2, 2, 1);
      break;
  }
  const len = moved ? Math.hypot(moved.dx, moved.dy) : 0;
  if (!moved || len < 0.01) return;
  const [ux, uy] = [moved.dx / len, moved.dy / len];
  for (let i = 1; i <= 3; i++)
    px(-ux * 1.5 * i - 0.5, -uy * 1.5 * i - 1.5, 1, 1, color, 0.6 - 0.15 * i);
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
