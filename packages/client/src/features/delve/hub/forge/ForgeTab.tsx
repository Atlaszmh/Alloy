import { useEffect, useState } from 'react';
import { findItem, GEAR_SLOTS, isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Panel, Tabs } from '../../kit';
import type { ForgeBenchId, HubLink, HubTabProps } from '../types';
import { ForgeBench, ForgeLocked, SELECT_PROMPT } from './ForgeBench';
import { GearList } from './GearList';
import { MaterialsPane } from './MaterialsPane';
import { Temper } from './Temper';

const forgeLink = (l?: HubLink) => (l?.tab === 'forge' ? l : null);
/** A link's bench: its own, else Temper for an item ("Forge it ›" from the Loadout), else the Forge. */
const benchOf = (l?: HubLink): ForgeBenchId =>
  forgeLink(l)?.bench ?? (forgeLink(l)?.uid ? 'temper' : 'forge');

/**
 * The Forge tab: three benches (a sub tab, LT/RT): Forge (a new item from a pattern), Temper
 * (the gear list, the operations on the picked item, its detail) and Materials (refining, the
 * shard bench, the rune pouch). Its bench and gear row live in the hub's memory; a
 * `{ tab: 'forge', uid, bench }` link picks them. Locked while a dive is under way (the hub
 * disables the tab in the pause).
 */
export function ForgeTab({ mode, setPrompts, link, memory }: HubTabProps) {
  const profile = useDelveStore((s) => s.profile);
  const kept = memory?.forge;
  const [selected, setSelected] = useState<string | null>(
    forgeLink(link)?.uid ?? kept?.uid ?? null,
  );
  const [bench, setBench] = useState<ForgeBenchId>(
    forgeLink(link) ? benchOf(link) : (kept?.bench ?? 'forge'),
  );
  useEffect(() => {
    if (memory) memory.forge = { bench, uid: selected, baseId: memory.forge?.baseId ?? null };
  }, [memory, bench, selected]);
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
    if (bench !== 'forge' || locked) setPrompts([SELECT_PROMPT]);
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
          {
            id: 'materials',
            label: 'Materials',
            testId: 'bench-materials',
            tutorial: 'forge.materials',
          },
        ]}
      />
      <div
        className="grid min-h-0 flex-1 gap-6"
        style={{
          gridTemplateColumns: '430px minmax(0, 1fr) 470px',
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {bench === 'forge' && (
          <>
            <ForgeBench locked={locked} setPrompts={setPrompts} />
            {/* The preview's column (plan 05). */}
            <div />
          </>
        )}
        {bench === 'temper' && (
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
            <div />
          </>
        )}
        {bench === 'materials' && <MaterialsPane locked={locked} />}
      </div>
    </div>
  );
}
