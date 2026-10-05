// The Anvil hub's shared contract (the spec's "Shared contract (the hub)"). Each area's tab
// (LoadoutTab, SkillsTab, ForgeTab, CodexTab, QuestsTab) takes HubTabProps.
import type { ReactNode } from 'react';
import type { ChainSkill } from '@alloy/engine';
import type { Prompt } from '../kit/types';

export type HubMode = 'anvil' | 'pause';
export type HubTab = 'loadout' | 'skills' | 'forge' | 'codex' | 'quests';
/** The bag's filters (the Loadout's LT/RT). */
export type BagFilter = 'all' | 'weapons' | 'armor' | 'jewelry' | 'upgrades';
/** The Forge tab's benches (LT/RT). */
export type ForgeBenchId = 'forge' | 'temper' | 'materials';

/**
 * What each tab last had selected, kept by the hub while its tab views remount (the pad-first
 * spec, 4: "each tab restores its selection"). A mutable box the hub holds in a ref: a tab reads
 * its entry as it mounts and writes it as its selection changes; a link it is opened by wins.
 */
export interface HubMemory {
  loadout?: { uid: string | null; filter: BagFilter };
  forge?: { bench: ForgeBenchId; baseId: string | null; uid: string | null };
}

export type HubLink =
  | { tab: 'loadout'; uid?: string }
  | { tab: 'skills'; skill?: ChainSkill; view?: 'mana' }
  | { tab: 'forge'; uid?: string; bench?: ForgeBenchId }
  | {
      tab: 'codex';
      section?: 'legendaries' | 'reactions' | 'patterns' | 'essences' | 'records' | 'help';
    }
  | { tab: 'quests'; questId?: string };

export interface HubTabProps {
  /** 'pause': read-only. Item actions become notes, and dive finds carry NEW. The engine's own locks (isDiveActive) still apply. */
  mode: HubMode;
  /** The tab's prompts. The hub draws them in its Footer and passes them to usePrompts. (revision) */
  setPrompts: (prompts: Prompt[]) => void;
  /** Replaces the footer's Delve button while set (Skills: the Apply bar and a compact Delve button); null restores it. */
  setFooterAction: (node: ReactNode | null) => void;
  go: (to: HubLink) => void;
  link?: HubLink;
  /** The hub's Delve: at the Anvil it opens the Depart sheet; in the pause it resumes the dive. */
  onDelve: () => void;
  /** The hub's memory of each tab's selection (absent: none, as in a tab's own tests). */
  memory?: HubMemory;
}
