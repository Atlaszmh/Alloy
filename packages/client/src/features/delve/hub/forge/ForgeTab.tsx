import { useEffect, useState } from 'react';
import { findItem, GEAR_SLOTS, isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Panel, Tabs } from '../../kit';
import type { HubLink, HubTabProps } from '../types';
import { ForgeBench, ForgeLocked, SELECT_PROMPT } from './ForgeBench';
import { GearList } from './GearList';
import { MaterialsPane } from './MaterialsPane';
import { Temper } from './Temper';

type Bench = 'forge' | 'temper';

const forgeLink = (l?: HubLink) => (l?.tab === 'forge' ? l : null);
/** A link's bench: its own, else Temper for an item ("Forge it ›" from the Loadout), else the Forge. */
const benchOf = (l?: HubLink): Bench => {
  const b = forgeLink(l)?.bench;
  return b === 'forge' || b === 'temper' ? b : forgeLink(l)?.uid ? 'temper' : 'forge';
};

/**
 * The Forge tab: two benches (a sub tab, LT/RT), each in three panes. The Forge
 * bench forges a new item from a pattern; the Temper bench works on the item
 * picked in the gear list; the Materials pane sits beside both.
 * `{ tab: 'forge', uid, bench }` links pick the item and the bench. Locked
 * while a dive is under way (the hub disables the tab in the pause).
 */
export function ForgeTab({ mode, setPrompts, link }: HubTabProps) {
  const profile = useDelveStore((s) => s.profile);
  const [selected, setSelected] = useState<string | null>(forgeLink(link)?.uid ?? null);
  const [bench, setBench] = useState<Bench>(benchOf(link));
  // A new link picks its item and bench.
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = forgeLink(link);
    if (to) {
      if (to.uid) setSelected(to.uid);
      setBench(benchOf(to));
    }
  }

  const locked = mode === 'pause' || isDiveActive(profile);
  // The Forge bench sets its own prompts (Enter forges); Temper and the lock show Select.
  useEffect(() => {
    if (bench === 'temper' || locked) setPrompts([SELECT_PROMPT]);
  }, [bench, locked, setPrompts]);

  const equipped = GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []);
  // The selected item, or (none yet, or salvaged away) the first one worn.
  const item = (selected && findItem(profile, selected)?.item) || equipped[0] || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-6" data-testid="forge-panel">
      <Tabs
        aria-label="Bench"
        level="sub"
        size="md"
        value={bench}
        onChange={(b) => {
          playSound('buttonClick');
          setBench(b);
        }}
        tabs={[
          { id: 'forge', label: 'Forge', testId: 'bench-forge', tutorial: 'forge.bench' },
          { id: 'temper', label: 'Temper', testId: 'bench-temper', tutorial: 'forge.temper' },
        ]}
      />
      <div
        className="grid min-h-0 flex-1 gap-6"
        style={{
          gridTemplateColumns: '430px minmax(0, 1fr) 470px',
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {bench === 'forge' ? (
          <ForgeBench locked={locked} setPrompts={setPrompts} />
        ) : (
          <>
            <GearList
              equipped={equipped}
              bag={profile.bag}
              selected={item?.uid ?? null}
              onSelect={(uid) => {
                playSound('orbSelect');
                setSelected(uid);
              }}
            />
            <Panel aria-label="Temper" testId="temper-bench">
              {locked ? <ForgeLocked /> : item && <Temper key={item.uid} item={item} />}
            </Panel>
          </>
        )}
        <MaterialsPane locked={locked} />
      </div>
    </div>
  );
}
