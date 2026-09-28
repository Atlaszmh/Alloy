import {
  createDelveProfile,
  parseDelveProfile,
  startDive as engineStartDive,
  closeDive as engineCloseDive,
  equipItem,
  unequipSlot,
  toggleLock,
  salvageItems,
  equipBest as engineEquipBest,
  upgradeGear,
  reforgeGear,
  fuseGear,
  setAutoSalvage,
  setAbility as engineSetAbility,
  bindSecondary as engineBindSecondary,
  chooseStartingMana,
  realign as engineRealign,
  reattuneItem,
  resolveOvertake,
  type AbilityBuild,
  type AbilitySlot,
  type BuildFix,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type GearSlot,
  type ManaType,
  type ParsedDelveProfile,
  type ProfileActionResult,
  type Rarity,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { createHmrStore } from './hmr-store';

/**
 * Delve save + UI prefs. All game rules live in @alloy/engine — every action
 * here delegates to an engine function and persists the resulting profile.
 */

export const DELVE_SAVE_KEY = 'alloy:delve:v2';
/** Device preference: basic attacks on a button ("1") instead of automatic. */
export const MANUAL_ATTACK_KEY = 'alloy:delve:manualAttack';

function loadManualAttack(): boolean {
  try {
    return localStorage.getItem(MANUAL_ATTACK_KEY) === '1';
  } catch {
    return false;
  }
}

/** The saved profile (migrated when older, with the builds it fixed), or null. */
export function loadDelveProfile(): (ParsedDelveProfile & { migrated: boolean }) | null {
  try {
    const raw = localStorage.getItem(DELVE_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = parseDelveProfile(getDelveRegistry(), data);
    return parsed && { ...parsed, migrated: data?.version !== parsed.profile.version };
  } catch {
    return null;
  }
}

/** Shown once when an older save gains a pair: the gear it no longer counts explains the Power drop. */
export const BIND_HINT =
  'Your gear now counts only for your two elements: bind a second one in the Mana view (Abilities tab) to count more of it';

function saveProfile(profile: DelveProfile): void {
  try {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(profile));
  } catch {
    /* storage full or unavailable — play continues in memory */
  }
}

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

const manaName = (registry: DataRegistry, m: ManaType) => registry.getArpgData().mana[m].name;
const manaNames = (registry: DataRegistry, els: ManaType[]) =>
  els.map((m) => manaName(registry, m)).join(' and ');

/** "Your Maelstrom used Frost, which isn't in your pair; it now uses Fire" */
export function fixNotice(registry: DataRegistry, fix: BuildFix): string {
  const form = registry.getForm(fix.build.form).name;
  const isnt = fix.removed.length > 1 ? "aren't" : "isn't";
  return `Your ${form} used ${manaNames(registry, fix.removed)}, which ${isnt} in your pair; it now uses ${manaNames(registry, fix.build.elements)}`;
}

/** "Storm now outweighs Fire: your basic attacks strike with Storm" (`now` is the new primary). */
export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
  const name = manaName(registry, now);
  return `${name} now outweighs ${manaName(registry, was)}: your basic attacks strike with ${name}`;
}

interface DelveStore {
  profile: DelveProfile;
  /** Items the player hasn't looked at yet (pulse dot). */
  newUids: Record<string, true>;
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
  /** Basic attacks on a button instead of automatic (a device preference). */
  manualAttack: boolean;
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed builds. */
  notices: string[];
  /** Elements whose bind prompt was answered "Not now" this session (never saved). */
  bindDeclined: ManaType[];

  setProfile: (profile: DelveProfile) => void;
  /** A new save; with `primary` its mana is already chosen (tests, E2E). */
  resetProfile: (seed?: number, primary?: ManaType) => void;
  startDive: (depth: number) => void;
  /** Close the finished (or abandoned) dive; a secondary that has overtaken swaps in, with a notice. */
  closeDive: () => void;
  /** The one-time "Choose your mana". */
  chooseMana: (mana: ManaType) => ProfileActionResult;
  bindSecondary: (mana: ManaType) => ProfileActionResult;
  /** Change the bound pair; the builds it had to change become notices. */
  realign: (next: { primary?: ManaType; secondary?: ManaType }) => ProfileActionResult;
  reattune: (uid: string, mana: ManaType) => ProfileActionResult;
  declineBind: (mana: ManaType) => void;
  /** Hand over the waiting notices, and forget them. */
  takeNotices: () => string[];
  equip: (uid: string) => void;
  unequip: (slot: GearSlot) => void;
  toggleLock: (uid: string) => void;
  /** Melt bag items; what they gave. */
  salvage: (uids: string[]) => { scrap: number; dust: number };
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  fuse: (uids: string[]) => ProfileActionResult;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  /** Set the Primary, Defensive or Ultimate build (throws on an invalid one). */
  setAbility: (slot: AbilitySlot, build: AbilityBuild) => void;
  setManualAttack: (on: boolean) => void;
}

function withoutUids(map: Record<string, true>, uids: string[]): Record<string, true> {
  const next = { ...map };
  for (const uid of uids) delete next[uid];
  return next;
}

export const useDelveStore = createHmrStore<DelveStore>('delveStore', (set, get) => {
  const commit = (profile: DelveProfile) => {
    saveProfile(profile);
    set({ profile });
  };
  const registry = () => getDelveRegistry();
  const applyResult = (res: ProfileActionResult) => {
    if (res.ok) commit(res.profile);
    return res;
  };
  const notify = (text: string) => set({ notices: [...get().notices, text] });

  const loaded = loadDelveProfile();
  // A migrated save is written back at once.
  if (loaded) saveProfile(loaded.profile);

  return {
    profile: loaded?.profile ?? createDelveProfile(getDelveRegistry(), freshSeed()),
    newUids: {},
    diveDrops: [],
    manualAttack: loadManualAttack(),
    notices: loaded
      ? [
          ...(loaded.migrated && loaded.profile.pair.primary && !loaded.profile.pair.secondary
            ? [BIND_HINT]
            : []),
          ...loaded.fixed.map((f) => fixNotice(getDelveRegistry(), f)),
        ]
      : [],
    bindDeclined: [],

    setProfile: (profile) => commit(profile),

    resetProfile: (seed, primary) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));
      set({ newUids: {}, diveDrops: [], notices: [], bindDeclined: [] });
    },

    startDive: (depth) => {
      commit(engineStartDive(registry(), get().profile, depth));
      set({ diveDrops: [] });
    },

    closeDive: () => {
      const res = resolveOvertake(registry(), engineCloseDive(get().profile));
      commit(res.profile);
      const { primary, secondary } = res.profile.pair;
      if (res.swapped) notify(overtakeNotice(registry(), primary!, secondary!));
    },

    chooseMana: (mana) => applyResult(chooseStartingMana(registry(), get().profile, mana)),

    bindSecondary: (mana) => applyResult(engineBindSecondary(get().profile, mana)),

    realign: (next) => {
      const res = applyResult(engineRealign(registry(), get().profile, next));
      for (const fix of res.fixed ?? []) notify(fixNotice(registry(), fix));
      return res;
    },

    reattune: (uid, mana) => applyResult(reattuneItem(registry(), get().profile, uid, mana)),

    declineBind: (mana) => {
      if (!get().bindDeclined.includes(mana)) set({ bindDeclined: [...get().bindDeclined, mana] });
    },

    takeNotices: () => {
      const notices = get().notices;
      if (notices.length > 0) set({ notices: [] });
      return notices;
    },

    equip: (uid) => {
      commit(equipItem(registry(), get().profile, uid));
      set({ newUids: withoutUids(get().newUids, [uid]) });
    },

    unequip: (slot) => commit(unequipSlot(registry(), get().profile, slot)),

    toggleLock: (uid) => commit(toggleLock(get().profile, uid)),

    salvage: (uids) => {
      const res = salvageItems(registry(), get().profile, uids);
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      return { scrap: res.scrap, dust: res.dust };
    },

    equipBest: () => {
      const res = engineEquipBest(registry(), get().profile);
      if (res.equipped.length > 0) {
        commit(res.profile);
        set({
          newUids: withoutUids(
            get().newUids,
            res.equipped.map((i) => i.uid),
          ),
        });
      }
      return res.equipped;
    },

    upgrade: (uid) => applyResult(upgradeGear(registry(), get().profile, uid)),

    reforge: (uid, affixIndex) =>
      applyResult(reforgeGear(registry(), get().profile, uid, affixIndex)),

    fuse: (uids) => {
      const res = applyResult(fuseGear(registry(), get().profile, uids));
      if (res.ok && res.item)
        set({ newUids: { ...withoutUids(get().newUids, uids), [res.item.uid]: true } });
      return res;
    },

    setAutoSalvage: (rarity, on) => commit(setAutoSalvage(get().profile, rarity, on)),

    markNew: (uids) => {
      if (uids.length === 0) return;
      const next = { ...get().newUids };
      for (const uid of uids) next[uid] = true;
      set({ newUids: next });
    },

    markSeen: (uids) => {
      if (!uids.some((u) => get().newUids[u])) return;
      set({ newUids: withoutUids(get().newUids, uids) });
    },

    pushDiveDrops: (uids) => {
      if (uids.length === 0) return;
      set({ diveDrops: [...uids.slice().reverse(), ...get().diveDrops].slice(0, 60) });
    },

    setManualAttack: (on) => {
      try {
        localStorage.setItem(MANUAL_ATTACK_KEY, on ? '1' : '0');
      } catch {
        /* storage unavailable: keep it for this session */
      }
      set({ manualAttack: on });
    },

    setAbility: (slot, build) => {
      commit(engineSetAbility(registry(), get().profile, slot, build));
    },
  };
});
