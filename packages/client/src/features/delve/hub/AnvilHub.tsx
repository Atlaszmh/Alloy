import { useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isDiveActive, startDepthOptions } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { HubHeader } from './HubHeader';
import { HubFooter } from './HubFooter';
import { DepartSheet, TRAINING_BINDING } from './DepartSheet';
import { SystemMenu } from './SystemMenu';
import { LoadoutTab } from './loadout/LoadoutTab';
import { SkillsTab } from './skills/SkillsTab';
import { ForgeTab } from './forge/ForgeTab';
import { CodexTab } from './codex/CodexTab';
import { QuestsTab } from './quests/QuestsTab';
import { useQuests } from '../quests/useQuests';
import { TutorialPanel } from '../tutorial/TutorialPanel';
import { SHOWN_AT, stepIn } from '../tutorial/tutorial-view';
import type { HubLink, HubMemory, HubMode, HubTab, HubTabProps } from './types';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'skills', label: 'Skills' },
  { id: 'forge', label: 'Forge' },
  { id: 'codex', label: 'Codex' },
  { id: 'quests', label: 'Quests' },
];

const TAB_VIEWS: Record<HubTab, (props: HubTabProps) => ReactNode> = {
  loadout: LoadoutTab,
  skills: SkillsTab,
  forge: ForgeTab,
  codex: CodexTab,
  quests: QuestsTab,
};

/**
 * The hub's tabs, shared by the Anvil and the pause: the open tab and the link it carries
 * (`initial` at first), the tab's prompts and footer action, the header's Tabs (`nav`), the
 * open tab's view (`view`) and the digit keys (`digits`, for the screen's usePrompts). In
 * `mode: 'pause'` the Forge is disabled ("Forge at the Anvil"): LB/RB and the digits skip it.
 * The Quests tab's pip counts the quests waiting to be claimed (`claimable`). `onDelve` is every
 * tab's Delve: at the Anvil it opens the Depart sheet, in the pause it resumes. Each tab's
 * selection lives in `memory` across its remounts.
 */
export function useHubTabs(mode: HubMode, onDelve: () => void, initial?: HubLink) {
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const claimable = useQuests().quests.filter((q) => q.status === 'complete').length;
  const [tab, setTab] = useState<HubTab>(initial?.tab ?? 'loadout');
  // The link the last go() carried, for the tab it names; a plain tab change carries none.
  const [link, setLink] = useState<HubLink | undefined>(initial);
  const [tabPrompts, setTabPrompts] = useState<Prompt[]>([]);
  const [footerAction, setFooterAction] = useState<ReactNode>(null);
  const memory = useRef<HubMemory>({}).current;
  const tabs = TABS.map((t) => {
    const locked = mode === 'pause' && t.id === 'forge';
    return { ...t, disabled: locked, title: locked ? 'Forge at the Anvil' : undefined };
  });

  const open = (to: HubTab, carried?: HubLink) => {
    if (to !== tab) setTabPrompts([]);
    setTab(to);
    setLink(carried);
    playSound('buttonClick');
  };
  const go = (to: HubLink) => open(to.tab, to);
  const digits: Prompt[] = tabs.map((t, i) => ({
    id: `tab-${t.id}`,
    label: t.label,
    binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
    onPress: () => open(t.id),
    disabled: t.disabled,
  }));
  const View = TAB_VIEWS[tab];

  const nav = (
    <Tabs
      aria-label="The Anvil"
      level="top"
      digits
      glyphs
      value={tab}
      onChange={(t) => open(t)}
      tabs={tabs.map((t) => ({
        ...t,
        testId: `tab-${t.id}`,
        badge:
          t.id === 'loadout' && newCount > 0 ? (
            <span aria-label={`${newCount} new`}>NEW {newCount}</span>
          ) : t.id === 'skills' && unapplied > 0 ? (
            <span
              aria-label={`${unapplied} unapplied change${unapplied === 1 ? '' : 's'}`}
              data-testid="draft-count"
            >
              {unapplied}
            </span>
          ) : t.id === 'quests' && claimable > 0 ? (
            <span aria-label={`${claimable} to claim`} data-testid="claim-pip">
              {claimable}
            </span>
          ) : undefined,
      }))}
    />
  );
  const view = (
    <View
      key={tab}
      mode={mode}
      setPrompts={setTabPrompts}
      setFooterAction={setFooterAction}
      go={go}
      link={link?.tab === tab ? link : undefined}
      onDelve={onDelve}
      memory={memory}
    />
  );
  return { nav, view, tabPrompts, footerAction, digits, claimable, go };
}

/**
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (the tab's prompts and Menu, then Delve, which opens the Depart
 * sheet, or the tab's own footer action) and the system menu on Esc / Menu. The
 * Depart sheet (View, Enter with nothing focused, or a click on any tab's Delve)
 * holds the start depths, Training and the Delve that starts the dive. B does
 * nothing at the hub's root. Each tab draws its own grid of panes in the main.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [departOpen, setDepartOpen] = useState(false);
  const openDepart = () => setDepartOpen(true);
  const mainRef = useRef<HTMLDivElement>(null);
  const menuKey = useControlsStore((s) => s.config.keys.menu);
  // The start depth the Depart sheet's chips pick (the deepest at first), for the footer's label too.
  const profile = useDelveStore((s) => s.profile);
  const starts = startDepthOptions(getDelveRegistry(), profile);
  const [start, setStart] = useState(starts[starts.length - 1]);
  const depth = starts.includes(start) ? start : 1;

  const onTraining = () => navigate('/delve/training');
  /** Start the dive at the chosen depth, or resume the one open (the sheet's Delve). */
  const startDelve = () => {
    const s = useDelveStore.getState();
    if (!isDiveActive(s.profile) && !s.startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };
  // A link the route brings (Try in Training's way back), read once.
  const location = useLocation();
  const [initial] = useState(() => (location.state as { link?: HubLink } | null)?.link);
  // Every Delve button at the Anvil (the footer's, the Skills tab's) opens the sheet.
  const hub = useHubTabs(mode, openDepart, initial);

  // The footer's prompts: the tab's, then the hub's Menu (Esc, or Menu on the pad: B does
  // nothing at the root). The hub also binds View to the Depart sheet (the footer's button
  // draws it), T to Training and the digits.
  const prompts: Prompt[] = [
    ...hub.tabPrompts,
    {
      id: 'menu',
      label: 'Menu',
      // The configured menu key too (as the stop's Menu binds it): with no [data-pad-back] in the
      // hub, the runtime's fallback for it would press [data-pad-menu], the Delve button.
      binding: {
        key: menuKey && menuKey !== 'Escape' ? ['Escape', menuKey] : 'Escape',
        pad: 'menu',
      },
      onPress: () => setMenuOpen(true),
      asButton: true,
    },
  ];
  usePrompts(
    [
      ...prompts,
      { id: 'depart', label: 'Delve', binding: { pad: 'view' }, onPress: openDepart },
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      ...hub.digits,
    ],
    mainRef,
  );

  return (
    <>
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId={`hub-${mode}`}
        header={<HubHeader nav={hub.nav} />}
        footer={
          <HubFooter
            prompts={prompts}
            start={depth}
            onDepart={openDepart}
            action={hub.footerAction}
          />
        }
      >
        <div ref={mainRef} className="flex h-full min-h-0 flex-col">
          {/* Hesta's strip, a row between the band and the tab's panes, which give up that row
              and nothing else; she speaks once the mana is chosen. */}
          {profile.tutorial &&
            profile.pair.primary !== null &&
            stepIn(getDelveRegistry(), profile.tutorial, SHOWN_AT.anvil) && (
              <div className="flex-none px-8 pt-4">
                <TutorialPanel
                  state={profile.tutorial}
                  where={SHOWN_AT.anvil}
                  place="anvil"
                  onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
                />
              </div>
            )}
          <div className="min-h-0 flex-1">{hub.view}</div>
        </div>
      </Screen>
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
      {departOpen && (
        <DepartSheet
          start={depth}
          onStart={setStart}
          onDelve={startDelve}
          onTraining={onTraining}
          onQuests={() => {
            setDepartOpen(false);
            hub.go({ tab: 'quests' });
          }}
          onClose={() => setDepartOpen(false)}
        />
      )}
    </>
  );
}
