import { useEffect, useRef, useState, type ReactElement } from 'react';
import { findItem, isDiveActive, rarityIndex, weaponParts } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import type { Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { HowTo } from '../HowTo';
import type { BagFilter, HubTabProps } from '../types';
import { EquippedPane } from './EquippedPane';
import { BagPane } from './BagPane';
import { ComparePane, type LoadoutActions } from './ComparePane';
import { needsBind } from './BindChoice';
import { TakeSheet, canTake } from './TakeSheet';

/** A precious item's second Salvage press must come within this. */
const ARMED_MS = 2000;

/**
 * The Anvil's Loadout tab: the equipped pane, the bag and the compare pane (430 / flexible / 470
 * px). The compare pane shows the last hovered bag item (keys and mouse), else the selected or
 * focused one (a worn one too), else the worn weapon (the how-to, on a first save). The footer's
 * prompts act on that item: A equips (under the pad, A on a bag weapon that can take your moveset
 * opens the take sheet; on a worn tile A only selects), X salvages a bag item and unequips a worn
 * one, Y locks, R3 or Shift toggles Full compare. Under the pad A and X carry the guided start's
 * targets (`Prompt.tutorial`). In `mode: 'pause'` the item actions give way to notes. Its tile and
 * filter live in the hub's memory.
 */
export function LoadoutTab({ mode, setPrompts, go, link, memory }: HubTabProps): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const kept = memory?.loadout;
  const [selected, setSelected] = useState<string | null>(
    link?.tab === 'loadout' && link.uid ? link.uid : (kept?.uid ?? null),
  );
  const [filter, setFilter] = useState<BagFilter>(kept?.filter ?? 'all');
  const [hovered, setHovered] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [taking, setTaking] = useState<string | null>(null);
  const declined = useDelveStore((s) => s.bindDeclined);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const locked = mode === 'pause' || isDiveActive(profile);

  const has = (uid: string | null): uid is string => !!uid && !!findItem(profile, uid);
  // Under the pad only the focus (the selection) counts: a mouse hover left behind never does.
  const target = !pad && has(hovered) ? hovered : has(selected) ? selected : null;
  // How to delve is for Jump in (and a skipped guided start) until its first lessons are behind it
  // (Strike the Anvil claimed): a guided save has Hesta (see the tutorial spec).
  const howTo =
    !target && !profile.tutorial && !profile.quests.claimed.includes('strike_the_anvil');
  const found = target ? findItem(profile, target) : null;
  const worn = found?.where === 'equipped';
  const targetLocked = !!found?.item.locked;
  const takes = !!target && !locked && canTake(profile, declined, target);
  const hasTarget = !!target;

  const select = (uid: string) => {
    setSelected(uid);
    setHovered(null);
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
      if (locked || !found) return;
      // A worn item comes off to the bag instead.
      if (found.where === 'equipped') {
        try {
          s.unequip(found.item.slot);
          playSound('orbRemove');
        } catch {
          showToast('Bag is full');
        }
        return;
      }
      if (found.item.locked) return;
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
  /** Take a bag item: a weapon that can take your moveset asks how (the take sheet), the rest equip. */
  const take = (uid: string) => {
    const s = useDelveStore.getState();
    if (!locked && canTake(s.profile, s.bindDeclined, uid)) {
      select(uid);
      setTaking(uid);
    } else actions.equip(uid);
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

  // The hub keeps the tile and the filter while the tab is away.
  useEffect(() => {
    if (memory) memory.loadout = { uid: selected, filter };
  }, [memory, selected, filter]);

  // A device switch forgets the hover.
  useEffect(() => useInputDeviceStore.subscribe(() => setHovered(null)), []);

  useEffect(() => {
    const on = (act: keyof LoadoutActions) => () => {
      const { actions: a, target: uid } = latest.current;
      if (uid) a[act](uid);
    };
    const select: Prompt = {
      id: 'select',
      label: mode === 'pause' ? 'Inspect' : 'Select',
      binding: { mouse: 'click', pad: 'a' },
    };
    const compare: Prompt = {
      id: 'compare',
      label: 'Full compare',
      binding: { key: ['ShiftLeft', 'ShiftRight'], pad: 'rs' },
      onPress: () => setFull((f) => !f),
    };
    if (mode === 'pause') {
      setPrompts([select, compare]);
      return;
    }
    // Under the pad one A names what A does on the focused tile.
    const a: Prompt = pad
      ? {
          id: 'equip',
          label: worn ? 'Select' : takes ? 'Equip or transfer' : 'Equip',
          binding: { mouse: 'rmb', pad: 'a' },
          tutorial: worn ? undefined : takes ? 'loadout.transfer' : 'loadout.equip',
        }
      : { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } };
    setPrompts([
      ...(pad ? [] : [select]),
      a,
      {
        id: 'salvage',
        label: worn ? 'Unequip' : 'Salvage',
        binding: { key: 'Delete', pad: 'x' },
        onPress: on('salvage'),
        disabled: !hasTarget || (!worn && targetLocked),
        tutorial: pad && !worn ? 'loadout.salvage' : undefined,
      },
      {
        id: 'lock',
        label: 'Lock',
        binding: { key: 'KeyL', pad: 'y' },
        onPress: on('lock'),
        disabled: !hasTarget,
      },
      compare,
    ]);
  }, [mode, setPrompts, pad, worn, takes, targetLocked, hasTarget]);
  useEffect(() => () => setPrompts([]), [setPrompts]);

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
        filter={filter}
        onFilter={setFilter}
        onSelect={select}
        onHover={setHovered}
        onEquip={actions.equip}
        onTake={take}
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
          asked={asked}
          actions={actions}
          go={go}
        />
      )}
      {taking && <TakeSheet uid={taking} onClose={() => setTaking(null)} />}
    </div>
  );
}
