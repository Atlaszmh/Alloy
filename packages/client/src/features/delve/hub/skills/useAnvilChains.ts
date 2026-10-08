import { useMemo } from 'react';
import { create } from 'zustand';
import {
  CHAIN_SKILLS,
  MAX_SOCKETS,
  UNARMED,
  addSlot,
  ceilingOf,
  formAllowed,
  heroChains,
  isDiveActive,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  slotPrice,
  slotRange,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
  type Chains,
  type Construct,
  type DataRegistry,
  type EquippedGear,
  type GearItem,
} from '@alloy/engine';
import { applyNow, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { RARITY_LABEL } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import type { ChainEditorProps, ChainRunes } from '../../chains/ChainEditor';

/** The last refused Apply, Add slot or Place, in the engine's words (the lane's message line); null once one goes through. */
export const useChainMessage = create<{ text: string | null }>(() => ({ text: null }));

/** Say a builder op's refusal on the lane, or clear it when the op went through. */
export function sayRefusal(res: { ok: boolean; reason?: string }, fallback: string): void {
  useChainMessage.setState({ text: res.ok ? null : (res.reason ?? fallback) });
}

/**
 * The worn gear with the weapon holding `chains` over its own (the builder's: the draft's chains
 * over the saved ones): what the builder's stats resolve against, and what Try in Training loads
 * into the sandbox. Unarmed, the gear as worn.
 */
export function draftEquipped(
  registry: DataRegistry,
  equipped: EquippedGear,
  chains: Partial<Chains>,
): EquippedGear {
  const weapon = equipped.weapon;
  if (!weapon) return equipped;
  const moveset = movesetOf(registry, weapon);
  return {
    ...equipped,
    weapon: { ...weapon, moveset: { ...moveset, chains: { ...moveset.chains, ...chains } } },
  };
}

/**
 * Why construct `c` is dormant on `weapon` (the constructs spec, 3.1): its form is outside the
 * weapon's class, worded as the engine refuses a place ("A bow can't express Strike"); null when
 * it plays. A blow always plays (its runes may not: the socket marks say so).
 */
export function cantExpress(registry: DataRegistry, weapon: GearItem, c: Construct): string | null {
  if (!('form' in c) || formAllowed(registry, weapon.baseId, c.form)) return null;
  const name = registry.getGearBase(weapon.baseId).name.toLowerCase();
  return `A ${name} can't express ${registry.getForm(c.form).name}`;
}

/** The line a skill with no chain shows: unarmed, no slot at this rarity, or Open a skill. */
export function absentText(registry: DataRegistry, weapon: GearItem | null, s: ChainSkill): string {
  if (!weapon) return 'Equip a weapon to build your moves.';
  if (ceilingOf(registry, weapon, s) === 0)
    return `No ${SKILL_NAME[s]} slot on a ${RARITY_LABEL[weapon.rarity].toLowerCase()} weapon`;
  return `No ${SKILL_NAME[s]} slot yet: Open a skill on the Forge's Temper bench`;
}

/** The Anvil's chain builder: its props, and the slots the equipped weapon sells. */
export interface AnvilChains {
  /** `useChainEditor`'s props, bound to the store's draft of the weapon's moveset and the bag. */
  editor: ChainEditorProps;
  weapon: GearItem | null;
  /** The weapon's own chains, every construct (the uid diff's saved side); unarmed, the default. */
  saved: Partial<Chains>;
  /** The skills the draft changes. */
  changed: Partial<Chains>;
  /** The bag as the draft sees it (the save's with nothing pending). */
  bag: Construct[];
  /** A chain's next slot: its price (null: none to buy), and why it can't be bought now. */
  slotOffer: (skill: ChainSkill) => {
    price: { links: number; scrap: number } | null;
    why: string | null;
  };
  buySlot: (skill: ChainSkill) => void;
}

/**
 * The Anvil's workshop: the equipped weapon's chains and the move bag, edited as a draft (kept
 * in the store, so it outlives the tab) that Apply pays for, all or nothing, or Revert drops;
 * each chain's slots against its ceiling, with the next slot's price; each construct's sockets
 * and runes, which the draft carries too. Read-only while a dive is under way, and unarmed (the
 * unarmed default shows).
 */
export function useAnvilChains(): AnvilChains {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  // The weapon's own chains, dormant constructs included; unarmed the bare hands' default.
  const saved = useMemo(
    () => (weapon ? movesetOf(registry, weapon).chains : heroChains(registry, equipped, pair)),
    [registry, weapon, equipped, pair],
  );
  // The draft against the weapon: the skills it changes, its bag, Apply's options, the engine's
  // dry run and the pouch it leaves; and the chains shown.
  const view = useDelveStore(selectDraftApply);
  const changed = view.changes;
  const bag = view.draft?.bag ?? profile.constructs;
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Each skill's slots and ceiling: the weapon's, or unarmed the bare hands' (the basic string, no ability slot).
  const slots = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [
      s,
      weapon ? (movesetOf(registry, weapon).slots[s] ?? 0) : slotRange(registry, UNARMED, s)[0],
    ]),
  ) as Partial<Record<ChainSkill, number>>;
  const ceilings = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [s, ceilingOf(registry, weapon ?? UNARMED, s)]),
  ) as Partial<Record<ChainSkill, number>>;
  const stats = useMemo(
    () => profileStats(registry, { pair, equipped: draftEquipped(registry, equipped, chains) }),
    [registry, equipped, pair, chains],
  );
  const elements = pairElements(pair);
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets: the pouch the draft leaves, the cap (every construct's), the price by
  // index, the pull rule's text, and the engine's dry run with one more socket on a move: why
  // "+ socket" is off (a draft already refused says so itself).
  const runes: ChainRunes | undefined = weapon
    ? {
        pouch: view.pouch,
        socketCap: MAX_SOCKETS,
        socketPrice: (open) => socketPrice(registry, open),
        weaponBaseId: weapon.baseId,
        pullText: (r) =>
          mode === 'destroy'
            ? 'Pull · destroys it'
            : `Pull · ${pullScrap[r.tier - 1]} scrap, back to your pouch`,
        openWhy: (skill, index) => {
          const chain = chains[skill];
          if (!chain || view.refused) return null;
          const m = movesOf(chain)[index];
          if (!m) return null;
          const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
          const draft = { chains: { ...changed, [skill]: next }, bag };
          // Apply's own op, dry (the rules, then the price: "Not enough Links"), so the row agrees
          // with what Apply would do, B2's placeholder fallback included.
          // ponytail: computed on each render of the editor; memoise per (skill, index) on
          // `draft` if the editor feels slow once B2's op is real.
          const dry = applyNow(registry, profile, draft, view.opts);
          return dry.ok ? null : (dry.reason ?? null);
        },
      }
    : undefined;

  return {
    editor: {
      chains,
      caps: slots,
      ceilings,
      bag,
      dormantText: weapon ? (c) => cantExpress(registry, weapon, c) : undefined,
      stats,
      locked: isDiveActive(profile) || !weapon,
      lockedText: weapon ? undefined : 'Equip a weapon to build your moves.',
      absentText: (s) => absentText(registry, weapon ?? null, s),
      onChange: (skill, chain, next) => useDelveStore.getState().editDraft(skill, chain, next),
      elements: elements.length > 0 ? elements : undefined,
      runes,
    },
    weapon: weapon ?? null,
    saved,
    changed,
    bag,
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
