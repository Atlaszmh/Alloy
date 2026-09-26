import type { Graphics } from 'pixi.js';
import type { ArpgWorld, ManaType, Projectile, Vec } from '@alloy/engine';
import type { AimMarker } from '../aim-gestures';
import { MANA_HEX, NEUTRAL_HEX } from '../palette';
import type { ManaFx } from './mana-fx';
import { windingUp } from './anticipation';
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
} from './mana-pixels';

/**
 * Effects that follow the game's state every frame, drawn as mana pixels:
 * zones and telegraphs on the ground layer; auras, projectiles, status marks
 * and the aim marker on the air layer.
 */

const HOSTILE = 0xff4d4d;
const HOSTILE_EDGE = 0xff9a9a;

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
    const fade = Math.min(1, (z.until - t) / 0.5, (t - z.born) / 0.2);
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
    const p = progress(w.t, z.born, z.detonateAt);
    const color = elem(z.element);
    const x = z.fromX + (z.x - z.fromX) * p;
    const y = z.fromY + (z.y - z.fromY) * p;
    const height = Math.sin(Math.PI * p) * 0.25 * Math.hypot(z.x - z.fromX, z.y - z.fromY);
    manaRing(ground, z.x, z.y, z.radius, color, time, { alpha: 0.25 + 0.6 * p, gaps: 4, spin: 6 });
    // A filled shadow that grows as the orb comes down; the orb lands on the ring.
    manaOrb(ground, x, y, 0.12 + 0.1 * p, 0x000000, 0x000000, 0.35);
    manaOrb(air, x, y - 0.3 * (1 - p) - height, 0.18, color, 0xffffff, 1);
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

/** The hero's footing: a pixel ring on the ground with a notch showing where it faces. */
export function drawFooting(ground: Graphics, w: ArpgWorld, time: number): void {
  const h = w.hero;
  const color = h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834;
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

/** Defensive auras around the hero, and a channel's filling arc. */
export function drawGuard(air: Graphics, w: ArpgWorld, time: number): void {
  const h = w.hero;
  const cy = h.y - 0.3;
  const guard = h.abilities[1];
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
    const ab = h.abilities[h.windup.slot];
    // The ring shows a channel only; a conjure is the anticipation (drawAnticipation).
    if (ab && ab.channel > 0 && w.t >= h.windup.conjureUntil) {
      const color = MANA_HEX[ab.element];
      const p = progress(w.t, h.windup.conjureUntil, h.windup.until);
      manaRing(air, h.x, cy, 1.2, color, time, { alpha: 0.35, gaps: 8, spin: 5 });
      manaArc(air, h.x, cy, 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, color, 1, 2);
    }
  }
}

/** Mana gathering at the hand while an action winds up: more with heft; heavy ones spiral in around a growing orb. */
export function drawAnticipation(
  air: Graphics,
  fx: ManaFx,
  w: ArpgWorld,
  time: number,
  dt: number,
): void {
  const a = windingUp(w);
  if (!a) return;
  const h = w.hero;
  const hx = h.x + a.dir.x * 0.35;
  const hy = h.y - 0.3 + a.dir.y * 0.35;
  // No new pixels while the display is frozen (they would pile up without moving).
  if (dt > 0) fx.gather(hx, hy, a.color, 1 + Math.round(a.heft * 3));
  if (a.heft >= 0.7) {
    manaMotes(air, hx, hy, 0.2 + 0.9 * (1 - a.progress), a.color, time, 5, 9, 0.9, 4);
    manaOrb(air, hx, hy, 0.05 + 0.2 * a.progress, a.color, 0xffffff, 0.9);
  }
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
      manaOrb(air, p.x, p.y, r(p.radius), color, 0xffffff);
      manaRing(air, p.x, p.y, r(p.radius + PX * 2), HOSTILE, time, { alpha: 0.7, jitter: 1 });
    } else if (p.form === 'bolt') {
      if (p.pierce && p.element === 'earth') {
        manaOrb(air, p.x, p.y, r(p.radius), 0x8b6b43, 0xb58a52);
      } else {
        manaOrb(air, p.x, p.y, r(p.radius), color, second ? MANA_HEX[second] : 0xffffff);
        manaRing(air, p.x, p.y, r(p.radius + PX * 2), color, time, { alpha: 0.6, jitter: 1 });
      }
    } else if (p.form === 'volley' || p.form === 'ember') {
      manaOrb(air, p.x, p.y, r(0.15), color, second ? MANA_HEX[second] : 0xffffff);
    } else {
      manaOrb(air, p.x, p.y, r(0.15), color, 0xffffff);
    }
  }
  for (const id of [...trails.keys()]) if (!alive.has(id)) trails.delete(id);
}

/** Elite and boss rings (ground), and status marks (air): hex, shock, frost, poison, stagger, brand. */
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
    if (t < s.hexUntil)
      manaMotes(
        air,
        m.x,
        m.y - m.radius * 0.3,
        m.radius + 0.28,
        MANA_HEX.shadow,
        time,
        3,
        2,
        0.9,
        4,
      );
    if (t < s.shockUntil) {
      manaRing(air, m.x, m.y, m.radius + 0.2, MANA_HEX.storm, time, {
        alpha: 0.9,
        gaps: 3,
        spin: 20,
        jitter: 2,
      });
    }
    if (t < s.freezeUntil) manaDust(air, m.x, m.y, m.radius, 0xbfefff, time, 0.25, 0.9, m.id);
    if (t < s.poisonUntil && s.poisonStacks > 0) {
      manaDust(
        air,
        m.x,
        m.y - m.radius * 0.2,
        m.radius * 0.9,
        MANA_HEX.nature,
        time,
        0.04 + 0.02 * s.poisonStacks,
        0.85,
        m.id + 3,
      );
    }
    if (t < s.staggerUntil && t >= s.freezeUntil) {
      manaMotes(air, m.x, m.y - m.radius - 0.25, m.radius * 0.7, 0xfde68a, time, 3, 5, 1, 2);
    }
    if (t < s.brandUntil) px(air, m.x - PX, m.y - m.radius - 0.35, MANA_HEX.fire, 1, 2);
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
