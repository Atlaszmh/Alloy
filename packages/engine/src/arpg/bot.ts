import type { DataRegistry } from '../data/registry.js';
import type { ArpgInput, ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import type { FloorMap, Room } from '../types/floor-map.js';
import { makeCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { abilityReady, holdCharge, nextMove } from './abilities/cast.js';
import { nearestMonster } from './abilities/targeting.js';
import { UNREACHED, downhill, flowField } from './flow.js';
import { doorShut, moveCircle, sees } from './grid.js';
import { roomAt } from './fog.js';
import { openedAlcove } from './interact.js';
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
  const input = plainInput(registry, world, policy);
  return world.tutorial ? guided(registry, world, input) : input;
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
  const far = gap > w.range * 0.8 || !sees(world.map, h, target);
  if (w.kind === 'melee') {
    if (far) move = toward(world, target);
  } else if (far) move = toward(world, target);
  else if (gap < 2.5) {
    const away = dirTo(target.x, target.y, h.x, h.y);
    move = away;
  }

  // Detour for loot when the coast is clear.
  const threat = nearestMonster(ctx, h.x, h.y, 4);
  if (!threat) {
    const item = world.drops.find(
      (d) => !d.dead && (d.kind === 'item' || d.kind === 'rune') && dist(h.x, h.y, d.x, d.y) < 6,
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
 * Each world's map as the hero walks it (`heroMap`) and the bot's flow fields
 * on it toward the cells it walks to, kept until a door opens or shuts.
 */
const paths = new WeakMap<
  ArpgWorld,
  { map: FloorMap; doors: string; byCell: Map<number, Uint16Array> }
>();

/**
 * `map` with every one-cell gap walled (a floor cell with a wall on each side
 * across it, as between two pillars): the hero's bounding square (radius 0.5)
 * passes one only dead on its centre line, which a step at its pace rarely
 * lands on.
 */
function heroMap(map: FloorMap): FloorMap {
  const { width: w, height: h } = map;
  const wall = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h || map.cells[y * w + x] === 1;
  const cells = map.cells.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const squeezed = (wall(x - 1, y) && wall(x + 1, y)) || (wall(x, y - 1) && wall(x, y + 1));
      if (cells[y * w + x] === 0 && squeezed) cells[y * w + x] = 1;
    }
  return { ...map, cells };
}

function cellOf(world: ArpgWorld, p: Vec): number {
  const { width: w, height: h } = world.map;
  const cx = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(p.y)));
  return cy * w + cx;
}

/** A flow field over the hero's map toward `p`'s cell, as the doors stand now. */
function fieldTo(world: ArpgWorld, p: Vec): Uint16Array {
  const doors = world.map.doors.map((d) => (doorShut(d) ? 1 : 0)).join('');
  let kept = paths.get(world);
  if (!kept || kept.doors !== doors)
    paths.set(world, (kept = { map: kept?.map ?? heroMap(world.map), doors, byCell: new Map() }));
  const cell = cellOf(world, p);
  let field = kept.byCell.get(cell);
  if (!field) {
    field = flowField(kept.map, p, world.map.width * world.map.height, 1);
    kept.byCell.set(cell, field);
  }
  return field;
}

/** Steps down `field` from the hero (from a neighbour when it stands in a walled gap); UNREACHED if none. */
function stepsFrom(world: ArpgWorld, field: Uint16Array): number {
  const { width: w, height: h } = world.map;
  const c = cellOf(world, world.hero);
  const x = c % w;
  let best = field[c];
  if (x > 0) best = Math.min(best, field[c - 1] + 1);
  if (x < w - 1) best = Math.min(best, field[c + 1] + 1);
  if (c >= w) best = Math.min(best, field[c - w] + 1);
  if (c < w * (h - 1)) best = Math.min(best, field[c + w] + 1);
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

/**
 * The nearest of `points` the hero can walk to, by path where the foes' field
 * toward the hero reaches (`flow.small`, `ai.flowRadius` steps), else in a
 * straight line; null if none.
 */
function nearestReachable(world: ArpgWorld, points: Vec[]): Goal | null {
  const h = world.hero;
  const steps = (p: Vec) => world.flow.small?.[cellOf(world, p)] ?? UNREACHED;
  const sorted = [...points].sort(
    (a, b) => steps(a) - steps(b) || dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y),
  );
  for (const at of sorted) {
    const field = fieldTo(world, at);
    if (stepsFrom(world, field) !== UNREACHED) return { at, field };
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

/**
 * The `thorough` bot's next goal with no foe in sight: what it has seen lying
 * on the floor; a foe of a room it has been in; an unused chest, shrine or
 * alcove (an alcove once opened is done, taken or not); the nearest room it
 * hasn't been in; then the gate.
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
