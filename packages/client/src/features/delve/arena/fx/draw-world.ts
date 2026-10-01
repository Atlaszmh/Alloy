import type { Graphics } from 'pixi.js';
import {
  MANA_TYPES,
  activeMove,
  chainMove,
  type ArpgWorld,
  type ManaType,
  type Projectile,
  type ResolvedAbility,
  type Vec,
  type Zone,
} from '@alloy/engine';
import { drawInfusion, type InfusionBudget, type InfusionLayers } from './infusion';
import type { AimMarker } from '../aim-gestures';
import { MANA_HEX, NEUTRAL_HEX } from '../palette';
import { handPoint, spawnCount, type ManaFx } from './mana-fx';
import { windingUp } from './anticipation';
import { EMBER, OBSIDIAN } from './reactions';
import {
  PX,
  manaArc,
  manaDust,
  manaEllipse,
  manaLine,
  manaMotes,
  manaOrb,
  manaRing,
  px,
  snap,
} from './mana-pixels';

/**
 * Effects that follow the game's state every frame, drawn as mana pixels:
 * zones and telegraphs on the ground layer; auras, projectiles, status marks
 * and the aim marker on the air layer. `drawInfusions` is the infusion pass's
 * persistent carriers.
 */

const HOSTILE = 0xff4d4d;
const HOSTILE_EDGE = 0xff9a9a;
/** Blinded foes' haze: a pale violet, since the air layer only adds light (a dark smoke vanishes). */
const BLIND_SMOKE = 0x9a8cc4;
/** Pips in a stack row: the cap (Plaguebearer's extra Nature stacks don't widen it). */
const MAX_PIPS = 5;
/** Sunder's crack, in pixels right of the Hellfire brand. */
const CRACK = [
  [1, -1],
  [2, 0],
  [1, 1],
  [2, 2],
];

/** What the player is aiming, in world units (drawn as a circle or a line from the hero). */
export interface AimView {
  marker: AimMarker;
  point: Vec;
  radius: number;
  range: number;
  element: ManaType;
}

export function elem(e: ManaType | null | undefined): number {
  return e ? MANA_HEX[e] : NEUTRAL_HEX;
}

/** A projectile's colour: monster shots are their element or hostile red; the hero's are its element. */
export function shotColor(p: Projectile): number {
  return p.owner === 'monster' ? (p.element ? MANA_HEX[p.element] : HOSTILE) : elem(p.element);
}

function progress(now: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (now - start) / Math.max(0.01, end - start)));
}

/** A lingering zone's fade: in over 0.2 s, out over its last 0.5 s. */
function zoneFade(z: Zone, t: number): number {
  return Math.min(1, (z.until - t) / 0.5, (t - z.born) / 0.2);
}

/** A thrown Burst in flight: how far along (0–1), its point on the ground, and its orb's height above it. */
function lobAt(z: Zone, t: number): { p: number; x: number; y: number; lift: number } {
  const p = progress(t, z.born, z.detonateAt);
  const fx = z.fromX ?? z.x;
  const fy = z.fromY ?? z.y;
  const height = Math.sin(Math.PI * p) * 0.25 * Math.hypot(z.x - fx, z.y - fy);
  return { p, x: fx + (z.x - fx) * p, y: fy + (z.y - fy) * p, lift: 0.3 * (1 - p) + height };
}

/** Lingering zones, Barrage targets and boss slam telegraphs. */
export function drawZones(ground: Graphics, w: ArpgWorld, time: number): void {
  const t = w.t;
  for (const z of w.zones) {
    if (z.owner === 'monster') {
      const p = progress(t, z.born, z.detonateAt);
      manaDust(ground, z.x, z.y, z.radius * p, HOSTILE, time, 0.28, 0.9, z.id);
      manaRing(ground, z.x, z.y, z.radius, HOSTILE_EDGE, time, { alpha: 0.95, thickness: 2 });
      manaRing(ground, z.x, z.y, Math.max(PX, z.radius * p), HOSTILE, time, { alpha: 0.8 });
      continue;
    }
    const color = elem(z.element);
    if (z.detonateAt > 0) {
      // A thrown Burst draws as a lob (drawLobs).
      if (z.source === 'burst') continue;
      // Barrage: a target fills in until the impact lands.
      const p = progress(t, z.born, z.detonateAt);
      manaRing(ground, z.x, z.y, z.radius, color, time, { alpha: 0.4 + p * 0.5, gaps: 4, spin: 6 });
      manaDust(ground, z.x, z.y, z.radius * p, color, time, 0.22, 0.5 + p * 0.4, z.id);
      continue;
    }
    const fade = zoneFade(z, t);
    if (z.source === 'maelstrom') {
      manaDust(ground, z.x, z.y, z.radius, color, time, 0.05, 0.8 * fade, z.id);
      for (let i = 0; i < 3; i++) {
        manaMotes(
          ground,
          z.x,
          z.y,
          z.radius * (0.3 + 0.24 * i),
          color,
          time + i,
          4 + i * 3,
          2.6 - i * 0.6,
          0.95 * fade,
          6,
        );
      }
      manaRing(ground, z.x, z.y, z.radius, color, time, {
        alpha: 0.85 * fade,
        gaps: 6,
        spin: 3,
        jitter: 1,
      });
    } else {
      // Lingering ground from a fusion: fire burns hot, anything else glitters.
      const hot = z.element === 'fire';
      manaDust(
        ground,
        z.x,
        z.y,
        z.radius,
        hot ? 0xff7a3c : color,
        time,
        hot ? 0.18 : 0.1,
        0.9 * fade,
        z.id,
      );
      if (hot)
        manaDust(
          ground,
          z.x,
          z.y,
          z.radius * 0.6,
          0xffd08a,
          time * 1.7,
          0.08,
          0.8 * fade,
          z.id + 1,
        );
      manaRing(ground, z.x, z.y, z.radius, hot ? 0xff7a3c : color, time, {
        alpha: 0.6 * fade,
        jitter: 1,
      });
    }
  }
}

/** A thrown Burst: an orb arcing to its landing ring, over a shadow that tracks it along the ground. */
export function drawLobs(ground: Graphics, air: Graphics, w: ArpgWorld, time: number): void {
  for (const z of w.zones) {
    if (
      z.owner !== 'hero' ||
      z.source !== 'burst' ||
      z.fromX === undefined ||
      z.fromY === undefined
    )
      continue;
    const { p, x, y, lift } = lobAt(z, w.t);
    const color = elem(z.element);
    manaRing(ground, z.x, z.y, z.radius, color, time, { alpha: 0.25 + 0.6 * p, gaps: 4, spin: 6 });
    // A filled shadow that grows as the orb comes down; the orb lands on the ring.
    manaOrb(ground, x, y, 0.12 + 0.1 * p, 0x000000, 0x000000, 0.35);
    manaOrb(air, x, y - lift, 0.18, color, 0xffffff, 1);
  }
}

/** Monster wind-ups: a reach ring that fills, a charger's lane, a shooter's sightline. */
export function drawTelegraphs(ground: Graphics, w: ArpgWorld, time: number): void {
  const h = w.hero;
  for (const m of w.monsters) {
    if (m.windupUntil <= 0) continue;
    const p = progress(w.t, m.windupStart, m.windupUntil);
    if (m.ai === 'charger') {
      const d = m.chargeDir;
      const len = 7;
      const nx = -d.y * m.radius;
      const ny = d.x * m.radius;
      for (const s of [1, -1]) {
        manaLine(
          ground,
          m.x + nx * s,
          m.y + ny * s,
          m.x + d.x * len + nx * s,
          m.y + d.y * len + ny * s,
          HOSTILE_EDGE,
          0.35 + p * 0.6,
        );
      }
      manaLine(ground, m.x, m.y, m.x + d.x * len * p, m.y + d.y * len * p, HOSTILE, 0.9, {
        every: 3,
        thickness: 2,
      });
    } else if (m.ai === 'ranged') {
      manaLine(ground, m.x, m.y, h.x, h.y, HOSTILE, 0.3 + p * 0.6, { every: 2 });
    } else {
      const reach = m.attackRange + m.radius + 0.4;
      manaDust(ground, m.x, m.y, reach * p, HOSTILE, time, 0.16, 0.8, m.id);
      manaRing(ground, m.x, m.y, reach, HOSTILE_EDGE, time, {
        alpha: 0.35 + p * 0.6,
        thickness: p > 0.7 ? 2 : 1,
      });
    }
  }
}

/**
 * The Defensive move whose effect is up (`h.defend`, at its stage), even while
 * the chain's next move winds up, else null.
 */
export function guardMove(h: ArpgWorld['hero']): ResolvedAbility | null {
  return h.defend ? chainMove(h.chains[1]!, h.defend.move, h.defend.stage) : null;
}

/** The hero's footing: a pixel ring on the ground with a notch showing where it faces. */
export function drawFooting(ground: Graphics, w: ArpgWorld, time: number): void {
  const h = w.hero;
  const color = MANA_HEX[h.stats.weapon.blows[0].element];
  const pulse = 0.55 + Math.sin(time * 4) * 0.15;
  manaEllipse(ground, h.x, h.y + 0.42, 0.78, 0.34, color, time, pulse);
  for (let k = 0; k < 3; k++) {
    px(
      ground,
      h.x + h.facing.x * (0.95 - k * PX),
      h.y + 0.42 + h.facing.y * (0.43 - k * PX * 0.45),
      color,
      0.95,
    );
  }
}

/**
 * Defensive auras around the hero, the reactions' states on it (Obsidian's
 * shell, Lightning Rod's trail), and a channel's filling arc.
 */
export function drawGuard(air: Graphics, w: ArpgWorld, time: number): void {
  const h = w.hero;
  const cy = h.y - 0.3;
  if (h.barrier) {
    // Obsidian: a glassy shell over cooling embers that thins as it soaks (pale,
    // so it reads over the burning floor its own fire leaves).
    const k = Math.min(1, Math.max(0, h.barrier.hp / Math.max(1e-6, h.barrier.max)));
    manaRing(air, h.x, cy, 1.15, OBSIDIAN, time, {
      alpha: 0.35 + 0.55 * k,
      thickness: k > 0.5 ? 2 : 1,
      gaps: Math.round(8 * (1 - k)),
      spin: 1,
      jitter: 1,
    });
    manaDust(air, h.x, cy, 1.1, EMBER, time, 0.01 + 0.05 * k, 0.8, 13);
  }
  if (w.t < h.quickUntil && h.moving) {
    // Lightning Rod: a storm trail behind the quickened hero.
    const len = Math.hypot(h.facing.x, h.facing.y) || 1;
    const bx = -h.facing.x / len;
    const by = -h.facing.y / len;
    const y = h.y + 0.2;
    manaLine(air, h.x + bx * 0.3, y + by * 0.3, h.x + bx * 1.8, y + by * 1.8, MANA_HEX.storm, 1, {
      jitter: 1,
      time,
    });
  }
  const guard = guardMove(h);
  if (h.defend && w.t < h.defend.until && guard) {
    const color = MANA_HEX[guard.element];
    if (h.defend.form === 'ward' && h.ward) {
      // A shell of mana that thins and breaks up as it soaks damage.
      const hp = h.ward.hp / Math.max(1, h.ward.max);
      manaRing(air, h.x, cy, 1.05, color, time, {
        alpha: 0.45 + 0.55 * hp,
        thickness: hp > 0.5 ? 2 : 1,
        gaps: hp < 0.5 ? 5 : 0,
        spin: 2,
        jitter: 1,
      });
      manaDust(air, h.x, cy, 1.0, color, time, 0.02 + 0.05 * hp, 0.7, 7);
      manaMotes(air, h.x, cy, 1.05, 0xffffff, time, 3, 1.4, 0.8, 4);
    } else if (h.defend.form === 'armor') {
      // Rotating plates of mana.
      for (let i = 0; i < 6; i++) {
        const a0 = (i * Math.PI) / 3 + time * 0.8;
        manaArc(air, h.x, cy, 0.95, a0, a0 + 0.62, color, 0.9, 2);
      }
    } else if (h.defend.form === 'surge') {
      manaMotes(air, h.x, cy, 0.8, color, time, 4, 7, 1, 6);
      manaMotes(air, h.x, cy, 0.55, 0xffffff, time, 2, -9, 0.7, 4);
    } else if (h.defend.form === 'blink') {
      manaMotes(air, h.x, cy, 0.7, color, time, 3, -4, 0.7, 5);
    }
  }
  if (h.windup) {
    const ab = activeMove(h, h.windup.slot);
    // The ring shows a channel only; a conjure is the anticipation (drawAnticipation).
    if (ab && ab.channel > 0 && w.t >= h.windup.conjureUntil) {
      const color = MANA_HEX[ab.element];
      const p = progress(w.t, h.windup.conjureUntil, h.windup.until);
      manaRing(air, h.x, cy, 1.2, color, time, { alpha: 0.35, gaps: 8, spin: 5 });
      manaArc(air, h.x, cy, 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, color, 1, 2);
    }
  }
}

/**
 * Mana gathering at the hand while an action winds up: more with heft; heavy
 * ones spiral in around a growing orb. A hold gathers toward `aim` (the aim
 * marker's point) while one shows.
 */
export function drawAnticipation(
  air: Graphics,
  fx: ManaFx,
  w: ArpgWorld,
  time: number,
  dt: number,
  aim: Vec | null = null,
): void {
  const a = windingUp(w, aim);
  if (!a) return;
  // Out past the sprite's edge, so the orb doesn't sit on the hero's face.
  const { x: hx, y: hy } = handPoint(w.hero.x, w.hero.y, a.dir);
  // None while the display is frozen (they would pile up without moving).
  fx.gather(hx, hy, a.color, spawnCount(1 + a.heft * 3, dt));
  if (a.heft >= 0.7) {
    manaMotes(air, hx, hy, 0.2 + 0.9 * (1 - a.progress), a.color, time, 5, 9, 0.9, 4);
    manaOrb(air, hx, hy, 0.05 + 0.2 * a.progress, a.color, 0xffffff, 0.9);
  }
}

/**
 * The size a shot draws at: bolts and monster shots at their radius, other
 * ability shots (darts, embers) at 0.15, a basic shot at half its radius (the
 * staff's great orb, the wand's flare). Shared with the infusion pass.
 */
function shotSize(p: Projectile): number {
  if (p.owner === 'monster' || p.form === 'bolt') return p.radius;
  return p.ability ? 0.15 : p.radius * 0.5;
}

/**
 * Projectiles as pixel orbs with pixel trails. `trails` keeps each one's
 * recent path; `bornAt` says when each appeared, so it pops in over 0.05 s.
 */
export function drawProjectiles(
  air: Graphics,
  w: ArpgWorld,
  time: number,
  trails: Map<number, Vec[]>,
  bornAt: (id: number) => number | undefined,
): void {
  const alive = new Set<number>();
  for (const p of w.projectiles) {
    const born = bornAt(p.id);
    const k = born === undefined ? 1 : Math.min(1, (time - born) / 0.05);
    const r = (v: number) => Math.max(PX, v * k);
    const size = shotSize(p);
    alive.add(p.id);
    let trail = trails.get(p.id);
    if (!trail) {
      trail = [];
      trails.set(p.id, trail);
    }
    trail.push({ x: p.x, y: p.y });
    if (trail.length > 7) trail.shift();
    const color = shotColor(p);
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      manaLine(air, trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y, color, 0.6 * a, {
        thickness: p.form === 'bolt' && a > 0.5 ? 2 : 1,
      });
    }
    const second = p.ability?.elements[1];
    if (p.owner === 'monster') {
      manaOrb(air, p.x, p.y, r(size), color, 0xffffff);
      manaRing(air, p.x, p.y, r(size + PX * 2), HOSTILE, time, { alpha: 0.7, jitter: 1 });
    } else if (p.form === 'bolt') {
      if (p.pierce && p.element === 'earth') {
        manaOrb(air, p.x, p.y, r(size), 0x8b6b43, 0xb58a52);
      } else {
        manaOrb(air, p.x, p.y, r(size), color, second ? MANA_HEX[second] : 0xffffff);
        manaRing(air, p.x, p.y, r(size + PX * 2), color, time, { alpha: 0.6, jitter: 1 });
      }
    } else if (p.form === 'volley' || p.form === 'ember') {
      manaOrb(air, p.x, p.y, r(size), color, second ? MANA_HEX[second] : 0xffffff);
    } else {
      manaOrb(air, p.x, p.y, r(size), color, 0xffffff);
    }
  }
  for (const id of [...trails.keys()]) if (!alive.has(id)) trails.delete(id);
}

/**
 * Elite and boss rings and stack pips (ground), and status marks (air): frost,
 * stagger, brand, and the reactions' Sunder and blind.
 */
export function drawMonsterMarks(
  ground: Graphics,
  air: Graphics,
  w: ArpgWorld,
  time: number,
): void {
  const t = w.t;
  for (const m of w.monsters) {
    const s = m.status;
    if (m.kind === 'elite')
      manaRing(ground, m.x, m.y, m.radius + 0.12, 0xfacc15, time, { alpha: 0.9 });
    if (m.kind === 'boss')
      manaRing(ground, m.x, m.y, m.radius + 0.15, 0xef4444, time, { alpha: 0.95, thickness: 2 });
    if (t < s.rootUntil)
      manaRing(ground, m.x, m.y, m.radius + 0.05, MANA_HEX.nature, time, { gaps: 5, spin: 1 });
    // Stacks: under the foe, a row per stacked element (in element order), one pip a stack, on a
    // dark plate so they read on any floor.
    let top = m.y + m.radius + 0.1;
    for (const e of MANA_TYPES) {
      const n = Math.min(MAX_PIPS, s.stacks[e]);
      if (n <= 0) continue;
      const left = m.x - (n + 0.5) * PX;
      ground.rect(snap(left), snap(top), (2 * n + 1) * PX, 3 * PX).fill({ color: 0, alpha: 0.6 });
      for (let i = 0; i < n; i++) px(ground, left + (2 * i + 1) * PX, top + PX, MANA_HEX[e], 1);
      top += 3 * PX;
    }
    if (t < s.freezeUntil) manaDust(air, m.x, m.y, m.radius, 0xbfefff, time, 0.25, 0.9, m.id);
    if (t < s.staggerUntil && t >= s.freezeUntil) {
      manaMotes(air, m.x, m.y - m.radius - 0.25, m.radius * 0.7, 0xfde68a, time, 3, 5, 1, 2);
    }
    if (t < s.brandUntil) px(air, m.x - PX, m.y - m.radius - 0.35, MANA_HEX.fire, 1, 2);
    if (t < s.sunderUntil)
      for (const [dx, dy] of CRACK)
        px(air, m.x + dx * PX, m.y - m.radius - 0.35 + dy * PX, MANA_HEX.earth, 1);
    if (t < s.blindUntil) {
      // Blind (Blackout, Steam): a haze over the eyes.
      const r = m.radius * 0.6;
      manaDust(air, m.x, m.y - m.radius - 0.3, r, BLIND_SMOKE, time, 0.6, 0.9, m.id + 5);
    }
  }
}

/** Where a held ability will go: a pixel target (placed forms) or a dotted line (directional ones). */
export function drawAim(air: Graphics, w: ArpgWorld, aim: AimView | null, time: number): void {
  if (!aim || aim.marker === 'none') return;
  const h = w.hero;
  const color = MANA_HEX[aim.element];
  const dx = aim.point.x - h.x;
  const dy = aim.point.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = aim.range > 0 ? Math.min(d, aim.range) : d;
  const x = h.x + (dx / d) * reach;
  const y = h.y + (dy / d) * reach;
  if (aim.marker === 'circle') {
    if (aim.range > 0)
      manaRing(air, h.x, h.y, aim.range, color, time, { alpha: 0.25, gaps: 14, spin: 1 });
    const r = Math.max(0.4, aim.radius);
    manaRing(air, x, y, r, color, time, { alpha: 0.95, thickness: 2, jitter: 1 });
    manaDust(air, x, y, r, color, time, 0.08, 0.6, 11);
  } else {
    manaLine(air, h.x, h.y, x, y, color, 0.7, { every: 2 });
    manaOrb(air, x, y, 0.15, color, 0xffffff);
  }
}

/**
 * The infusion pass's persistent carriers, drawn after ManaFx's transient
 * ones and in priority order: the hero's Defensive aura (a ring, seeded by its
 * slot), projectiles (orbs), thrown Bursts in flight (orbs), then lingering
 * zones (their rims, the only ground carriers here).
 */
export function drawInfusions(
  layers: Required<InfusionLayers>,
  w: ArpgWorld,
  time: number,
  budget: InfusionBudget,
): void {
  const air = { air: layers.air };
  const h = w.hero;
  const aura = guardMove(h)?.elements[1];
  if (aura && h.defend && w.t < h.defend.until && (h.defend.form !== 'ward' || h.ward)) {
    const fade = Math.min(1, (h.defend.until - w.t) / 0.3);
    drawInfusion(air, aura, { kind: 'ring', x: h.x, y: h.y - 0.3, r: 1 }, time, 1, fade, budget);
  }
  for (const p of w.projectiles) {
    // An ability shot's second element (a basic shot has one element; embers none).
    const el = p.owner === 'hero' && p.form !== 'ember' ? p.ability?.elements[1] : undefined;
    if (!el) continue;
    const orb = { kind: 'orb' as const, x: p.x, y: p.y, r: shotSize(p), vx: p.vx, vy: p.vy };
    drawInfusion(air, el, orb, time, p.id, 1, budget);
  }
  for (const z of w.zones) {
    const el = z.owner === 'hero' ? z.ability?.elements[1] : undefined;
    if (!el || z.source !== 'burst' || z.fromX === undefined || z.fromY === undefined) continue;
    const l = lobAt(z, w.t);
    const orb = {
      kind: 'orb' as const,
      x: l.x,
      y: l.y - l.lift,
      r: 0.18,
      vx: z.x - z.fromX,
      vy: z.y - z.fromY,
    };
    drawInfusion(air, el, orb, time, z.id, 1, budget);
  }
  for (const z of w.zones) {
    const el = z.owner === 'hero' ? z.ability?.elements[1] : undefined;
    if (!el || z.detonateAt > 0) continue;
    const rim = { kind: 'ring' as const, x: z.x, y: z.y, r: z.radius };
    drawInfusion(layers, el, rim, time, z.id, zoneFade(z, w.t), budget);
  }
}
