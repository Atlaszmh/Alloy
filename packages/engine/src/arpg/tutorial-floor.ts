import type { DataRegistry } from '../data/registry.js';
import { onRoomWall } from '../data/tutorial-floor-schema.js';
import { generateItem } from '../loot/item-generator.js';
import { DEFAULT_FORMS, defaultMoveset } from '../loot/moveset.js';
import { runeFits, socketCap, socketsOf } from '../loot/runes.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { Blow, ChainSkill, Move } from '../types/ability.js';
import type { ArpgWorld, Drop, MonsterEntity, Vec } from '../types/arpg.js';
import type { Door, FloorMap, Interactable, Room } from '../types/floor-map.js';
import type { GearItem } from '../types/gear.js';
import type { RuneTier } from '../types/rune.js';
import {
  TUTORIAL_INTERACTABLES,
  type TutorialDrop,
  type TutorialFloorDef,
  type TutorialSetDrop,
} from '../types/tutorial-floor.js';
import type { SimCtx } from './combat.js';
import { flowField } from './flow.js';
import { clipSight, snapToWalkable } from './grid.js';

/**
 * The guided start's hand-built floors (see the tutorial spec): building them,
 * their scripted foes and their set drops.
 */

/** A room that seals (a den, the boss room): a door between it and another is its own. */
const seals = (r: Room) => r.kind === 'den' || r.kind === 'boss';

/**
 * A hand-built floor's map: its rows' walls, floor and doors (`0`–`9`, each
 * door its cells of one digit, its id the digit); its rooms, each holding the
 * interactable its cells place (`C`, `H`, `A`, `X`; its id `${depth}:${room}`,
 * a shrine's blessing the first of `shrines.json`) and its home field; each
 * door's rooms, those on whose wall it lies (one that seals first, then by
 * id; one alone twice); the start (`S`) and the exit gate (`X`) at their
 * cells' centres. `tutorialFloorProblems` has checked its geometry.
 */
export function tutorialFloorMap(
  registry: DataRegistry,
  def: TutorialFloorDef,
  depth: number,
): FloorMap {
  const width = def.rows[0].length;
  const height = def.rows.length;
  const cells = new Uint8Array(width * height);
  const doors: Door[] = [];
  const rooms: Room[] = def.rooms.map((r) => ({
    id: r.id,
    kind: r.kind,
    rect: { ...r.rect },
    revealed: false,
    cleared: false,
    sealed: false,
  }));
  const map: FloorMap = {
    width,
    height,
    cells,
    rooms,
    doors,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    open: false,
  };
  const shrine = registry.getDelveData().shrines[0].id;
  def.rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const at = { x: x + 0.5, y: y + 0.5 };
      if (c === '#') cells[y * width + x] = 1;
      else if (c >= '0' && c <= '9') {
        cells[y * width + x] = 2;
        (doors[+c] ??= { id: +c, cells: [], rooms: [0, 0], closed: false }).cells.push({ x, y });
      } else if (c === 'S') map.start = at;
      const kind = TUTORIAL_INTERACTABLES[c];
      const room = rooms.find(
        ({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
      );
      if (!kind || !room) return;
      const it: Interactable = { id: `${depth}:${room.id}`, kind, ...at, used: false };
      if (kind === 'shrine') it.shrine = shrine;
      if (kind === 'gate') map.exit = at;
      room.interactable = it;
    }),
  );
  for (const d of doors) {
    const on = rooms
      .filter((r) => d.cells.some((c) => onRoomWall(r.rect, c)))
      .sort((a, b) => Number(seals(b)) - Number(seals(a)) || a.id - b.id);
    d.rooms = [on[0].id, (on[1] ?? on[0]).id];
  }
  for (const r of rooms) {
    const centre = snapToWalkable(map, r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2);
    r.homeField = flowField(map, centre, Infinity, 1);
  }
  return map;
}

/**
 * Each hand-built floor's own seed, which its set drops fork (`tutorial:<dropId>`), so a
 * retried depth drops the same whatever the fight did to the world's streams.
 */
// ponytail: a side table, since ArpgWorld keeps no seed; a field if a second reader needs it.
const STREAMS = new WeakMap<ArpgWorld, SeededRNG>();

/** `createFloorWorld`'s: a hand-built floor's seed (its never-advanced RNG), for its set drops. */
export function seedSetDrops(world: ArpgWorld, rng: SeededRNG): void {
  STREAMS.set(world, rng);
}

/** The world's hand-built floor, or undefined. */
function floorOf(ctx: SimCtx): TutorialFloorDef | undefined {
  const id = ctx.world.tutorialFloor;
  return id === null ? undefined : ctx.registry.getTutorialData().floors.find((f) => f.id === id);
}

/** The skills whose moves a set drop's sockets open on, in order. */
const SOCKET_ORDER: readonly ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];

/**
 * A set drop's gear: in the pair's element (`world.loot.pair`: its secondary, or the
 * primary while none is bound), its item level the depth, rolled on `rng`; a weapon
 * carries its rarity's skills at their base slots but the Primary's `slots.primary`,
 * every move its default, and `sockets` open, one a move, the Primary's first.
 */
function setGear(
  registry: DataRegistry,
  world: ArpgWorld,
  g: Extract<TutorialDrop, { kind: 'gear' }>,
  rng: SeededRNG,
): GearItem {
  const [primary, secondary] = world.loot.pair;
  const mana = (g.element === 'secondary' && secondary) || primary || world.element;
  const uid = `g${world.loot.nextUid++}`;
  const opts = { uid, ilvl: world.depth, rarity: g.rarity, baseId: g.base, mana };
  const item = generateItem(registry, opts, rng);
  if (item.slot !== 'weapon') return item;
  const moveset = defaultMoveset(registry, item, mana, { primary: g.slots?.primary });
  const moves = SOCKET_ORDER.flatMap((s): (Move | Blow)[] => {
    const chain = moveset.chains[s];
    return !chain ? [] : Array.isArray(chain) ? chain : chain.moves;
  });
  let open = g.sockets ?? 0;
  for (let round = 0; round < socketCap(registry, item.rarity); round++)
    for (const m of moves)
      if (open > 0) {
        m.runes = [...socketsOf(m), null];
        open--;
      }
  return { ...item, moveset };
}

/**
 * Set drop `d` thrown from `from` (on its stream: where it lands, then what it is): it
 * lands short of any wall, in `roomId` (the foe's room; none for the chest's). A rune
 * is one that fits the hero's Primary's first move now (its default form's without one),
 * picked at random; a material (Mana Dust and Links too) or scrap one pickup of its count.
 */
function setDrop(ctx: SimCtx, d: TutorialSetDrop, from: Vec, roomId: number | null): void {
  const { world, registry } = ctx;
  const rng = (STREAMS.get(world) ?? new SeededRNG(0)).fork(`tutorial:${d.id}`);
  const angle = rng.next() * Math.PI * 2;
  const r = 0.6 + rng.next() * 0.9;
  const at = snapToWalkable(
    world.map,
    from.x + Math.cos(angle) * r,
    from.y + Math.sin(angle) * r,
    1,
  );
  const { x, y } = clipSight(world.map, from, at);
  const g = d.drop;
  let what: Pick<Drop, 'kind' | 'amount' | 'item' | 'rune' | 'material'>;
  if (g.kind === 'gear') what = { kind: 'item', amount: 1, item: setGear(registry, world, g, rng) };
  else if (g.kind === 'rune') {
    const form = world.hero.chains[0]?.moves[0]?.form.id ?? DEFAULT_FORMS.primary.form;
    const fits = registry.getRunes().filter((def) => runeFits(def, { form }));
    if (fits.length === 0) return;
    const id = fits[rng.nextInt(0, fits.length - 1)].id;
    what = { kind: 'rune', amount: 1, rune: { id, tier: g.tier as RuneTier } };
  } else if (g.kind === 'material')
    what = { kind: 'material', amount: g.count, material: g.material };
  else what = { kind: 'scrap', amount: g.count };
  const id = world.nextId++;
  world.drops.push({
    id,
    x,
    y,
    ...what,
    ...(roomId !== null && { roomId }),
    born: world.t,
    vacuum: world.cleared,
    dead: false,
  });
  ctx.events.push({
    kind: 'drop',
    dropId: id,
    x,
    y,
    dropKind: what.kind,
    rarity: what.item?.rarity,
  });
}

/**
 * Foe `m`'s set drops on a hand-built floor (`spawn:<its id>`, and `boss` for the
 * boss), `killMonster`'s: around it, in its room. A foe that already gave its gear this
 * dive (`dropsGiven`: a replayed floor) gives the rest, not the gear again.
 */
export function tutorialDrops(ctx: SimCtx, m: MonsterEntity): void {
  const floor = floorOf(ctx);
  if (!floor || m.spawnId === undefined) return;
  const loot = ctx.world.loot;
  const given = loot.dropsGiven.includes(m.id);
  for (const d of floor.drops) {
    if (d.on !== `spawn:${m.spawnId}` && !(d.on === 'boss' && m.kind === 'boss')) continue;
    if (d.drop.kind === 'gear' && given) continue;
    if (d.drop.kind === 'gear' && !loot.dropsGiven.includes(m.id)) loot.dropsGiven.push(m.id);
    setDrop(ctx, d, m, m.roomId);
  }
}

/**
 * A chest on a hand-built floor: its set drops (`on: 'chest'`) burst out in
 * place of a vault's roll, and true; false off a hand-built floor (the vault's
 * roll follows).
 */
export function tutorialChest(ctx: SimCtx, it: Interactable): boolean {
  const floor = floorOf(ctx);
  if (!floor) return false;
  for (const d of floor.drops) if (d.on === 'chest') setDrop(ctx, d, it, null);
  return true;
}
