import type { ArpgWorld } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import { elem, shotColor } from './draw-world';
import type { ManaFx } from './mana-fx';

type Fx = Pick<ManaFx, 'burst' | 'disperse'>;

/**
 * Watches effects come and go: a new shot sparks at the hand (and pops in;
 * see `bornAt`), and whatever ends (shots, lingering zones, a guard)
 * scatters into drifting pixels instead of vanishing.
 */
export class Lifecycles {
  private shots = new Map<
    number,
    { x: number; y: number; r: number; color: number; born: number }
  >();
  private zones = new Map<number, { x: number; y: number; r: number; color: number }>();
  private guard: number | null = null;

  bornAt(id: number): number | undefined {
    return this.shots.get(id)?.born;
  }

  update(w: ArpgWorld, fx: Fx, time: number): void {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      if (p.dead) continue;
      seen.add(p.id);
      const color = shotColor(p);
      const known = this.shots.get(p.id);
      if (!known) fx.burst(p.x, p.y, color, 4, 3);
      this.shots.set(p.id, { x: p.x, y: p.y, r: p.radius, color, born: known?.born ?? time });
    }
    for (const [id, s] of this.shots)
      if (!seen.has(id)) {
        fx.disperse(s.x, s.y, s.r, s.color, 6);
        this.shots.delete(id);
      }

    seen.clear();
    for (const z of w.zones) {
      if (z.owner !== 'hero' || z.detonateAt > 0) continue;
      seen.add(z.id);
      this.zones.set(z.id, { x: z.x, y: z.y, r: z.radius, color: elem(z.element) });
    }
    for (const [id, z] of this.zones)
      if (!seen.has(id)) {
        fx.disperse(z.x, z.y, z.r, z.color, Math.min(60, Math.round(z.r * 14)));
        this.zones.delete(id);
      }

    const h = w.hero;
    const guarding = !!h.defend && w.t < h.defend.until;
    if (this.guard !== null && !guarding) fx.disperse(h.x, h.y - 0.3, 1, this.guard, 30);
    const el = h.abilities[1]?.element;
    this.guard = guarding && el ? MANA_HEX[el] : null;
  }

  clear(): void {
    this.shots.clear();
    this.zones.clear();
    this.guard = null;
  }
}
