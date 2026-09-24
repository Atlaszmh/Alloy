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
  type DelveProfile,
  type GearItem,
  type GearSlot,
  type ProfileActionResult,
  type Rarity,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { createHmrStore } from './hmr-store';

/**
 * Delve save + UI prefs. All game rules live in @alloy/engine — every action
 * here delegates to an engine function and persists the resulting profile.
 */

export const DELVE_SAVE_KEY = 'alloy:delve:v1';
const SPEED_KEY = 'alloy:delve:speed';
const AUTOSLAM_KEY = 'alloy:delve:autoSlam';

export type DelveSpeed = 1 | 2 | 4;

export function loadDelveProfile(): DelveProfile | null {
  try {
    const raw = localStorage.getItem(DELVE_SAVE_KEY);
    if (!raw) return null;
    return parseDelveProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

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

function loadSpeed(): DelveSpeed {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    if (v === 1 || v === 2 || v === 4) return v;
  } catch {
    /* noop */
  }
  return 1;
}

function loadAutoSlam(): boolean {
  try {
    return localStorage.getItem(AUTOSLAM_KEY) === 'true';
  } catch {
    return false;
  }
}

interface DelveStore {
  profile: DelveProfile;
  speed: DelveSpeed;
  autoSlam: boolean;
  /** Items the player hasn't looked at yet (pulse dot). */
  newUids: Record<string, true>;
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];

  setProfile: (profile: DelveProfile) => void;
  resetProfile: (seed?: number) => void;
  startDive: (depth: number) => void;
  closeDive: () => void;
  equip: (uid: string) => void;
  unequip: (slot: GearSlot) => void;
  toggleLock: (uid: string) => void;
  salvage: (uids: string[]) => number;
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  fuse: (uids: string[]) => ProfileActionResult;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  setSpeed: (speed: DelveSpeed) => void;
  cycleSpeed: () => void;
  toggleAutoSlam: () => void;
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

  return {
    profile: loadDelveProfile() ?? createDelveProfile(getDelveRegistry(), freshSeed()),
    speed: loadSpeed(),
    autoSlam: loadAutoSlam(),
    newUids: {},
    diveDrops: [],

    setProfile: (profile) => commit(profile),

    resetProfile: (seed) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed()));
      set({ newUids: {}, diveDrops: [] });
    },

    startDive: (depth) => {
      commit(engineStartDive(registry(), get().profile, depth));
      set({ diveDrops: [] });
    },

    closeDive: () => commit(engineCloseDive(get().profile)),

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
      return res.scrap;
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

    setSpeed: (speed) => {
      try {
        localStorage.setItem(SPEED_KEY, String(speed));
      } catch {
        /* noop */
      }
      set({ speed });
    },

    cycleSpeed: () => {
      const next: DelveSpeed = get().speed === 1 ? 2 : get().speed === 2 ? 4 : 1;
      get().setSpeed(next);
    },

    toggleAutoSlam: () => {
      const next = !get().autoSlam;
      try {
        localStorage.setItem(AUTOSLAM_KEY, String(next));
      } catch {
        /* noop */
      }
      set({ autoSlam: next });
    },
  };
});
