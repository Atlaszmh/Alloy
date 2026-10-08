import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { generateItem } from '../src/loot/item-generator.js';
import {
  UNARMED,
  ceilingOf,
  constructSkill,
  defaultForm,
  defaultMoveset,
  dormantUids,
  fillSlots,
  formAllowed,
  isPlain,
  plainConstruct,
  slotRange,
  weaponClass,
} from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ChainSkill, Move } from '../src/types/ability.js';
import { RARITY_ORDER, type GearItem, type Rarity } from '../src/types/gear.js';
import { registry } from './fixtures/arena.js';

// See the constructs spec §2.1 (classes), §2.4 (the class defaults), §3.1 (the model) and §3.2
// (the slot table). In Phase A these helpers are read by nothing: the switch task wires them.

const bal = registry.getDelveBalance();
const weapon = (rarity: Rarity, baseId: string, uid = `w-${baseId}-${rarity}`): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(3).fork(uid),
  );

describe('balance: delve.movesets.slots, openSkill, salvageDust and runes.runeChance', () => {
  it("holds the spec's slot table, the Basic's start 0 (the weapon's string)", () => {
    expect(bal.movesets.slots).toEqual({
      common: { basic: [0, 3], primary: [2, 3], defensive: [0, 1], ultimate: [0, 0] },
      uncommon: { basic: [0, 3], primary: [2, 3], defensive: [1, 2], ultimate: [0, 1] },
      magic: { basic: [0, 4], primary: [3, 4], defensive: [1, 2], ultimate: [0, 1] },
      rare: { basic: [0, 4], primary: [3, 4], defensive: [2, 3], ultimate: [1, 2] },
      epic: { basic: [0, 5], primary: [4, 5], defensive: [2, 4], ultimate: [1, 3] },
      legendary: { basic: [0, 5], primary: [4, 5], defensive: [3, 5], ultimate: [2, 5] },
    });
    expect(bal.movesets.openSkill).toEqual({
      common: { flux: { uncommon: 2 }, links: 1, scrap: 40 },
      uncommon: { flux: { uncommon: 2 }, links: 1, scrap: 60 },
      magic: { flux: { magic: 1 }, links: 2, scrap: 80 },
      rare: { flux: { rare: 1 }, links: 2, scrap: 120 },
      epic: { flux: { epic: 1 }, links: 3, scrap: 160 },
      legendary: { flux: { epic: 1 }, links: 3, scrap: 200 },
    });
    expect(bal.movesets.salvageDust).toBe(0);
    expect(bal.runes.runeChance).toEqual({
      common: 0,
      uncommon: 0,
      magic: 0.05,
      rare: 0.1,
      epic: 0.2,
      legendary: 0.35,
    });
  });

  it('refuses a ceiling under its start, a ceiling that falls with rarity, and a legendary ceiling under 5', () => {
    const withSlots = (patch: (s: typeof bal.movesets.slots) => object) => ({
      ...balanceData,
      delve: {
        ...balanceData.delve,
        movesets: {
          ...balanceData.delve.movesets,
          slots: patch(JSON.parse(JSON.stringify(balanceData.delve.movesets.slots))),
        },
      },
    });
    const ok = (x: object) => BalanceConfigSchema.safeParse(x).success;
    expect(ok(withSlots((s) => s))).toBe(true);
    expect(ok(withSlots((s) => ({ ...s, rare: { ...s.rare, primary: [4, 3] } })))).toBe(false);
    expect(ok(withSlots((s) => ({ ...s, epic: { ...s.epic, defensive: [2, 2] } })))).toBe(false);
    expect(ok(withSlots((s) => ({ ...s, legendary: { ...s.legendary, ultimate: [2, 4] } })))).toBe(
      false,
    );
  });
});

describe('weaponClass, formAllowed and defaultForm', () => {
  it('reads each base; unarmed is null and expresses no form', () => {
    const classes = Object.fromEntries(
      registry.getGearBasesForSlot('weapon').map((b) => [b.id, weaponClass(registry, b.id)]),
    );
    expect(classes).toEqual({
      dagger: 'melee',
      sword: 'melee',
      axe: 'melee',
      maul: 'melee',
      staff: 'ranged',
      wand: 'ranged',
      bow: 'ranged',
    });
    expect(weaponClass(registry, null)).toBeNull();
    expect(formAllowed(registry, 'sword', 'strike')).toBe(true);
    expect(formAllowed(registry, 'sword', 'bolt')).toBe(false);
    expect(formAllowed(registry, 'bow', 'bolt')).toBe(true);
    expect(formAllowed(registry, 'bow', 'strike')).toBe(false);
    expect(formAllowed(registry, 'bow', 'lance')).toBe(true);
    expect(formAllowed(registry, 'sword', 'lance')).toBe(true);
    for (const f of registry.getArpgData().forms) expect(formAllowed(registry, null, f.id)).toBe(false);
  });

  it("the Primary's default is Strike on a melee weapon and Bolt otherwise; Ward and Nova for both", () => {
    expect(defaultForm(registry, 'primary', 'melee')).toEqual({ form: 'strike', payment: 'mana' });
    expect(defaultForm(registry, 'primary', 'ranged')).toEqual({ form: 'bolt', payment: 'mana' });
    expect(defaultForm(registry, 'primary', null)).toEqual({ form: 'bolt', payment: 'mana' });
    for (const cls of ['melee', 'ranged', null] as const) {
      expect(defaultForm(registry, 'defensive', cls)).toEqual({ form: 'ward', payment: 'mana' });
      expect(defaultForm(registry, 'ultimate', cls)).toEqual({ form: 'nova', payment: 'charge' });
    }
  });
});

describe('slotRange, ceilingOf, plainConstruct, constructSkill, isPlain', () => {
  it("gives each skill's [start, ceiling] by rarity, the Basic's start its weapon's string", () => {
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'basic')).toEqual([3, 3]);
    expect(slotRange(registry, { baseId: 'maul', rarity: 'rare' }, 'basic')).toEqual([2, 4]);
    expect(slotRange(registry, { baseId: 'dagger', rarity: 'common' }, 'basic')).toEqual([4, 4]);
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'primary')).toEqual([2, 3]);
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'ultimate')).toEqual([0, 0]);
    expect(slotRange(registry, { baseId: 'bow', rarity: 'legendary' }, 'ultimate')).toEqual([2, 5]);
    expect(slotRange(registry, UNARMED, 'basic')).toEqual([3, 3]);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const)
      expect(slotRange(registry, UNARMED, skill)).toEqual([0, 0]);
    expect(ceilingOf(registry, { baseId: 'sword', rarity: 'epic' }, 'defensive')).toBe(4);
    expect(ceilingOf(registry, UNARMED, 'primary')).toBe(0);
  });

  it("a plain construct: the skill's default kind at its index, the class default form, in the element; no uid", () => {
    const sword = { baseId: 'sword', rarity: 'common' as const };
    expect(plainConstruct(registry, sword, 'primary', 0, 'frost')).toEqual({
      kind: 'medium',
      form: 'strike',
      elements: ['frost'],
    });
    expect(plainConstruct(registry, sword, 'primary', 3, 'frost')).toEqual({
      kind: 'heavy',
      form: 'strike',
      elements: ['frost'],
    });
    expect(plainConstruct(registry, { baseId: 'bow', rarity: 'rare' }, 'primary', 0, 'storm')).toEqual({
      kind: 'light',
      form: 'bolt',
      elements: ['storm'],
    });
    expect(plainConstruct(registry, sword, 'basic', 2, 'fire')).toEqual({ kind: 'heavy', element: 'fire' });
    expect(plainConstruct(registry, sword, 'basic', 4, 'fire')).toEqual({ kind: 'medium', element: 'fire' });
    expect(plainConstruct(registry, sword, 'ultimate', 0, 'fire')).toEqual({
      kind: 'medium',
      form: 'nova',
      elements: ['fire'],
    });
  });

  it('a construct belongs to its skill, and is plain without an open socket or a rune', () => {
    const m = (form: Move['form']): Move => ({ kind: 'medium', form, elements: ['fire'] });
    expect(constructSkill(registry, { kind: 'light', element: 'fire' })).toBe('basic');
    expect(constructSkill(registry, m('bolt'))).toBe('primary');
    expect(constructSkill(registry, m('repel'))).toBe('defensive');
    expect(constructSkill(registry, m('onslaught'))).toBe('ultimate');
    expect(isPlain(m('bolt'))).toBe(true);
    expect(isPlain({ ...m('bolt'), runes: [] })).toBe(true);
    expect(isPlain({ ...m('bolt'), runes: [null] })).toBe(false);
    expect(isPlain({ kind: 'light', element: 'fire', runes: [{ id: 'quick', tier: 1 }] })).toBe(false);
  });
});

describe('dormantUids and fillSlots', () => {
  it("names the moves whose form the weapon's class can't express; blows never", () => {
    const bow = weapon('rare', 'bow');
    const moves: Move[] = [
      { uid: 'c1', kind: 'medium', form: 'strike', elements: ['fire'] },
      { uid: 'c2', kind: 'medium', form: 'lance', elements: ['fire'] },
      { uid: 'c3', kind: 'medium', form: 'bolt', elements: ['fire'] },
    ];
    const held: GearItem = {
      ...bow,
      moveset: {
        chains: {
          basic: [{ uid: 'b1', kind: 'light', element: 'fire', runes: [{ id: 'widen', tier: 1 }] }],
          primary: { moves, payment: 'mana' },
          defensive: { moves: [{ uid: 'c4', kind: 'medium', form: 'armor', elements: ['fire'] }], payment: 'mana' },
        },
        slots: { basic: 3, primary: 3, defensive: 2 },
      },
    };
    expect([...dormantUids(registry, held)].sort()).toEqual(['c1', 'c4']);
    expect(dormantUids(registry, weapon('common', 'sword')).size).toBe(0);
  });

  it("fills a skill's empty slots below its start with plain constructs, raising its slots to the start", () => {
    const rare = { baseId: 'sword', rarity: 'rare' as const };
    // An uncommon sword's moveset as the old carries make it: the Basic and a two-Bolt Primary.
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'fire', { primary: 2 });
    const filled = fillSlots(registry, rare, m, 'storm');
    // A rare's Primary starts at 3 (the two kept, one Storm Strike added), its Defensive at 2.
    expect(filled.slots).toMatchObject({ basic: 3, primary: 3, defensive: 2 });
    expect(filled.chains.primary!.moves.map((x) => [x.form, x.elements[0]])).toEqual([
      ['bolt', 'fire'],
      ['bolt', 'fire'],
      ['strike', 'storm'],
    ]);
    expect(filled.chains.defensive).toEqual({
      moves: [
        { kind: 'medium', form: 'ward', elements: ['storm'] },
        { kind: 'medium', form: 'ward', elements: ['storm'] },
      ],
      payment: 'mana',
    });
    // Emptied chains refill to the start, their slots past it kept; nothing above the start is added.
    const emptied = { ...filled, chains: { ...filled.chains, primary: { moves: [], payment: 'cast' as const } }, slots: { ...filled.slots, primary: 4 } };
    const again = fillSlots(registry, rare, emptied, 'storm');
    expect(again.slots.primary).toBe(4);
    expect(again.chains.primary!.moves).toHaveLength(3);
    expect(again.chains.primary!.payment).toBe('cast');
    expect(fillSlots(registry, rare, again, 'storm')).toEqual(again);
    // A skill at a start of 0 with no chain stays without one.
    const skills = (x: typeof m) => Object.keys(x.chains).sort();
    expect(skills(fillSlots(registry, { baseId: 'sword', rarity: 'common' }, m, 'fire'))).toEqual(skills(m));
  });
});
