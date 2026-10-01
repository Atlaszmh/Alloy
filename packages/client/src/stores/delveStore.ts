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
  fuseRunes as engineFuseRunes,
  setAutoSalvage,
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  draftPrice,
  movesOf,
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
  type ChainOrigins,
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
  type DraftPrice,
  type RunePouch,
  type RuneRef,
  type SetChainsOptions,
  type StopAction,
  type UnsocketMode,
} from '@alloy/engine';
import { SKILL_NAME, listed } from '@/features/delve/chains/chain-text';
import { formatNumber } from '@/features/delve/format';
import { getDelveRegistry } from '@/features/delve/registry';
import { runeName } from '@/features/delve/runes/rune-style';
import { createHmrStore } from './hmr-store';

/**
 * Delve save + UI prefs. All game rules live in @alloy/engine — every action
 * here delegates to an engine function and persists the resulting profile.
 */

export const DELVE_SAVE_KEY = 'alloy:delve:v2';
/** Device preference: basic attacks on a button ("1") instead of automatic. */
export const MANUAL_ATTACK_KEY = 'alloy:delve:manualAttack';
/** Dev builds: the pull rule chosen on the Anvil's chip ("destroy" or "pay"). */
export const UNSOCKET_KEY = 'alloy:delve:unsocket';

function loadManualAttack(): boolean {
  try {
    return localStorage.getItem(MANUAL_ATTACK_KEY) === '1';
  } catch {
    return false;
  }
}

/** The pull rule this device chose (dev builds only; production never reads it), or null. */
function loadUnsocket(): UnsocketMode | null {
  if (!import.meta.env.DEV) return null;
  try {
    const mode = localStorage.getItem(UNSOCKET_KEY);
    return mode === 'destroy' || mode === 'pay' ? mode : null;
  } catch {
    return null;
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
  /** For each chain in `chains`, the saved move each of its moves came from (null: a new one). */
  origins: ChainOrigins;
}

/** `origins` for the skills `chains` holds. */
function originsFor(origins: ChainOrigins, chains: Partial<Chains>): ChainOrigins {
  return Object.fromEntries(
    CHAIN_SKILLS.filter((s) => chains[s] && origins[s]).map((s) => [s, origins[s]]),
  );
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

/** Apply's options: the draft's origins and the pull rule (the dev override, else the balance's). */
function applyOpts(draft: ChainDraft | null, unsocket: UnsocketMode | null): SetChainsOptions {
  return { origins: draft?.origins ?? {}, unsocket: unsocket ?? undefined };
}

/** What Apply would do with the draft: the Anvil's builder and its Delve button both show it. */
export interface DraftApply {
  /** The chains it would set: the draft's that differ from the weapon's. */
  changes: Partial<Chains>;
  opts: SetChainsOptions;
  /** The total, from the engine's `draftPrice`; null with nothing pending, or when it refuses. */
  price: DraftPrice | null;
  /** Why `draftPrice` refuses (and so Apply would); null when it prices the draft. */
  refused: string | null;
  /** The engine's `setChains` as a dry run: whether Apply goes through, and why not. */
  dry: ProfileActionResult | null;
  /** The pouch once Apply has taken what it sockets (and, paying, given back what it pulls). */
  pouch: RunePouch;
}

export function draftApply(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
  unsocket: UnsocketMode | null,
): DraftApply {
  const changes = draftChanges(registry, profile, draft);
  const opts = applyOpts(draft, unsocket);
  if (Object.keys(changes).length === 0)
    return { changes, opts, price: null, refused: null, dry: null, pouch: profile.runes };
  const price = draftPrice(registry, profile, changes, opts);
  const refused = 'refused' in price ? price.refused : null;
  return {
    changes,
    opts,
    price: 'refused' in price ? null : price,
    refused,
    dry: engineSetChains(registry, profile, changes, opts),
    // Refused (a rune short, say), the picker shows the pouch as it is.
    pouch: 'refused' in price ? profile.runes : price.pouch,
  };
}

/** An engine op's pull rule: the dev override, else (undefined) the balance's. */
export function pullOpts(s: Pick<DelveStore, 'unsocket'>): Pick<SetChainsOptions, 'unsocket'> {
  return { unsocket: s.unsocket ?? undefined };
}

let lastApply: {
  profile: DelveProfile;
  draft: ChainDraft | null;
  unsocket: UnsocketMode | null;
  view: DraftApply;
} | null = null;

/**
 * `draftApply` on the store's state, memoised across its readers (the Anvil page and its
 * builder): the same result until the profile, the draft or the pull rule changes.
 */
export function selectDraftApply(s: DelveStore): DraftApply {
  const { profile, chainDraft: draft, unsocket } = s;
  if (
    lastApply?.profile !== profile ||
    lastApply.draft !== draft ||
    lastApply.unsocket !== unsocket
  )
    lastApply = {
      profile,
      draft,
      unsocket,
      view: draftApply(getDelveRegistry(), profile, draft, unsocket),
    };
  return lastApply.view;
}

/** Runes by name: "Split III", "Split III and Quick I". */
export function runeNames(registry: DataRegistry, refs: readonly RuneRef[]): string {
  return listed(refs.map((r) => runeName(registry, r)));
}

/**
 * Apply's label with the draft's total: "Apply · ✦ 15 · 🔗 2 · ⚙ 40 · destroys Split III". Links
 * are netted (the sockets of moves removed pay for those opened): a refund beyond them reads
 * "🔗 +1".
 */
export function applyLabel(registry: DataRegistry, price: DraftPrice | null): string {
  if (!price) return 'Apply';
  const links = price.links - price.refundLinks;
  return [
    'Apply',
    price.dust > 0 ? `✦ ${price.dust}` : null,
    links !== 0 ? `🔗 ${links > 0 ? links : `+${-links}`}` : null,
    price.scrap > 0 ? `⚙ ${formatNumber(price.scrap)}` : null,
    price.destroys.length > 0 ? `destroys ${runeNames(registry, price.destroys)}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** The runes a load-time trim destroyed: "Split III was lost: its socket no longer exists". */
export function runeLostNotices(registry: DataRegistry, lost: readonly RuneRef[]): string[] {
  return lost
    .filter((r) => registry.findRune(r.id))
    .map((r) => `${runeName(registry, r)} was lost: its socket no longer exists`);
}

/**
 * What became of the runes an op's parts brought back (salvage, a fuse, a transfer):
 * "Split I back to your pouch", "2 runes back to your pouch · destroys Quick III"; null for none.
 */
export function partsText(
  registry: DataRegistry,
  runes: readonly RuneRef[] = [],
  destroyed: readonly RuneRef[] = [],
): string | null {
  const out: string[] = [];
  if (runes.length > 0)
    out.push(
      `${runes.length === 1 ? runeName(registry, runes[0]) : `${runes.length} runes`} back to your pouch`,
    );
  if (destroyed.length > 0) out.push(`destroys ${runeNames(registry, destroyed)}`);
  return out.length > 0 ? out.join(' · ') : null;
}

interface DelveStore {
  profile: DelveProfile;
  /** Items the player hasn't looked at yet (pulse dot). */
  newUids: Record<string, true>;
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
  /** Runes picked up this dive, newest first (session only). */
  diveRunes: RuneRef[];
  /** Basic attacks on a button instead of automatic (a device preference). */
  manualAttack: boolean;
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves. */
  notices: string[];
  /** Elements whose bind prompt was answered "Not now" this session (never saved). */
  bindDeclined: ManaType[];
  /** The chain builder's unapplied edits (never saved; a dive can't start over them). */
  chainDraft: ChainDraft | null;
  /** Dev builds: the pull rule chosen on the Anvil's chip (null: the balance's). */
  unsocket: UnsocketMode | null;

  setProfile: (profile: DelveProfile) => void;
  /** A new save; with `primary` its mana is already chosen (tests, E2E). */
  resetProfile: (seed?: number, primary?: ManaType) => void;
  /** Start a dive; refused (false) while the chain builder holds unapplied changes. */
  startDive: (depth: number) => boolean;
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
  /** Melt bag items; what they gave (their runes back to the pouch, or destroyed, by the rule). */
  salvage: (uids: string[]) => {
    scrap: number;
    dust: number;
    links: number;
    runes: RuneRef[];
    destroyed: RuneRef[];
  };
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  fuse: (uids: string[]) => ProfileActionResult;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  pushDiveRunes: (runes: RuneRef[]) => void;
  /** Fuse `fuseCount` of a rune and tier into one of the next tier, for scrap (the Forge tab). */
  fuseRunes: (ref: RuneRef) => ProfileActionResult;
  /** Set the equipped weapon's changed chains, for Mana Dust: all or nothing. */
  setChains: (chains: Partial<Chains>) => ProfileActionResult;
  /**
   * Put a chain into the builder's draft (a chain back as it was leaves it). `map`: for each of
   * its moves, the index in the chain the builder showed (null: a new move); missing, each move
   * stays where it was.
   */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], map?: (number | null)[]) => void;
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
  /** Dev builds: choose the pull rule, kept on this device. */
  setUnsocket: (mode: UnsocketMode) => void;
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
  // The pull rule for the ops whose parts can return or destroy a rune.
  const pull = () => pullOpts(get());

  const loaded = loadDelveProfile();
  // A migrated save is written back at once.
  if (loaded) saveProfile(loaded.profile);

  return {
    profile: loaded?.profile ?? createDelveProfile(getDelveRegistry(), freshSeed()),
    newUids: {},
    diveDrops: [],
    diveRunes: [],
    manualAttack: loadManualAttack(),
    notices: loaded
      ? [
          ...(loaded.gainedPair && loaded.profile.pair.primary && !loaded.profile.pair.secondary
            ? [BIND_HINT]
            : []),
          ...movesetNotices(loaded.dropped, loaded.movesetReset, loaded.profile.links),
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
          ...runeLostNotices(getDelveRegistry(), loaded.runesLost),
        ]
      : [],
    bindDeclined: [],
    chainDraft: null,
    unsocket: loadUnsocket(),

    setProfile: (profile) => commit(profile),

    resetProfile: (seed, primary) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));
      set({
        newUids: {},
        diveDrops: [],
        diveRunes: [],
        notices: [],
        bindDeclined: [],
        chainDraft: null,
      });
    },

    startDive: (depth) => {
      const { profile, chainDraft } = get();
      // A dive locks the chains: a pending draft is applied or discarded first, never dropped.
      if (Object.keys(draftChanges(registry(), profile, chainDraft)).length > 0) return false;
      commit(engineStartDive(registry(), profile, depth));
      set({ diveDrops: [], diveRunes: [], chainDraft: null });
      return true;
    },

    closeDive: () => {
      const res = resolveOvertake(registry(), engineCloseDive(get().profile));
      commit(res.profile);
      const { primary, secondary } = res.profile.pair;
      if (res.swapped) notify(overtakeNotice(registry(), primary!, secondary!));
    },

    chooseMana: (mana) => applyResult(chooseStartingMana(registry(), get().profile, mana, pull())),

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
      const res = salvageItems(registry(), get().profile, uids, pull());
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      const { scrap, dust, links, runes, destroyed } = res;
      return { scrap, dust, links, runes, destroyed };
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
      const res = applyResult(fuseGear(registry(), get().profile, uids, pull()));
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

    pushDiveRunes: (runes) => {
      if (runes.length === 0) return;
      set({ diveRunes: [...runes.slice().reverse(), ...get().diveRunes].slice(0, 60) });
    },

    setManualAttack: (on) => {
      try {
        localStorage.setItem(MANUAL_ATTACK_KEY, on ? '1' : '0');
      } catch {
        /* storage unavailable: keep it for this session */
      }
      set({ manualAttack: on });
    },

    setUnsocket: (mode) => {
      try {
        localStorage.setItem(UNSOCKET_KEY, mode);
      } catch {
        /* storage unavailable: keep it for this session */
      }
      set({ unsocket: mode });
    },

    setChains: (chains) => applyResult(engineSetChains(registry(), get().profile, chains)),

    editDraft: (skill, chain, map) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const changes = draftChanges(registry(), profile, chainDraft);
      // The builder's map is over the chain it showed (the draft's, else the saved one):
      // composed with the draft's own origins, it gives each move's index in the saved chain.
      const shown = changes[skill] ?? heroChains(registry(), profile.equipped, profile.pair)[skill];
      const from: (number | null)[] =
        (changes[skill] ? chainDraft?.origins[skill] : undefined) ??
        movesOf(shown).map((_, i) => i);
      const handed = map ?? movesOf(chain).map((_, j) => j);
      const origins = {
        ...originsFor(chainDraft?.origins ?? {}, changes),
        [skill]: handed.map((k) => (k === null ? null : (from[k] ?? null))),
      };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      const next = {
        uid: weapon.uid,
        pair: profile.pair,
        chains: { ...changes, [skill]: chain },
        origins,
      };
      const chains = draftChanges(registry(), profile, next);
      set({ chainDraft: { ...next, chains, origins: originsFor(origins, chains) } });
    },

    applyDraft: () => {
      const { profile, chainDraft, unsocket } = get();
      const changes = draftChanges(registry(), profile, chainDraft);
      const res = applyResult(
        engineSetChains(registry(), profile, changes, applyOpts(chainDraft, unsocket)),
      );
      if (res.ok) set({ chainDraft: null });
      return res;
    },

    revertDraft: () => set({ chainDraft: null }),

    fuseRunes: (ref) => applyResult(engineFuseRunes(registry(), get().profile, ref)),

    addSlot: (skill) => {
      const res = applyResult(engineAddSlot(registry(), get().profile, skill));
      // The draft's edit of that chain was made on fewer slots: it goes.
      const draft = get().chainDraft;
      if (res.ok && draft?.chains[skill]) {
        const { [skill]: _gone, ...chains } = draft.chains;
        set({ chainDraft: { ...draft, chains, origins: originsFor(draft.origins, chains) } });
      }
      return res;
    },

    transfer: (uid) => {
      const res = applyResult(transferMoveset(registry(), get().profile, uid, pull()));
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
