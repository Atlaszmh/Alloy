import type { DataRegistry } from '../data/registry.js';
import {
  carriedByText,
  defaultKind,
  defaultMoveset,
  movesetOf,
  movesetTransfer,
} from '../loot/moveset.js';
import {
  ABILITY_PAYMENTS,
  CHAIN_SKILLS,
  MOVE_KINDS,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { inPair } from './pair.js';
import { withMoveset, type ProfileActionResult } from './profile.js';

/**
 * Editing a weapon's moveset (see the weapon movesets spec): its chains'
 * moves, priced in Mana Dust, and its slots, priced in Links and scrap.
 * profile.ts and pair.ts import this module back: keep to function declarations.
 */

const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A chain's moves or blows. */
export function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move's elements: its one or two, a blow's one. */
function elementsOf(m: Move | Blow): ManaType[] {
  return 'element' in m ? [m.element] : m.elements;
}

/** A move as it is: its kind, its form and its elements (a blow: its kind and element). */
export function moveKey(m: Move | Blow): string {
  return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
}

/** Whether two chains hold the same moves in order (by `moveKey`) and the same payment. */
export function sameChain(
  a: Chains[ChainSkill] | undefined,
  b: Chains[ChainSkill] | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [movesOf(a), movesOf(b)];
  if (!Array.isArray(a) && (a as Chain).payment !== (b as Chain).payment) return false;
  return x.length === y.length && x.every((m, i) => moveKey(m) === moveKey(y[i]));
}

/** `chain` with move `index` replaced by `move` (its payment kept). */
export function withMove(
  chain: Chains[ChainSkill],
  index: number,
  move: Move | Blow,
): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
  return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
}

/** An element set as the off-pair rule counts it: sorted, so a fusion's order doesn't matter. */
function elementSet(els: readonly ManaType[]): string {
  return [...els].sort().join('+');
}

/**
 * Whether a move holding `own` may take the elements `next` (the builder's
 * chips): all in `allowed` (the pair), or its own set kept. An off-pair set is
 * kept, never taken: `setChains` refuses a chain holding more of one than before.
 */
export function takesElements(
  allowed: readonly ManaType[],
  own: readonly ManaType[],
  next: readonly ManaType[],
): boolean {
  return next.every((e) => allowed.includes(e)) || elementSet(next) === elementSet(own);
}

/** Legendary powers that ride one skill: Nightstalker's (combat.ts), Rimeheart's (resolve.ts). */
const LEGENDARY_NEEDS = new Map<string, ChainSkill>([
  ['nightstalker', 'defensive'],
  ['rimeheart', 'ultimate'],
]);

/** The skill legendary `id`'s power needs (on a weapon without it, it does nothing), or null. */
export function legendaryNeeds(id: string): ChainSkill | null {
  return LEGENDARY_NEEDS.get(id) ?? null;
}

/** Index pairs of a longest common subsequence of `a` and `b` (by key). */
function commonRun(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const len = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (len[i + 1][j] >= len[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** A move's elements as the price matches them ("fire+storm"). */
function els(m: Move | Blow): string {
  return elementsOf(m).join('+');
}

/**
 * The least total over every way to pair the old moves left with the new
 * ones, a move left unpaired included (a removal, or a new move): a pair costs
 * `pair(old, new)`, an unpaired move `editDust`, and a new element set (no old
 * move's, and no pair's changed elements) `elementDust` once, however many
 * new moves take it. A side holds at most 5 moves, so at most 1,546 ways.
 */
function leastPairing(
  old: (Move | Blow)[],
  now: (Move | Blow)[],
  pair: (o: Move | Blow, m: Move | Blow) => number,
  known: Set<string>,
  { editDust, elementDust }: { editDust: number; elementDust: number },
): number {
  const used = now.map(() => false);
  const go = (i: number): number => {
    if (i === old.length) {
      const added = now.filter((_, j) => !used[j]);
      const sets = new Set(added.map(els).filter((s) => !known.has(s)));
      return added.length * editDust + sets.size * elementDust;
    }
    let best = editDust + go(i + 1); // removed
    for (let j = 0; j < now.length; j++) {
      if (used[j]) continue;
      // Changed elements are charged here, so a new move in the same set isn't again.
      const set = els(now[j]);
      const charges = !known.has(set);
      used[j] = true;
      if (charges) known.add(set);
      best = Math.min(best, pair(old[i], now[j]) + go(i + 1));
      if (charges) known.delete(set);
      used[j] = false;
    }
    return best;
  };
  return go(0);
}

/** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
function chainEditPrice(
  registry: DataRegistry,
  old: Chains[ChainSkill] | undefined,
  next: Chains[ChainSkill],
): number {
  const dust = registry.getDelveBalance().movesets;
  const { editDust, elementDust } = dust;
  const was = movesOf(old);
  const now = movesOf(next);
  // 1. The longest run the two share in order is unchanged, and free.
  const run = commonRun(was.map(moveKey), now.map(moveKey));
  const restOld = was.filter((_, i) => !run.some(([a]) => a === i));
  let restNew = now.filter((_, j) => !run.some(([, b]) => b === j));
  let price = 0;
  // 2. A remaining new move equal to a remaining old one moved.
  restNew = restNew.filter((m) => {
    const i = restOld.findIndex((o) => moveKey(o) === moveKey(m));
    if (i < 0) return true;
    restOld.splice(i, 1);
    price += editDust;
    return false;
  });
  // 3. The rest pair up at the least total price: a changed kind or form, or elements, or both;
  // 4. or stay unpaired: a removal, or a new move (a new element set charged once per Apply).
  const shape = (x: Move | Blow) => ('form' in x ? `${x.kind}|${x.form}` : x.kind);
  const paired = (o: Move | Blow, m: Move | Blow) =>
    (shape(o) !== shape(m) ? editDust : 0) + (els(o) !== els(m) ? elementDust : 0);
  price += leastPairing(restOld, restNew, paired, new Set(was.map(els)), dust);
  // 5. A changed payment.
  if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
    price += editDust;
  return price;
}

/**
 * The Mana Dust turning `old` into `next` costs, over every chain `next`
 * holds (see the weapon movesets spec): moves matched by what they are, not
 * where they stand. The longest run the two share in order is free; a move
 * that only moved costs `editDust`; the rest pair up at the least total price, a changed kind
 * or form costing `editDust` and changed elements `elementDust`, or stay
 * unpaired for `editDust` each (a removal, or a new move); a new element set
 * no old move has costs `elementDust` once per Apply, however many moves
 * take it; a changed payment costs `editDust`. The caller applies the
 * first-dive freebie.
 */
export function movesetEditPrice(
  registry: DataRegistry,
  old: Partial<Chains>,
  next: Partial<Chains>,
): number {
  return CHAIN_SKILLS.reduce((sum, skill) => {
    const chain = next[skill];
    return chain ? sum + chainEditPrice(registry, old[skill], chain) : sum;
  }, 0);
}

/** What an edit costs `profile`: its price, but nothing before the hero's first dive. */
export function editPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  next: Partial<Chains>,
): number {
  const weapon = profile.equipped.weapon;
  if (!weapon || profile.stats.dives === 0) return 0;
  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next);
}

/** How many moves of `chain` hold each element set outside the pair ("fire+nature"). */
function offPairSets(profile: DelveProfile, chain: Chains[ChainSkill] | undefined) {
  const counts = new Map<string, number>();
  for (const m of movesOf(chain)) {
    const els = elementsOf(m);
    if (els.every((e) => inPair(profile, e))) continue;
    const key = elementSet(els);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Why `chain` can't be the weapon's `skill` chain, or null when it can. */
function chainRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  moveset: Moveset,
  skill: ChainSkill,
  chain: Chains[ChainSkill],
): string | null {
  const slots = moveset.slots[skill];
  if (slots === undefined) return carriedByText(registry, skill);
  if (Array.isArray(chain) !== (skill === 'basic')) return `Not a ${skill} chain`;
  const moves = movesOf(chain);
  if (moves.length < 1 || moves.length > slots) return `A chain holds 1 to ${slots} moves`;
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) return `Bad kind ${m.kind}`;
  for (const m of moves) {
    const els = elementsOf(m);
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      return 'Pick one or two different elements';
    if (!els.every((e) => e in registry.getArpgData().mana)) return 'Unknown element';
    if ('form' in m) {
      if (!registry.getArpgData().forms.some((f) => f.id === m.form))
        return `Unknown form ${m.form}`;
      const form = registry.getForm(m.form);
      if (form.slot !== skill) return `${form.name} is not a ${skill} form`;
    }
  }
  if (!Array.isArray(chain) && !ABILITY_PAYMENTS.includes(chain.payment))
    return `Bad payment ${chain.payment}`;
  // An off-pair element set may be kept, moved or removed, never added or copied.
  const before = offPairSets(profile, moveset.chains[skill]);
  for (const [key, n] of offPairSets(profile, chain))
    if (n > (before.get(key) ?? 0)) return 'Pick from your two elements';
  return null;
}

/** A chain copied, so the save never shares arrays with the caller. */
function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b) => ({ ...b }));
  const moves = chain.moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}

/**
 * Set several of the equipped weapon's chains at once, for Mana Dust
 * (`editPrice`): all or nothing. Refuses mid-dive, unarmed, and when any
 * chain is refused (a skill the weapon doesn't carry; fewer than one move or
 * more than its slots; an unknown kind, a form from another slot, anything
 * but one or two different known elements, an unknown payment; or an element
 * set outside the pair held more times than before) or the total can't be paid.
 */
export function setChains(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  const next = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const reason = chainRefusal(registry, profile, moveset, skill, chain);
    if (reason) return refuse(profile, reason);
    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const price = editPrice(registry, profile, chains);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  const edited = withMoveset(profile, { ...moveset, chains: next });
  return { ok: true, profile: { ...edited, manaDust: profile.manaDust - price } };
}

/** Set one of the equipped weapon's chains (`setChains` with one). */
export function setChain<S extends ChainSkill>(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: S,
  chain: Chains[S],
): ProfileActionResult {
  return setChains(registry, profile, { [skill]: chain });
}

/**
 * The next slot of `weapon`'s `skill` chain: its Links and scrap by the new
 * slot's position (`slotLinks`, `slotScrap`: the 2nd slot's first), or null
 * when the weapon doesn't carry the skill or the chain has every slot.
 */
export function slotPrice(
  registry: DataRegistry,
  weapon: GearItem,
  skill: ChainSkill,
): { links: number; scrap: number } | null {
  const bal = registry.getDelveBalance();
  const slots = movesetOf(registry, weapon).slots[skill];
  if (slots === undefined || slots >= bal.chains.cap[skill]) return null;
  return { links: bal.movesets.slotLinks[slots - 1], scrap: bal.movesets.slotScrap[slots - 1] };
}

/**
 * Add a slot to the equipped weapon's `skill` chain, for Links and scrap
 * (`slotPrice`), and a move at the chain's end: the default kind at its
 * position (the last move's form's default chain, or for the basic chain the
 * weapon's, medium past its end), the last move's form, and the last move's
 * elements while they're all in the pair, else the pair's primary. A slot the
 * chain isn't using stays free. Refuses mid-dive, unarmed, for a skill the
 * weapon doesn't carry, at the cap, and when it can't be paid for.
 */
export function addSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  if (moveset.slots[skill] === undefined) return refuse(profile, carriedByText(registry, skill));
  const price = slotPrice(registry, weapon, skill);
  if (!price) return refuse(profile, 'This chain has every slot');
  if (profile.links < price.links) return refuse(profile, 'Not enough Links');
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  const chain = moveset.chains[skill]!;
  const moves = movesOf(chain);
  const last = moves[moves.length - 1];
  const primary = profile.pair.primary;
  const kept = elementsOf(last).every((e) => inPair(profile, e));
  const elements = kept || !primary ? elementsOf(last) : [primary];
  let next: Chains[ChainSkill];
  if (Array.isArray(chain)) {
    const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
    next = [...chain, { kind, element: elements[0] }];
  } else {
    const form = (last as Move).form;
    const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
    next = { ...chain, moves: [...chain.moves, { kind, form, elements: [...elements] }] };
  }
  const slots = { ...moveset.slots, [skill]: moveset.slots[skill]! + 1 };
  const edited = withMoveset(profile, { chains: { ...moveset.chains, [skill]: next }, slots });
  return {
    ok: true,
    item: edited.equipped.weapon,
    profile: { ...edited, links: profile.links - price.links, scrap: profile.scrap - price.scrap },
  };
}

/**
 * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip
 * it, for scrap (`movesetTransfer`); its Links come back. The old weapon goes
 * to the bag at its base slots, its moves the defaults in its own mana.
 * Refuses mid-dive, unarmed, for anything but a bag weapon, and when it can't
 * be paid for.
 */
export function transferMoveset(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Transfer your moveset between dives');
  const source = profile.equipped.weapon;
  if (!source) return refuse(profile, UNARMED_TEXT);
  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
  if (!target) return refuse(profile, 'Transfer onto a weapon in your bag');
  const t = movesetTransfer(registry, source, target);
  if (profile.scrap < t.scrap) return refuse(profile, 'Not enough scrap');
  const item = { ...target, moveset: t.moveset };
  const old = { ...source, moveset: defaultMoveset(registry, source, source.mana) };
  return {
    ok: true,
    item,
    links: t.links,
    profile: {
      ...profile,
      equipped: { ...profile.equipped, weapon: item },
      bag: [...profile.bag.filter((i) => i.uid !== uid), old],
      scrap: profile.scrap - t.scrap,
      links: profile.links + t.links,
    },
  };
}
