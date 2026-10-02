import { useMemo, useRef, type RefObject } from 'react';
import {
  bankWorld,
  beginFloor,
  completeFloor,
  failFloor,
  heroChains,
  profileStats,
  type ArpgWorld,
  type GearItem,
  type ReactionId,
} from '@alloy/engine';
import { pullOpts, useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
import type { Insets } from './camera';

export { snapshot, type AbilityHud, type ArenaHud } from './useArenaCore';

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
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean }
  | { kind: 'fell' };

const END_DELAY = 1.3;

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    /** The HUD's insets; until the 3a page passes all four, the sides default to 0. */
    insets: Pick<Insets, 'top' | 'bottom'> & Partial<Insets>;
    onUi: (e: ArenaUiEvent) => void;
    /** Basic attacks on a button (held or tapped) instead of automatic. */
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const phase = profile.dive?.phase ?? null;
  const depth = profile.dive?.depth ?? 0;
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
      const res = completeFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      store.pushDiveRunes(res.runes);
      onUiRef.current({
        kind: 'cleared',
        bountyAdded: res.bountyAdded,
        bossKilled: res.bossKilled,
      });
    }
    return true;
  }

  const mode: ArenaMode = {
    // Only while fighting: the finished floor stays on screen behind the doors or the summary.
    worldKey: phase === 'fighting' ? `fighting:${depth}` : null,
    createWorld: () => {
      endAtRef.current = null;
      return beginFloor(registry, useDelveStore.getState().profile);
    },
    loadout,
    frame: checkEnd,
    onEvents: (world) => {
      const { items, reactions, runes } = world.pending;
      if (items.length + reactions.length + runes.length > 0) bank(world);
    },
    onHeroDead: () => {},
    speed: 1,
  };
  return useArenaCore(hostRef, mode, { ...opts, insets: { left: 0, right: 0, ...opts.insets } });
}
