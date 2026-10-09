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
  forge as engineForge,
  hone as engineHone,
  imprint as engineImprint,
  refine as engineRefine,
  buyShard as engineBuyShard,
  startTutorial as engineStartTutorial,
  skipTutorial as engineSkipTutorial,
  applyTutorialEvents,
  retryTutorialDepth as engineRetryTutorialDepth,
  tutorialBlocksDive,
  claimQuest as engineClaimQuest,
  rerollContract as engineRerollContract,
  trackQuest as engineTrackQuest,
  markQuestSeen as engineMarkQuestSeen,
  fuseRunes as engineFuseRunes,
  setAutoSalvage,
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  applyDraft as engineApplyDraft,
  draftPrice,
  draftRefusal,
  salvageConstruct as engineSalvageConstruct,
  unsocketMode,
  movesOf,
  movesetOf,
  socketsOf,
  moveAll as engineMoveAll,
  openSkill as engineOpenSkill,
  takeStop as engineTakeStop,
  bindSecondary as engineBindSecondary,
  chooseStartingMana,
  realign as engineRealign,
  reattuneItem,
  resolveOvertake,
  pairElements,
  CHAIN_SKILLS,
  sameChain,
  type ArpgWorld,
  type ChainFix,
  type Chains,
  type Construct,
  type ConstructDraft,
  type AbilitySlot,
  type ChainSkill,
  type DataRegistry,
  type DelveProfile,
  type ForgeRequest,
  type GearItem,
  type GearSlot,
  type HeroStatKey,
  type ManaPair,
  type ManaType,
  type MaterialRef,
  type ParsedDelveProfile,
  type ProfileActionResult,
  type ProfileQuests,
  type QuestDef,
  type Rarity,
  type DraftPrice,
  type RunePouch,
  type RuneRef,
  type SetChainsOptions,
  type ShardRef,
  type StopAction,
  type TutorialEvent,
  type UnsocketMode,
} from '@alloy/engine';
import { SKILL_NAME, lessRunes, listed } from '@/features/delve/chains/chain-text';
import { getDelveRegistry } from '@/features/delve/registry';
import { runeName } from '@/features/delve/runes/rune-style';
import { createHmrStore } from './hmr-store';
import { useUIStore } from './uiStore';

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
    // Manual by default: auto only once chosen.
    return localStorage.getItem(MANUAL_ATTACK_KEY) !== '0';
  } catch {
    return true;
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
 * The saved profile, `{ reset: true }` for a save of another version (no
 * migrations: see the crafting spec), or null with no save or a broken one.
 */
export function loadDelveProfile(): ParsedDelveProfile | null {
  try {
    const raw = localStorage.getItem(DELVE_SAVE_KEY);
    if (!raw) return null;
    return parseDelveProfile(getDelveRegistry(), JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Shown once when a save of another version starts afresh. */
export const RESET_NOTICE = 'The forge changed: your save was reset';

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

/** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */
export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
  const name = manaName(registry, now);
  return `${name} now outweighs ${manaName(registry, was)}: ${name} is your primary`;
}

/**
 * What quest progress gained between two saves, as toasts (see the quests spec's Notices): "Quest
 * complete: <name> · claim at the Anvil" for a quest whose last objective is newly done, else
 * "Objective done: <text>" for each objective newly done. `defs` are the main and side quests
 * (`getQuestsData().quests`); a contract on the board carries its own name and texts.
 */
export function questNotices(
  defs: readonly QuestDef[],
  was: ProfileQuests,
  now: ProfileQuests,
): string[] {
  if (was === now) return [];
  const quests = [
    ...defs.map((q) => ({ ...q, progress: now.progress[q.id], before: was.progress[q.id] })),
    ...now.board.flatMap((c) =>
      c ? [{ ...c, before: was.board.find((b) => b?.id === c.id)?.progress }] : [],
    ),
  ];
  const notices: string[] = [];
  for (const { name, objectives, progress, before } of quests) {
    const done = objectives.filter((_, i) => progress?.[i]?.done && !before?.[i]?.done);
    if (done.length === 0) continue;
    if (progress.every((p) => p.done)) notices.push(`Quest complete: ${name} · claim at the Anvil`);
    else for (const o of done) notices.push(`Objective done: ${o.text}`);
  }
  return notices;
}

/**
 * The Anvil builder's unapplied edits (session only): one weapon's, under one pair, with the
 * move bag as the draft sees it (a construct unsocketed joins it, one placed leaves it).
 */
export interface ChainDraft {
  uid: string;
  pair: ManaPair;
  chains: Partial<Chains>;
  bag: Construct[];
}

/** Whether two chains hold the same constructs (by uid, as Apply prices them) the same way. */
function sameConstructs(
  a: Chains[ChainSkill] | undefined,
  b: Chains[ChainSkill] | undefined,
): boolean {
  return sameChain(a, b) && movesOf(a).every((m, i) => m.uid === movesOf(b)[i]?.uid);
}

/** A bag's uids as a key: its order is no change. */
const bagKey = (bag: readonly Construct[]) =>
  bag
    .map((c) => c.uid ?? '')
    .sort()
    .join();

/** The draft is this weapon's, under this pair (equipping another, a bind or a realign drops it). */
function draftFits(profile: DelveProfile, draft: ChainDraft | null): draft is ChainDraft {
  const weapon = profile.equipped.weapon;
  const { primary, secondary } = profile.pair;
  return (
    !!draft &&
    !!weapon &&
    draft.uid === weapon.uid &&
    draft.pair.primary === primary &&
    draft.pair.secondary === secondary
  );
}

/**
 * The draft's chains that still differ from the equipped weapon's own (every construct, a dormant
 * one too: the uid diff's saved side); none when the draft belongs to another weapon or pair.
 */
export function draftChanges(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): Partial<Chains> {
  if (!draftFits(profile, draft)) return {};
  const saved = movesetOf(registry, profile.equipped.weapon!).chains;
  return Object.fromEntries(
    CHAIN_SKILLS.filter((s) => draft.chains[s] && !sameConstructs(draft.chains[s], saved[s])).map(
      (s) => [s, draft.chains[s]],
    ),
  );
}

/** What Apply would set: the chains that differ and the draft's bag; null with nothing pending. */
export function draftOf(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): ConstructDraft | null {
  if (!draftFits(profile, draft)) return null;
  const chains = draftChanges(registry, profile, draft);
  if (Object.keys(chains).length === 0 && bagKey(draft.bag) === bagKey(profile.constructs))
    return null;
  return { chains, bag: draft.bag };
}

/** Why a bag construct can't be salvaged while the draft holds changes: `DRAFT_PENDING`, C1's name. */
export const SALVAGE_WAITS = 'Apply or discard your Skills changes first';

/** More than any draft can spend: the copy Apply is priced on. */
const RICH = 1_000_000_000;

/** The runes held on the worn weapon and in the bag. */
function heldRunes(registry: DataRegistry, p: DelveProfile): RuneRef[] {
  const weapon = p.equipped.weapon;
  const onWeapon = weapon
    ? CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, weapon).chains[s]))
    : [];
  return [...onWeapon, ...p.constructs].flatMap((c) =>
    socketsOf(c).filter((r): r is RuneRef => r !== null),
  );
}

/**
 * The draft's price from a dry run of Apply on a copy of `before` that holds RICH of everything:
 * what it spent in Mana Dust, Links (net; a refund beyond the spend is `refundLinks`) and scrap,
 * the pouch it leaves, and the runes it pulled off the weapon and the bag, destroyed or returned
 * by the pull rule.
 */
// ponytail: priced by a rich dry run; swap in an engine draftPrice(registry, profile, draft, opts) if B2 adds one.
// Its multiset diff reads a rune pulled from one construct and socketed on another in the same
// Apply as no pull (the pouch and scrap still say what Apply spent); an engine price would name it.
export function priceFromDry(
  registry: DataRegistry,
  before: DelveProfile,
  after: DelveProfile,
  pay: boolean,
): DraftPrice {
  const net = RICH - after.links;
  const pulled = lessRunes(heldRunes(registry, before), heldRunes(registry, after));
  return {
    dust: RICH - after.manaDust,
    links: Math.max(0, net),
    refundLinks: Math.max(0, -net),
    scrap: RICH - after.scrap,
    destroys: pay ? [] : pulled,
    returns: pay ? pulled : [],
    pouch: after.runes,
  };
}

/** Phase A's placeholder `applyDraft` refuses every draft with this until B2 fills it. */
const NOT_YET = 'Not yet';

/**
 * Apply's op: the engine's `applyDraft`. While it is A's placeholder (it refuses "Not yet") a
 * draft that moves nothing into or out of the bag is `applyDraft`'s own `setChains` step, so
 * it goes there, once `draftRefusal` has passed it (the lost-construct, two-slot and class rules
 * run on every draft). A draft that moves the bag waits for B2.
 */
// ponytail: delete the fallback (keep the engineApplyDraft call) once B2's applyDraft is merged.
export function applyNow(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
  opts: SetChainsOptions,
): ProfileActionResult {
  const res = engineApplyDraft(registry, profile, draft, opts);
  if (res.ok || res.reason !== NOT_YET || bagKey(draft.bag) !== bagKey(profile.constructs))
    return res;
  const refused = draftRefusal(registry, profile, draft);
  return refused
    ? { ok: false, profile, reason: refused }
    : engineSetChains(registry, profile, draft.chains, opts);
}

/** What Apply would do with the draft: the Anvil's builder and its Delve button both show it. */
export interface DraftApply {
  /** The engine's draft: the chains that differ and the bag; null with nothing pending. */
  draft: ConstructDraft | null;
  /** The chains it would set: the draft's that differ from the weapon's. */
  changes: Partial<Chains>;
  opts: SetChainsOptions;
  /** The total; null with nothing pending, or when the engine refuses the draft. */
  price: DraftPrice | null;
  /**
   * Why the engine won't price the draft (`draftRefusal`'s rules on a draft that moves the bag,
   * else `draftPrice`'s: a rune the pouch lacks); null when it prices it. A rule that only stops
   * Apply (an element outside the pair) is `dry`'s reason.
   */
  refused: string | null;
  /** The engine's `applyDraft` as a dry run: whether Apply goes through, and why not. */
  dry: ProfileActionResult | null;
  /** The pouch once Apply has taken what it sockets (and, paying, given back what it pulls). */
  pouch: RunePouch;
}

export function draftApply(
  registry: DataRegistry,
  profile: DelveProfile,
  chainDraft: ChainDraft | null,
  unsocket: UnsocketMode | null,
): DraftApply {
  const draft = draftOf(registry, profile, chainDraft);
  const opts: SetChainsOptions = { unsocket: unsocket ?? undefined };
  if (!draft)
    return {
      draft,
      changes: {},
      opts,
      price: null,
      refused: null,
      dry: null,
      pouch: profile.runes,
    };
  // The rules first (a wrong class, a rune the pouch lacks, a uid in two places), on a copy that
  // can pay anything (`draftRefusal` runs `setChains`, which would refuse the price too), then
  // the price on that copy, then the op itself (what Apply can't afford).
  const rich = { ...profile, manaDust: RICH, links: RICH, scrap: RICH };
  const rules = draftRefusal(registry, rich, draft);
  if (rules) {
    // Apply stays off with the rule's reason. A draft that leaves the bag as it is still shows
    // what it would cost (the engine's `draftPrice` on its chains; display only), so a fix such
    // as an element back in the pair reads its price; one that moves the bag reads the rule.
    const priced =
      bagKey(draft.bag) === bagKey(profile.constructs)
        ? draftPrice(registry, profile, draft.chains, opts)
        : { refused: rules };
    const price = 'refused' in priced ? null : priced;
    return {
      draft,
      changes: draft.chains,
      opts,
      price,
      refused: 'refused' in priced ? priced.refused : null,
      dry: { ok: false, profile, reason: rules },
      // Refused, the picker shows the pouch as it is.
      pouch: price?.pouch ?? profile.runes,
    };
  }
  const paid = applyNow(registry, rich, draft, opts);
  const price = paid.ok
    ? priceFromDry(registry, profile, paid.profile, unsocketMode(registry, unsocket) === 'pay')
    : null;
  return {
    draft,
    changes: draft.chains,
    opts,
    price,
    refused: paid.ok ? null : (paid.reason ?? 'Cannot apply'),
    dry: applyNow(registry, profile, draft, opts),
    // Refused, the picker shows the pouch as it is.
    pouch: price?.pouch ?? profile.runes,
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
 * Apply's label with the draft's total, in the words its Price draws: "Apply · 15 Mana Dust ·
 * 2 Links · 40 scrap · destroys Split III". Links are netted (the sockets of moves removed pay
 * for those opened): a refund beyond them reads "+1 Link".
 */
export function applyLabel(registry: DataRegistry, price: DraftPrice | null): string {
  if (!price) return 'Apply';
  const links = price.links - price.refundLinks;
  const n = (x: number) => x.toLocaleString('en-US');
  const linkText = (x: number) => `${n(x)} Link${x === 1 ? '' : 's'}`;
  return [
    'Apply',
    price.dust > 0 ? `${n(price.dust)} Mana Dust` : null,
    links !== 0 ? (links > 0 ? linkText(links) : `+${linkText(-links)}`) : null,
    price.scrap > 0 ? `${n(price.scrap)} scrap` : null,
    price.destroys.length > 0 ? `destroys ${runeNames(registry, price.destroys)}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
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

/** What melting these runes would do with them under `mode` (a confirm's `partsText`); null for none. */
export function pullText(
  registry: DataRegistry,
  runes: readonly RuneRef[],
  mode: UnsocketMode,
): string | null {
  return mode === 'destroy' ? partsText(registry, [], runes) : partsText(registry, runes);
}

/** How long Salvage's Undo is offered (the pad-first spec, 4). */
export const UNDO_MS = 5000;

/** Why Move all, a construct's salvage and any Equip wait: the Skills draft (spec §3.3). */
export const DRAFT_PENDING = SALVAGE_WAITS;

/** The Skills draft holds changes the save doesn't (the ops that commit at once wait on it). */
export function draftPending(s: Pick<DelveStore, 'profile' | 'chainDraft'>): boolean {
  return Object.keys(draftChanges(getDelveRegistry(), s.profile, s.chainDraft)).length > 0;
}

/** A salvage Undo can still take back: the save from before it, the one it made, and the NEW marks it cleared. */
export interface SalvageUndo {
  before: DelveProfile;
  after: DelveProfile;
  newUids: Record<string, true>;
}

interface DelveStore {
  profile: DelveProfile;
  /** Items the player hasn't looked at yet (pulse dot). */
  newUids: Record<string, true>;
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
  /** Runes picked up this dive, newest first (session only). */
  diveRunes: RuneRef[];
  /** Patterns learned this dive (base ids), newest first (session only). */
  divePatterns: string[];
  /**
   * The lengths of `diveDrops` and `diveRunes` when this floor began: the floor's finds are
   * `diveDrops.slice(0, diveDrops.length - floorDropsFrom)` (the Found log, the stop).
   */
  floorDropsFrom: number;
  floorRunesFrom: number;
  /** The length of `divePatterns` when this floor began. */
  floorPatternsFrom: number;
  /** Basic attacks on a button instead of automatic (a device preference). */
  manualAttack: boolean;
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves, a reset save. */
  notices: string[];
  /** Elements whose bind prompt was answered "Not now" this session (never saved). */
  bindDeclined: ManaType[];
  /** The chain builder's unapplied edits (never saved; a dive can't start over them). */
  chainDraft: ChainDraft | null;
  /** Dev builds: the pull rule chosen on the Anvil's chip (null: the balance's). */
  unsocket: UnsocketMode | null;
  /**
   * The last salvage, while Undo can take it back: for `UNDO_MS`, and only while the save is still
   * the one it made (any other commit ends it). Session only.
   */
  undo: SalvageUndo | null;

  setProfile: (profile: DelveProfile) => void;
  /** A new save; with `primary` its mana is already chosen (tests, E2E). */
  resetProfile: (seed?: number, primary?: ManaType) => void;
  /**
   * Start a dive; refused (false) while the chain builder holds unapplied changes, or while
   * Hesta's lesson holds the Delve (`tutorialBlocksDive`).
   */
  startDive: (depth: number) => boolean;
  /**
   * Close the finished (or abandoned) dive (the engine settles an abandoned one); a secondary that
   * has overtaken swaps in, with a notice.
   */
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
  /**
   * Wear a bag item; false, with the `DRAFT_PENDING` notice, while the Skills draft holds changes
   * (spec §3.3: any equip waits, the bind choice's too).
   */
  equip: (uid: string) => boolean;
  unequip: (slot: GearSlot) => void;
  toggleLock: (uid: string) => void;
  /**
   * Melt bag items; what they gave (their runes back to the pouch, or destroyed, by the rule; their
   * shards, patterns and essences: see the crafting spec's Salvage).
   */
  salvage: (uids: string[]) => {
    scrap: number;
    dust: number;
    links: number;
    runes: RuneRef[];
    destroyed: RuneRef[];
    shards: ShardRef[];
    patterns: string[];
    essences: string[];
  };
  /**
   * Take the last salvage back (the pad-first spec, 4): the save as it was before it, whole (its
   * quest and tutorial progress too), and the NEW marks it cleared. A quest toast it queued stays
   * shown (a toast can't be unshown; salvaging again queues it again). False once the offer is gone.
   */
  undoSalvage: () => boolean;
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  /** Forge an item at the bench (see the crafting spec); it comes marked new. */
  forge: (req: ForgeRequest) => ProfileActionResult;
  /** Hone affix line `line` of item `uid`. */
  hone: (uid: string, line: number) => ProfileActionResult;
  /** Imprint `shard` on affix line `line` of item `uid`. */
  imprint: (uid: string, line: number, shard: ShardRef) => ProfileActionResult;
  /** Refine a bar, a flux or a shard into one of the next grade. */
  refine: (what: MaterialRef) => ProfileActionResult;
  /** Buy a tier I shard at the shard bench. */
  buyShard: (stat: HeroStatKey) => ProfileActionResult;
  /** Open a skill on weapon `uid` (the constructs spec §3.2, Awaken's heir): its first slot, bought, for flux, Links and scrap. */
  openSkill: (uid: string, skill: AbilitySlot) => ProfileActionResult;
  /** A new save's Guided start: the script's first step (see the tutorial spec). */
  startTutorial: () => void;
  /** Drop the rails (the confirm is the caller's), and a floor's in progress (`world`). */
  skipTutorial: (world?: ArpgWorld | null) => void;
  /** Off a floor, the events only the tutorial reads: a beat's `ack`, a `skipStep`, Training's cast. */
  tutorialEvents: (events: TutorialEvent[]) => void;
  /** A tutorial death, Abandon or floor restart: the depth as it was entered, its finds forgotten. */
  retryTutorialDepth: () => void;
  /** Claim a completed quest or contract at the Anvil: its rewards to the stockpile (see the quests spec). */
  claimQuest: (id: string) => ProfileActionResult;
  /** Replace a board slot's contract, for scrap, once an Anvil visit. */
  rerollContract: (slot: number) => ProfileActionResult;
  /** Track a quest on the HUD (up to `delve.quests.maxTracked`), or stop. */
  trackQuest: (id: string, on: boolean) => ProfileActionResult;
  /** The journal opened a quest: it is NEW no more. */
  markQuestSeen: (id: string) => void;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  pushDiveRunes: (runes: RuneRef[]) => void;
  pushDivePatterns: (ids: string[]) => void;
  /** Fuse `fuseCount` of a rune and tier into one of the next tier, for scrap (the Forge tab). */
  fuseRunes: (ref: RuneRef) => ProfileActionResult;
  /** Set the equipped weapon's changed chains, for Mana Dust: all or nothing. */
  setChains: (chains: Partial<Chains>) => ProfileActionResult;
  /**
   * Put a chain into the builder's draft (a chain back as it was leaves it), with the bag as the
   * edit leaves it (an unsocket, a place); without `bag` the draft's bag stays (the save's at first).
   */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], bag?: Construct[]) => void;
  /** Pay for the draft and set its chains and bag together (`applyDraft`); a refusal keeps the draft. */
  applyDraft: () => ProfileActionResult;
  /**
   * Melt bag construct `uid` at once (the constructs spec, 3.3): its runes to the pouch at the pull
   * price; refused while the draft has unapplied changes. Undo for `UNDO_MS`, as a salvage
   * (`undoSalvage` takes it back).
   */
  salvageConstruct: (uid: string) => ProfileActionResult & { runes?: RuneRef[] };
  revertDraft: () => void;
  /** Add a slot to a chain of the equipped weapon, for Links and scrap (dropping its draft). */
  addSlot: (skill: ChainSkill) => ProfileActionResult;
  /** Take the stop's boon (`{ kind: 'boon', index }`) or a guided stop's power-up. */
  takeStop: (action: StopAction) => ProfileActionResult;
  setManualAttack: (on: boolean) => void;
  /** Dev builds: choose the pull rule, kept on this device. */
  setUnsocket: (mode: UnsocketMode) => void;
  /**
   * Move every construct of the worn weapon onto bag weapon `uid`, slot for slot, and wear it
   * (spec §3.3 Move all): free; refused while the Skills draft holds changes.
   */
  moveAll: (uid: string) => ProfileActionResult;
}

function withoutUids(map: Record<string, true>, uids: string[]): Record<string, true> {
  const next = { ...map };
  for (const uid of uids) delete next[uid];
  return next;
}

export const useDelveStore = createHmrStore<DelveStore>('delveStore', (set, get) => {
  const commit = (profile: DelveProfile) => {
    saveProfile(profile);
    const prev = get();
    // The chain draft belongs to one weapon and one bag: equipping another (or Move all) drops
    // it, as does any save that changed the bag (a Loadout salvage's constructs; Apply nulls the
    // draft itself) or one made while it holds no change (its bag would go stale).
    const draft = prev?.chainDraft;
    const kept =
      !draft ||
      (profile.equipped.weapon?.uid === draft.uid &&
        profile.constructs === prev.profile.constructs &&
        Object.keys(draft.chains).length > 0);
    // A floor begins (a door taken): its finds are what the dive picks up from here.
    const was = prev?.profile.dive;
    const now = profile.dive;
    const floor =
      prev && now?.phase === 'fighting' && (was?.phase !== 'fighting' || was.depth !== now.depth)
        ? {
            floorDropsFrom: prev.diveDrops.length,
            floorRunesFrom: prev.diveRunes.length,
            floorPatternsFrom: prev.divePatterns.length,
          }
        : {};
    // Quest progress that finished an objective or a quest becomes a toast, whichever op saved it
    // (a bank included).
    const done = prev
      ? questNotices(getDelveRegistry().getQuestsData().quests, prev.profile.quests, profile.quests)
      : [];
    const notices = done.length > 0 ? { notices: [...prev.notices, ...done] } : {};
    // Salvage's Undo holds only while the save is the one the salvage made.
    const undo = prev?.undo && prev.undo.after !== profile ? { undo: null } : {};
    set(
      kept
        ? { profile, ...floor, ...notices, ...undo }
        : { profile, ...floor, ...notices, ...undo, chainDraft: null },
    );
  };
  const registry = () => getDelveRegistry();
  const applyResult = (res: ProfileActionResult) => {
    if (res.ok) commit(res.profile);
    return res;
  };
  const notify = (text: string) => set({ notices: [...get().notices, text] });
  // The pull rule for the ops whose parts can return or destroy a rune.
  const pull = () => pullOpts(get());
  /** Something melted: Undo may take it back for UNDO_MS (`cleared`: the NEW marks it took). */
  const offerUndo = (before: DelveProfile, cleared: Record<string, true> = {}) => {
    const undo: SalvageUndo = { before, after: get().profile, newUids: cleared };
    set({ undo });
    setTimeout(() => {
      if (get().undo === undo) set({ undo: null });
    }, UNDO_MS);
  };

  const loaded = loadDelveProfile();
  // A save of another version starts afresh (no migrations), with a notice; either is written back at once.
  const profile =
    loaded && 'profile' in loaded
      ? loaded.profile
      : createDelveProfile(getDelveRegistry(), freshSeed());
  if (loaded) saveProfile(profile);

  return {
    profile,
    newUids: {},
    diveDrops: [],
    diveRunes: [],
    divePatterns: [],
    floorDropsFrom: 0,
    floorRunesFrom: 0,
    floorPatternsFrom: 0,
    manualAttack: loadManualAttack(),
    notices: loaded && 'reset' in loaded ? [RESET_NOTICE] : [],
    bindDeclined: [],
    chainDraft: null,
    unsocket: loadUnsocket(),
    undo: null,

    setProfile: (profile) => commit(profile),

    resetProfile: (seed, primary) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));
      set({
        newUids: {},
        diveDrops: [],
        diveRunes: [],
        divePatterns: [],
        floorDropsFrom: 0,
        floorRunesFrom: 0,
        floorPatternsFrom: 0,
        notices: [],
        bindDeclined: [],
        chainDraft: null,
        undo: null,
      });
    },

    startDive: (depth) => {
      const { profile, chainDraft } = get();
      // A dive locks the chains: a pending draft is applied or discarded first, never dropped.
      if (Object.keys(draftChanges(registry(), profile, chainDraft)).length > 0) return false;
      if (tutorialBlocksDive(registry(), profile)) return false;
      commit(engineStartDive(registry(), profile, depth));
      set({
        diveDrops: [],
        diveRunes: [],
        divePatterns: [],
        floorDropsFrom: 0,
        floorRunesFrom: 0,
        floorPatternsFrom: 0,
        chainDraft: null,
      });
      return true;
    },

    closeDive: () => {
      const res = resolveOvertake(registry(), engineCloseDive(registry(), get().profile));
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
      // A dive locks the chains and so does an unapplied draft: Apply or discard it first.
      if (draftPending(get())) {
        notify(DRAFT_PENDING);
        return false;
      }
      commit(equipItem(registry(), get().profile, uid));
      set({ newUids: withoutUids(get().newUids, [uid]) });
      // The Loadout's onboarding hint is done, by whichever control equipped (features/delve/onboarding.ts).
      useUIStore.getState().markSeen('loadout');
      return true;
    },

    unequip: (slot) => commit(unequipSlot(registry(), get().profile, slot)),

    toggleLock: (uid) => commit(toggleLock(get().profile, uid)),

    salvage: (uids) => {
      const { profile: before, newUids } = get();
      const res = salvageItems(registry(), before, uids, pull());
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      if (res.profile.bag.length < before.bag.length)
        offerUndo(
          before,
          Object.fromEntries(uids.filter((u) => newUids[u]).map((u) => [u, true as const])),
        );
      const { scrap, dust, links, runes, destroyed, shards, patterns, essences } = res;
      return { scrap, dust, links, runes, destroyed, shards, patterns, essences };
    },

    undoSalvage: () => {
      const { undo, profile } = get();
      if (!undo || profile !== undo.after) return false;
      commit(undo.before);
      set({ newUids: { ...get().newUids, ...undo.newUids }, undo: null });
      return true;
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

    forge: (req) => {
      const res = applyResult(engineForge(registry(), get().profile, req));
      if (res.ok && res.item) set({ newUids: { ...get().newUids, [res.item.uid]: true } });
      return res;
    },

    hone: (uid, line) => applyResult(engineHone(registry(), get().profile, uid, line)),

    imprint: (uid, line, shard) =>
      applyResult(engineImprint(registry(), get().profile, uid, line, shard)),

    refine: (what) => applyResult(engineRefine(registry(), get().profile, what)),

    buyShard: (stat) => applyResult(engineBuyShard(registry(), get().profile, stat)),

    startTutorial: () => commit(engineStartTutorial(registry(), get().profile)),

    skipTutorial: (world) => commit(engineSkipTutorial(get().profile, world)),

    tutorialEvents: (events) => commit(applyTutorialEvents(registry(), get().profile, events)),

    retryTutorialDepth: () => {
      commit(engineRetryTutorialDepth(registry(), get().profile));
      // The floor's finds went with it: the Found log and the stop keep the dive's from before.
      const { diveDrops, diveRunes, divePatterns } = get();
      const { floorDropsFrom, floorRunesFrom, floorPatternsFrom } = get();
      set({
        diveDrops: diveDrops.slice(diveDrops.length - floorDropsFrom),
        diveRunes: diveRunes.slice(diveRunes.length - floorRunesFrom),
        divePatterns: divePatterns.slice(divePatterns.length - floorPatternsFrom),
      });
    },

    claimQuest: (id) => applyResult(engineClaimQuest(registry(), get().profile, id)),

    rerollContract: (slot) => applyResult(engineRerollContract(registry(), get().profile, slot)),

    trackQuest: (id, on) => applyResult(engineTrackQuest(registry(), get().profile, id, on)),

    markQuestSeen: (id) => commit(engineMarkQuestSeen(registry(), get().profile, id)),

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
      const all = [...uids.slice().reverse(), ...get().diveDrops];
      // The oldest fall off the end, and the floor's mark moves back with them.
      const cut = Math.max(0, all.length - 60);
      set({
        diveDrops: all.slice(0, 60),
        floorDropsFrom: Math.max(0, get().floorDropsFrom - cut),
      });
    },

    pushDiveRunes: (runes) => {
      if (runes.length === 0) return;
      const all = [...runes.slice().reverse(), ...get().diveRunes];
      const cut = Math.max(0, all.length - 60);
      set({
        diveRunes: all.slice(0, 60),
        floorRunesFrom: Math.max(0, get().floorRunesFrom - cut),
      });
    },

    pushDivePatterns: (ids) => {
      if (ids.length > 0) set({ divePatterns: [...ids.slice().reverse(), ...get().divePatterns] });
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

    editDraft: (skill, chain, bag) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const live = draftFits(profile, chainDraft) ? chainDraft : null;
      const next: ChainDraft = {
        uid: weapon.uid,
        pair: profile.pair,
        chains: { ...draftChanges(registry(), profile, chainDraft), [skill]: chain },
        bag: bag ?? live?.bag ?? profile.constructs,
      };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      set({ chainDraft: { ...next, chains: draftChanges(registry(), profile, next) } });
    },

    applyDraft: () => {
      const { profile, chainDraft } = get();
      const draft = draftOf(registry(), profile, chainDraft) ?? {
        chains: {},
        bag: profile.constructs,
      };
      const res = applyResult(applyNow(registry(), profile, draft, pull()));
      if (res.ok) set({ chainDraft: null });
      return res;
    },

    revertDraft: () => set({ chainDraft: null }),

    fuseRunes: (ref) => applyResult(engineFuseRunes(registry(), get().profile, ref)),

    addSlot: (skill) => {
      const res = applyResult(engineAddSlot(registry(), get().profile, skill));
      // A chain's draft was made on fewer slots: the draft goes (the lane holds Add slot off while
      // that chain has a change, so this is the store's own guard).
      if (res.ok && get().chainDraft?.chains[skill]) set({ chainDraft: null });
      return res;
    },

    takeStop: (action) => {
      const res = applyResult(engineTakeStop(registry(), get().profile, action));
      if (res.ok && action.kind === 'equip')
        set({ newUids: withoutUids(get().newUids, [action.uid]) });
      return res;
    },

    // ── Constructs (the constructs spec §3.3): the ops that commit at once. C1 owns the draft above. ──

    moveAll: (uid) => {
      const { profile } = get();
      if (draftPending(get())) return { ok: false, profile, reason: DRAFT_PENDING };
      const res = applyResult(engineMoveAll(registry(), profile, uid));
      if (res.ok) {
        set({ newUids: withoutUids(get().newUids, [uid]) });
        useUIStore.getState().markSeen('loadout');
      }
      return res;
    },

    salvageConstruct: (uid) => {
      const { profile: before } = get();
      if (draftPending(get())) return { ok: false, profile: before, reason: DRAFT_PENDING };
      const res = applyResult(engineSalvageConstruct(registry(), before, uid, pull()));
      if (res.ok) offerUndo(before);
      return res;
    },

    openSkill: (uid, skill) => applyResult(engineOpenSkill(registry(), get().profile, uid, skill)),
  };
});
