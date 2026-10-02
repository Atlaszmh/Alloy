import { useEffect, useState } from 'react';
import { findItem, fusePrice, GEAR_SLOTS, isDiveActive, type RuneRef } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Panel, Tabs, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { runeName } from '../../runes/rune-style';
import type { HubLink, HubTabProps } from '../types';
import { GearList } from './GearList';
import { Temper } from './Temper';
import { Fuse } from './Fuse';
import { RunePane } from './RunePane';

type BenchId = 'temper' | 'fuse';

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
];

/**
 * The Forge tab: the gear list, the bench (Temper the selected item, or Alloy
 * Fusion) and the rune pane. `{ tab: 'forge', uid, bench }` links pick the item
 * and the bench. Locked while a dive is under way, and in the pause.
 */
export function ForgeTab({ mode, setPrompts, link }: HubTabProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const forgeLink = (l?: HubLink) => (l?.tab === 'forge' ? l : null);
  const [selected, setSelected] = useState<string | null>(forgeLink(link)?.uid ?? null);
  const [bench, setBench] = useState<BenchId>(forgeLink(link)?.bench ?? 'temper');
  // A new link (e.g. "Forge it ›" from the Loadout) picks its item and bench.
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = forgeLink(link);
    if (to) {
      if (to.uid) setSelected(to.uid);
      setBench(to.bench ?? 'temper');
    }
  }

  useEffect(() => setPrompts(PROMPTS), [setPrompts]);

  const equipped = GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []);
  // The selected item, or (none yet, or fused away) the first one worn.
  const item = (selected && findItem(profile, selected)?.item) || equipped[0] || null;
  const locked = mode === 'pause' || isDiveActive(profile);

  const fuseCount = registry.getDelveBalance().runes.fuseCount;
  const onFuseRunes = (ref: RuneRef) => {
    const res = useDelveStore.getState().fuseRunes(ref);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot fuse');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    showToast(
      `Fused ${fuseCount} ${runeName(registry, ref)} into ${runeName(registry, res.runes![0])}`,
    );
  };

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '430px minmax(0, 1fr) 470px' }}
      data-testid="forge-panel"
    >
      <GearList
        equipped={equipped}
        bag={profile.bag}
        selected={item?.uid ?? null}
        onSelect={(uid) => {
          playSound('orbSelect');
          setSelected(uid);
          setBench('temper');
        }}
      />
      <Panel aria-label="Bench" testId="forge-bench">
        {locked ? (
          <p className="k-body-2" data-testid="forge-locked">
            A dive is under way: forge and salvage between dives.
          </p>
        ) : (
          <>
            <Tabs
              aria-label="Bench"
              level="sub"
              size="md"
              value={bench}
              onChange={setBench}
              tabs={[
                { id: 'temper', label: 'Temper', testId: 'bench-temper' },
                { id: 'fuse', label: 'Fuse', testId: 'bench-fuse' },
              ]}
            />
            {bench === 'temper' && item && <Temper key={item.uid} item={item} />}
            {bench === 'fuse' && (
              <Fuse
                onResult={(uid) => {
                  setSelected(uid);
                  setBench('temper');
                }}
              />
            )}
          </>
        )}
      </Panel>
      <RunePane
        pouch={profile.runes}
        fuseCount={fuseCount}
        fusePrice={(ref) => fusePrice(registry, ref)}
        scrap={profile.scrap}
        locked={locked}
        onFuse={onFuseRunes}
      />
    </div>
  );
}
