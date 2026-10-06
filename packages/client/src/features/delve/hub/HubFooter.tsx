import type { ReactNode } from 'react';
import { isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Footer, type Binding, type Prompt } from '@/features/delve/kit';

/** Delve's inputs at the Anvil: Enter with nothing focused, or View on the pad. Both open the Depart sheet. */
export const DEPART_BINDING: Binding = { key: 'Enter', pad: 'view' };

/**
 * The hub's planks: the prompts, then one hot metal button, Delve, which opens the Depart sheet
 * (the pad-first spec, 2.2: the start depths, Training, the claim count and whatever holds a
 * dive live there). It is never disabled. While a tab sets `action` (Skills: its Apply bar, with
 * a compact Delve), that node replaces it.
 */
export function HubFooter({
  prompts,
  start,
  onDepart,
  action,
}: {
  prompts: Prompt[];
  /** The chosen start depth (the hub keeps it; the sheet picks it). */
  start: number;
  /** Opens the Depart sheet. */
  onDepart: () => void;
  action?: ReactNode;
}) {
  const profile = useDelveStore((s) => s.profile);
  const active = isDiveActive(profile);
  if (action) return <Footer prompts={prompts}>{action}</Footer>;
  return (
    <Footer prompts={prompts}>
      <Button
        variant="primary"
        size="lg"
        onClick={onDepart}
        binding={DEPART_BINDING}
        data-pad-menu
        data-pad-first
        data-primary-action="delve"
        data-tutorial="hub.delve"
        testId="depart-button"
      >
        {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${start}`}
      </Button>
    </Footer>
  );
}
