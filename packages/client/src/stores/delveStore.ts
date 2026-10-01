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
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  transferMoveset,
  takeStop as engineTakeStop,
  bindSecondary as engineBindSecondary,
  chooseStartingMana,
  realign as engineRealign,
  reattuneItem,
  resolveOvertake,
  pairElements,
  CHAIN_SKILLS,
  heroChains,
  sameChain,
  type ChainFix,
  type Chains,
  type ChainSkill,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type GearSlot,
  type ManaPair,
  type ManaType,
  type ParsedDelveProfile,
  type ProfileActionResult,
  type Rarity,
  type StopAction,
} from '@alloy/engine';
import { SKILL_NAME } from '@/features/delve/chains/chain-text';
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

/**
 * The saved profile (migrated when older, with the moves it fixed), or null;
 * `gainedPair` when the save predates the pair (version 3 or older).
 */
export function loadDelveProfile(): (ParsedDelveProfile & { gainedPair: boolean }) | null {
  try {
    const raw = localStorage.getItem(DELVE_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = parseDelveProfile(getDelveRegistry(), data);
    return (
      parsed && { ...parsed, gainedPair: typeof data?.version === 'number' && data.version < 4 }
    );
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

/** "a", "a and b", "a, b and c". */
function listed(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');
}

const manaNames = (registry: DataRegistry, els: ManaType[]) =>
  listed(els.map((m) => manaName(registry, m)));

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/**
 * The notices for the moves and blows a pair op changed (`fixed`), `pair` the
 * pair after it: one per skill for its moves that changed the same way (the
 * same elements lost, the same elements now). "Your Bolt's 3rd move used
 * Frost, which isn't in your pair; it now uses Fire", "Your Bolt's 1st, 2nd and
 * 4th moves used Fire, which isn't in your pair; they now use Storm", "Your
 * basic attack's 2nd blow used …"; moves of different forms go by their
 * skill ("Your Primary's …"). Elements still in the pair need no clause:
 * "Your Bolt's 2nd move used Storm; it now uses Nature".
 */
export function fixNotices(registry: DataRegistry, fixed: ChainFix[], pair: ManaPair): string[] {
  const now = (f: ChainFix) => ('element' in f.move ? [f.move.element] : f.move.elements);
  const groups = new Map<string, ChainFix[]>();
  for (const f of fixed) {
    const key = `${f.skill}|${f.removed.join()}|${now(f).join()}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()].map((group) => {
    const [first] = group;
    const forms = new Set(group.map((f) => ('form' in f.move ? f.move.form : null)));
    const [form] = forms;
    const owner =
      first.skill === 'basic'
        ? 'basic attack'
        : forms.size === 1 && form
          ? registry.getForm(form).name
          : SKILL_NAME[first.skill];
    const nths = listed(group.map((f) => ORDINALS[f.index] ?? `${f.index + 1}th`));
    const noun = `${first.skill === 'basic' ? 'blow' : 'move'}${group.length > 1 ? 's' : ''}`;
    const outside = first.removed.every((e) => !pairElements(pair).includes(e));
    const clause = outside
      ? `, which ${first.removed.length > 1 ? "aren't" : "isn't"} in your pair`
      : '';
    const uses = group.length > 1 ? 'they now use' : 'it now uses';
    return `Your ${owner}'s ${nths} ${noun} used ${manaNames(registry, first.removed)}${clause}; ${uses} ${manaNames(registry, now(first))}`;
  });
}

/**
 * What the move to weapon movesets (save version 6) changed: the chains the
 * equipped weapon can't carry went (`dropped`, their extra moves back as
 * `links`), or an unarmed save's built chains were reset (`reset`).
 */
export function movesetNotices(dropped: ChainSkill[], reset: boolean, links: number): string[] {
  const out: string[] = [];
  if (dropped.length > 0) {
    const names = listed(dropped.map((s) => SKILL_NAME[s]));
    const many = dropped.length > 1;
    const back =
      links > 0
        ? `, and ${many ? 'their' : 'its'} ${links} extra move${links === 1 ? '' : 's'} came back as ${links} Link${links === 1 ? '' : 's'}`
        : '';
    out.push(
      `Your chains live on your weapon now, and yours can't carry your ${names}: ${many ? 'they' : 'it'} went${back}`,
    );
  }
  if (reset)
    out.push(
      'Your chains live on your weapon now: with no weapon equipped, yours were reset to the defaults',
    );
  return out;
}

/** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */
export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
  const name = manaName(registry, now);
  return `${name} now outweighs ${manaName(registry, was)}: ${name} is your primary`;
}

/** The Anvil builder's unapplied edits (session only): one weapon's, under one pair. */
export interface ChainDraft {
  uid: string;
  pair: ManaPair;
  chains: Partial<Chains>;
}

/**
 * The draft's chains that still differ from the equipped weapon's; none when
 * the draft belongs to another weapon or another pair (equipping another
 * weapon, a bind or a realign drops it).
 */
export function draftChanges(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): Partial<Chains> {
  const weapon = profile.equipped.weapon;
  const { primary, secondary } = profile.pair;
  if (!draft || !weapon || draft.uid !== weapon.uid) return {};
  if (draft.pair.primary !== primary || draft.pair.secondary !== secondary) return {};
  const saved = heroChains(registry, profile.equipped, profile.pair);
  return Object.fromEntries(
    CHAIN_SKILLS.filter((s) => draft.chains[s] && !sameChain(draft.chains[s], saved[s])).map(
      (s) => [s, draft.chains[s]],
    ),
  );
}

interface DelveStore {
  profile: DelveProfile;
  /** Items the player hasn't looked at yet (pulse dot). */
  newUids: Record<string, true>;
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
  /** Basic attacks on a button instead of automatic (a device preference). */
  manualAttack: boolean;
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves. */
  notices: string[];
  /** Elements whose bind prompt was answered "Not now" this session (never saved). */
  bindDeclined: ManaType[];
  /** The chain builder's unapplied edits (never saved; a dive's start drops them). */
  chainDraft: ChainDraft | null;

  setProfile: (profile: DelveProfile) => void;
  /** A new save; with `primary` its mana is already chosen (tests, E2E). */
  resetProfile: (seed?: number, primary?: ManaType) => void;
  startDive: (depth: number) => void;
  /** Close the finished (or abandoned) dive; a secondary that has overtaken swaps in, with a notice. */
  closeDive: () => void;
  /** The one-time "Choose your mana". */
  chooseMana: (mana: ManaType) => ProfileActionResult;
  bindSecondary: (mana: ManaType) => ProfileActionResult;
  /** Change the bound pair; the moves it had to change become notices. */
  realign: (next: { primary?: ManaType; secondary?: ManaType }) => ProfileActionResult;
  reattune: (uid: string, mana: ManaType) => ProfileActionResult;
  declineBind: (mana: ManaType) => void;
  /** Hand over the waiting notices, and forget them. */
  takeNotices: () => string[];
  equip: (uid: string) => void;
  unequip: (slot: GearSlot) => void;
  toggleLock: (uid: string) => void;
  /** Melt bag items; what they gave. */
  salvage: (uids: string[]) => { scrap: number; dust: number; links: number };
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  fuse: (uids: string[]) => ProfileActionResult;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  /** Set the equipped weapon's changed chains, for Mana Dust: all or nothing. */
  setChains: (chains: Partial<Chains>) => ProfileActionResult;
  /** Put a chain into the builder's draft (a chain back as it was leaves it). */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
  /** Pay for the draft's changes and set them (`setChains`); a refusal keeps the draft. */
  applyDraft: () => ProfileActionResult;
  revertDraft: () => void;
  /** Add a slot to a chain of the equipped weapon, for Links and scrap (dropping its draft). */
  addSlot: (skill: ChainSkill) => ProfileActionResult;
  /** Move the equipped weapon's moveset onto bag weapon `uid` and equip it, for scrap. */
  transfer: (uid: string) => ProfileActionResult;
  /** Take the door screen's power-up. */
  takeStop: (action: StopAction) => ProfileActionResult;
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
    // The chain draft belongs to one weapon: equipping another (or a transfer) drops it.
    const draft = get()?.chainDraft;
    const kept = !draft || profile.equipped.weapon?.uid === draft.uid;
    set(kept ? { profile } : { profile, chainDraft: null });
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
          ...(loaded.gainedPair && loaded.profile.pair.primary && !loaded.profile.pair.secondary
            ? [BIND_HINT]
            : []),
          ...movesetNotices(loaded.dropped, loaded.movesetReset, loaded.profile.links),
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
        ]
      : [],
    bindDeclined: [],
    chainDraft: null,

    setProfile: (profile) => commit(profile),

    resetProfile: (seed, primary) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));
      set({ newUids: {}, diveDrops: [], notices: [], bindDeclined: [], chainDraft: null });
    },

    startDive: (depth) => {
      commit(engineStartDive(registry(), get().profile, depth));
      set({ diveDrops: [], chainDraft: null });
    },

    closeDive: () => {
      const res = resolveOvertake(registry(), engineCloseDive(get().profile));
      commit(res.profile);
      const { primary, secondary } = res.profile.pair;
      if (res.swapped) notify(overtakeNotice(registry(), primary!, secondary!));
    },

    chooseMana: (mana) => applyResult(chooseStartingMana(registry(), get().profile, mana)),

    bindSecondary: (mana) => applyResult(engineBindSecondary(registry(), get().profile, mana)),

    realign: (next) => {
      const res = applyResult(engineRealign(registry(), get().profile, next));
      for (const text of fixNotices(registry(), res.fixed ?? [], res.profile.pair)) notify(text);
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
      return { scrap: res.scrap, dust: res.dust, links: res.links };
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

    setChains: (chains) => applyResult(engineSetChains(registry(), get().profile, chains)),

    editDraft: (skill, chain) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const chains = { ...draftChanges(registry(), profile, chainDraft), [skill]: chain };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      const next = { uid: weapon.uid, pair: profile.pair, chains };
      set({ chainDraft: { ...next, chains: draftChanges(registry(), profile, next) } });
    },

    applyDraft: () => {
      const { profile, chainDraft } = get();
      const res = applyResult(
        engineSetChains(registry(), profile, draftChanges(registry(), profile, chainDraft)),
      );
      if (res.ok) set({ chainDraft: null });
      return res;
    },

    revertDraft: () => set({ chainDraft: null }),

    addSlot: (skill) => {
      const res = applyResult(engineAddSlot(registry(), get().profile, skill));
      // The draft's edit of that chain was made on fewer slots: it goes.
      const draft = get().chainDraft;
      if (res.ok && draft?.chains[skill]) {
        const { [skill]: _gone, ...chains } = draft.chains;
        set({ chainDraft: { ...draft, chains } });
      }
      return res;
    },

    transfer: (uid) => {
      const res = applyResult(transferMoveset(registry(), get().profile, uid));
      if (res.ok) set({ newUids: withoutUids(get().newUids, [uid]) });
      return res;
    },

    takeStop: (action) => {
      const res = applyResult(engineTakeStop(registry(), get().profile, action));
      if (res.ok && action.kind === 'equip')
        set({ newUids: withoutUids(get().newUids, [action.uid]) });
      return res;
    },
  };
});
