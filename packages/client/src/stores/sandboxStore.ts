import { useMemo } from 'react';
import { z } from 'zod';
import {
  BlowSchema,
  ChainSchema,
  GEAR_SLOTS,
  GearItemSchema,
  MANA_TYPES,
  MAX_CHAIN,
  RARITY_ORDER,
  computeHeroStats,
  defaultChains,
  sandboxWeapon,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
  type DataRegistry,
  type DelveProfile,
  type DummyLayout,
  type EquippedGear,
  type GearItem,
  type HeroStats,
  type ManaMap,
  type ManaType,
  type MonsterKind,
  type Rarity,
  type SandboxToggles,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { createHmrStore } from './hmr-store';

/**
 * The Training Grounds loadout: its own weapon, powers, attunement, chains and
 * arena settings, saved apart from the Delve save, which it never touches.
 * Rules stay in the engine; this only remembers the choices.
 */

export const SANDBOX_KEY = 'alloy:delve:sandbox:v1';
export const SLOWMO_SPEEDS = [0.25, 0.5, 0.75, 1] as const;
export const MAX_EXTRA_ATTUNE = 15;
export const MAX_DEPTH = 30;
/** Dummy groups kept (and replayed) at most. */
export const MAX_DUMMY_GROUPS = 8;

export interface WeaponChoice {
  baseId: string;
  mana: ManaType;
  rarity: Rarity;
}

/** The weapon choice an item stands for. */
function choiceOf(item: GearItem): WeaponChoice {
  return { baseId: item.baseId, mana: item.mana, rarity: item.rarity };
}

/** Same base, element and rarity (two unarmed choices match too). */
function sameChoice(a: WeaponChoice | null, b: WeaponChoice | null): boolean {
  return (
    a === b || (!!a && !!b && a.baseId === b.baseId && a.mana === b.mana && a.rarity === b.rarity)
  );
}

/** A group of dummies added so far, replayed whenever the arena is rebuilt. */
export interface DummyGroup {
  layout: DummyLayout;
  element: ManaType | null;
}

export interface SandboxLoadout {
  /** The weapon picked, or null for unarmed. */
  weapon: WeaponChoice | null;
  /** The real weapon copied by Load my build, used as-is until a weapon option changes. */
  loadedWeapon: GearItem | null;
  /** The other equipped slots (only Load my build fills them). */
  gear: Omit<EquippedGear, 'weapon'>;
  /** Legendary powers switched on → value (their max roll). */
  legendaries: Record<string, number>;
  /** Attunement added per element, 0–15. */
  attunement: Partial<ManaMap>;
  /** The basic chain and each ability slot's (any element: the sandbox is unrestricted). */
  chains: Chains;
  depth: number;
  /** What new dummies resist: null = Neutral. */
  dummyElement: ManaType | null;
  dummies: DummyGroup[];
  toggles: SandboxToggles;
  /** Display speed: 0.25, 0.5, 0.75 or 1. */
  slowmo: number;
  /** The sandbox hero's pair: the elements its basic blows can pick (the weapon keeps its mana, for attunement). */
  primary: ManaType;
  /** The pair's second element (null = none; never the primary). */
  secondary: ManaType | null;
}

export const SANDBOX_DEFAULTS: SandboxLoadout = {
  weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
  loadedWeapon: null,
  gear: {},
  legendaries: {},
  attunement: {},
  chains: defaultChains(getDelveRegistry(), 'fire', 'sword'),
  depth: 5,
  dummyElement: null,
  dummies: [],
  toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
  slowmo: 1,
  primary: 'fire',
  secondary: null,
};

const ManaSchema = z.enum(MANA_TYPES as readonly [ManaType, ...ManaType[]]);
const RaritySchema = z.enum(RARITY_ORDER as [Rarity, ...Rarity[]]);

/** Each field falls back to its default when it is missing or bad; typed, so tsc catches drift. */
function loadoutSchema(registry: DataRegistry): z.ZodType<SandboxLoadout, z.ZodTypeDef, unknown> {
  const D = SANDBOX_DEFAULTS;
  const weaponIds = new Set(registry.getGearBasesForSlot('weapon').map((b) => b.id));
  const powers = new Set(registry.getDelveData().legendaries.map((l) => l.id));
  const forms = registry.getArpgData().forms;
  const chain = (slot: AbilitySlot) =>
    ChainSchema.refine((c) =>
      c.moves.every((m) => forms.some((f) => f.id === m.form && f.slot === slot)),
    );
  const item = GearItemSchema.optional();
  return z.object({
    weapon: z
      .object({
        baseId: z.string().refine((id) => weaponIds.has(id)),
        mana: ManaSchema,
        rarity: RaritySchema,
      })
      .nullable()
      .catch(D.weapon),
    loadedWeapon: GearItemSchema.refine((i) => i.slot === 'weapon' && weaponIds.has(i.baseId))
      .nullable()
      .catch(null),
    gear: z
      .object(
        Object.fromEntries(
          GEAR_SLOTS.filter((slot) => slot !== 'weapon').map((slot) => [slot, item]),
        ),
      )
      .catch({}),
    legendaries: z
      .record(z.string(), z.number())
      .refine((l) => Object.keys(l).every((id) => powers.has(id)))
      .catch({}),
    attunement: z.record(ManaSchema, z.number().int().min(0).max(MAX_EXTRA_ATTUNE)).catch({}),
    chains: z
      .object({
        basic: z.array(BlowSchema).min(1).max(MAX_CHAIN),
        primary: chain('primary'),
        defensive: chain('defensive'),
        ultimate: chain('ultimate'),
      })
      .catch(D.chains),
    depth: z.number().int().min(1).max(MAX_DEPTH).catch(D.depth),
    dummyElement: ManaSchema.nullable().catch(null),
    dummies: z
      .array(
        z.object({ layout: z.enum(['single', 'row', 'clump']), element: ManaSchema.nullable() }),
      )
      .transform((groups) => groups.slice(0, MAX_DUMMY_GROUPS))
      .catch([]),
    toggles: z
      .object({ infiniteMana: z.boolean(), noCooldowns: z.boolean(), invulnerable: z.boolean() })
      .catch(D.toggles),
    slowmo: z
      .number()
      .refine((v) => (SLOWMO_SPEEDS as readonly number[]).includes(v))
      .catch(D.slowmo),
    primary: ManaSchema.catch(D.primary),
    secondary: ManaSchema.nullable().catch(null),
  });
}

/** A saved loadout; whatever is missing or bad takes its default. */
export function parseSandbox(raw: unknown): SandboxLoadout {
  const parsed = loadoutSchema(getDelveRegistry()).safeParse(raw);
  if (!parsed.success) return SANDBOX_DEFAULTS;
  // The secondary is never the primary.
  const s =
    parsed.data.secondary === parsed.data.primary
      ? { ...parsed.data, secondary: null }
      : parsed.data;
  // A loaded weapon only counts while the choice still names it: a bad save can't show one
  // weapon and fight with another.
  return s.loadedWeapon && !sameChoice(s.weapon, choiceOf(s.loadedWeapon))
    ? { ...s, loadedWeapon: null }
    : s;
}

function load(): SandboxLoadout {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    return raw ? parseSandbox(JSON.parse(raw)) : SANDBOX_DEFAULTS;
  } catch {
    return SANDBOX_DEFAULTS;
  }
}

/** The Targets tab's spawn picks. */
export interface SpawnChoice {
  biomeId: string;
  defId: string;
  kind: MonsterKind;
  count: number;
}

/** The first biome's first monster, three normal ones. */
function defaultSpawn(): SpawnChoice {
  const biome = getDelveRegistry().getDelveData().biomes[0];
  return { biomeId: biome.id, defId: biome.monsters[0].id, kind: 'normal', count: 3 };
}

interface SandboxStore extends SandboxLoadout {
  /** Kept while the app runs (across tab switches and panel closes), never saved. */
  spawn: SpawnChoice;
  setSpawn: (patch: Partial<SpawnChoice>) => void;
  /** Pick a weapon (null = unarmed); a loaded weapon is dropped, unless the choice is unchanged. */
  setWeapon: (weapon: WeaponChoice | null) => void;
  /** Switch a legendary power on (at its max roll) or off. */
  setLegendary: (id: string, on: boolean) => void;
  setAttunement: (mana: ManaType, extra: number) => void;
  setChain: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
  setDepth: (depth: number) => void;
  setDummyElement: (element: ManaType | null) => void;
  /** Remember a dummy group (ignored once MAX_DUMMY_GROUPS are kept). */
  addDummyGroup: (group: DummyGroup) => void;
  clearDummyGroups: () => void;
  setToggles: (toggles: SandboxToggles) => void;
  setSlowmo: (speed: number) => void;
  /** Pick the primary (a secondary of that element is dropped); the basic blows follow the pair. */
  setPrimary: (mana: ManaType) => void;
  /** Pick the secondary (null = none; the primary is ignored); the basic blows follow the pair. */
  setSecondary: (mana: ManaType | null) => void;
  /** Copy the save's gear, chains and pair in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'chains' | 'pair'>) => void;
  reset: () => void;
}

const FIELDS = Object.keys(SANDBOX_DEFAULTS) as (keyof SandboxLoadout)[];

/**
 * The basic chain after the pair changes: the old secondary's blows take the
 * new one (a secondary bound from none takes the last blow, as `bindSecondary`
 * does), every other blow the primary.
 */
function refit(
  basic: Blow[],
  was: ManaType | null,
  primary: ManaType,
  secondary: ManaType | null,
): Blow[] {
  return basic.map((b, i) => ({
    ...b,
    element:
      secondary && (was === null ? i === basic.length - 1 : b.element === was)
        ? secondary
        : primary,
  }));
}

export const useSandboxStore = createHmrStore<SandboxStore>('sandboxStore', (set, get) => {
  const commit = (patch: Partial<SandboxLoadout>) => {
    set(patch);
    const state = get();
    try {
      localStorage.setItem(
        SANDBOX_KEY,
        JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, state[k]]))),
      );
    } catch {
      /* storage unavailable: keep it for this session */
    }
  };
  return {
    ...load(),
    spawn: defaultSpawn(),
    setSpawn: (patch) => set({ spawn: { ...get().spawn, ...patch } }),
    // Re-clicking the pressed chip changes nothing (so a loaded weapon survives it).
    setWeapon: (weapon) => {
      if (sameChoice(weapon, get().weapon)) return;
      commit({ weapon, loadedWeapon: null });
    },
    setLegendary: (id, on) => {
      const legendaries = { ...get().legendaries };
      if (on) legendaries[id] = getDelveRegistry().getLegendary(id).max;
      else delete legendaries[id];
      commit({ legendaries });
    },
    setAttunement: (mana, extra) =>
      commit({
        attunement: {
          ...get().attunement,
          [mana]: Math.max(0, Math.min(MAX_EXTRA_ATTUNE, Math.round(extra))),
        },
      }),
    setChain: (skill, chain) => commit({ chains: { ...get().chains, [skill]: chain } }),
    setDepth: (depth) => commit({ depth: Math.max(1, Math.min(MAX_DEPTH, Math.round(depth))) }),
    setDummyElement: (dummyElement) => commit({ dummyElement }),
    addDummyGroup: (group) => {
      if (get().dummies.length < MAX_DUMMY_GROUPS) commit({ dummies: [...get().dummies, group] });
    },
    clearDummyGroups: () => commit({ dummies: [] }),
    setToggles: (toggles) => commit({ toggles }),
    setSlowmo: (slowmo) => commit({ slowmo }),
    setPrimary: (primary) => {
      const { secondary: was, chains } = get();
      const secondary = was === primary ? null : was;
      commit({
        primary,
        secondary,
        chains: { ...chains, basic: refit(chains.basic, was, primary, secondary) },
      });
    },
    setSecondary: (secondary) => {
      const { primary, secondary: was, chains } = get();
      if (secondary === primary) return;
      commit({
        secondary,
        chains: { ...chains, basic: refit(chains.basic, was, primary, secondary) },
      });
    },
    loadMyBuild: (profile) => {
      const { weapon, ...gear } = profile.equipped;
      commit({
        weapon: weapon ? choiceOf(weapon) : null,
        loadedWeapon: weapon ?? null,
        gear,
        chains: profile.chains,
        legendaries: {},
        attunement: {},
        // Your pair: the loaded weapon keeps its real mana (the weapon check relies on it).
        primary: profile.pair.primary ?? get().primary,
        secondary: profile.pair.secondary,
      });
    },
    reset: () => {
      commit(SANDBOX_DEFAULTS);
      set({ spawn: defaultSpawn() });
    },
  };
});

type StatsInput = Pick<
  SandboxLoadout,
  | 'weapon'
  | 'loadedWeapon'
  | 'gear'
  | 'legendaries'
  | 'attunement'
  | 'depth'
  | 'primary'
  | 'secondary'
> & { chains: Pick<Chains, 'basic'> };

/** What the sandbox hero wears: the loaded weapon, else a clean one of the picked kind (item level = depth). */
export function sandboxEquipped(registry: DataRegistry, s: StatsInput): EquippedGear {
  const weapon =
    s.loadedWeapon ?? (s.weapon ? sandboxWeapon(registry, { ...s.weapon, ilvl: s.depth }) : null);
  return weapon ? { ...s.gear, weapon } : { ...s.gear };
}

export function sandboxStats(registry: DataRegistry, s: StatsInput): HeroStats {
  return computeHeroStats(sandboxEquipped(registry, s), registry, {
    legendaries: s.legendaries,
    attunement: s.attunement,
    // The pair powers the basic blows; every element still attunes: the sandbox stays unrestricted.
    pair: { primary: s.primary, secondary: s.secondary },
    filterAttunement: false,
    basic: s.chains.basic,
  });
}

/** The sandbox hero's stats, recomputed only when the loadout changes (so the arena hot-swaps only then). */
export function useSandboxStats(): HeroStats {
  const weapon = useSandboxStore((s) => s.weapon);
  const loadedWeapon = useSandboxStore((s) => s.loadedWeapon);
  const gear = useSandboxStore((s) => s.gear);
  const legendaries = useSandboxStore((s) => s.legendaries);
  const attunement = useSandboxStore((s) => s.attunement);
  const depth = useSandboxStore((s) => s.depth);
  const primary = useSandboxStore((s) => s.primary);
  const secondary = useSandboxStore((s) => s.secondary);
  const basic = useSandboxStore((s) => s.chains.basic);
  return useMemo(
    () =>
      sandboxStats(getDelveRegistry(), {
        weapon,
        loadedWeapon,
        gear,
        legendaries,
        attunement,
        depth,
        primary,
        secondary,
        chains: { basic },
      }),
    [weapon, loadedWeapon, gear, legendaries, attunement, depth, primary, secondary, basic],
  );
}
