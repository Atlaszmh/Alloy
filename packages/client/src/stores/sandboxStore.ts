import { useMemo } from 'react';
import { z } from 'zod';
import {
  AbilityBuildSchema,
  GEAR_SLOTS,
  GearItemSchema,
  MANA_TYPES,
  RARITY_ORDER,
  computeHeroStats,
  defaultAbilities,
  sandboxWeapon,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
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
 * The Training Grounds loadout: its own weapon, powers, attunement, builds and
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
  abilities: AbilityBuilds;
  depth: number;
  /** What new dummies resist: null = Neutral. */
  dummyElement: ManaType | null;
  dummies: DummyGroup[];
  toggles: SandboxToggles;
  /** Display speed: 0.25, 0.5, 0.75 or 1. */
  slowmo: number;
  /** The sandbox hero's primary: what basic blows strike with (the weapon keeps its mana, for attunement). */
  primary: ManaType;
  /** The second element the combo's finisher discharges (null = none; never the primary). */
  basicInfusion: ManaType | null;
}

export const SANDBOX_DEFAULTS: SandboxLoadout = {
  weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
  loadedWeapon: null,
  gear: {},
  legendaries: {},
  attunement: {},
  abilities: defaultAbilities('fire'),
  depth: 5,
  dummyElement: null,
  dummies: [],
  toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
  slowmo: 1,
  primary: 'fire',
  basicInfusion: null,
};

const ManaSchema = z.enum(MANA_TYPES as readonly [ManaType, ...ManaType[]]);
const RaritySchema = z.enum(RARITY_ORDER as [Rarity, ...Rarity[]]);

/** Each field falls back to its default when it is missing or bad; typed, so tsc catches drift. */
function loadoutSchema(registry: DataRegistry): z.ZodType<SandboxLoadout, z.ZodTypeDef, unknown> {
  const D = SANDBOX_DEFAULTS;
  const weaponIds = new Set(registry.getGearBasesForSlot('weapon').map((b) => b.id));
  const powers = new Set(registry.getDelveData().legendaries.map((l) => l.id));
  const forms = registry.getArpgData().forms;
  const build = (slot: AbilitySlot) =>
    AbilityBuildSchema.refine((b) => forms.some((f) => f.id === b.form && f.slot === slot));
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
    abilities: z
      .object({
        primary: build('primary'),
        defensive: build('defensive'),
        ultimate: build('ultimate'),
      })
      .catch(D.abilities),
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
    basicInfusion: ManaSchema.nullable().catch(null),
  });
}

/** A saved loadout; whatever is missing or bad takes its default. */
export function parseSandbox(raw: unknown): SandboxLoadout {
  const parsed = loadoutSchema(getDelveRegistry()).safeParse(raw);
  if (!parsed.success) return SANDBOX_DEFAULTS;
  // A Basic infusion is never the primary.
  const s =
    parsed.data.basicInfusion === parsed.data.primary
      ? { ...parsed.data, basicInfusion: null }
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
  setAbility: (slot: AbilitySlot, build: AbilityBuild) => void;
  setDepth: (depth: number) => void;
  setDummyElement: (element: ManaType | null) => void;
  /** Remember a dummy group (ignored once MAX_DUMMY_GROUPS are kept). */
  addDummyGroup: (group: DummyGroup) => void;
  clearDummyGroups: () => void;
  setToggles: (toggles: SandboxToggles) => void;
  setSlowmo: (speed: number) => void;
  /** Pick the primary; a Basic infusion of that element is dropped. */
  setPrimary: (mana: ManaType) => void;
  /** The finisher's discharge (null = none); the primary is ignored. */
  setBasicInfusion: (mana: ManaType | null) => void;
  /** Copy the save's gear, builds and pair in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'abilities' | 'pair'>) => void;
  reset: () => void;
}

const FIELDS = Object.keys(SANDBOX_DEFAULTS) as (keyof SandboxLoadout)[];

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
    setAbility: (slot, build) => commit({ abilities: { ...get().abilities, [slot]: build } }),
    setDepth: (depth) => commit({ depth: Math.max(1, Math.min(MAX_DEPTH, Math.round(depth))) }),
    setDummyElement: (dummyElement) => commit({ dummyElement }),
    addDummyGroup: (group) => {
      if (get().dummies.length < MAX_DUMMY_GROUPS) commit({ dummies: [...get().dummies, group] });
    },
    clearDummyGroups: () => commit({ dummies: [] }),
    setToggles: (toggles) => commit({ toggles }),
    setSlowmo: (slowmo) => commit({ slowmo }),
    setPrimary: (primary) =>
      commit({ primary, ...(primary === get().basicInfusion ? { basicInfusion: null } : {}) }),
    setBasicInfusion: (basicInfusion) => {
      if (basicInfusion !== get().primary) commit({ basicInfusion });
    },
    loadMyBuild: (profile) => {
      const { weapon, ...gear } = profile.equipped;
      commit({
        weapon: weapon ? choiceOf(weapon) : null,
        loadedWeapon: weapon ?? null,
        gear,
        abilities: profile.abilities,
        legendaries: {},
        attunement: {},
        // Your pair: the loaded weapon keeps its real mana (the weapon check relies on it).
        primary: profile.pair.primary ?? get().primary,
        basicInfusion: profile.pair.secondary,
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
  | 'basicInfusion'
>;

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
    // Basics only: blows strike with the primary and the finisher discharges the infusion,
    // unarmed too. Every element still attunes: the sandbox stays unrestricted.
    pair: { primary: s.primary, secondary: s.basicInfusion },
    filterAttunement: false,
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
  const basicInfusion = useSandboxStore((s) => s.basicInfusion);
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
        basicInfusion,
      }),
    [weapon, loadedWeapon, gear, legendaries, attunement, depth, primary, basicInfusion],
  );
}
