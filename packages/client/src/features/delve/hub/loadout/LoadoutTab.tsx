import { useEffect, useRef, useState, type ReactElement } from 'react';
import { findItem, isDiveActive, rarityIndex, weaponParts } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import type { Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { HowTo } from '../HowTo';
import type { HubTabProps } from '../types';
import { EquippedPane } from './EquippedPane';
import { BagPane } from './BagPane';
import { ComparePane, type LoadoutActions } from './ComparePane';
import { needsBind } from './BindChoice';

/** A precious item's second Salvage press must come within this. */
const ARMED_MS = 2000;

/**
 * The Anvil's Loadout tab: the equipped pane, the bag and the compare pane, in the spec's
 * 430 / flexible / 470 px columns. The compare pane shows the hovered item, else the selected one
 * (a click, or the pad's focus), else the worn weapon (the how-to, on a first save). The tab's
 * prompts: Select, Equip, Full compare (hold Shift / LT), Salvage (Del / X) and Lock (L / Y),
 * which act on the hovered or selected item. In `mode: 'pause'` the item actions give way to notes.
 */
export function LoadoutTab({ mode, setPrompts, go, link }: HubTabProps): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const locked = mode === 'pause' || isDiveActive(profile);

  const has = (uid: string | null): uid is string => !!uid && !!findItem(profile, uid);
  const target = has(hovered) ? hovered : has(selected) ? selected : null;
  const howTo = !target && profile.stats.dives === 0;

  const select = (uid: string) => {
    setSelected(uid);
    useDelveStore.getState().markSeen([uid]);
  };

  const actions: LoadoutActions = {
    equip: (uid) => {
      const s = useDelveStore.getState();
      const found = findItem(s.profile, uid);
      if (locked || found?.where !== 'bag') return;
      if (needsBind(s.profile, s.bindDeclined, found.item)) {
        // The compare pane asks first: Bind, or Not now.
        select(uid);
        setAsked(uid);
        return;
      }
      s.equip(uid);
      playSound('orbPlace');
      vibrate('medium');
    },
    salvage: (uid) => {
      const s = useDelveStore.getState();
      const found = findItem(s.profile, uid);
      if (locked || found?.where !== 'bag' || found.item.locked) return;
      const { item } = found;
      const precious =
        weaponParts(registry, item).runes.length > 0 ||
        rarityIndex(item.rarity) >= rarityIndex('rare');
      if (precious && armed !== uid) {
        setArmed(uid);
        return;
      }
      setArmed(null);
      const { links, runes, destroyed } = s.salvage([uid]);
      playSound('orbRemove');
      vibrate('light');
      if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
      const parts = partsText(registry, runes, destroyed);
      if (parts) showToast(parts);
    },
    lock: (uid) => {
      if (mode === 'pause') return;
      useDelveStore.getState().toggleLock(uid);
      playSound('buttonClick');
    },
  };
  // The prompts are set once; their keys act through the latest actions and target.
  const latest = useRef({ actions, target });
  latest.current = { actions, target };

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), ARMED_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (link?.tab === 'loadout' && link.uid) setSelected(link.uid);
  }, [link]);

  useEffect(() => {
    const on = (act: keyof LoadoutActions) => () => {
      const { actions: a, target: uid } = latest.current;
      if (uid) a[act](uid);
    };
    const prompts: Prompt[] = [
      { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
      { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } },
      {
        id: 'compare',
        label: 'Full compare',
        binding: { key: ['ShiftLeft', 'ShiftRight'], pad: 'lt', whileHeld: true },
        onHold: setFull,
      },
      {
        id: 'salvage',
        label: 'Salvage',
        binding: { key: 'Delete', pad: 'x' },
        onPress: on('salvage'),
      },
      { id: 'lock', label: 'Lock', binding: { key: 'KeyL', pad: 'y' }, onPress: on('lock') },
    ];
    setPrompts(
      mode === 'pause' ? prompts.filter((p) => p.id === 'select' || p.id === 'compare') : prompts,
    );
    return () => setPrompts([]);
  }, [mode, setPrompts]);

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{
        gridTemplateColumns: '430px minmax(0, 1fr) 470px',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
      data-testid="loadout-tab"
    >
      <EquippedPane selected={selected} onSelect={select} go={go} />
      <BagPane
        locked={locked}
        selected={selected}
        onSelect={select}
        onHover={setHovered}
        onEquip={actions.equip}
      />
      {howTo ? (
        <div className="k-scroll min-h-0">
          <HowTo />
        </div>
      ) : (
        <ComparePane
          uid={target ?? profile.equipped.weapon?.uid ?? null}
          source={!target ? 'worn' : target === hovered ? 'hovered' : 'selected'}
          full={full}
          locked={locked}
          armed={armed}
          asked={asked}
          actions={actions}
          go={go}
        />
      )}
    </div>
  );
}
