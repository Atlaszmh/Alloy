import { useMemo, useRef, type RefObject } from 'react';
import {
  bankWorld,
  beginFloor,
  compareItem,
  completeFloor,
  emptyHaul,
  failFloor,
  heroChains,
  profileStats,
  type ArpgEvent,
  type ArpgWorld,
  type DiveState,
  type GearItem,
  type Haul,
  type ReactionId,
} from '@alloy/engine';
import { pullOpts, useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { UPGRADE_EPSILON } from '../format';
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
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
  /** `haul`: the floor's haul as the clear banked it (the stop's "Found this floor"). */
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean; haul: Haul }
  | { kind: 'fell' };

const END_DELAY = 1.3;

/**
 * Whether a frame banks now: an item, a rune or a reaction is waiting, or a material or scrap was
 * picked up (they ride the floor's haul, which the purse and the Found log show as it grows).
 */
export function banksNow(world: ArpgWorld, events: readonly ArpgEvent[]): boolean {
  const { items, reactions, runes } = world.pending;
  return (
    items.length + reactions.length + runes.length > 0 ||
    events.some((e) => e.kind === 'pickup' && (e.dropKind === 'material' || e.dropKind === 'scrap'))
  );
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
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [equipped, pair, registry]);
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);

  function bank(world: ArpgWorld) {
    const store = useDelveStore.getState();
    const res = bankWorld(registry, store.profile, world, pullOpts(store));
    store.setProfile(res.profile);
    store.pushDiveDrops(res.kept.map((i) => i.uid));
    store.pushDiveRunes(res.runes);
    store.markNew(res.kept.map((i) => i.uid));
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
    const done =
      world.heroDead ||
      (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5));
    if (!done) return false;
    const now = performance.now() / 1000;
    endAtRef.current ??= now;
    if (now - endAtRef.current < (world.heroDead ? END_DELAY : 0.4)) return false;
    const store = useDelveStore.getState();
    if (world.heroDead) {
      const res = failFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
      onUiRef.current({ kind: 'fell' });
    } else {
      const haul = store.profile.dive?.haul ?? emptyHaul();
      const res = completeFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      store.pushDiveRunes(res.runes);
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
    frame: checkEnd,
    onEvents: (world, events) => {
      if (banksNow(world, events)) bank(world);
    },
    onHeroDead: () => {},
    speed: 1,
    // ▲ on a loot label: better as it comes, as the bag's tiles count it.
    isUpgrade: (item) => {
      const p = useDelveStore.getState().profile;
      const value = compareItem(p.equipped, item, registry, p.dive?.depth ?? 0, p.pair, 'asIs');
      return value.powerPct > UPGRADE_EPSILON;
    },
  };
  return useArenaCore(hostRef, mode, opts);
}
