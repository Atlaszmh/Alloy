import { useMemo } from 'react';
import { create } from 'zustand';
import {
  CHAIN_SKILLS,
  addSlot,
  baseSlots,
  carriedByText,
  heroChains,
  isDiveActive,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  setChains,
  slotPrice,
  socketCap,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
  type Chains,
  type GearItem,
} from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from '../../registry';
import type { ChainEditorProps, ChainRunes } from '../../chains/ChainEditor';

/** The last refused Apply or Add slot, in the engine's words (the lane's message line); null once one goes through. */
export const useChainMessage = create<{ text: string | null }>(() => ({ text: null }));

/** Say a builder op's refusal on the lane, or clear it when the op went through. */
export function sayRefusal(res: { ok: boolean; reason?: string }, fallback: string): void {
  useChainMessage.setState({ text: res.ok ? null : (res.reason ?? fallback) });
}

/** The Anvil's chain builder: its props, and the slots the equipped weapon sells. */
export interface AnvilChains {
  /** `useChainEditor`'s props, bound to the store's draft of the weapon's moveset. */
  editor: ChainEditorProps;
  weapon: GearItem | null;
  /** The skills the draft changes. */
  changed: Partial<Chains>;
  /** A chain's next slot: its price (null: none to buy), and why it can't be bought now. */
  slotOffer: (skill: ChainSkill) => {
    price: { links: number; scrap: number } | null;
    why: string | null;
  };
  buySlot: (skill: ChainSkill) => void;
}

/**
 * The Anvil's workshop: the equipped weapon's chains, edited as a draft (kept
 * in the store, so it outlives the tab) that Apply pays for, all or nothing,
 * or Revert drops; each chain's slots, with the next slot's price; each move's
 * sockets and runes, which the draft carries too. Read-only while a dive is
 * under way, and unarmed (the unarmed default shows).
 */
export function useAnvilChains(): AnvilChains {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // The draft against the weapon: the skills it changes, Apply's options, the engine's dry run
  // and the pouch it leaves; and the chains shown.
  const view = useDelveStore(selectDraftApply);
  const changed = view.changes;
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  const elements = pairElements(pair);
  const applying = view.dry;
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets: the pouch the draft leaves, the rarity's cap, the price by index, the
  // pull rule's text, and the engine's own op run dry with one more socket on a move: why
  // "+ socket" is off (a draft Apply already refuses says so itself).
  const runes: ChainRunes | undefined = weapon
    ? {
        pouch: view.pouch,
        socketCap: socketCap(registry, weapon.rarity),
        socketPrice: (open) => socketPrice(registry, open),
        weaponBaseId: weapon.baseId,
        pullText: (r) =>
          mode === 'destroy'
            ? 'Pull · destroys it'
            : `Pull · ${pullScrap[r.tier - 1]} scrap, back to your pouch`,
        openWhy: (skill, index) => {
          const chain = chains[skill];
          if (!chain || (applying && !applying.ok)) return null;
          const m = movesOf(chain)[index];
          const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
          const res = setChains(registry, profile, { ...changed, [skill]: next }, view.opts);
          return res.ok ? null : (res.reason ?? null);
        },
      }
    : undefined;

  return {
    editor: {
      chains,
      caps: slots,
      stats,
      locked: isDiveActive(profile) || !weapon,
      lockedText: weapon ? undefined : 'Equip a weapon to build your moves.',
      absentText: (s) => carriedByText(registry, s),
      onChange: (skill, chain, map) => useDelveStore.getState().editDraft(skill, chain, map),
      elements: elements.length > 0 ? elements : undefined,
      runes,
    },
    weapon: weapon ?? null,
    changed,
    slotOffer: (skill) => {
      const price = weapon ? slotPrice(registry, weapon, skill) : null;
      // Why the slot can't be bought, in the engine's words (a dry run of its op). It adds to
      // the saved chain, so a chain with changes waits for them.
      const dry = price && !changed[skill] ? addSlot(registry, profile, skill) : null;
      const why = !price
        ? null
        : changed[skill]
          ? 'Apply or revert this chain first'
          : dry && !dry.ok
            ? (dry.reason ?? null)
            : null;
      return { price, why };
    },
    buySlot: (skill) => {
      const res = useDelveStore.getState().addSlot(skill);
      playSound(res.ok ? 'upgradeTier' : 'combineFail');
      sayRefusal(res, 'Cannot add a slot');
    },
  };
}
