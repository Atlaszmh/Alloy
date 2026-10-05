import type { DataRegistry } from '../data/registry.js';
import type { ArpgInput, ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import { CELL, type FloorMap, type Room } from '../types/floor-map.js';
import { makeCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { abilityReady, holdCharge, nextMove } from './abilities/cast.js';
import { nearestMonster } from './abilities/targeting.js';
import { UNREACHED, downhill } from './flow.js';
import {
  bindTerrain,
  doorShut,
  moveCircle,
  perceives,
  sees,
  solid,
  solidCode,
  terrainOf,
} from './grid.js';
import { roomAt } from './fog.js';
import { openedAlcove } from './interact.js';
import { footprint } from './objects-base.js';
import { tutorialStep } from '../delve/tutorial.js';

/**
 * How the bot plays a generated floor (see the floor maps spec's "The autopilot
 * and pacing"): `thorough` clears every room, picks up what it sees, opens the
 * chests, prays at the shrines and opens the alcove, then takes the exit;
 * `beeline` makes for the exit, fighting only foes awake near it and what a
 * sealed room shuts it in with.
 */
export type BotPolicy = 'thorough' | 'beeline';

/** How near (edge) an awake foe must be for a beeline to turn and fight it. */
const BEELINE_FIGHT = 8;

/**
 * A simple arena bot: walks to the nearest foe (keeping range with bolt
 * weapons), steps (or dodges) out of telegraphed slams, dodges blows about to
 * land, drinks at low life, grabs nearby
 * loot, and uses its abilities: the Ultimate on a crowd or a big foe, the
 * Defensive when hurt or crowded, the Primary whenever it's ready. A hold move
 * charges to full before it lets go (the bot never taps one). On a generated
 * floor it walks by flow fields, plays `policy` (`explore`) and presses
 * interact at what it uses; its loop answers `exitRequest` and `alcoveOpen`
 * (`botStep`). On a guided floor it also follows the step (`guided`). Drives
 * the pacing tests.
 */
export function botInput(
  registry: DataRegistry,
  world: ArpgWorld,
  policy: BotPolicy = 'thorough',
): ArpgInput {
  // The terrain's numbers, as the step binds them (the bot may look first).
  if (!world.map.open) bindTerrain(world.map, registry.getDelveBalance().terrain);
  const input = plainInput(registry, world, policy);
  if (!world.map.open) breakInWay(world, input);
  return world.tutorial ? guided(registry, world, input) : input;
}

/**
 * A standing prop the hero walks into (in reach, within 60° of its way) gets a
 * manual blow aimed at it: the bot's paths cross a prop's footprint only where
 * going round costs more (`PROP`), and any hit breaks one.
 */
function breakInWay(world: ArpgWorld, input: ArpgInput): void {
  const h = world.hero;
  const way = input.move;
  if (way.x === 0 && way.y === 0) return;
  const prop = world.props.find(
    (p) =>
      !p.dead &&
      dist(h.x, h.y, p.x, p.y) - p.radius - h.radius <= 0.8 &&
      angleBetween(way, dirTo(h.x, h.y, p.x, p.y)) <= Math.PI / 3,
  );
  if (prop)
    Object.assign(input, { attack: true, attackTap: true, attackAim: { x: prop.x, y: prop.y } });
}

/**
 * The guided start's floor step (see the tutorial spec's "The bot"): it walks
 * to the step's marker, aims a cast the step wants aimed at the nearest foe,
 * drinks at the potion step once hurt, and dodges at a dodge step once no foe
 * is left (while one lives, its slams are the usual dodging). Its beats and
 * "Skip this step" are its loop's (`worldTutorialEvents`).
 */
function guided(registry: DataRegistry, world: ArpgWorld, input: ArpgInput): ArpgInput {
  const step = tutorialStep(registry, world.tutorial);
  if (!step) return input;
  const h = world.hero;
  const floor = registry.getTutorialData().floors.find((f) => f.id === world.tutorialFloor);
  const marker = floor?.markers.find((m) => m.id === step.marker);
  if (marker) input.move = toward(world, marker.at);
  const foe = nearestMonster(makeCtx(registry, world, []), h.x, h.y, 60);
  if (step.trigger.filter?.aimed && input.cast && foe) input.cast.aim = { x: foe.x, y: foe.y };
  if (step.trigger.type === 'potion' && h.hp < h.stats.maxHp && h.potions > 0) input.potion = true;
  const dodging = step.trigger.type === 'dodge' || step.trigger.type === 'perfectDodge';
  if (dodging && world.monsters.every((m) => m.dead)) input.dodge = true;
  return input;
}

/** `botInput` without the guided start's step. */
function plainInput(registry: DataRegistry, world: ArpgWorld, policy: BotPolicy): ArpgInput {
  const ctx = makeCtx(registry, world, []);
  const h = world.hero;
  const input: ArpgInput = { move: { x: 0, y: 0 } };

  if (h.hp < h.stats.maxHp * 0.4 && h.potions > 0) input.potion = true;

  const canDodge = h.dodgeCharges >= 1 && !(h.dodge && world.t < h.dodge.until);

  // Step out of a primed hazard's burst (it reaches a body within `burst` of
  // its edge that it sees), dodging through it if it's about to go off.
  for (const hz of world.hazards) {
    if (hz.state !== 'primed') continue;
    const reach = hz.burst + h.radius + 0.3;
    if (dist(h.x, h.y, hz.x, hz.y) >= reach || !sees(world.map, hz, h)) continue;
    const away = dirTo(hz.x, hz.y, h.x, h.y);
    input.move = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
    if (canDodge && hz.until - world.t <= 0.15) input.dodge = true;
    return input;
  }

  // Step out of any telegraphed slam, dodging if it's about to land.
  for (const z of world.zones) {
    if (z.owner !== 'monster' || z.dead) continue;
    if (dist(h.x, h.y, z.x, z.y) < z.radius + h.radius + 0.6) {
      const away = dirTo(z.x, z.y, h.x, h.y);
      input.move = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
      if (canDodge && z.detonateAt - world.t <= 0.15) input.dodge = true;
      return input;
    }
  }

  // Dodge a blow that is about to land, the way a player saves dodges for the
  // ones that matter: from elites and bosses, or when already hurt.
  if (canDodge) {
    const hurt = h.hp < h.stats.maxHp * 0.5;
    for (const m of world.monsters) {
      if (m.dead || (m.kind === 'normal' && !hurt)) continue;
      const gapM = dist(h.x, h.y, m.x, m.y) - m.radius - h.radius;
      const swing =
        m.ai !== 'charger' &&
        m.ai !== 'ranged' &&
        m.windupUntil > 0 &&
        m.windupUntil - world.t <= 0.15 &&
        gapM <= m.attackRange + 0.5;
      // A charge lands when it closes the gap, not when its wind-up ends.
      const charge =
        m.ai === 'charger' &&
        m.chargeUntil > world.t &&
        !m.chargeHit &&
        gapM / (m.speed * 3.4) <= 0.15;
      if (swing || charge) {
        input.move = dirTo(m.x, m.y, h.x, h.y);
        input.dodge = true;
        return input;
      }
    }
  }

  // A hold charges until full, then lets go.
  if (h.hold) {
    input.holding = h.hold.slot;
    const { charge } = holdCharge(ctx.bal, h.hold.start, world.t, h.hold.full);
    if (charge >= 1) input.cast = { slot: h.hold.slot };
    return input;
  }

  // A prayer holds still until it is said.
  if (world.channel) return input;

  // Spent (no potions left), a thorough bot makes for the exit.
  const plan = h.potions === 0 ? 'beeline' : policy;
  if (!world.map.open) lookIntoLeaves(world);
  const target = foeFor(world, foeInSight(world, nearestMonster(ctx, h.x, h.y, 60)), plan);
  if (!world.map.open) chasing.set(world, target?.id ?? null);
  if (!target) {
    if (!world.map.open) return explore(registry, world, input, plan);
    const drop = world.drops.find((d) => !d.dead);
    if (drop) input.move = dirTo(h.x, h.y, drop.x, drop.y);
    return input;
  }

  const gap = dist(h.x, h.y, target.x, target.y) - target.radius;
  const w = h.stats.weapon;
  let move: Vec = { x: 0, y: 0 };
  // Out of reach, or out of sight round a wall's edge: go to it.
  const far = gap > w.range * 0.8 || !perceives(world.map, h, target);
  if (w.kind === 'melee') {
    if (far) move = toward(world, target);
  } else if (far) move = toward(world, target);
  else if (gap < 2.5) {
    const away = dirTo(target.x, target.y, h.x, h.y);
    move = away;
  }

  // Detour for loot it can walk to when the coast is clear; shut in a sealed
  // room, its foes come first (the loot waits outside the shut door).
  const threat = nearestMonster(ctx, h.x, h.y, 4);
  if (!threat && (world.map.open || !shutIn(world))) {
    const item = world.drops.find(
      (d) =>
        !d.dead &&
        (d.kind === 'item' || d.kind === 'rune') &&
        dist(h.x, h.y, d.x, d.y) < 6 &&
        (world.map.open || stepsFrom(world, fieldTo(world, d)) !== UNREACHED),
    );
    if (item) move = toward(world, item);
  }
  input.move = move;

  const near = world.monsters.filter((m) => !m.dead && Math.hypot(m.x - h.x, m.y - h.y) < 7).length;
  const big = target.kind !== 'normal' && gap < 8;
  const crowded = nearestMonster(ctx, h.x, h.y, 2.5) !== null;
  const wants = [
    (near >= 3 || big) && abilityReady(ctx, 2) ? 2 : -1,
    (h.hp < h.stats.maxHp * 0.7 || crowded) && gap < 6 && abilityReady(ctx, 1) ? 1 : -1,
    // Let a swing land: pressing the Primary now would cancel it.
    gap < (nextMove(h, 0, world.t, ctx.bal.abilities.comboWindow)?.range ?? 0) &&
    !h.swing &&
    abilityReady(ctx, 0)
      ? 0
      : -1,
  ];
  const slot = wants.find((s) => s >= 0);
  if (slot !== undefined) {
    if (nextMove(h, slot, world.t, ctx.bal.abilities.comboWindow)?.kind === 'hold')
      input.holding = slot;
    else input.cast = { slot };
  }
  return input;
}

/**
 * The foe the bot fights: any for `thorough`; for a beeline one awake and near
 * that isn't in its den, or any in a room it's shut in.
 */
function foeFor(
  world: ArpgWorld,
  foe: MonsterEntity | null,
  policy: BotPolicy,
): MonsterEntity | null {
  if (!foe || world.map.open || policy === 'thorough') return foe;
  if (foe.roomId === shutIn(world)?.id) return foe;
  const h = world.hero;
  const near = foe.aggro && dist(h.x, h.y, foe.x, foe.y) - foe.radius <= BEELINE_FIGHT;
  return near && roomAt(world.map, foe.x, foe.y)?.kind !== 'den' ? foe : null;
}

/** Each world's foe the bot last went after (none in the open room). */
const chasing = new WeakMap<ArpgWorld, number | null>();

/** How much nearer than the foe it is after another must be for the bot to turn to it. */
const SWITCH = 3;

/**
 * The foe to go after: the one it last went after while it lives, even out of
 * sight round a wall's edge, unless `seen` is `SWITCH` nearer; else `seen`.
 */
function foeInSight(world: ArpgWorld, seen: MonsterEntity | null): MonsterEntity | null {
  const id = chasing.get(world);
  const last = world.monsters.find((m) => m.id === id && !m.dead);
  if (!last) return seen;
  const h = world.hero;
  const nearer = seen && dist(h.x, h.y, seen.x, seen.y) < dist(h.x, h.y, last.x, last.y) - SWITCH;
  return nearer ? seen : last;
}

/** The room sealed (or sealing) round the hero, if any. */
function shutIn(world: ArpgWorld): Room | undefined {
  const room = roomAt(world.map, world.hero.x, world.hero.y);
  return room && (room.sealed || world.sealing?.roomId === room.id) ? room : undefined;
}

/**
 * Each world's step costs as the hero walks them (`costs`) and the bot's path
 * fields on them toward the cells it walks to, kept until the map's `version`
 * moves, a door opens or shuts or a prop breaks (`key`).
 */
const paths = new WeakMap<
  ArpgWorld,
  { cost: Uint8Array; key: string; byCell: Map<number, Uint16Array> }
>();

/** A step's cost on firm ground; on slow ground it is `FIRM / terrain.slowMult`, rounded. */
const FIRM = 3;
/** A step onto a standing prop's footprint: worth about six cells of detour (`breakInWay` breaks it). */
const PROP = 18;

/**
 * What a step onto each cell costs the hero (0: it can't), as the doors stand
 * now: solid cells and the hazards' footprints none; a standing prop's
 * footprint `PROP`; slow ground its pace's share of `FIRM`; firm ground
 * `FIRM`. A one-cell gap (a walkable cell, not a door's, with something on
 * each side across it, as between two pillars) is shut, or costs `PROP` where
 * a prop is one side: the hero's bounding square (radius 0.5) passes one only
 * dead on its centre line, which a step at its pace rarely lands on. Only the
 * cells' codes make a gap's sides (a door is never one).
 */
function costs(world: ArpgWorld): Uint8Array {
  const { map } = world;
  const { width: w, height: h } = map;
  const props = new Set(world.props.filter((p) => !p.dead).flatMap((p) => footprint(map, p)));
  const hazards = new Set(world.hazards.flatMap((z) => footprint(map, z)));
  const slow = Math.round(FIRM / (terrainOf(map)?.slowMult ?? 1));
  const wall = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h || solidCode(map.cells[y * w + x]) || hazards.has(y * w + x);
  const side = (x: number, y: number) => wall(x, y) || props.has(y * w + x);
  const cost = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid(map, x, y) || hazards.has(i)) continue;
      const door = map.cells[i] === CELL.door;
      if (!door && ((wall(x - 1, y) && wall(x + 1, y)) || (wall(x, y - 1) && wall(x, y + 1))))
        continue;
      const gap = (side(x - 1, y) && side(x + 1, y)) || (side(x, y - 1) && side(x, y + 1));
      cost[i] = props.has(i) || (!door && gap) ? PROP : map.cells[i] === CELL.slow ? slow : FIRM;
    }
  return cost;
}

/** The eight steps (dx, dy), and what a diagonal costs over a straight one (about √2). */
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;
const DIAGONAL = 1.5;

/**
 * Each cell's cheapest way to `target` by `cost` (Dial's buckets over the
 * eight neighbours, a diagonal `DIAGONAL` × the cell's cost and only between
 * two open cells, as `downhill` walks them); UNREACHED where none, the
 * target's cell 0 whatever it costs.
 */
function pathField(map: FloorMap, cost: Uint8Array, target: number): Uint16Array {
  const { width: w, height: h } = map;
  const n = cost.length;
  const field = new Uint16Array(n).fill(UNREACHED);
  const ring = Math.ceil(PROP * DIAGONAL) + 1;
  const buckets: number[][] = Array.from({ length: ring }, () => []);
  const open = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && cost[j * w + i] > 0;
  field[target] = 0;
  buckets[0].push(target);
  for (let d = 0, left = 1; left > 0; d++) {
    const bucket = buckets[d % ring];
    while (bucket.length > 0) {
      const c = bucket.pop()!;
      left--;
      if (field[c] !== d) continue;
      const x = c % w;
      const y = (c - x) / w;
      for (const [dx, dy] of STEPS) {
        if (!open(x + dx, y + dy) || (dx && dy && !(open(x + dx, y) && open(x, y + dy)))) continue;
        const next = c + dy * w + dx;
        const to = Math.min(UNREACHED - 1, d + Math.ceil(cost[next] * (dx && dy ? DIAGONAL : 1)));
        if (to >= field[next]) continue;
        field[next] = to;
        buckets[to % ring].push(next);
        left++;
      }
    }
  }
  return field;
}

function cellOf(world: ArpgWorld, p: Vec): number {
  const { width: w, height: h } = world.map;
  const cx = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(p.y)));
  return cy * w + cx;
}

/** A path field toward `p`'s cell by the hero's step costs, as the cells, doors and objects stand now. */
function fieldTo(world: ArpgWorld, p: Vec): Uint16Array {
  const doors = world.map.doors.map((d) => (doorShut(d) ? 1 : 0)).join('');
  const broken = world.props.filter((o) => o.dead).length;
  const key = `${world.map.version}:${doors}:${broken}`;
  let kept = paths.get(world);
  if (!kept || kept.key !== key)
    paths.set(world, (kept = { cost: costs(world), key, byCell: new Map() }));
  const cell = cellOf(world, p);
  let field = kept.byCell.get(cell);
  if (!field) {
    field = pathField(world.map, kept.cost, cell);
    kept.byCell.set(cell, field);
  }
  return field;
}

/** The cost down `field` from the hero (from a neighbour when it stands on a shut cell); UNREACHED if none. */
function stepsFrom(world: ArpgWorld, field: Uint16Array): number {
  const { width: w, height: h } = world.map;
  const c = cellOf(world, world.hero);
  const x = c % w;
  let best = field[c];
  if (x > 0) best = Math.min(best, field[c - 1] + FIRM);
  if (x < w - 1) best = Math.min(best, field[c + 1] + FIRM);
  if (c >= w) best = Math.min(best, field[c - w] + FIRM);
  if (c < w * (h - 1)) best = Math.min(best, field[c + w] + FIRM);
  return Math.min(best, UNREACHED);
}

/** The way to `p`: straight in the open room; on a generated floor, down a flow field toward its cell. */
function toward(world: ArpgWorld, p: Vec): Vec {
  const h = world.hero;
  if (world.map.open) return dirTo(h.x, h.y, p.x, p.y);
  return walk(world, fieldTo(world, p), p);
}

/**
 * Down `field` toward `p` (straight at it where the field doesn't reach). A
 * hero square-on to a wall's edge across its way (the grid holds its bounding
 * square) first steps sideways onto its cell's centre line.
 */
function walk(world: ArpgWorld, field: Uint16Array, p: Vec): Vec {
  return headway(world, square(world, field, p));
}

/** How long (s) a walk may go without `STUCK_MOVE` of headway before it side-steps, and for how long. */
const STUCK_TIME = 1;
const STUCK_MOVE = 0.3;
const SIDE_STEP = 0.5;

/** Each world's walk: where it last made headway and when, its side-step, and the last tick it walked. */
const walks = new WeakMap<
  ArpgWorld,
  { x: number; y: number; since: number; last: number; until: number; side: number }
>();

/**
 * The no-progress guard on a walk's way `d`: a walk that hasn't got
 * `STUCK_MOVE` from where it was for `STUCK_TIME` (pressed on something its
 * field doesn't see, or flip-flopping) steps square to `d` for `SIDE_STEP`,
 * each time to the other side. A tick without a walk starts it afresh.
 */
function headway(world: ArpgWorld, d: Vec): Vec {
  const h = world.hero;
  let s = walks.get(world);
  if (!s || world.t - s.last > 0.1) {
    s = { x: h.x, y: h.y, since: world.t, last: world.t, until: 0, side: s?.side ?? 1 };
    walks.set(world, s);
  }
  s.last = world.t;
  if (world.t < s.until) return { x: -d.y * s.side, y: d.x * s.side };
  if (dist(h.x, h.y, s.x, s.y) > STUCK_MOVE) Object.assign(s, { x: h.x, y: h.y, since: world.t });
  else if (world.t - s.since > STUCK_TIME) {
    s.side = -s.side;
    s.until = world.t + SIDE_STEP;
    Object.assign(s, { x: h.x, y: h.y, since: s.until });
    return { x: -d.y * s.side, y: d.x * s.side };
  }
  return d;
}

/** Down `field` toward `p`, squared to a cell's centre line at a wall's edge (`walk`). */
function square(world: ArpgWorld, field: Uint16Array, p: Vec): Vec {
  const h = world.hero;
  const d = downhill(world.map, field, h, p) ?? dirTo(h.x, h.y, p.x, p.y);
  const probe = 0.1;
  const to = moveCircle(world.map, h, h.radius, d.x * probe, d.y * probe);
  const held = (along: number, moved: number) =>
    Math.abs(along) > 0.5 && Math.abs(moved) < Math.abs(along) * probe * 0.5;
  const centre = (v: number) => Math.floor(v) + 0.5 - v;
  if (held(d.y, to.y - h.y) && Math.abs(centre(h.x)) > 1e-3)
    return { x: Math.sign(centre(h.x)), y: 0 };
  if (held(d.x, to.x - h.x) && Math.abs(centre(h.y)) > 1e-3)
    return { x: 0, y: Math.sign(centre(h.y)) };
  return d;
}

/** Where the bot walks next on a generated floor, and the field that leads there; `use` presses interact on arrival. */
interface Goal {
  at: Vec;
  field: Uint16Array;
  use?: boolean;
}

/** Each world's last goal from `nearestReachable` (the point it was). */
const lastGoal = new WeakMap<ArpgWorld, Vec>();

/** How many steps nearer another point must be for `nearestReachable` to leave its last one. */
const KEEP = 2;

/**
 * The nearest of `points` the hero can walk to, by path where the foes' field
 * toward the hero reaches (`flow.small`, `ai.flowRadius` steps), else in a
 * straight line; null if none. The last one it gave stays first while it is
 * among them and no other is `KEEP` steps nearer, so two at about the same
 * steps don't flip-flop as the hero crosses a cell.
 */
function nearestReachable(world: ArpgWorld, points: Vec[]): Goal | null {
  const h = world.hero;
  const steps = (p: Vec) => world.flow.small?.[cellOf(world, p)] ?? UNREACHED;
  const sorted = [...points].sort(
    (a, b) => steps(a) - steps(b) || dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y),
  );
  const last = lastGoal.get(world);
  if (last && sorted[0] !== last && sorted.includes(last) && steps(last) <= steps(sorted[0]) + KEEP)
    sorted.unshift(...sorted.splice(sorted.indexOf(last), 1));
  for (const at of sorted) {
    const field = fieldTo(world, at);
    if (stepsFrom(world, field) !== UNREACHED) {
      lastGoal.set(world, at);
      return { at, field };
    }
  }
  return null;
}

/** The nearest by path of `rooms`: their centres, or their interactables when `use`. */
function nearestRoom(world: ArpgWorld, rooms: Room[], use = false): Goal | null {
  let best: (Goal & { steps: number }) | null = null;
  for (const room of rooms) {
    const { x, y, w, h } = room.rect;
    const at = (use && room.interactable) || { x: x + w / 2, y: y + h / 2 };
    const field = fieldTo(world, at);
    const steps = stepsFrom(world, field);
    if (steps < (best?.steps ?? UNREACHED)) best = { at, field, use, steps };
  }
  return best;
}

/**
 * The gate (its room's interactable), or the boss that keeps it shut; while
 * its room is neither found nor hinted (`exitHinted`), the nearest room not
 * yet been in, a den only when no other is left.
 */
function gateGoal(world: ArpgWorld): Goal | null {
  const { rooms } = world.map;
  const room = rooms.find((r) => r.interactable?.kind === 'gate');
  if (!room) return null;
  if (!room.revealed && !world.exitHinted) {
    const unseen = rooms.filter((r) => !r.revealed);
    const calm = unseen.filter((r) => r.kind !== 'den');
    return nearestRoom(world, calm.length > 0 ? calm : unseen);
  }
  const boss = world.monsters.find((m) => !m.dead && m.kind === 'boss');
  return boss ? nearestReachable(world, [boss]) : nearestRoom(world, [room], true);
}

/** Each world's foliage cells (their centres), and those the hero has looked into. */
const leaves = new WeakMap<ArpgWorld, { at: Vec[]; seen: boolean[] }>();

/**
 * Mark the foliage cells the hero now sees into: within `terrain.foliageSight`
 * of it and in its sight (what stands in foliage is perceived only that near).
 */
function lookIntoLeaves(world: ArpgWorld): void {
  const { map, hero: h } = world;
  let l = leaves.get(world);
  if (!l) {
    const at: Vec[] = [];
    map.cells.forEach((c, i) => {
      if (c === CELL.foliage)
        at.push({ x: (i % map.width) + 0.5, y: Math.floor(i / map.width) + 0.5 });
    });
    leaves.set(world, (l = { at, seen: at.map(() => false) }));
  }
  const reach = terrainOf(map)?.foliageSight ?? 0;
  l.at.forEach((c, i) => {
    if (!l.seen[i] && dist(h.x, h.y, c.x, c.y) <= reach && sees(map, h, c)) l.seen[i] = true;
  });
}

/** The foliage cells of the rooms the hero has been in that it hasn't looked into. */
function unseenLeaves(world: ArpgWorld): Vec[] {
  const l = leaves.get(world);
  if (!l) return [];
  return l.at.filter((c, i) => !l.seen[i] && roomAt(world.map, c.x, c.y)?.revealed);
}

/**
 * The `thorough` bot's next goal with no foe in sight: what it has seen lying
 * on the floor; a foe of a room it has been in; the foliage of those rooms it
 * hasn't looked into; an unused chest, shrine or alcove (an alcove once opened
 * is done, taken or not); the nearest room it hasn't been in; then the gate.
 */
function thoroughGoal(world: ArpgWorld): Goal | null {
  const { map, fog } = world;
  const seen = world.drops.filter((d) => !d.dead && fog[cellOf(world, d)] > 0);
  const foes = world.monsters.filter(
    (m) => !m.dead && (m.roomId === null || map.rooms[m.roomId]?.revealed),
  );
  const opened = openedAlcove(world);
  const unused = map.rooms.filter(({ revealed, interactable: it }) => {
    return revealed && it && !it.used && it.kind !== 'gate' && it.id !== opened;
  });
  return (
    nearestReachable(world, seen) ??
    nearestReachable(world, foes) ??
    nearestReachable(world, unseenLeaves(world)) ??
    nearestRoom(world, unused, true) ??
    nearestRoom(
      world,
      map.rooms.filter((r) => !r.revealed),
    ) ??
    gateGoal(world)
  );
}

/**
 * The bot's way on a generated floor with no foe to fight: shut in a sealed
 * room, to its foes; else to its policy's goal (a beeline's is the gate),
 * pressing interact once in reach of an interactable. Stands still with
 * nowhere to go.
 */
function explore(
  registry: DataRegistry,
  world: ArpgWorld,
  input: ArpgInput,
  policy: BotPolicy,
): ArpgInput {
  const h = world.hero;
  const room = shutIn(world);
  const goal = room
    ? nearestReachable(
        world,
        world.monsters.filter((m) => !m.dead && m.roomId === room.id),
      )
    : policy === 'beeline'
      ? gateGoal(world)
      : thoroughGoal(world);
  if (!goal) return input;
  const reach = registry.getDelveBalance().ai.interactRadius * 0.8;
  if (goal.use && dist(h.x, h.y, goal.at.x, goal.at.y) <= reach) {
    input.interact = true;
    return input;
  }
  input.move = walk(world, goal.field, goal.at);
  return input;
}
