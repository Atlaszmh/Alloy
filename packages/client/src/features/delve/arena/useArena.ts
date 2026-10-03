import { useMemo, useRef, type RefObject } from 'react';
import {
  alcoveOffers,
  bankWorld,
  beginFloor,
  compareItem,
  completeFloor,
  emptyHaul,
  exitFloor,
  failFloor,
  heroChains,
  takeAlcove,
  takeBestAlcove,
  type DataRegistry,
  profileStats,
  type ArpgEvent,
  type ArpgWorld,
  type DiveState,
  type GearItem,
  type Haul,
  type ProfileActionResult,
  type ReactionId,
  type StopAction,
  type StopKind,
  type WorldPending,
} from '@alloy/engine';
import { pullOpts, useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { UPGRADE_EPSILON } from '../format';
import { readArenaFlags, useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
import type { Insets } from './camera';

export {
  snapshot,
  type AbilityHud,
  type ArenaHud,
  type HudBuff,
  type HudMap,
  type Insets,
} from './useArenaCore';

/**
 * The dive, on the shared arena core: it runs the save's current floor, banks
 * pickups into the save as they happen, and hands floor clears and deaths back
 * to the dive state machine. Rules stay in the engine: this only times and routes.
 */

export type ArenaUiEvent =
  | CoreUiEvent
  | { kind: 'loot'; kept: GearItem[]; salvaged: GearItem[]; bagFull: boolean }
  | { kind: 'legendary'; item: GearItem; firstTime: boolean }
  | { kind: 'reaction'; reaction: ReactionId }
  /** Patterns picked up: learned as they bank (base ids). */
  | { kind: 'patterns'; ids: string[] }
  /** `haul`: the floor's haul as the clear banked it (the stop's "Found this floor"). */
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean; haul: Haul }
  | { kind: 'fell' }
  /** The exit gate asks (a generated floor): `unexplored` rooms are left. */
  | { kind: 'exitRequest'; unexplored: number }
  /** An anvil alcove opened: its power-ups (`alcoveOffers`), the arena to pause under them. */
  | { kind: 'alcove'; offers: StopKind[] };

const END_DELAY = 1.3;

/** How often materials and scrap bank at most, seconds: the HUD's refresh. */
export const BANK_EVERY = 0.08;

/**
 * Whether the dive banks what `pending` holds now, `since` seconds after its last bank: an
 * item, a rune, a pattern, an essence or a reaction not in `seen` (the save's `reactionsSeen`) at
 * once (a pattern is learned, an essence and a reaction seen as it comes); materials and scrap (the
 * floor's haul, which the purse and the Found log show as it grows), quest events (a kill, a
 * perfect dodge: the HUD tracker moves at each bank) and known reactions at most every
 * `BANK_EVERY`, since each bank writes the save and re-renders the run. A kill count alone waits
 * for the next. The floor's end, a death, an abandon and the pause's Anvil bank whatever waits.
 */
export function banksNow(
  pending: WorldPending,
  since: number,
  seen: readonly string[] = [],
): boolean {
  const { items, reactions, runes, patterns, haul, scrap, questEvents } = pending;
  if (items.length + runes.length + patterns.length > 0) return true;
  if (reactions.some((r) => !seen.includes(r))) return true;
  if (Object.keys(haul.essences).length > 0) return true;
  const some = (counts: readonly number[]) => counts.some((n) => n > 0);
  const held =
    scrap + haul.dust + haul.links + questEvents.length + reactions.length > 0 ||
    some(Object.values(haul.metals)) ||
    some(Object.values(haul.flux)) ||
    some(Object.values(haul.shards).flatMap((tiers) => tiers ?? []));
  return held && since >= BANK_EVERY;
}

/**
 * A cleared floor: what waits banks first (`bank`), so the stop's "Found this floor" holds it, then
 * the clear runs on the save that bank left (`completeFloor`). Returns its result and that haul.
 */
export function clearFloor(
  registry: DataRegistry,
  world: ArpgWorld,
  bank: (world: ArpgWorld) => void,
): { res: ReturnType<typeof completeFloor>; haul: Haul } {
  bank(world);
  const store = useDelveStore.getState();
  const haul = store.profile.dive?.haul ?? emptyHaul();
  const res = completeFloor(registry, store.profile, world, pullOpts(store));
  store.setProfile(res.profile);
  store.pushDiveDrops(res.kept.map((i) => i.uid));
  store.pushDiveRunes(res.runes);
  return { res, haul };
}

/**
 * Whether the floor is over: the hero fell, took the exit (a generated floor), or cleared the open
 * room and its loot is picked up (or 2.5 s passed).
 */
export function floorOver(world: ArpgWorld): boolean {
  return (
    world.heroDead ||
    world.exited ||
    (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5))
  );
}

/**
 * A generated floor's requests (see the floor maps spec). The gate's `exitRequest`: the page
 * confirms it, the autopilot takes the exit at once (`exitFloor`). An alcove's `alcoveOpen`: what
 * waits banks first, so its offers (`alcoveOffers`) are priced on the save, then the page opens
 * them (none affordable: no dialog, a notice instead); the autopilot takes the bot's pick at once
 * (`takeBestAlcove`).
 */
export function routeFloorEvents(
  registry: DataRegistry,
  world: ArpgWorld,
  events: readonly ArpgEvent[],
  opts: { autopilot: boolean; bank: (world: ArpgWorld) => void; onUi: (e: ArenaUiEvent) => void },
): void {
  for (const e of events) {
    if (e.kind === 'exitRequest') {
      if (opts.autopilot) exitFloor(world);
      else opts.onUi({ kind: 'exitRequest', unexplored: e.roomsUnexplored });
    } else if (e.kind === 'alcoveOpen') {
      opts.bank(world);
      const { profile, setProfile } = useDelveStore.getState();
      if (opts.autopilot) {
        setProfile(takeBestAlcove(registry, profile, world, e.id));
        continue;
      }
      const offers = alcoveOffers(registry, profile, world, e.id);
      if (offers.length > 0) opts.onUi({ kind: 'alcove', offers });
      else
        useDelveStore.setState((s) => ({ notices: [...s.notices, 'Nothing to forge here yet'] }));
    }
  }
}

/**
 * Take an alcove's power-up: what waits banks first (`bank`), then `takeAlcove` runs on the save
 * that bank left, and the save keeps what it gives.
 */
export function alcoveTake(
  registry: DataRegistry,
  world: ArpgWorld,
  action: StopAction,
  bank: (world: ArpgWorld) => void,
): ProfileActionResult {
  bank(world);
  const store = useDelveStore.getState();
  const res = takeAlcove(registry, store.profile, world, action);
  if (res.ok) store.setProfile(res.profile);
  return res;
}

/**
 * The arena's world key: a floor under way. Only while fighting, so the finished floor stays on
 * screen behind the doors or the summary; and not once the dive has settled, so after an abandon
 * mid-floor a dive again at that depth starts a fresh floor.
 */
export function diveWorldKey(dive: DiveState | null): string | null {
  return dive?.phase === 'fighting' && !dive.settled ? `fighting:${dive.depth}` : null;
}

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    /** The screen the HUD covers (viewport px), from `HudGrid`. */
    insets: Insets;
    onUi: (e: ArenaUiEvent) => void;
    /** Basic attacks on a button (held or tapped) instead of automatic. */
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const onUiRef = useRef(opts.onUi);
  onUiRef.current = opts.onUi;
  const endAtRef = useRef<number | null>(null);
  // Under "ask" the page answers the gate and the alcove as for a player.
  const autopilot = useMemo(() => {
    const flags = readArenaFlags();
    return flags.autopilot && !flags.ask;
  }, []);
  /** When the dive last banked (performance.now() seconds). */
  const bankedAtRef = useRef(-Infinity);
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [equipped, pair, registry]);
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);

  function bank(world: ArpgWorld) {
    bankedAtRef.current = performance.now() / 1000;
    const store = useDelveStore.getState();
    const res = bankWorld(registry, store.profile, world, pullOpts(store));
    store.setProfile(res.profile);
    store.pushDiveDrops(res.kept.map((i) => i.uid));
    store.pushDiveRunes(res.runes);
    store.pushDivePatterns(res.patterns);
    store.markNew(res.kept.map((i) => i.uid));
    if (res.patterns.length > 0) onUiRef.current({ kind: 'patterns', ids: res.patterns });
    if (res.kept.length + res.salvaged.length > 0) {
      onUiRef.current({
        kind: 'loot',
        kept: res.kept,
        salvaged: res.salvaged,
        bagFull: res.bagFull,
      });
    }
    for (const item of [...res.kept, ...res.salvaged]) {
      if (item.rarity === 'legendary') {
        onUiRef.current({
          kind: 'legendary',
          item,
          firstTime: !!item.legendary && res.newCodex.includes(item.legendary.id),
        });
      }
    }
    for (const r of res.newReactions) onUiRef.current({ kind: 'reaction', reaction: r });
  }

  /** The clear timers and, after a death, the END_DELAY beat; true once the floor has ended. */
  function checkEnd(world: ArpgWorld): boolean {
    if (!floorOver(world)) return false;
    const now = performance.now() / 1000;
    endAtRef.current ??= now;
    // A death waits its beat and a clear 0.4 s; the exit goes at once.
    const wait = world.heroDead ? END_DELAY : world.exited ? 0 : 0.4;
    if (now - endAtRef.current < wait) return false;
    const store = useDelveStore.getState();
    if (world.heroDead) {
      const res = failFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
      onUiRef.current({ kind: 'fell' });
    } else {
      const { res, haul } = clearFloor(registry, world, bank);
      onUiRef.current({
        kind: 'cleared',
        bountyAdded: res.bountyAdded,
        bossKilled: res.bossKilled,
        haul,
      });
    }
    return true;
  }

  const mode: ArenaMode = {
    worldKey: diveWorldKey(profile.dive),
    createWorld: () => {
      endAtRef.current = null;
      return beginFloor(registry, useDelveStore.getState().profile);
    },
    loadout,
    frame: (world) => {
      const since = performance.now() / 1000 - bankedAtRef.current;
      const { reactionsSeen } = useDelveStore.getState().profile;
      if (banksNow(world.pending, since, reactionsSeen)) bank(world);
      return checkEnd(world);
    },
    onEvents: (world, events) =>
      routeFloorEvents(registry, world, events, { autopilot, bank, onUi: onUiRef.current }),
    onHeroDead: () => {},
    speed: 1,
    // ▲ on a loot label: better as it comes, as the bag's tiles count it.
    isUpgrade: (item) => {
      const p = useDelveStore.getState().profile;
      const value = compareItem(p.equipped, item, registry, p.dive?.depth ?? 0, p.pair, 'asIs');
      return value.powerPct > UPGRADE_EPSILON;
    },
  };
  const core = useArenaCore(hostRef, mode, opts);
  /**
   * Bank whatever the floor under way picked up since the last bank (before an abandon settles it,
   * or the pause's Anvil restarts the floor).
   */
  const flush = () => {
    const world = core.worldRef.current;
    const dive = useDelveStore.getState().profile.dive;
    if (world && dive?.phase === 'fighting' && !dive.settled) bank(world);
  };
  /** The exit confirm's Leave: `world.exited`, and the next frame ends the floor (`checkEnd`). */
  const leave = () => {
    const world = core.worldRef.current;
    if (world) exitFloor(world);
  };
  /** The alcove dialog's take (`alcoveTake`). */
  const alcove = (action: StopAction): ProfileActionResult => {
    const world = core.worldRef.current;
    if (world) return alcoveTake(registry, world, action, bank);
    return { ok: false, profile: useDelveStore.getState().profile, reason: 'No floor under way' };
  };
  return { ...core, flush, leave, alcove };
}
